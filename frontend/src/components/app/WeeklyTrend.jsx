import React from "react";
import { TrendingUp } from "lucide-react";

/**
 * Pure-CSS 7-bar mini-trend on the dashboard. No charting libraries.
 * Bars scale to the busiest day of the window. Today bar is highlighted
 * orange; days with zero miles show a faint outline so the layout is stable.
 */
export default function WeeklyTrend({ data }) {
  const days = data?.days || [];
  const max = Math.max(1, ...(days.map((d) => d.miles) || [0]));

  return (
    <section
      data-testid="weekly-trend"
      className="bg-white border border-[var(--tm-border)] rounded-md shadow-sm"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--tm-border)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-md bg-[var(--tm-blue)] text-white flex items-center justify-center shrink-0">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-blue)] font-bold">
              This week
            </div>
            <div className="text-sm font-bold text-[var(--tm-navy)]">
              <span data-testid="week-miles-total">{(data?.miles_total_7d ?? 0).toLocaleString()}</span>
              <span className="text-[var(--tm-text-soft)] font-normal"> miles · </span>
              <span data-testid="week-trips-total">{data?.trips_total_7d ?? 0}</span>
              <span className="text-[var(--tm-text-soft)] font-normal"> trips</span>
            </div>
          </div>
        </div>
        {data?.miles_max > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold whitespace-nowrap">
            Best: {data.miles_max.toLocaleString()} mi
          </div>
        )}
      </header>

      <div
        className="px-4 pt-4 pb-3 grid grid-cols-7 gap-1.5 items-end"
        style={{ height: 130 }}
        data-testid="weekly-trend-bars"
      >
        {days.map((d) => {
          const heightPct = max > 0 ? Math.max(d.miles > 0 ? 6 : 0, (d.miles / max) * 100) : 0;
          const isToday = d.is_today;
          return (
            <div key={d.date} className="flex flex-col items-center justify-end h-full" data-testid={`week-bar-${d.label.toLowerCase()}`}>
              <div className="text-[9px] font-bold text-[var(--tm-navy)] tabular-nums leading-none mb-1 h-3">
                {d.miles > 0 ? formatMilesShort(d.miles) : ""}
              </div>
              <div
                className={`w-full rounded-t-sm transition-[height] duration-500 ease-out ${
                  d.miles === 0
                    ? "border border-dashed border-[var(--tm-border)]"
                    : isToday
                      ? "bg-[var(--tm-orange)]"
                      : "bg-[var(--tm-blue)]"
                }`}
                style={{ height: `${heightPct}%`, minHeight: d.miles > 0 ? 6 : 4 }}
                title={`${d.label}: ${d.miles.toLocaleString()} mi · ${d.trips} trip${d.trips === 1 ? "" : "s"}`}
              />
              <div className={`mt-1.5 text-[9px] font-bold uppercase tracking-wider ${isToday ? "text-[var(--tm-orange)]" : "text-[var(--tm-text-muted)]"}`}>
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatMilesShort(n) {
  if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return String(n);
}
