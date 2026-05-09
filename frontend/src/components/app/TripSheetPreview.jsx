import React from "react";

/**
 * Static preview of the built-in TripMonitor Default trip sheet.
 *
 * Rendered inside the "Use TripMonitor Default" confirmation modal so
 * the driver sees a populated, representative example of the sheet
 * before committing — not an empty skeleton. All fields are filled
 * with realistic sample data so the layout, column widths, totals
 * and signature line are recognisable at a glance.
 *
 * Purely visual: NOT interactive (no inputs, no clicks, no API calls).
 */

// Realistic sample so the preview looks like an actual completed sheet
// the moment it pops up. Driver / company names are deliberately
// generic ("J. Driver" / "TripMonitor Demo Co.") so they read as a
// sample, not a real driver's data.
const SAMPLE_HEADER = [
  ["Driver",    "J. Driver"],
  ["Truck #",   "T-104"],
  ["Date",      "02 / 08 / 26"],
  ["Trailer #", "L-2207"],
  ["Order #",   "ORD-58213"],
  ["BOL #",     "BOL-001-A"],
];

const SAMPLE_ROWS = [
  { code: "PU",  loc: "Riverside DC",     city: "Riverside",   st: "CA", trailer: "L-2207", dep: "06:42", note: "Sealed" },
  { code: "DEL", loc: "Phoenix Crossdock", city: "Phoenix",     st: "AZ", trailer: "L-2207", dep: "11:18", note: "On time" },
  { code: "FUEL", loc: "Loves #412",       city: "Quartzsite",  st: "AZ", trailer: "",       dep: "12:05", note: "" },
  { code: "DEL", loc: "Albuquerque RDC",   city: "Albuquerque", st: "NM", trailer: "L-2207", dep: "16:30", note: "Pallet check" },
  { code: "PU",  loc: "Amarillo Whse 7",   city: "Amarillo",    st: "TX", trailer: "L-2208", dep: "21:14", note: "Live load" },
  { code: "END", loc: "Home Terminal",     city: "Riverside",   st: "CA", trailer: "L-2208", dep: "05:55", note: "" },
];

const SAMPLE_TOTALS = [
  ["Total Stops",       "6"],
  ["Round-trip Miles",  "1,442"],
  ["Driver Signature",  "J. Driver"],
];

export default function TripSheetPreview() {
  // 8-column grid mirrors the default sheet layout.
  const COLS = ["#", "Code", "Location", "City", "ST", "Trailer", "Dep", "Notes"];
  const COL_TEMPLATE = "20px 36px 1fr 1fr 24px 60px 38px 1fr";

  return (
    <div
      data-testid="default-sheet-preview"
      className="bg-white border border-[var(--tm-border)] rounded-md overflow-hidden text-[10px]"
    >
      {/* Title strip */}
      <div className="bg-[var(--tm-navy)] text-white px-3 py-2 flex items-baseline justify-between">
        <div className="font-black tracking-tight text-sm">Trip Monitor</div>
        <div className="text-[8px] uppercase tracking-[0.25em] opacity-80">Driver Trip Sheet</div>
      </div>

      {/* Driver info strip — populated sample data */}
      <div className="grid grid-cols-3 gap-px bg-[var(--tm-border)] text-[8px] border-b border-[var(--tm-border)]">
        {SAMPLE_HEADER.map(([k, v]) => (
          <div key={k} className="bg-white px-2 py-1.5">
            <div className="uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">{k}</div>
            <div className="font-bold text-[var(--tm-navy)] truncate">{v}</div>
          </div>
        ))}
      </div>

      {/* Stops grid header */}
      <div
        className="grid bg-[var(--tm-surface)] border-b border-[var(--tm-border)] text-[8px] uppercase tracking-wider font-black text-[var(--tm-navy)]"
        style={{ gridTemplateColumns: COL_TEMPLATE }}
      >
        {COLS.map((c) => (
          <div key={c} className="px-1.5 py-1.5 border-r border-[var(--tm-border)] last:border-r-0">{c}</div>
        ))}
      </div>

      {/* Populated stop rows — driver can see exactly how data
          flows into each column. */}
      {SAMPLE_ROWS.map((r, i) => (
        <div
          key={i}
          className="grid border-b border-[var(--tm-border)]/60 text-[9px]"
          style={{ gridTemplateColumns: COL_TEMPLATE }}
        >
          <Cell first>{i + 1}</Cell>
          <Cell mono>{r.code}</Cell>
          <Cell>{r.loc}</Cell>
          <Cell>{r.city}</Cell>
          <Cell mono>{r.st}</Cell>
          <Cell mono>{r.trailer}</Cell>
          <Cell mono>{r.dep}</Cell>
          <Cell muted last>{r.note}</Cell>
        </div>
      ))}

      {/* Totals footer */}
      <div className="grid grid-cols-3 gap-px bg-[var(--tm-border)] text-[8px] mt-px">
        {SAMPLE_TOTALS.map(([k, v]) => (
          <div key={k} className="bg-white px-2 py-1.5">
            <div className="uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">{k}</div>
            <div className="font-bold text-[var(--tm-navy)] truncate">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Cell({ children, first, last, mono, muted }) {
  // Internal helper: row cells share the same padding + border treatment.
  // `first` cell shows the row number in muted weight; `last` cell drops
  // the right border so the row reads cleanly.
  return (
    <div
      className={`px-1.5 py-1.5 ${last ? "" : "border-r border-[var(--tm-border)]/60"} ${mono ? "font-mono" : ""} ${
        first ? "text-[var(--tm-text-muted)] font-bold" :
        muted ? "text-[var(--tm-text-soft)]" : "text-[var(--tm-navy)]"
      } truncate`}
    >
      {children || "\u00A0"}
    </div>
  );
}
