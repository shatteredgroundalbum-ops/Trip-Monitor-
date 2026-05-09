import React, { useEffect, useMemo, useState } from "react";
import { Input } from "../ui/input";
import {
  Calculator, Check, AlertTriangle, Route, RefreshCw, Loader2, Info,
} from "lucide-react";
import {
  buildWaypointsFromSession, computeRouteMileage, loadMileageResult,
  saveMileageResult, setCompanyPayMiles, diff, RouteEngineError,
} from "../../lib/route-mileage";
import { toast } from "sonner";

/**
 * Mileage Card
 *
 * Displays the three numbers the spec calls out — Real Route Miles,
 * Company Pay Miles, Difference — and a single "Calculate" button
 * that runs the OSM/OSRM mileage engine. NO map UI, NO route picker,
 * NO GPS log — only the resulting numbers + an optional read-only
 * stop-to-stop list once a calculation has been performed.
 */
export default function MileageCard({ session }) {
  const sessionId = session?.session_id || null;
  const [stored, setStored] = useState(() => sessionId ? (loadMileageResult(sessionId) || {}) : {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [pay, setPay] = useState(stored.companyPayMiles ?? "");

  // Re-hydrate when we open a different session.
  useEffect(() => {
    const next = sessionId ? (loadMileageResult(sessionId) || {}) : {};
    setStored(next);
    setPay(next.companyPayMiles ?? "");
    setErr(null);
  }, [sessionId]);

  const stops = useMemo(() => buildWaypointsFromSession(session), [session]);
  const eligibleStopCount = stops.length;
  const canCalc = eligibleStopCount >= 2;

  const onCalculate = async () => {
    if (!sessionId || !canCalc || busy) return;
    setBusy(true); setErr(null);
    try {
      const result = await computeRouteMileage(session);
      const next = {
        ...stored,
        routeMiles: result.routeMiles,
        legMiles: result.legMiles,
        waypoints: result.waypoints,
        computedAt: result.computedAt,
        companyPayMiles: stored.companyPayMiles ?? null,
      };
      saveMileageResult(sessionId, next);
      setStored(next);
      toast.success(`Route mileage: ${result.routeMiles.toLocaleString()} mi`);
    } catch (e) {
      const msg = e instanceof RouteEngineError ? e.message : "Could not calculate route mileage";
      setErr(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const onPayBlur = () => {
    if (!sessionId) return;
    const updated = setCompanyPayMiles(sessionId, pay === "" ? null : pay);
    if (updated) setStored((p) => ({ ...p, companyPayMiles: updated.companyPayMiles }));
  };

  const route = stored.routeMiles ?? null;
  const payNum = Number.isFinite(+pay) && pay !== "" ? +pay : (stored.companyPayMiles ?? null);
  const d = (route != null && payNum != null) ? diff(route, payNum) : null;
  const dPositive = d != null && d > 0;
  const dNegative = d != null && d < 0;
  const dZero     = d != null && d === 0;

  return (
    <div data-testid="trip-mileage-card" className="rounded-md p-5 shadow-sm border border-[var(--tm-border)] bg-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold flex items-center gap-1.5">
            Mileage
            <span className="text-[var(--tm-text-muted)]">·</span>
            <span className="text-[var(--tm-blue)]">Internal estimate</span>
          </div>
          <div className="text-base font-bold text-[var(--tm-navy)]">Real Route Miles vs Company Pay Miles</div>
          <div className="text-xs text-[var(--tm-text-soft)]">
            Estimated road miles from your stops via OpenStreetMap. Not a navigation tool.
          </div>
        </div>
        <button
          type="button"
          data-testid="trip-mileage-calc"
          disabled={!canCalc || busy}
          onClick={onCalculate}
          className={[
            "h-10 px-3.5 rounded-md font-bold text-xs tracking-wide inline-flex items-center gap-1.5 border whitespace-nowrap",
            canCalc && !busy
              ? "bg-[var(--tm-navy)] text-white border-[var(--tm-navy)] hover:brightness-110"
              : "bg-white text-[var(--tm-navy)]/60 border-[var(--tm-border)] cursor-not-allowed",
          ].join(" ")}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> :
            (route != null ? <RefreshCw className="h-4 w-4" /> : <Calculator className="h-4 w-4" />)}
          {busy ? "Calculating…" : route != null ? "Recalculate" : "Calculate"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat
          testId="trip-mileage-real"
          label="Real Route Miles"
          value={route != null ? route : "—"}
          sub={route != null ? `Updated ${formatRelative(stored.computedAt)}` : "Tap Calculate to estimate"}
          icon={<Route className="h-4 w-4" />}
          tone="navy"
        />
        <Stat
          testId="trip-mileage-pay"
          label="Company Pay Miles"
          input={(
            <Input
              data-testid="trip-mileage-pay-input"
              type="number"
              min={0}
              inputMode="numeric"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
              onBlur={onPayBlur}
              placeholder="Pay miles"
              className="h-10 text-lg font-black tabular-nums"
            />
          )}
          sub="Miles paid by dispatch"
          icon={<Calculator className="h-4 w-4" />}
          tone="white"
        />
        <Stat
          testId="trip-mileage-diff"
          label="Difference"
          value={d == null ? "—" : (dPositive ? `+${d}` : String(d))}
          sub={
            d == null ? "Enter pay miles & calculate"
            : dPositive ? "unpaid miles vs pay"
            : dNegative ? "extra paid vs route"
            : "matches"
          }
          icon={dPositive ? <AlertTriangle className="h-4 w-4" /> : dZero ? <Check className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          tone={dPositive ? "warn" : dNegative ? "blue" : dZero ? "success" : "white"}
        />
      </div>

      {/* Stop-to-stop legs (read-only). Only shown after a calc. */}
      {Array.isArray(stored.legMiles) && stored.legMiles.length > 0 && (
        <div data-testid="trip-mileage-legs" className="mt-4 border border-[var(--tm-border)] rounded-md overflow-hidden">
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold bg-[var(--tm-surface-2)] border-b border-[var(--tm-border)]">
            Stop-to-stop
          </div>
          <ul className="divide-y divide-[var(--tm-border)]">
            {stored.waypoints?.slice(0, -1).map((w, i) => {
              const next = stored.waypoints[i + 1];
              const legMi = stored.legMiles[i];
              return (
                <li key={`${w.seq}-${i}`} className="px-3 py-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--tm-navy)]">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] tabular-nums">
                    #{w.seq}→#{next?.seq}
                  </span>
                  <span className="flex-1 truncate">{w.label} <span className="text-[var(--tm-text-muted)]">→</span> {next?.label}</span>
                  <span className="tabular-nums font-bold">{legMi.toLocaleString()} mi</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {err && (
        <div className="mt-3 px-3 py-2 rounded-md bg-[var(--tm-orange)]/5 border border-[var(--tm-orange)]/40 text-[12px] text-[var(--tm-orange-deep)] font-bold">
          {err}
        </div>
      )}
      {!canCalc && (
        <div className="mt-3 text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">
          Add at least two stops with a location and state to calculate. We have <span className="font-bold">{eligibleStopCount}</span> usable stop{eligibleStopCount === 1 ? "" : "s"} so far.
        </div>
      )}
    </div>
  );
}

/* ---- bits ---- */

function Stat({ testId, label, value, input, sub, icon, tone = "white" }) {
  const borderCls = tone === "warn"    ? "border-[var(--tm-orange)]/40 bg-[var(--tm-orange)]/5"
                  : tone === "success" ? "border-emerald-400/40 bg-emerald-50"
                  : tone === "blue"    ? "border-[var(--tm-blue)]/40 bg-[var(--tm-blue)]/5"
                  : tone === "navy"    ? "border-[var(--tm-navy)]/30 bg-[var(--tm-navy)]/5"
                  : "border-[var(--tm-border)] bg-white";
  const valueColor = tone === "warn" ? "text-[var(--tm-orange-deep)]"
                   : tone === "success" ? "text-emerald-700"
                   : tone === "blue" ? "text-[var(--tm-blue)]"
                   : "text-[var(--tm-navy)]";
  return (
    <div data-testid={testId} className={`rounded-md p-3 border ${borderCls} flex flex-col gap-1`}>
      <span className="text-[var(--tm-navy)] inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold">
        {icon}{label}
      </span>
      {input ? (
        input
      ) : (
        <span className={`text-3xl font-black tabular-nums ${valueColor}`}>{value}{typeof value === "number" || (typeof value === "string" && /^[+-]?\d/.test(value)) ? <span className="text-base font-bold text-[var(--tm-text-muted)] ml-1">mi</span> : null}</span>
      )}
      {sub && <span className="text-[11px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{sub}</span>}
    </div>
  );
}

function formatRelative(ms) {
  if (!ms) return "—";
  try {
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return "—"; }
}
