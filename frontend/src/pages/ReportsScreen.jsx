import React, { useEffect, useState } from "react";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import {
  FileBarChart2, FileSpreadsheet, FileImage, Route, ListChecks, Truck, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Reports — generated summaries and exports. Different from Trip
 * History (which lives inside New Trip) — this is the analytical /
 * export side: trip summaries, mileage, stops, export history.
 */
export default function ReportsScreen() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const [s, r] = await Promise.all([
          api.get("/stats"),
          api.get("/trip-sessions"),
        ]);
        setStats(s.data);
        setRecent((r.data || []).filter((t) => t.status === "finished").slice(0, 8));
      } catch { /* ignore */ }
    })();
  }, []);

  return (
    <AppShell overline="Hamburger Menu" pageTitle="Reports">
      <div data-testid="reports-screen" className="flex flex-col gap-4">
        {/* SUMMARY METRICS */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric testId="rep-trips"   label="Total Trips"   value={String(stats?.trips_total ?? 0)}     icon={<Truck className="h-4 w-4" />} />
          <Metric testId="rep-miles"   label="Lifetime Miles" value={fmt(stats?.miles_lifetime ?? 0)}    icon={<Route className="h-4 w-4" />} />
          <Metric testId="rep-stops"   label="Total Stops"   value={String(stats?.total_stops ?? 0)}    icon={<ListChecks className="h-4 w-4" />} />
        </div>

        {/* TRIP SUMMARIES */}
        <Card title="Trip Summaries" icon={<FileBarChart2 className="h-4 w-4" />}>
          {recent.length === 0 ? (
            <Empty>No finished trips yet.</Empty>
          ) : (
            recent.map((t) => (
              <Row
                key={t.session_id}
                testId={`rep-trip-${t.session_id}`}
                title={`Order #${t.order_number}`}
                sub={`${formatDate(t.finished_at || t.created_at)} · ${t.row_count ?? "—"} stops`}
                rightLabel={`${fmt(t.total_trip_miles ?? 0)} mi`}
                onClick={() => toast.info(`Opening summary for #${t.order_number}`)}
              />
            ))
          )}
        </Card>

        {/* EXPORTED REPORTS */}
        <Card title="Exported Reports" icon={<FileSpreadsheet className="h-4 w-4" />}>
          <Empty>Your exported PDFs and JPEGs will appear here. Stored in <span className="font-bold">Trip Monitor / Exports</span>.</Empty>
        </Card>

        {/* EXPORT HISTORY (image/PDF) */}
        <Card title="PDF / Image Export History" icon={<FileImage className="h-4 w-4" />}>
          <Empty>No exports yet — finish a trip and export to see it listed here.</Empty>
        </Card>
      </div>
    </AppShell>
  );
}

function Metric({ testId, label, value, icon }) {
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
      <div className="p-2">{children}</div>
    </div>
  );
}
function Row({ testId, title, sub, rightLabel, onClick }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)] truncate">{title}</span>
        <span className="block text-[11px] text-[var(--tm-navy)]/70 font-semibold mt-0.5 truncate">{sub}</span>
      </span>
      {rightLabel && <span className="text-sm font-bold text-[var(--tm-navy)] tabular-nums">{rightLabel}</span>}
      <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)]" />
    </button>
  );
}
function Empty({ children }) {
  return (
    <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold px-2 py-2 leading-snug">{children}</div>
  );
}
function fmt(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "K";
  return v.toLocaleString();
}
function formatDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}
