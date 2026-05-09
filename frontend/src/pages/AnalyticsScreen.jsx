import React, { useEffect, useState } from "react";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import { TrendingUp, Route, ListChecks, Clock, BarChart3, Activity } from "lucide-react";

/**
 * Analytics — performance & trend data. Currently a structural stub
 * that visualizes available stats. Real charting library plugs in
 * later; for now we render lightweight CSS bar charts so the screen
 * feels alive instead of empty.
 */
export default function AnalyticsScreen() {
  const [stats, setStats] = useState(null);
  const [week, setWeek] = useState(null);
  useEffect(() => {
    (async () => {
      try {
        const [s, w] = await Promise.all([api.get("/stats"), api.get("/stats/week")]);
        setStats(s.data);
        setWeek(w.data);
      } catch { /* ignore */ }
    })();
  }, []);

  const days = (week?.days || []);
  const max = Math.max(1, ...days.map((d) => Number(d.miles) || 0));

  return (
    <AppShell overline="Hamburger Menu" pageTitle="Analytics">
      <div data-testid="analytics-screen" className="flex flex-col gap-4">
        {/* trend tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile testId="an-trips"  icon={<TrendingUp className="h-4 w-4" />} label="Trips this week" value={String(week?.trips_this_week ?? 0)} />
          <Tile testId="an-miles"  icon={<Route className="h-4 w-4" />}      label="Miles this week" value={fmt(week?.miles_this_week ?? 0)} />
          <Tile testId="an-stops"  icon={<ListChecks className="h-4 w-4" />} label="Stops this week" value={String(week?.stops_this_week ?? 0)} />
          <Tile testId="an-onTime" icon={<Clock className="h-4 w-4" />}      label="On-time rate"    value={`${week?.on_time_pct ?? 0}%`} />
        </div>

        {/* mileage trend */}
        <Card title="Mileage Trend (last 7 days)" icon={<BarChart3 className="h-4 w-4" />}>
          {days.length === 0 ? (
            <Empty>No data yet — finish a few trips to see your weekly trend.</Empty>
          ) : (
            <div className="grid grid-cols-7 gap-2 items-end h-40 px-2">
              {days.map((d) => {
                const h = Math.max(4, Math.round(((Number(d.miles) || 0) / max) * 100));
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1.5">
                    <div className="w-full bg-[var(--tm-surface-2)] rounded-t-md" style={{ height: `${h}%` }}>
                      <div className="w-full h-full bg-[var(--tm-blue)] rounded-t-md" />
                    </div>
                    <div className="text-[10px] font-bold text-[var(--tm-navy)]/70 uppercase tracking-wider">{shortDay(d.date)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Load-Type Summary" icon={<Activity className="h-4 w-4" />}>
          <Empty>Per-load-type breakdown will appear here as you log trips with the load type filled in.</Empty>
        </Card>
      </div>
    </AppShell>
  );
}

function Tile({ testId, icon, label, value }) {
  return (
    <div data-testid={testId} className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-1">
      <span className="text-[var(--tm-navy)]" aria-hidden="true">{icon}</span>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold mt-1.5">{label}</div>
      <div className="text-2xl md:text-3xl font-black tracking-tight text-[var(--tm-navy)]">{value}</div>
    </div>
  );
}
function Card({ title, icon, children }) {
  return (
    <div className="bg-white border border-[var(--tm-border)] rounded-xl shadow-[0_2px_8px_rgba(14,31,71,0.04)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--tm-border)]">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--tm-navy)]">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
function Empty({ children }) {
  return (
    <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold px-1 py-2 leading-snug">{children}</div>
  );
}
function fmt(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "K";
  return v.toLocaleString();
}
function shortDay(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2); }
  catch { return iso; }
}
