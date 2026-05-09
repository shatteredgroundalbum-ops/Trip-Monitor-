/**
 * Local report-history store for Reports screen.
 *
 * Tracks generated/exported reports as lightweight metadata only —
 * the actual files live in the user-selected Trip Monitor folder
 * (Exports, Completed Trip Sheets, Documents). This store is the
 * Reports screen's source of truth for "Generated Reports", "Report
 * History", and the per-export status entries.
 *
 * Backed by localStorage so it survives reloads but stays fully
 * offline. Largest entries are ~250 bytes; capacity is plenty for
 * thousands of reports.
 */

const KEY = "tm_report_history_v1";
const SCHEMA_VERSION = 1;

/** @typedef {"trip" | "mileage" | "stop" | "driver" | "export" | "document"} ReportType */
/** @typedef {"pdf" | "jpeg" | "png" | "csv" | "json"} ReportFormat */
/** @typedef {"ready" | "exported" | "shared" | "failed" | "archived"} ReportStatus */

/**
 * @typedef {Object} ReportRow
 * @property {string} id              uuid-ish
 * @property {string} title           "Order #66754 — Trip Sheet"
 * @property {ReportType} type
 * @property {ReportFormat=} format
 * @property {number} when            epoch ms
 * @property {number=} sizeBytes
 * @property {string=} location       e.g. "Trip Monitor / Exports"
 * @property {ReportStatus} status
 * @property {string=} sessionId      backing trip session
 * @property {boolean=} archived
 */

const TYPE_LABELS = Object.freeze({
  trip: "Trip Report",
  mileage: "Mileage Report",
  stop: "Stop Report",
  driver: "Driver Activity",
  export: "Export",
  document: "Document Report",
});

const FORMAT_LABELS = Object.freeze({
  pdf: "PDF", jpeg: "JPEG", png: "PNG", csv: "CSV", json: "JSON Backup",
});

export function reportTypeLabel(t) { return TYPE_LABELS[t] || "Report"; }
export function reportFormatLabel(f) { return FORMAT_LABELS[f] || (f ? f.toUpperCase() : "—"); }

function safeParse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Returns the raw store {version, items: ReportRow[]}. */
export function loadReportStore() {
  const data = safeParse(localStorage.getItem(KEY));
  if (!data || data.version !== SCHEMA_VERSION) return { version: SCHEMA_VERSION, items: [] };
  if (!Array.isArray(data.items)) return { version: SCHEMA_VERSION, items: [] };
  return data;
}

export function saveReportStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* quota — silently drop */ }
}

export function listReports() { return loadReportStore().items; }

/** Add or update a report by id. */
export function upsertReport(row) {
  const store = loadReportStore();
  const idx = store.items.findIndex((r) => r.id === row.id);
  if (idx === -1) store.items.unshift({ archived: false, ...row });
  else store.items[idx] = { ...store.items[idx], ...row };
  saveReportStore(store);
  return store.items;
}

export function deleteReport(id) {
  const store = loadReportStore();
  store.items = store.items.filter((r) => r.id !== id);
  saveReportStore(store);
  return store.items;
}

export function archiveReport(id, archived = true) {
  return upsertReport({ id, archived, status: archived ? "archived" : "ready" });
}

export function setReportStatus(id, status) {
  return upsertReport({ id, status });
}

export function clearAllReports() {
  saveReportStore({ version: SCHEMA_VERSION, items: [] });
}

/**
 * Seed report rows from finished trip sessions if the store is empty.
 * Idempotent — only seeds if a row for that session_id doesn't exist.
 *
 * Each finished trip yields ONE virtual "Trip Report" row pointing at
 * that session — this keeps the Reports screen useful even before any
 * actual export has occurred.
 */
export function seedReportsFromTrips(finishedTrips) {
  if (!Array.isArray(finishedTrips) || finishedTrips.length === 0) return listReports();
  const store = loadReportStore();
  const have = new Set(store.items.map((r) => r.sessionId).filter(Boolean));
  let added = 0;
  for (const t of finishedTrips) {
    const sid = t.session_id;
    if (!sid || have.has(sid)) continue;
    store.items.unshift({
      id: `seed-${sid}`,
      sessionId: sid,
      title: `Order #${t.order_number || "—"} · Trip Report`,
      type: "trip",
      format: "pdf",
      when: new Date(t.finished_at || t.created_at || Date.now()).getTime(),
      sizeBytes: 64 * 1024,
      location: "Trip Monitor / Completed Trip Sheets",
      status: "ready",
    });
    added += 1;
  }
  if (added) saveReportStore(store);
  return store.items;
}

/** Filter helper used by the Reports screen. */
export function filterReports(items, { type = "all", q = "", from = null, to = null,
                                       trip = "", driver = "", truck = "",
                                       status = "all", format = "all",
                                       includeArchived = false } = {}) {
  return items.filter((r) => {
    if (!includeArchived && r.archived) return false;
    if (type !== "all" && r.type !== type) return false;
    if (status !== "all" && r.status !== status) return false;
    if (format !== "all" && r.format !== format) return false;
    if (from && r.when < +from) return false;
    if (to && r.when > +to) return false;
    if (q) {
      const hay = `${r.title} ${r.sessionId || ""} ${r.location || ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (trip && !(r.sessionId || "").includes(trip)) return false;
    // driver / truck are reserved fields for when reports start carrying them.
    void driver; void truck;
    return true;
  });
}

export const REPORT_TYPES = Object.freeze([
  { value: "trip",     label: "Trip Reports" },
  { value: "mileage",  label: "Mileage Reports" },
  { value: "stop",     label: "Stop Reports" },
  { value: "driver",   label: "Driver Activity" },
  { value: "export",   label: "Export History" },
  { value: "document", label: "Document Reports" },
]);

export const REPORT_FORMATS = Object.freeze([
  { value: "pdf",  label: "PDF" },
  { value: "jpeg", label: "JPEG" },
  { value: "png",  label: "PNG" },
  { value: "csv",  label: "CSV" },
  { value: "json", label: "JSON" },
]);

export const REPORT_STATUSES = Object.freeze([
  { value: "ready",    label: "Ready" },
  { value: "exported", label: "Exported" },
  { value: "shared",   label: "Shared" },
  { value: "failed",   label: "Failed" },
  { value: "archived", label: "Archived" },
]);
