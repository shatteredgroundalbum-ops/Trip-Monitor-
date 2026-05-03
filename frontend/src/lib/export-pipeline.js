/**
 * Export helpers for completed trip sheets — CSV and structured JSON
 * backup. JPEG + PDF live in FinishExportDialog (require html2canvas +
 * the rendered DOM); these two are pure-data exports that don't need
 * the DOM, so we keep them here as small utilities.
 */

function escapeCsv(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Builds a CSV blob with one row per stop plus a metadata header.
 * Driver privacy rule: total_trip_miles + segment_miles are INTERNAL;
 * we DO include them in CSV (this is the driver's own backup, not an
 * exported document), but we do NOT include them in PDF/JPEG.
 */
export function buildTripCsvBlob(session, profile) {
  const meta = [
    ["Order #", session?.order_number || ""],
    ["BOL #", session?.bol_number || ""],
    ["Driver", profile?.full_name || ""],
    ["Driver ID", session?.driver_id || ""],
    ["Truck #", session?.truck_number || profile?.truck_number || ""],
    ["Load type", session?.load_type || ""],
    ["Started at", session?.created_at || ""],
    ["Finished at", session?.finished_at || ""],
    ["Total trip miles", session?.total_trip_miles ?? ""],
    [], // blank line
  ];
  const cols = [
    "Stop #", "Date", "Time", "Event", "City", "State",
    "Trailer #", "Temperature (°F)", "Segment miles", "Notes",
  ];
  const lines = [];
  for (const [k, v] of meta) {
    if (k === undefined) lines.push("");
    else lines.push(`${escapeCsv(k)},${escapeCsv(v)}`);
  }
  lines.push(cols.map(escapeCsv).join(","));
  const rows = Array.isArray(session?.rows) ? session.rows : [];
  for (const r of rows) {
    lines.push([
      r.seq, r.departure_date || r.arrival_date || "", r.departure_time || r.arrival_time || "",
      r.event_code || "", r.city || "", r.state || "",
      r.trailer_number || "", r.temperature ?? "", r.segment_miles ?? "", r.notes || "",
    ].map(escapeCsv).join(","));
  }
  if (Array.isArray(session?.expenses) && session.expenses.length) {
    lines.push("");
    lines.push(["Expense", "Amount"].map(escapeCsv).join(","));
    for (const e of session.expenses) {
      lines.push([e.label || "", e.amount ?? ""].map(escapeCsv).join(","));
    }
  }
  return new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
}

/**
 * Structured JSON backup — captures the full trip session, driver
 * profile, and the active template (mapping schema + scan reference).
 * Re-importable by future versions.
 */
export function buildTripBackupBlob({ session, profile, template, app_version = "1.0.0" }) {
  const payload = {
    kind: "trip-monitor-backup",
    version: 1,
    app_version,
    exported_at: new Date().toISOString(),
    session: session || null,
    profile: profile || null,
    template: template ? sanitizeTemplate(template) : null,
  };
  const text = JSON.stringify(payload, null, 2);
  return new Blob([text], { type: "application/json;charset=utf-8" });
}

/**
 * Strip data-URL scan from the template if it's > 1 MB so backups
 * stay tractable; the schema + ocr_words are what matter for import.
 */
function sanitizeTemplate(template) {
  const out = { ...template };
  if (out?.scan?.data_url && out.scan.data_url.length > 1024 * 1024) {
    out.scan = { ...out.scan, data_url: null, _data_url_omitted: true };
  }
  return out;
}

export function safeBaseName(session, profile) {
  const order = session?.order_number || "NO-ORDER";
  const driver = (profile?.full_name || "driver").replace(/\s+/g, "_");
  return `TripSheet_${order}_${driver}`;
}
