import React, { useMemo } from "react";
import { Trophy, Route, CalendarDays, ListChecks } from "lucide-react";

const CAT_META = {
  miles: { icon: Route, label: "Mileage" },
  years: { icon: CalendarDays, label: "Service" },
  trips: { icon: ListChecks, label: "Trips" },
};

/**
 * Earned badges only. Locked / unearned badges stay hidden until the
 * driver actually earns them — no progress teasers, no preview cards.
 * The header still shows X / Y so the driver sees there's more to earn,
 * but the badges themselves stay a surprise reveal.
 */
export default function AchievementsPanel({ data }) {
  const earned = useMemo(() => (data?.badges || []).filter((b) => b.earned), [data?.badges]);

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
      </header>

      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-2.5" data-testid="achievements-grid">
        {earned.map((b) => (
          <BadgeCard key={b.id} badge={b} />
        ))}
        {earned.length === 0 && (
          <div className="col-span-full text-sm text-[var(--tm-text-soft)] text-center py-3">
            Your badges will appear here as you log miles &amp; trips.
          </div>
        )}
      </div>
    </section>
  );
}

function BadgeCard({ badge }) {
  const meta = CAT_META[badge.category] || CAT_META.miles;
  const CatIcon = meta.icon;

  return (
    <div
      data-testid={`badge-${badge.id}`}
      data-earned="true"
      className="rounded-md p-3 border-2 bg-[var(--tm-orange)]/8 border-[var(--tm-orange)] transition-all"
    >
      <div className="flex items-start gap-2">
        <div className="h-8 w-8 rounded-md flex items-center justify-center shrink-0 bg-[var(--tm-orange)] text-white">
          <Trophy className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold flex items-center gap-1">
            <CatIcon className="h-2.5 w-2.5" />
            {meta.label}
          </div>
          <div className="text-sm font-bold leading-tight text-[var(--tm-navy)]">
            {badge.label}
          </div>
        </div>
      </div>
    </div>
  );
}
