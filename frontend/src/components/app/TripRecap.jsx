import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Trophy, Route, Gauge, CalendarDays, Sparkles, ArrowRight, X } from "lucide-react";
import { api } from "../../lib/api";

const fmt = (n) => Number(n || 0).toLocaleString();

/**
 * Internal-only celebration shown right after a trip is finished.
 * Loads `/api/trip-sessions/:id/recap` and renders the per-trip miles,
 * career growth (before → after), today + this-week totals, next milestone,
 * and any badge unlocked by THIS trip.
 *
 * Privacy: this component is internal-only — its data NEVER appears on the
 * exported JPEG/PDF/email/print of the trip sheet.
 */
export default function TripRecap({ sessionId, open, onClose }) {
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !sessionId) return;
    setLoading(true);
    api.get(`/trip-sessions/${sessionId}/recap`)
      .then((r) => setRecap(r.data))
      .catch(() => setRecap(null))
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent
        data-testid="trip-recap-dialog"
        className="max-w-md bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md p-0 overflow-hidden"
        hideClose
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-[var(--tm-navy)] to-[var(--tm-blue-deep)] text-white p-5 relative">
          <button
            type="button"
            onClick={onClose}
            data-testid="trip-recap-close"
            aria-label="Close trip recap"
            className="absolute top-3 right-3 text-white/70 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--tm-orange)] font-bold flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" /> Trip Recap
          </div>
          <DialogTitle className="text-white text-2xl font-black tracking-tight mt-1">
            Trip complete — nice work
          </DialogTitle>
          <DialogDescription className="text-white/70 text-sm mt-1">
            Internal recap. Never appears on the printed sheet.
          </DialogDescription>
        </div>

        {loading || !recap ? (
          <div className="p-8 text-sm uppercase tracking-[0.2em] text-[var(--tm-text-muted)] text-center font-bold">
            Crunching the numbers…
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* This trip miles */}
            <div data-testid="recap-trip-miles" className="text-center">
              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--tm-blue)] font-bold">
                This trip
              </div>
              <div className="text-5xl font-black tracking-tight text-[var(--tm-navy)] tabular-nums mt-1">
                {fmt(recap.trip_miles)}<span className="text-2xl text-[var(--tm-text-soft)] ml-1">mi</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] mt-1">
                {recap.mileage_mode === "segment" ? "Sum of stop segments" : "Workflow round trip"}
              </div>
            </div>

            {/* Career before → after */}
            <div data-testid="recap-career" className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-3">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold flex items-center gap-1.5 mb-1">
                <Route className="h-3 w-3" /> Career mileage
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--tm-text-soft)] tabular-nums" data-testid="recap-career-before">
                  {fmt(recap.career_before)}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--tm-blue)]" />
                <span className="font-black text-[var(--tm-navy)] tabular-nums" data-testid="recap-career-after">
                  {fmt(recap.career_after)}
                </span>
                <span className="text-[var(--tm-text-soft)] text-xs">mi</span>
              </div>
            </div>

            {/* Today + Week tiles */}
            <div className="grid grid-cols-2 gap-2">
              <RecapTile
                icon={<Gauge className="h-3.5 w-3.5" />}
                label="Today"
                value={`${fmt(recap.miles_today)} mi`}
                testId="recap-today"
              />
              <RecapTile
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="This week"
                value={`${fmt(recap.miles_week)} mi`}
                testId="recap-week"
              />
            </div>

            {/* Next milestone */}
            {recap.next_milestone && (
              <div data-testid="recap-next-milestone" className="bg-white border border-[var(--tm-border)] rounded-md p-3">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-blue)] font-bold mb-1">
                  Next milestone
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-bold text-[var(--tm-navy)]">{recap.next_milestone.label}</div>
                  <div className="text-xs text-[var(--tm-text-soft)] tabular-nums">
                    {fmt(recap.next_milestone.remaining)} mi to go
                  </div>
                </div>
                <div className="h-1.5 w-full bg-[var(--tm-surface-2)] rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-[var(--tm-blue)] transition-[width] duration-700 ease-out"
                    style={{ width: `${recap.next_milestone.progress_pct}%` }}
                  />
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold mt-1">
                  {recap.next_milestone.progress_pct}%
                </div>
              </div>
            )}

            {/* New badges */}
            {recap.new_badges?.length > 0 && (
              <div data-testid="recap-new-badges" className="bg-[var(--tm-orange)]/8 border-2 border-[var(--tm-orange)] rounded-md p-3">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold flex items-center gap-1.5 mb-2">
                  <Trophy className="h-3 w-3" /> Unlocked this trip
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recap.new_badges.map((b) => (
                    <span
                      key={b.id}
                      data-testid={`recap-new-badge-${b.id}`}
                      className="inline-flex items-center gap-1 bg-[var(--tm-orange)] text-white text-[11px] font-bold px-2 py-1 rounded-full"
                    >
                      <Trophy className="h-3 w-3" />
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Button
              data-testid="trip-recap-done"
              onClick={onClose}
              className="w-full h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md mt-2"
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecapTile({ icon, label, value, testId }) {
  return (
    <div data-testid={testId} className="bg-white border border-[var(--tm-border)] rounded-md p-3">
      <div className="text-[9px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-lg font-black tracking-tight text-[var(--tm-navy)] tabular-nums">
        {value}
      </div>
    </div>
  );
}
