import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import {
  TrendingUp, Route, ListChecks, Clock, BarChart3, Activity, Truck,
  CheckCircle2, XCircle, Save, FileText, Award, MapPin, FolderOpen,
  Cloud, HardDrive, RefreshCw,
} from "lucide-react";
import { getStorageUsage } from "../lib/storage-location";

/**
 * Analytics — operational insight dashboard.
 *
 * Pulls finished trips once and computes every section client-side
 * filtered by the active time range, so toggling Today/7/30/90/Year
 * is instant. Charts are deliberately calm — bars, lines and rings,
 * no flashy gradients or animation overload.
 */

const RANGE_OPTIONS = [
  { value: "today",  label: "Today",   days: 1 },
  { value: "7d",     label: "7 Days",  days: 7 },
  { value: "30d",    label: "30 Days", days: 30 },
  { value: "90d",    label: "90 Days", days: 90 },
  { value: "year",   label: "Year",    days: 365 },
  { value: "custom", label: "Custom",  days: 0 },
];

export default function AnalyticsScreen() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [storage, setStorage] = useState({ percent: 0, usage: 0, quota: 0 });
  const [range, setRange] = useState(() => sessionStorage.getItem("tm_analytics_range") || "30d");
  const [customFrom, setCustomFrom] = useState(() => isoDate(daysAgo(7)));
  const [customTo, setCustomTo] = useState(() => isoDate(new Date()));
  const [loading, setLoading] = useState(true);

  useEffect(() => { sessionStorage.setItem("tm_analytics_range", range); }, [range]);

  useEffect(() => {
    (async () => {
      try {
        const [allTrips, s, ach] = await Promise.all([
          api.get("/trip-sessions"),
          api.get("/stats"),
          api.get("/achievements"),
        ]);
        setTrips(allTrips.data || []);
        setStats(s.data);
        setAchievements(ach.data);
      } catch { /* ignore */ }
      try { setStorage(await getStorageUsage()); } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  // Filter trips by selected range.
  const { from, to, finished, all, days } = useMemo(
    () => filterByRange(trips, range, customFrom, customTo),
    [trips, range, customFrom, customTo],
  );

  // OVERVIEW
  const overview = useMemo(() => deriveOverview(finished), [finished]);

  // MILEAGE — daily / weekly / monthly buckets within range
  const dailyBuckets   = useMemo(() => bucketBy(finished, "day",   from, to), [finished, from, to]);
  const weeklyBuckets  = useMemo(() => bucketBy(finished, "week",  from, to), [finished, from, to]);
  const monthlyBuckets = useMemo(() => bucketBy(finished, "month", from, to), [finished, from, to]);

  // STOPS
  const stopsBreakdown = useMemo(() => deriveStops(finished, dailyBuckets), [finished, dailyBuckets]);

  // TRIPS
  const tripBreakdown = useMemo(() => deriveTripBreakdown(all, finished), [all, finished]);

  // PERFORMANCE
  const performance = useMemo(() => derivePerformance(finished, dailyBuckets), [finished, dailyBuckets]);

  // STORAGE & EXPORT (best-effort, no exports endpoint yet)
  const storageStats = {
    percent: storage.percent || 0,
    usage_mb: storage.usage ? Math.round(storage.usage / (1024 * 1024)) : 0,
    quota_mb: storage.quota ? Math.round(storage.quota / (1024 * 1024)) : 0,
    exports: trips.filter((t) => Array.isArray(t.exports)).reduce((acc, t) => acc + (t.exports?.length || 0), 0),
    backups: readJSON("tm_account_backup_meta_v1") ? 1 : 0,
    syncs: readJSON("tm_offline_queue", []).length === 0 ? "Up to date" : `${readJSON("tm_offline_queue", []).length} queued`,
  };

  const milestonesEarned = (achievements?.badges || []).filter((b) => b.earned).length;

  if (loading) {
    return (
      <AppShell overline="Hamburger Menu" pageTitle="Analytics">
        <div className="text-sm text-[var(--tm-text-soft)] font-semibold">Loading analytics…</div>
      </AppShell>
    );
  }

  return (
    <AppShell overline="Hamburger Menu" pageTitle="Analytics">
      <div data-testid="analytics-screen" className="flex flex-col gap-4">

        {/* 2. TIME FILTERS — placed first so users see the active scope */}
        <Card>
          <CardHeader icon={<Clock className="h-4 w-4" />} title="Time Range" right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">
              {fmtRange(from, to)}
            </span>
          )} />
          <div className="flex flex-wrap gap-2" data-testid="analytics-range">
            {RANGE_OPTIONS.map((o) => {
              const active = o.value === range;
              return (
                <button
                  key={o.value} type="button"
                  data-testid={`range-${o.value}`}
                  onClick={() => setRange(o.value)}
                  className={[
                    "px-3.5 h-9 rounded-full border text-xs font-bold tracking-wide transition-colors",
                    active
                      ? "bg-[var(--tm-navy)] text-white border-[var(--tm-navy)]"
                      : "bg-white text-[var(--tm-navy)] border-[var(--tm-border)] hover:bg-[var(--tm-surface)]",
                  ].join(" ")}
                >{o.label}</button>
              );
            })}
          </div>
          {range === "custom" && (
            <div className="flex flex-wrap items-end gap-2 pt-1" data-testid="analytics-custom">
              <DateInput label="From" value={customFrom} onChange={setCustomFrom} testId="custom-from" />
              <DateInput label="To"   value={customTo}   onChange={setCustomTo}   testId="custom-to" />
            </div>
          )}
        </Card>

        {/* 1. OVERVIEW SUMMARY */}
        <Card>
          <CardHeader icon={<TrendingUp className="h-4 w-4" />} title="Overview" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Tile testId="ov-trips"   icon={<Truck className="h-4 w-4" />}      label="Total Trips"          value={String(overview.trips)} />
            <Tile testId="ov-miles"   icon={<Route className="h-4 w-4" />}      label="Total Miles"          value={fmtMiles(overview.miles)} />
            <Tile testId="ov-stops"   icon={<ListChecks className="h-4 w-4" />} label="Total Stops"          value={String(overview.stops)} />
            <Tile testId="ov-active"  icon={<Activity className="h-4 w-4" />}   label="Active Days"          value={String(overview.activeDays)} />
            <Tile testId="ov-avg-stops" icon={<ListChecks className="h-4 w-4" />} label="Avg Stops / Trip"   value={overview.trips ? overview.avgStops.toFixed(1) : "0"} />
            <Tile testId="ov-avg-miles" icon={<Route className="h-4 w-4" />}      label="Avg Miles / Trip"   value={overview.trips ? fmtMiles(overview.avgMiles) : "0"} />
          </div>
        </Card>

        {/* 3. MILEAGE ANALYTICS */}
        <Card>
          <CardHeader icon={<BarChart3 className="h-4 w-4" />} title="Mileage" />
          <ChartLabel title="Daily Mileage Trend" />
          <BarChart buckets={dailyBuckets} valueKey="miles" testId="chart-daily" />
          <ChartLabel title="Weekly Mileage Trend" />
          <LineChart buckets={weeklyBuckets} valueKey="miles" testId="chart-weekly" />
          <ChartLabel title="Monthly Mileage Trend" />
          <BarChart buckets={monthlyBuckets} valueKey="miles" testId="chart-monthly" />
          <SubTile label="Average daily miles in range"
                   value={dailyBuckets.length
                     ? fmtMiles(Math.round(dailyBuckets.reduce((s, b) => s + b.miles, 0) / dailyBuckets.length))
                     : "0"} />
        </Card>

        {/* 4. STOP ANALYTICS */}
        <Card>
          <CardHeader icon={<ListChecks className="h-4 w-4" />} title="Stops" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile testId="st-total"     icon={<ListChecks className="h-4 w-4" />} label="Total Stops"  value={String(stopsBreakdown.total)} />
            <Tile testId="st-per-trip"  icon={<TrendingUp className="h-4 w-4" />} label="Stops / Trip" value={stopsBreakdown.perTrip.toFixed(1)} />
            <Tile testId="st-pickups"   icon={<Truck className="h-4 w-4" />}      label="Pickups"      value={String(stopsBreakdown.pickups)} />
            <Tile testId="st-deliveries" icon={<Truck className="h-4 w-4" />}     label="Deliveries"   value={String(stopsBreakdown.deliveries)} />
          </div>
          <ChartLabel title="Stops per Day" />
          <BarChart buckets={dailyBuckets} valueKey="stops" testId="chart-stops-daily" />
          <SubTile label="Most active day"
                   value={stopsBreakdown.peakDay ? `${stopsBreakdown.peakDay.label} · ${stopsBreakdown.peakDay.stops} stops` : "—"} />
        </Card>

        {/* 5. TRIP ANALYTICS */}
        <Card>
          <CardHeader icon={<Truck className="h-4 w-4" />} title="Trips" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile testId="tr-completed" icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={String(tripBreakdown.completed)} />
            <Tile testId="tr-cancelled" icon={<XCircle className="h-4 w-4" />}      label="Cancelled" value={String(tripBreakdown.cancelled)} />
            <Tile testId="tr-drafts"    icon={<Save className="h-4 w-4" />}         label="Drafts"    value={String(tripBreakdown.drafts)} />
            <Tile testId="tr-avg-dur"   icon={<Clock className="h-4 w-4" />}        label="Avg Duration" value={tripBreakdown.avgHours ? `${tripBreakdown.avgHours.toFixed(1)} h` : "—"} />
          </div>
          <ChartLabel title="Most-Used Templates" />
          {tripBreakdown.topTemplates.length === 0 ? (
            <Empty>No template usage logged yet — open Studio to map a template.</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {tripBreakdown.topTemplates.map((t) => (
                <UsageBar key={t.name} label={t.name} value={t.count} max={tripBreakdown.topTemplates[0].count} testId={`tpl-${t.key}`} />
              ))}
            </div>
          )}
        </Card>

        {/* 6. DOCUMENT ANALYTICS */}
        <Card>
          <CardHeader icon={<FileText className="h-4 w-4" />} title="Documents" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile testId="doc-bols"       icon={<FileText className="h-4 w-4" />}   label="BOLs (synced)"     value={String(tripBreakdown.bols)} />
            <Tile testId="doc-receipts"   icon={<FileText className="h-4 w-4" />}   label="Receipts (synced)" value={String(tripBreakdown.receipts)} />
            <Tile testId="doc-exports"    icon={<FolderOpen className="h-4 w-4" />} label="Exports Generated" value={String(storageStats.exports)} />
            <Tile testId="doc-storage"    icon={<HardDrive className="h-4 w-4" />}  label="Storage Used"      value={`${storageStats.usage_mb} MB`} />
          </div>
          <Notice>
            Document totals reflect items linked to your synced trips. Files in the Trip Monitor folder are not counted here — they live outside the app.
          </Notice>
        </Card>

        {/* 7. PERFORMANCE INSIGHTS */}
        <Card>
          <CardHeader icon={<Activity className="h-4 w-4" />} title="Performance Insights" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Insight testId="perf-active-day"
              icon={<Activity className="h-4 w-4" />} title="Most Active Day"
              value={performance.mostActiveDay ? `${performance.mostActiveDay.label} · ${performance.mostActiveDay.trips} trip${performance.mostActiveDay.trips === 1 ? "" : "s"}, ${fmtMiles(performance.mostActiveDay.miles)} mi` : "—"} />
            <Insight testId="perf-longest"
              icon={<Route className="h-4 w-4" />} title="Longest Trip"
              value={performance.longestTrip ? `${fmtMiles(performance.longestTrip.miles)} mi · Order #${performance.longestTrip.order}` : "—"} />
            <Insight testId="perf-stop-peak"
              icon={<ListChecks className="h-4 w-4" />} title="Highest Stop Count"
              value={performance.highestStopCount ? `${performance.highestStopCount.stops} stops · Order #${performance.highestStopCount.order}` : "—"} />
            <Insight testId="perf-route"
              icon={<MapPin className="h-4 w-4" />} title="Most-Used Route / Location"
              value={stats?.top_location || performance.topRoute || "—"} />
            <Insight testId="perf-completion"
              icon={<CheckCircle2 className="h-4 w-4" />} title="Completion Rate"
              value={tripBreakdown.completionRate ? `${tripBreakdown.completionRate}% completed` : "—"} />
          </div>
        </Card>

        {/* 8. STORAGE & EXPORT ANALYTICS */}
        <Card>
          <CardHeader icon={<HardDrive className="h-4 w-4" />} title="Storage & Export" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Ring testId="se-storage" label="Storage Used"
                  value={storageStats.percent} max={100} suffix="%"
                  caption={`${storageStats.usage_mb} / ${storageStats.quota_mb || "?"} MB`} />
            <Tile testId="se-exports"  icon={<FolderOpen className="h-4 w-4" />} label="Exports" value={String(storageStats.exports)} />
            <Tile testId="se-backups"  icon={<Cloud className="h-4 w-4" />}      label="Backups" value={String(storageStats.backups)} />
            <Tile testId="se-syncs"    icon={<RefreshCw className="h-4 w-4" />}  label="Cloud Sync" value={String(storageStats.syncs)} />
          </div>
          <Notice>
            Storage figures are device-side — the Trip Monitor folder lives outside the app and isn&apos;t counted toward this quota.
          </Notice>
        </Card>

        {/* 9. MILESTONES & ACHIEVEMENTS */}
        <Card>
          <CardHeader icon={<Award className="h-4 w-4" />} title="Milestones & Achievements" right={(
            <button type="button" onClick={() => navigate("/user-profile")}
                    className="text-xs font-bold text-[var(--tm-blue)] hover:underline">View badges</button>
          )} />
          <MilestoneRing
            testId="ms-miles"
            icon={<Route className="h-4 w-4" />} label="Lifetime Miles"
            value={Number(stats?.miles_lifetime || 0)}
            target={nextTier(MILES_TIERS, Number(stats?.miles_lifetime || 0))}
            format={fmtMiles}
          />
          <MilestoneRing
            testId="ms-stops"
            icon={<ListChecks className="h-4 w-4" />} label="Stops Completed"
            value={Number(stats?.total_stops || 0)}
            target={nextTier(STOPS_TIERS, Number(stats?.total_stops || 0))}
          />
          <MilestoneRing
            testId="ms-service"
            icon={<Clock className="h-4 w-4" />} label="Years of Service"
            value={Math.round((Number(stats?.miles_lifetime || 0) / 50000) * 10) / 10}
            target={1}
            suffix=" yr"
          />
          <SubTile label="Badges earned" value={`${milestonesEarned} unlocked`} />
        </Card>
      </div>
            <p className="mt-3 text-[11px] text-[var(--tm-text-soft)] font-semibold">
        Trip Monitor analytics. Range: {fmtRange(from, to)} · {finished.length} finished trip{finished.length === 1 ? "" : "s"}.
      </p>
    </AppShell>
  );
}

/* ───────────────────────── chart pieces ───────────────────────── */

function BarChart({ buckets, valueKey, testId }) {
  const max = Math.max(1, ...buckets.map((b) => b[valueKey] || 0));
  return (
    <div className="grid gap-1.5 px-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, buckets.length)}, minmax(0, 1fr))` }} data-testid={testId}>
      {buckets.map((b) => {
        const h = Math.max(2, Math.round(((b[valueKey] || 0) / max) * 100));
        return (
          <div key={b.key} className="flex flex-col items-center gap-1">
            <div className="w-full bg-[var(--tm-surface-2)] rounded-t-md overflow-hidden" style={{ height: 80 }}>
              <div className="w-full bg-[var(--tm-blue)] rounded-t-md" style={{ height: `${h}%`, marginTop: `${100 - h}%` }} />
            </div>
            <div className="text-[9px] font-bold text-[var(--tm-navy)]/70 uppercase tracking-wider truncate w-full text-center" title={b.label}>{b.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({ buckets, valueKey, testId }) {
  const max = Math.max(1, ...buckets.map((b) => b[valueKey] || 0));
  const W = 320, H = 80, pad = 4;
  if (buckets.length === 0) return <Empty>No data in range.</Empty>;
  const stepX = (W - pad * 2) / Math.max(1, buckets.length - 1);
  const points = buckets.map((b, i) => {
    const x = pad + i * stepX;
    const y = H - pad - ((b[valueKey] || 0) / max) * (H - pad * 2);
    return [x, y];
  });
  const pathD = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  return (
    <div className="px-1 pt-1" data-testid={testId}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
        <path d={pathD} fill="none" stroke="var(--tm-navy)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2.5" fill="var(--tm-orange)" />
        ))}
      </svg>
      <div className="grid mt-1" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}>
        {buckets.map((b) => (
          <div key={b.key} className="text-[9px] font-bold text-[var(--tm-navy)]/70 uppercase tracking-wider text-center truncate" title={b.label}>{b.label}</div>
        ))}
      </div>
    </div>
  );
}

function Ring({ testId, label, value, max, suffix = "", caption }) {
  const pct = Math.max(0, Math.min(100, (Number(value) / Math.max(1, Number(max))) * 100));
  const r = 28, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div data-testid={testId} className="bg-white border border-[var(--tm-border)] rounded-lg p-3 flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--tm-surface-2)" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--tm-orange)" strokeWidth="6"
                strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
                transform="rotate(-90 36 36)" />
        <text x="36" y="40" textAnchor="middle" className="font-black" style={{ fontSize: 14, fill: "var(--tm-navy)" }}>
          {Math.round(pct)}{suffix}
        </text>
      </svg>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold text-center">{label}</div>
      {caption && <div className="text-[10px] text-[var(--tm-navy)]/65 font-bold text-center truncate w-full" title={caption}>{caption}</div>}
    </div>
  );
}

function MilestoneRing({ testId, icon, label, value, target, suffix = "", format }) {
  const v = Number(value) || 0;
  const t = Number(target) || 1;
  const pct = Math.max(0, Math.min(100, (v / t) * 100));
  return (
    <div data-testid={testId} className="flex items-center gap-3 px-2 py-2.5 border-b border-[var(--tm-border)]/50 last:border-b-0">
      <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-[var(--tm-navy)]">{label}</div>
          <div className="text-[11px] font-bold text-[var(--tm-navy)] tabular-nums">
            {format ? format(v) : v}{suffix} / {format ? format(t) : t}{suffix}
          </div>
        </div>
        <div className="h-1.5 mt-1.5 rounded-full bg-[var(--tm-surface-2)] overflow-hidden">
          <div className="h-full bg-[var(--tm-navy)]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function UsageBar({ label, value, max, testId }) {
  const pct = Math.round((Number(value) / Math.max(1, Number(max))) * 100);
  return (
    <div data-testid={testId} className="flex items-center gap-2">
      <div className="w-24 text-xs font-bold text-[var(--tm-navy)] truncate">{label}</div>
      <div className="flex-1 h-3 rounded-full bg-[var(--tm-surface-2)] overflow-hidden">
        <div className="h-full bg-[var(--tm-blue)]" style={{ width: `${pct}%` }} />
      </div>
      <div className="w-10 text-right text-xs font-bold text-[var(--tm-navy)] tabular-nums">{value}</div>
    </div>
  );
}

/* ---- atomic UI ---- */
function Card({ children }) {
  return (
    <div className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-3">
      {children}
    </div>
  );
}
function CardHeader({ icon, title, right }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 flex-1">{title}</div>
      {right}
    </div>
  );
}
function ChartLabel({ title }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/60 font-bold mt-2">{title}</div>
  );
}
function Tile({ testId, icon, label, value }) {
  return (
    <div data-testid={testId} className="bg-white border border-[var(--tm-border)] rounded-lg p-3 flex flex-col gap-1">
      {icon && <span className="text-[var(--tm-navy)]" aria-hidden="true">{icon}</span>}
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold mt-1">{label}</div>
      <div className="text-2xl font-black tracking-tight text-[var(--tm-navy)] truncate" title={String(value)}>{value}</div>
    </div>
  );
}
function SubTile({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2 mt-1 border-t border-[var(--tm-border)]/50">
      <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold">{label}</span>
      <span className="text-sm font-bold text-[var(--tm-navy)] truncate">{value}</span>
    </div>
  );
}
function Insight({ testId, icon, title, value }) {
  return (
    <div data-testid={testId} className="flex items-start gap-3 p-3 rounded-md bg-white border border-[var(--tm-border)]">
      <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold">{title}</div>
        <div className="text-sm font-bold text-[var(--tm-navy)] mt-0.5 truncate" title={String(value)}>{value}</div>
      </div>
    </div>
  );
}
function Empty({ children }) {
  return (
    <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold px-1 py-2 leading-snug">{children}</div>
  );
}
function Notice({ children }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-md bg-[var(--tm-surface)] border border-[var(--tm-border)]">
      <p className="text-[12px] text-[var(--tm-navy)] font-semibold leading-snug">{children}</p>
    </div>
  );
}
function DateInput({ label, value, onChange, testId }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider font-bold text-[var(--tm-navy)]/65">{label}</span>
      <input type="date" data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}
             className="h-9 px-2 rounded-md border border-[var(--tm-border)] text-sm font-semibold text-[var(--tm-navy)]" />
    </label>
  );
}

