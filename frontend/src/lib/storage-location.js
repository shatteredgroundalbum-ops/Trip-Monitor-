/**
 * Offline storage location wizard for Trip Monitor — Driver Edition.
 *
 * Drivers can pick where exports + backups land:
 *   - "app"        → in-app only (IndexedDB; browser-managed quota)
 *   - "documents"  → device Documents folder (File System Access API)
 *   - "sdcard"     → external SD card / USB drive (File System Access API)
 *   - "custom"     → user-picked folder (File System Access API)
 *
 * On browsers without FSA support (e.g. iOS Safari) only "app" mode is
 * available; writeFile() falls back to a normal browser download in that
 * case so drivers always get their file.
 *
 * Directory handles persist in IndexedDB as opaque structured-clonable
 * objects; on next session we re-`requestPermission` before writing.
 */

const STORAGE_DB = "tm-storage";
const STORAGE_STORE = "config";
const CONFIG_KEY = "destination_config";
const HANDLE_KEY = "destination_handle";

/** "Quota approaching" warning threshold — fires at 90% used per spec. */
export const QUOTA_WARNING_PCT = 90;

export const STORAGE_MODES = Object.freeze({
  app: {
    id: "app",
    label: "In-app only",
    blurb: "Saved inside the app — works on every device. Browser may clear if storage runs low.",
    needsFsa: false,
  },
  documents: {
    id: "documents",
    label: "Documents folder",
    blurb: "Pick your device's Documents folder once; exports save straight there.",
    needsFsa: true,
  },
  sdcard: {
    id: "sdcard",
    label: "SD card or USB drive",
    blurb: "Pick a folder on a removable card or USB drive. Great for backups.",
    needsFsa: true,
  },
  custom: {
    id: "custom",
    label: "Choose a folder",
    blurb: "Pick any folder on your device — Trip Monitor will write exports there.",
    needsFsa: true,
  },
});

// ---------- IndexedDB helpers (mirrors local-auth.js style) ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORAGE_STORE)) db.createObjectStore(STORAGE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE, "readonly");
      const req = tx.objectStore(STORAGE_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function kvSet(key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE, "readwrite");
      tx.objectStore(STORAGE_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function kvDelete(key) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_STORE, "readwrite");
      tx.objectStore(STORAGE_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// ---------- Capability detection ----------

export function isFileSystemAccessSupported() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

// ---------- Quota / usage ----------

/**
 * Returns { usage, quota, percent } in bytes. percent is rounded to one
 * decimal place. Numbers come from `navigator.storage.estimate()` which
 * is supported in all evergreen browsers; older browsers return zeros.
 */
export async function getStorageUsage() {
  try {
    if (navigator?.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const percent = quota > 0 ? Math.round((usage / quota) * 1000) / 10 : 0;
      return { usage, quota, percent, supported: true };
    }
  } catch {
    /* ignore */
  }
  return { usage: 0, quota: 0, percent: 0, supported: false };
}

export function isAboveQuotaWarning(percent) {
  return Number(percent) >= QUOTA_WARNING_PCT;
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ---------- Destination config ----------

const DEFAULT_CONFIG = Object.freeze({
  mode: "app",
  folder_name: "",
  picked_at: null,
});

export async function getDestinationConfig() {
  const cfg = await kvGet(CONFIG_KEY);
  return cfg ? { ...DEFAULT_CONFIG, ...cfg } : { ...DEFAULT_CONFIG };
}

async function setDestinationConfig(cfg) {
  await kvSet(CONFIG_KEY, { ...DEFAULT_CONFIG, ...cfg });
}

async function setDirectoryHandle(handle) {
  if (handle) await kvSet(HANDLE_KEY, handle);
  else await kvDelete(HANDLE_KEY);
}

async function getDirectoryHandle() {
  return (await kvGet(HANDLE_KEY)) || null;
}

/**
 * Re-acquire write permission for a saved directory handle. Returns the
 * handle on success, null if the user denied or the handle is stale.
 */
async function ensureHandlePermission(handle) {
  if (!handle?.queryPermission) return null;
  try {
    const opts = { mode: "readwrite" };
    let perm = await handle.queryPermission(opts);
    if (perm === "granted") return handle;
    perm = await handle.requestPermission(opts);
    return perm === "granted" ? handle : null;
  } catch {
    return null;
  }
}

/**
 * Open the OS folder picker and persist the resulting handle. `mode`
 * is one of STORAGE_MODES — used purely as a label in the UI; the
 * driver still picks any folder they want.
 */
export async function pickDestinationFolder(mode) {
  if (!isFileSystemAccessSupported()) {
    throw new Error("Folder picking isn't available on this browser");
  }
  const m = STORAGE_MODES[mode] || STORAGE_MODES.custom;
  let handle;
  try {
    handle = await window.showDirectoryPicker({
      id: `tm-${m.id}`,
      mode: "readwrite",
      startIn: m.id === "documents" ? "documents" : "downloads",
    });
  } catch (err) {
    if (err?.name === "AbortError") return null;
    throw err;
  }
  await setDirectoryHandle(handle);
  await setDestinationConfig({
    mode: m.id,
    folder_name: handle.name || "",
    picked_at: new Date().toISOString(),
  });
  return { mode: m.id, folder_name: handle.name || "" };
}

/** Switch back to in-app mode — clears any stored directory handle. */
export async function selectInAppDestination() {
  await setDirectoryHandle(null);
  await setDestinationConfig({ mode: "app", folder_name: "", picked_at: new Date().toISOString() });
}

/**
 * Write a Blob/File to the configured destination. Falls back to a
 * standard browser download if FSA isn't available, the saved handle
 * is missing, or the user denies permission.
 *
 * Returns { mode: "fs" | "download", path?: string }.
 */
export async function writeFileToDestination(filename, blob) {
  const cfg = await getDestinationConfig();
  if (cfg.mode !== "app" && isFileSystemAccessSupported()) {
    const handle = await getDirectoryHandle();
    const ok = handle ? await ensureHandlePermission(handle) : null;
    if (ok) {
      try {
        const fileHandle = await ok.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { mode: "fs", path: `${ok.name || cfg.folder_name}/${filename}` };
      } catch {
        /* fall through to download */
      }
    }
  }
  // Browser-download fallback (also the "in-app" path — there's no real
  // "save inside the app" for binary exports in a PWA, so we hand the
  // file to the OS download manager which respects the device's
  // default Downloads folder).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { mode: "download", path: filename };
}

/** Clear destination config (used on auth wipe / dev reset). */
export async function _DEV_resetStorageConfig() {
  await kvDelete(CONFIG_KEY);
  await kvDelete(HANDLE_KEY);
}
