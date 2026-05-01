import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Upload, Trash2, AlertTriangle, Loader2, Image as ImageIcon, ScanLine, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import { toast } from "sonner";
import {
  normalizeCapture,
  runOcr,
  formatBytes,
} from "../../lib/scan-pipeline";
import {
  saveTemplate,
  listTemplates,
  deleteTemplate,
  totalStorageBytes,
  _DEV_clearAll,
} from "../../lib/template-store";
import { emptyTemplate } from "../../lib/template-types";

/**
 * HIDDEN dev harness for Batch 1 of the dynamic-trip-sheet pipeline.
 *
 * - Not linked anywhere in the production navigation.
 * - Reachable only by typing /dev/template-lab into the URL bar.
 * - Used to validate the capture → normalize → OCR → store flow before
 *   any of it is surfaced to drivers (Batch 2 will build the
 *   tap-to-assign mapping UI on top of this foundation).
 *
 * Privacy: scans never leave the device — saved to IndexedDB only.
 */
export default function TemplateLab() {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(null);
  const [ocrWords, setOcrWords] = useState([]);
  const [ocrDone, setOcrDone] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [templates, setTemplates] = useState([]);
  const [bytes, setBytes] = useState(0);

  const refresh = async () => {
    setTemplates(await listTemplates());
    setBytes(await totalStorageBytes());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    setOcrProgress(0);
    setOcrWords([]);
    try {
      const normalized = await normalizeCapture(file);
      setScan(normalized);
      toast.success(`Scan normalized to ${normalized.width}×${normalized.height}`);
    } catch (e) {
      toast.error(`Capture failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRunOcr = async () => {
    if (!scan) return;
    setBusy(true);
    setOcrWords([]);
    setOcrDone(false);
    setOcrProgress(0);
    setOcrStatus("loading model");
    try {
      const words = await runOcr(scan, {
        onProgress: (p, status) => {
          setOcrProgress(Math.round(p * 100));
          setOcrStatus(status || "");
          // Surface progress to console so headless tests can see it.
          // eslint-disable-next-line no-console
          console.log(`[ocr] ${Math.round(p * 100)}% ${status}`);
        },
      });
      setOcrWords(words);
      setOcrDone(true);
      toast.success(`OCR found ${words.length} words`);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ocr] failed", e);
      toast.error(`OCR failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
      setOcrStatus("");
    }
  };

  const handleSave = async () => {
    if (!scan) {
      toast.error("Capture a scan first");
      return;
    }
    if (templates.length >= 1) {
      // Honor the user's "multiple templates increase storage" memory rule.
      const ok = window.confirm(
        "Adding multiple trip sheet templates increases device storage usage. Continue?"
      );
      if (!ok) return;
    }
    const tpl = emptyTemplate({ source: "scanned", name: `Scan ${templates.length + 1}` });
    tpl.scan = scan;
    tpl.ocr_words = ocrWords;
    await saveTemplate(tpl);
    toast.success("Template saved locally");
    setScan(null);
    setOcrWords([]);
    setOcrProgress(0);
    refresh();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    await deleteTemplate(id);
    refresh();
    toast.success("Deleted");
  };

  const handleWipe = async () => {
    if (!window.confirm("Clear ALL local templates? This cannot be undone.")) return;
    await _DEV_clearAll();
    refresh();
    toast.success("All templates cleared");
  };

  return (
    <div className="min-h-screen bg-white text-[var(--tm-navy)]" data-testid="template-lab-page">
      <header className="border-b border-[var(--tm-border)] px-4 py-3 flex items-center gap-3 sticky top-0 bg-white z-10">
        <Link
          to="/"
          className="text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold"
          data-testid="template-lab-back"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--tm-orange)] font-bold">
            Internal · Hidden
          </div>
          <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
            <ScanLine className="h-4 w-4" /> Template Lab
          </h1>
        </div>
        <span
          data-testid="template-lab-storage"
          className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold"
        >
          {formatBytes(bytes)} stored
        </span>
      </header>

      <main className="max-w-2xl mx-auto p-5 space-y-5">
        {/* Privacy note */}
        <div className="bg-[var(--tm-blue)]/8 border border-[var(--tm-blue)]/40 rounded-md p-3 text-xs text-[var(--tm-text-soft)]">
          <strong className="text-[var(--tm-navy)]">Local-only:</strong> scans live in
          IndexedDB on this device. Nothing is uploaded.
        </div>

        {/* Capture */}
        <section className="bg-white border border-[var(--tm-border)] rounded-md p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--tm-orange)]">
            1 · Capture
          </h2>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            data-testid="template-lab-file-input"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              data-testid="template-lab-camera-btn"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
            >
              <Camera className="h-4 w-4 mr-1" /> Camera / Photo
            </Button>
            <Button
              data-testid="template-lab-upload-btn"
              disabled={busy}
              variant="outline"
              onClick={() => {
                // Same input — `capture` is just a hint; users can pick from gallery too.
                if (fileRef.current) {
                  fileRef.current.removeAttribute("capture");
                  fileRef.current.click();
                  // Restore for next mobile camera tap.
                  setTimeout(() => fileRef.current?.setAttribute("capture", "environment"), 0);
                }
              }}
              className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
            >
              <Upload className="h-4 w-4 mr-1" /> Upload file
            </Button>
          </div>

          {scan && (
            <div className="mt-3 space-y-2" data-testid="template-lab-preview">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold">
                <span>{scan.width}×{scan.height}</span>
                <span>{formatBytes(scan.data_url.length)}</span>
              </div>
              <div className="relative border border-[var(--tm-border)] rounded-md overflow-hidden bg-black/5">
                <img
                  src={scan.data_url}
                  alt="Scan preview"
                  className="w-full h-auto block"
                  data-testid="template-lab-preview-img"
                />
                {/* Word-box overlay */}
                {ocrWords.length > 0 && (
                  <svg
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {ocrWords.map((w, i) => (
                      <rect
                        key={i}
                        x={w.x}
                        y={w.y}
                        width={w.w}
                        height={w.h}
                        fill="none"
                        stroke="rgba(255,95,21,0.6)"
                        strokeWidth="0.0015"
                      />
                    ))}
                  </svg>
                )}
              </div>
            </div>
          )}
        </section>

        {/* OCR */}
        <section className="bg-white border border-[var(--tm-border)] rounded-md p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--tm-orange)]">
            2 · OCR (helper, not authoritative)
          </h2>
          <Button
            data-testid="template-lab-run-ocr"
            disabled={!scan || busy}
            onClick={handleRunOcr}
            className="h-12 w-full bg-[var(--tm-blue)] hover:bg-[var(--tm-blue-deep)] text-white font-bold rounded-md"
          >
            {busy && ocrStatus ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {ocrProgress}% — {ocrStatus}
              </span>
            ) : (
              <>
                <ScanLine className="h-4 w-4 mr-1" /> Run Tesseract
              </>
            )}
          </Button>
          {ocrWords.length > 0 && (
            <div
              data-testid="template-lab-ocr-stats"
              className="text-xs text-[var(--tm-text-soft)] flex items-center gap-2"
            >
              <ImageIcon className="h-3.5 w-3.5 text-[var(--tm-blue)]" />
              <span>
                <strong className="text-[var(--tm-navy)]">{ocrWords.length}</strong> words ·
                avg confidence{" "}
                <strong className="text-[var(--tm-navy)]">
                  {Math.round(
                    ocrWords.reduce((a, w) => a + w.confidence, 0) / ocrWords.length
                  )}%
                </strong>
              </span>
            </div>
          )}
          {ocrDone && ocrWords.length === 0 && (
            <div
              data-testid="template-lab-ocr-empty"
              className="text-xs text-[#FF3B30] uppercase tracking-wider font-bold"
            >
              OCR finished but found no words
            </div>
          )}
        </section>

        {/* Save */}
        <section className="bg-white border border-[var(--tm-border)] rounded-md p-4 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--tm-orange)]">
            3 · Save to local store
          </h2>
          <Button
            data-testid="template-lab-save"
            disabled={!scan || busy}
            onClick={handleSave}
            className="h-12 w-full bg-[var(--tm-navy)] hover:bg-[var(--tm-navy)]/90 text-white font-bold rounded-md"
          >
            Save template (no field mapping yet)
          </Button>
          <p className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-[var(--tm-orange)]" />
            Mapping UI ships in Batch 2 — saved templates have empty `fields{}` for now.
          </p>
        </section>

        {/* Stored templates */}
        <section className="bg-white border border-[var(--tm-border)] rounded-md p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--tm-orange)]">
              Stored ({templates.length})
            </h2>
            {templates.length > 0 && (
              <button
                type="button"
                data-testid="template-lab-wipe"
                onClick={handleWipe}
                className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-soft)] hover:text-[#FF3B30]"
              >
                Wipe all
              </button>
            )}
          </div>
          {templates.length === 0 ? (
            <div className="text-xs text-[var(--tm-text-muted)] uppercase tracking-wider font-bold">
              No templates yet
            </div>
          ) : (
            <ul className="space-y-2" data-testid="template-lab-list">
              {templates.map((t) => (
                <li
                  key={t.id}
                  data-testid={`template-row-${t.id}`}
                  className="flex items-center gap-3 border border-[var(--tm-border)] rounded-md p-2"
                >
                  {t.scan?.data_url ? (
                    <img
                      src={t.scan.data_url}
                      alt={t.name}
                      className="h-12 w-12 object-cover rounded-md border border-[var(--tm-border)]"
                    />
                  ) : (
                    <div className="h-12 w-12 bg-[var(--tm-surface)] rounded-md border border-[var(--tm-border)] flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-[var(--tm-text-muted)]" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{t.name}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold">
                      {t.source} · {Object.keys(t.fields || {}).length} fields ·{" "}
                      {(t.ocr_words || []).length} OCR words
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    aria-label={`Delete ${t.name}`}
                    className="text-[var(--tm-text-soft)] hover:text-[#FF3B30] shrink-0 p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