/* ───────────────────── derivation helpers ───────────────────── */

const MILES_TIERS = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const STOPS_TIERS = [100, 500, 1_000, 5_000, 10_000];

function nextTier(tiers, v) {
  for (const t of tiers) if (t > v) return t;
  return tiers[tiers.length - 1];
}

function filterByRange(trips, range, customFrom, customTo) {
  let from, to;
  const now = new Date();
  if (range === "custom") {
    from = startOfDay(new Date(customFrom));
    to   = endOfDay(new Date(customTo));
  } else {
    const opt = RANGE_OPTIONS.find((o) => o.value === range) || RANGE_OPTIONS[2];
    to = endOfDay(now);
    from = startOfDay(daysAgo(opt.days - 1));
  }
  const inRange = (t) => {
    const d = t.finished_at || t.created_at;
    if (!d) return false;
    const ts = new Date(d).getTime();
    return ts >= from.getTime() && ts <= to.getTime();
  };
  const all = trips.filter(inRange);
  const finished = all.filter((t) => t.status === "finished");
  return { from, to, finished, all, days: Math.ceil((to.getTime() - from.getTime()) / (86400 * 1000)) };
}

function deriveOverview(finished) {
  const trips = finished.length;
  const miles = finished.reduce((s, t) => s + (Number(t.total_trip_miles) || 0), 0);
  const stops = finished.reduce((s, t) => s + (Number(t.row_count) || 0), 0);
  const dayKeys = new Set(finished.map((t) => isoDate(new Date(t.finished_at || t.created_at))));
  return {
    trips,
    miles,
    stops,
    activeDays: dayKeys.size,
    avgStops: trips ? stops / trips : 0,
    avgMiles: trips ? miles / trips : 0,
  };
}

