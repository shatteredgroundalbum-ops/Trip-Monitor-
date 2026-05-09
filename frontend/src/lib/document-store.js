/**
 * Local document index/metadata store for the Documents screen.
 *
 * IMPORTANT: this store does NOT contain the actual binary content.
 * The user's photos, BOLs, PDFs, scans, and exports live OUTSIDE the
 * app inside their selected Trip Monitor folder. The app only keeps:
 *
 *   • a stable id
 *   • the original filename
 *   • the document category
 *   • optional tripId / orderNumber association
 *   • content type (image/pdf/jpeg/png/csv/json/...)
 *   • size in bytes (reported by the picker; unverified)
 *   • a small thumbnail data-URL (≤ ~5 KB) for fast list rendering
 *   • the resolved storage location (label only — never a handle)
 *   • timestamps (created, lastOpened)
 *   • flags (archived, locked, hidden)
 *
 * The thumbnail is kept inline so the Documents list and DocumentViewer
 * can render even when the file system permission has lapsed. When the
 * user re-grants permission, the actual file is re-fetched from the
 * Trip Monitor folder by name.
 */

const KEY = "tm_document_index_v1";
const SCHEMA_VERSION = 1;

export const DOCUMENT_CATEGORIES = Object.freeze([
  { value: "bols",             label: "BOLs",                 path: "Documents/BOLs",             desc: "Bills of lading" },
  { value: "scale_tickets",    label: "Scale Tickets",        path: "Documents/Scale Tickets",    desc: "Weight & axle tickets" },
  { value: "lumper_receipts",  label: "Lumper Receipts",      path: "Documents/Lumper Receipts",  desc: "Lumper-fee receipts" },
  { value: "receipts",         label: "Receipts",             path: "Documents/Receipts",         desc: "Fuel, tolls, expenses" },
  { value: "trip_attachments", label: "Trip Attachments",     path: "Documents/Trip Attachments", desc: "Per-trip notes & files" },
  { value: "photos",           label: "Photos",               path: "Documents/Photos",           desc: "POD & damage photos" },
  { value: "completed_sheets", label: "Completed Trip Sheets",path: "Completed Trip Sheets",      desc: "Finished sheets ready to share" },
  { value: "exports",          label: "Exports",              path: "Exports",                    desc: "PDF / JPEG export history" },
]);

const CATEGORY_BY_VALUE = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.value, c]));

export function categoryLabel(v) { return CATEGORY_BY_VALUE[v]?.label || "Document"; }
export function categoryPath(v)  { return CATEGORY_BY_VALUE[v]?.path  || "Documents"; }

export const DOCUMENT_FILE_TYPES = Object.freeze([
  { value: "image", label: "Image" },
  { value: "pdf",   label: "PDF" },
  { value: "csv",   label: "CSV" },
  { value: "json",  label: "JSON" },
  { value: "other", label: "Other" },
]);

export function fileTypeFromMime(mime) {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/csv" || mime === "application/vnd.ms-excel") return "csv";
  if (mime === "application/json") return "json";
  return "other";
}

function safeParse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function loadDocStore() {
  const data = safeParse(localStorage.getItem(KEY));
  if (!data || data.version !== SCHEMA_VERSION || !Array.isArray(data.items)) {
    return { version: SCHEMA_VERSION, items: [] };
  }
  return data;
}

export function saveDocStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota — silently drop */ }
}

export function listDocuments() { return loadDocStore().items; }

export function upsertDocument(row) {
  const store = loadDocStore();
  const idx = store.items.findIndex((d) => d.id === row.id);
  if (idx === -1) store.items.unshift({
    archived: false, locked: false, hidden: false, ...row,
  });
  else store.items[idx] = { ...store.items[idx], ...row };
  saveDocStore(store);
  return store.items;
}

export function deleteDocument(id) {
  const store = loadDocStore();
  store.items = store.items.filter((d) => d.id !== id);
  saveDocStore(store);
  return store.items;
}

export function archiveDocument(id, archived = true) {
  return upsertDocument({ id, archived });
}
export function lockDocument(id, locked = true) {
  return upsertDocument({ id, locked });
}
export function hideDocument(id, hidden = true) {
  return upsertDocument({ id, hidden });
}

export function touchOpened(id) {
  return upsertDocument({ id, lastOpened: Date.now() });
}

export function clearAllDocuments() {
  saveDocStore({ version: SCHEMA_VERSION, items: [] });
}

/** Filter helper used by the screen. */
export function filterDocuments(items, {
  category = "all", q = "", trip = "", from = null, to = null,
  fileType = "all", includeArchived = false, includeHidden = false,
} = {}) {
  return items.filter((d) => {
    if (!includeArchived && d.archived) return false;
    if (!includeHidden && d.hidden) return false;
    if (category !== "all" && d.category !== category) return false;
    if (fileType !== "all" && d.fileType !== fileType) return false;
    if (from && d.createdAt < +from) return false;
    if (to && d.createdAt > +to) return false;
    if (trip && !`${d.orderNumber || ""} ${d.tripId || ""}`.toLowerCase().includes(trip.toLowerCase())) return false;
    if (q) {
      const hay = `${d.name} ${d.orderNumber || ""} ${d.tripId || ""} ${d.location || ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
}

/**
 * Detect duplicate filenames within the same category. Returns a map
 * of filename → array of doc rows (only includes filenames with > 1
 * row). Used by Document Organization → Duplicate detection.
 */
export function detectDuplicates(items) {
  const groups = {};
  for (const d of items) {
    const key = `${d.category}::${d.name?.toLowerCase()}`;
    (groups[key] ||= []).push(d);
  }
  return Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length > 1));
}

/** Per-category count for the Categories grid. */
export function countByCategory(items) {
  const c = Object.fromEntries(DOCUMENT_CATEGORIES.map((cat) => [cat.value, 0]));
  for (const d of items) if (!d.archived && !d.hidden) c[d.category] = (c[d.category] || 0) + 1;
  return c;
}
