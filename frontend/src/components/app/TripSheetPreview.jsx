import React from "react";

/**
 * Static preview of the built-in TripMonitor Default trip sheet.
 *
 * Used by the "Use TripMonitor Default" confirmation modal so the
 * driver can see exactly what they're agreeing to *before* committing.
 * Renders the column structure + a few empty rows + the totals
 * footer — purely visual, NOT interactive (no inputs, no clicks).
 *
 * Kept slim by design (~140 LoC) instead of reusing the heavy
 * `TripSheetForm` (~700 LoC, lots of state, API calls). The preview
 * doesn't need any of that.
 */
export default function TripSheetPreview() {
  // 8 columns matching the default sheet layout.
  const COLS = ["#", "Code", "Location", "City", "ST", "Trailer", "Dep", "Notes"];
  const ROWS = 6; // sample empty row count

  return (
    <div
      data-testid="default-sheet-preview"
      className="bg-white border border-[var(--tm-border)] rounded-md overflow-hidden text-[10px]"
    >
      {/* Title strip */}
      <div className="bg-[var(--tm-navy)] text-white px-3 py-2 flex items-baseline justify-between">
        <div className="font-black tracking-tight text-sm">TripMonitor</div>
        <div className="text-[8px] uppercase tracking-[0.25em] opacity-80">Driver Trip Sheet</div>
      </div>

      {/* Driver info strip (sample, blanks) */}
      <div className="grid grid-cols-3 gap-px bg-[var(--tm-border)] text-[8px] border-b border-[var(--tm-border)]">
        {[
          ["Driver", ""],
          ["Truck #", ""],
          ["Date", ""],
          ["Trailer #", ""],
          ["Order #", ""],
          ["BOL #", ""],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-2 py-1.5">
            <div className="uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">{k}</div>
            <div className="font-bold text-[var(--tm-navy)] min-h-[12px]">{v || " "}</div>
          </div>
        ))}
      </div>

      {/* Stops grid header */}
      <div
        className="grid bg-[var(--tm-surface)] border-b border-[var(--tm-border)] text-[8px] uppercase tracking-wider font-black text-[var(--tm-navy)]"
        style={{ gridTemplateColumns: "20px 36px 1fr 1fr 24px 60px 38px 1fr" }}
      >
        {COLS.map((c) => (
          <div key={c} className="px-1.5 py-1.5 border-r border-[var(--tm-border)] last:border-r-0">{c}</div>
        ))}
      </div>

      {/* Empty stop rows */}
      {Array.from({ length: ROWS }).map((_, i) => (
        <div
          key={i}
          className="grid border-b border-[var(--tm-border)]/60 text-[9px]"
          style={{ gridTemplateColumns: "20px 36px 1fr 1fr 24px 60px 38px 1fr" }}
        >
          <div className="px-1.5 py-1.5 border-r border-[var(--tm-border)]/60 text-[var(--tm-text-muted)] font-bold">
            {i + 1}
          </div>
          {Array.from({ length: 7 }).map((__, j) => (
            <div
              key={j}
              className="px-1.5 py-1.5 border-r border-[var(--tm-border)]/60 last:border-r-0 min-h-[18px]"
            />
          ))}
        </div>
      ))}

      {/* Totals footer */}
      <div className="grid grid-cols-3 gap-px bg-[var(--tm-border)] text-[8px] mt-px">
        {[
          ["Total Stops", ""],
          ["Round-trip Miles", ""],
          ["Driver Signature", ""],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-2 py-1.5">
            <div className="uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">{k}</div>
            <div className="font-bold text-[var(--tm-navy)] min-h-[12px]">{v || " "}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
