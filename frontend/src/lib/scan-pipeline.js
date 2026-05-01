/**
 * Scan pipeline — capture → normalize → optional OCR.
 *
 * KEY DECISIONS (locked in by user spec):
 *  - OCR engine is Tesseract.js (free, browser-only, offline-capable).
 *  - OCR is a HELPER, not the source of truth. Mapping is human-driven.
 *  - The pipeline runs entirely client-side; nothing is uploaded.
 *  - We downscale every scan to a max edge of 1600px before storing
 *    so a 12-megapixel iPhone capture compresses ~5 MB → ~350 KB,
 *    keeping IndexedDB usage reasonable.
 */

const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Read a File / Blob into a {dataUrl, width, height} normalized JPEG.
 * Downscales if either dimension exceeds MAX_EDGE_PX.
 *
 * @param {File|Blob} file
 * @returns {Promise<{ data_url: string, width: number, height: number, captured_at: string }>}
 */
export async function normalizeCapture(file) {
  if (!file) throw new Error("normalizeCapture: no file provided");
  const sourceUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(sourceUrl);
    const { canvas, width, height } = drawDownscaled(img);
    const data_url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return {
      data_url,
      width,
      height,
      captured_at: new Date().toISOString(),
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawDownscaled(img) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(sw, sh));
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  // Boost contrast slightly for OCR — single pass, cheap.
  ctx.filter = "contrast(108%) brightness(102%)";
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, width, height };
}

/**
 * Run Tesseract.js across a normalized scan and return word-level boxes
 * in normalized 0..1 coordinates so the mapping UI can use them as
 * tap-target hints.
 *
 * Tesseract is loaded lazily so the rest of the app stays small.
 *
 * Network: the worker, core WASM, and `eng.traineddata` (~10 MB) are
 * downloaded from public CDNs on first run and cached in IndexedDB
 * via `cacheMethod: 'write'`. Subsequent runs (and offline use) load
 * from cache.
 *
 * @param {{ data_url: string, width: number, height: number }} scan
 * @param {{ onProgress?: (p: number, status: string) => void }} [opts]
 * @returns {Promise<Array<{text:string,x:number,y:number,w:number,h:number,confidence:number}>>}
 */
export async function runOcr(scan, opts = {}) {
  if (!scan?.data_url || !scan.width || !scan.height) {
    throw new Error("runOcr: invalid scan payload");
  }
  const onProgress = opts.onProgress || (() => {});
  const Tesseract = await import("tesseract.js");
  // v7: use the explicit worker API. data.words is present by default
  // (the legacy `recognize()` helper omits it).
  const worker = await Tesseract.createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0",
    langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
    cacheMethod: "write",
    logger: (m) => {
      if (typeof m?.progress === "number" && m?.status) {
        onProgress(m.progress, m.status);
      }
    },
  });
  let allWords = [];
  try {
    // v7: pass output config to enable hocr+tsv. data.words is unreliable
    // in v7 — TSV is the most stable word-level export.
    const { data } = await worker.recognize(scan.data_url, {}, { blocks: true, tsv: true, hocr: true });
    // eslint-disable-next-line no-console
    console.log("[ocr] keys=", Object.keys(data || {}),
      "words=", (data?.words || []).length,
      "tsv-len=", (data?.tsv || "").length,
      "hocr-len=", (data?.hocr || "").length);

    // 1) try data.words
    if (Array.isArray(data?.words) && data.words.length > 0) {
      allWords = data.words;
    }
    // 2) walk blocks tree
    if (allWords.length === 0 && Array.isArray(data?.blocks)) {
      for (const block of data.blocks) {
        for (const para of (block?.paragraphs || [])) {
          for (const line of (para?.lines || [])) {
            for (const w of (line?.words || [])) {
              if (w?.text && w?.bbox) allWords.push(w);
            }
          }
        }
      }
    }
    // 3) fall back to TSV (most reliable in v7)
    if (allWords.length === 0 && data?.tsv) {
      const lines = data.tsv.split("\n");
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split("\t");
        if (cols.length < 12) continue;
        if (Number(cols[0]) !== 5) continue; // word level
        const left = Number(cols[6]);
        const top = Number(cols[7]);
        const width = Number(cols[8]);
        const height = Number(cols[9]);
        const conf = Number(cols[10]);
        const text = (cols[11] || "").trim();
        if (!text || !Number.isFinite(left)) continue;
        allWords.push({ text, confidence: conf, bbox: { x0: left, y0: top, x1: left + width, y1: top + height } });
      }
    }
    // 4) parse hocr as last-resort fallback
    if (allWords.length === 0 && typeof data?.hocr === "string" && data.hocr.length > 0) {
      const re = /<span class=['"]ocrx_word['"][^>]*title=['"]bbox (\d+) (\d+) (\d+) (\d+);[^'"]*x_wconf (\d+)[^'"]*['"][^>]*>([^<]+)<\/span>/g;
      let m;
      while ((m = re.exec(data.hocr)) !== null) {
        const [, x0, y0, x1, y1, conf, raw] = m;
        const text = decodeHtmlEntities(raw).trim();
        if (!text) continue;
        allWords.push({
          text,
          confidence: Number(conf),
          bbox: { x0: Number(x0), y0: Number(y0), x1: Number(x1), y1: Number(y1) },
        });
      }
    }
  } finally {
    await worker.terminate();
  }
  const sw = scan.width;
  const sh = scan.height;
  return allWords
    .filter((w) => (w?.text || "").trim().length > 0 && w?.bbox)
    .map((w) => ({
      text: w.text,
      confidence: Math.round(w.confidence || 0),
      x: w.bbox.x0 / sw,
      y: w.bbox.y0 / sh,
      w: (w.bbox.x1 - w.bbox.x0) / sw,
      h: (w.bbox.y1 - w.bbox.y0) / sh,
    }));
}

function decodeHtmlEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Bytes → human label (KB/MB) for the dev harness storage indicator.
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