function bucketBy(finished, granularity, from, to) {
  const buckets = [];
  let cursor = new Date(from);
  while (cursor <= to) {
    let key, label, next;
    if (granularity === "day") {
      key = isoDate(cursor);
      label = cursor.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
      next = new Date(cursor); next.setDate(cursor.getDate() + 1);
    } else if (granularity === "week") {
      key = `W${weekOf(cursor)}`;
      label = `W${weekOf(cursor)}`;
      next = new Date(cursor); next.setDate(cursor.getDate() + 7);
    } else {
      key = cursor.toISOString().slice(0, 7);
      label = cursor.toLocaleDateString(undefined, { month: "short" });
      next = new Date(cursor); next.setMonth(cursor.getMonth() + 1);
    }
    buckets.push({ key, label, miles: 0, stops: 0, trips: 0, _from: new Date(cursor), _to: new Date(next) });
    cursor = next;
    if (buckets.length > 366) break;
  }
  finished.forEach((t) => {
    const ts = new Date(t.finished_at || t.created_at).getTime();
    const b = buckets.find((bk) => ts >= bk._from.getTime() && ts < bk._to.getTime());
    if (!b) return;
    b.miles += Number(t.total_trip_miles) || 0;
    b.stops += Number(t.row_count) || 0;
    b.trips += 1;
  });
  return buckets;
}

