import React, { useState, useMemo } from "react";
import { Trophy, Lock, Route, CalendarDays, ListChecks, ChevronDown, ChevronUp } from "lucide-react";

const CAT_META = {
  miles: { icon: Route, label: "Mileage" },
  years: { icon: CalendarDays, label: "Service" },
  trips: { icon: ListChecks, label: "Trips" },
};

/**
 * Earned + locked badges. Earned badges are highlighted with an orange medal,
 * locked ones show a small progress bar. Designed to fit on the dashboard
 * without overwhelming it.
 */
export default function AchievementsPanel({ data }) {
  const [expanded, setExpanded] = useState(false);
  const badges = data?.badges || [];

  // Show 3 earned + 3 next-up by default; "Show all" reveals everything.
  const earned = useMemo(() => badges.filter((b) => b.earned), [badges]);
  const next = useMemo(() => badges.filter((b) => !b.earned).slice(0, 3), [badges]);
  const visible = expanded ? badges : [...earned.slice(-3), ...next];

  return (
    <section
      data-testid="achievements-panel"
      className="bg-white border border-[var(--tm-border)] rounded-md shadow-sm"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--tm-border)]">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-md bg-[var(--tm-orange)] text-white flex items-center justify-center shrink-0">
            <Trophy className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold">
              Milestones
            </div>
            <div className="text-sm font-bold text-[var(--tm-navy)]">
              <span data-testid="achievements-earned">{data?.earned_count ?? 0}</span>
              <span className="text-[var(--tm-text-muted)]"> / {data?.total_count ?? 0}</span>
              <span className="text-[var(--tm-text-soft)] font-normal"> badges earned</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          data-testid="achievements-toggle"
          className="text-xs text-[var(--tm-blue)] font-bold inline-flex items-center gap-1 hover:underline"
        >
          {expanded ? "Collapse" : "Show all"}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </header>

      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2.5" data-testid="achievements-grid">
        {visible.map((b) => (
          <BadgeCard key={b.id} badge={b} />
        ))}
        {visible.length === 0 && (
          <div className="col-span-full text-sm text-[var(--tm-text-soft)] text-center py-3">
            Your badges will appear here as you log miles & trips.
          </div>
        )}
      </div>
    </section>
  );
}

function BadgeCard({ badge }) {
  const meta = CAT_META[badge.category] || CAT_META.miles;
  const Icon = badge.earned ? Trophy : Lock;
  const CatIcon = meta.icon;
  const pct = badge.threshold > 0 ? Math.min(100, Math.round((badge.progress / badge.threshold) * 100)) : 0;

  return (
    <div
      data-testid={`badge-${badge.id}`}
      data-earned={badge.earned ? "true" : "false"}
      className={`rounded-md p-3 border-2 transition-all ${
        badge.earned
          ? "bg-[var(--tm-orange)]/8 border-[var(--tm-orange)]"
          : "bg-[var(--tm-surface)] border-[var(--tm-border)]"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${
          badge.earned ? "bg-[var(--tm-orange)] text-white" : "bg-white text-[var(--tm-text-muted)] border border-[var(--tm-border)]"
        }`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold flex items-center gap-1">
            <CatIcon className="h-2.5 w-2.5" />
            {meta.label}
          </div>
          <div className={`text-sm font-bold leading-tight ${badge.earned ? "text-[var(--tm-navy)]" : "text-[var(--tm-text-soft)]"}`}>
            {badge.label}
          </div>
        </div>
      </div>
      {!badge.earned && (
        <div className="mt-2.5">
          <div className="h-1 w-full bg-white rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--tm-blue)] transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[9px] uppercase tracking-wider text-[var(--tm-text-muted)] mt-1 font-bold">
            {pct}% · {badge.progress.toLocaleString()} / {badge.threshold.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