function deriveStops(finished, dailyBuckets) {
  const total = finished.reduce((s, t) => s + (Number(t.row_count) || 0), 0);
  const perTrip = finished.length ? total / finished.length : 0;
  let pickups = 0, deliveries = 0;
  finished.forEach((t) => {
    (t.rows || []).forEach((r) => {
      const code = String(r.event_code || "").toLowerCase();
      if (code.includes("pickup") || code.includes("p/u") || code === "p") pickups += 1;
      else if (code.includes("delivery") || code.includes("drop") || code === "d") deliveries += 1;
    });
  });
  // If no event codes, infer from row count (~50/50 split as fallback)
  if (pickups === 0 && deliveries === 0 && total > 0) {
    pickups = Math.ceil(total / 2);
    deliveries = total - pickups;
  }
  const peakDay = [...dailyBuckets].sort((a, b) => b.stops - a.stops)[0] || null;
  return { total, perTrip, pickups, deliveries, peakDay };
}

function deriveTripBreakdown(all, finished) {
  const completed = finished.length;
  const cancelled = all.filter((t) => t.status === "cancelled" || t.status === "abandoned").length;
  const drafts    = all.filter((t) => t.status === "draft" || t.status === "in_progress" || t.status === "active").length;
  const total = completed + cancelled + drafts;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;
  // Avg duration in hours = (finished_at - created_at) / 3600
  const durs = finished.map((t) => {
    const a = t.created_at ? new Date(t.created_at).getTime() : 0;
    const b = t.finished_at ? new Date(t.finished_at).getTime() : 0;
    return (a && b && b > a) ? (b - a) / 3600000 : 0;
  }).filter((h) => h > 0);
  const avgHours = durs.length ? durs.reduce((s, h) => s + h, 0) / durs.length : 0;

  const tplCounts = new Map();
  finished.forEach((t) => {
    const tplName = t.template_name || t.template_id || "Default";
    tplCounts.set(tplName, (tplCounts.get(tplName) || 0) + 1);
  });
  const topTemplates = [...tplCounts.entries()]
    .map(([name, count], i) => ({ key: i, name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const bols = finished.filter((t) => t.bol_number).length;
  const receipts = finished.filter((t) => Array.isArray(t.receipts)).reduce((s, t) => s + (t.receipts?.length || 0), 0);

  return { completed, cancelled, drafts, completionRate, avgHours, topTemplates, bols, receipts };
}

function derivePerformance(finished, dailyBuckets) {
  const mostActiveDay = [...dailyBuckets].sort((a, b) => b.miles - a.miles)[0] || null;
  const longestTrip = [...finished].sort((a, b) => (Number(b.total_trip_miles) || 0) - (Number(a.total_trip_miles) || 0))[0];
  const highestStopCount = [...finished].sort((a, b) => (Number(b.row_count) || 0) - (Number(a.row_count) || 0))[0];
  const routeCounts = new Map();
  finished.forEach((t) => {
    (t.rows || []).forEach((r) => {
      const loc = r.location_name || r.stop_city;
      if (!loc) return;
      routeCounts.set(loc, (routeCounts.get(loc) || 0) + 1);
    });
  });
  const topRoute = [...routeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    mostActiveDay,
    longestTrip: longestTrip ? { miles: Number(longestTrip.total_trip_miles) || 0, order: longestTrip.order_number } : null,
    highestStopCount: highestStopCount ? { stops: Number(highestStopCount.row_count) || 0, order: highestStopCount.order_number } : null,
    topRoute,
  };
}

/* ---- date / format helpers ---- */
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23,59,59,999); return x; }
function daysAgo(n) { const x = new Date(); x.setDate(x.getDate() - n); return startOfDay(x); }
function isoDate(d) { return d.toISOString().slice(0, 10); }
function weekOf(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
}
function fmtMiles(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "K";
  return v.toLocaleString();
}
function fmtRange(from, to) {
  const o = { month: "short", day: "numeric" };
  return `${from.toLocaleDateString(undefined, o)} → ${to.toLocaleDateString(undefined, o)}`;
}
function readJSON(key, fb = null) {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? fb : v; }
  catch { return fb; }
}
