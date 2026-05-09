import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import SessionWizard from "../components/app/SessionWizard";
import {
  Plus, Save, History, FileText, ChevronRight, Layers, Clock, Truck,
} from "lucide-react";
import { toast } from "sonner";
import { listTemplates } from "../lib/template-store";

/**
 * New Trip — full-screen launcher.
 *
 * Per spec, this screen contains:
 *   • Create New Trip          (opens the wizard)
 *   • Resume Draft             (active session if any)
 *   • Trip History             (list of finished trips)
 *   • Saved Templates          (list of templates)
 *   • Select Trip Sheet Template (used at trip creation)
 *
 * Trip History and Saved Templates live HERE, not on the bottom nav.
 */
export default function NewTripScreen() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [active, setActive] = useState(null);
  const [recent, setRecent] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, a, recent] = await Promise.all([
          api.get("/profile"),
          api.get("/trip-sessions/active"),
          api.get("/trip-sessions"),
        ]);
        setProfile(p.data);
        setActive(a.data || null);
        setRecent((recent.data || []).filter((t) => t.status === "finished").slice(0, 5));
      } catch { /* ignore */ }
      try {
        setTemplates(await listTemplates());
      } catch { /* ignore */ }
    })();
  }, []);

  const createSession = async (payload) => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ seq: i + 1 }));
    rows[0].departure_date = payload.initial_date;
    try {
      await api.post("/trip-sessions", { ...payload, rows });
      setShowWizard(false);
      toast.success("Trip started");
      navigate("/dashboard");
    } catch {
      toast.error("Could not start trip");
    }
  };

  return (
    <AppShell active="new-trip" overline="Bottom Nav" pageTitle="New Trip">
      <div data-testid="new-trip-screen" className="flex flex-col gap-4">
        {/* CREATE / RESUME row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ActionTile
            testId="nt-create"
            icon={<Plus className="h-5 w-5" />}
            tone="orange"
            title="Create New Trip"
            sub="Order #, BOL, 8 stops · ready to fill"
            onClick={() => setShowWizard(true)}
          />
          {active ? (
            <ActionTile
              testId="nt-resume"
              icon={<Save className="h-5 w-5" />}
              tone="navy"
              title="Resume Draft"
              sub={`Order #${active.order_number} · in progress`}
              onClick={() => navigate("/dashboard")}
            />
          ) : (
            <ActionTile
              testId="nt-resume-empty"
              icon={<Save className="h-5 w-5" />}
              tone="ghost"
              title="No Drafts"
              sub="Create a trip and it'll auto-save here."
            />
          )}
        </div>

        {/* TEMPLATES */}
        <Section
          title="Saved Templates"
          icon={<Layers className="h-4 w-4" />}
          actionLabel="Open Studio"
          onAction={() => navigate("/studio")}
        >
          {templates.length === 0 ? (
            <Empty>No saved templates yet — open Studio to build one.</Empty>
          ) : (
            <div className="flex flex-col">
              {templates.slice(0, 6).map((t) => (
                <Listrow
                  key={t.id}
                  testId={`nt-template-${t.id}`}
                  icon={<FileText className="h-4 w-4" />}
                  title={t.name}
                  sub={t.source === "default" ? "Built-in default" : "Custom template"}
                  actionLabel="Use"
                  onClick={() => { toast.info(`Selected template: ${t.name}`); setShowWizard(true); }}
                />
              ))}
            </div>
          )}
        </Section>

        {/* TRIP HISTORY */}
        <Section
          title="Trip History"
          icon={<History className="h-4 w-4" />}
          actionLabel="See all"
          onAction={() => navigate("/reports")}
        >
          {recent.length === 0 ? (
            <Empty>No finished trips yet.</Empty>
          ) : (
            <div className="flex flex-col">
              {recent.map((t) => (
                <Listrow
                  key={t.session_id}
                  testId={`nt-history-${t.session_id}`}
                  icon={<Truck className="h-4 w-4" />}
                  title={`Order #${t.order_number}`}
                  sub={`${formatDate(t.finished_at || t.created_at)} · ${t.row_count ?? "—"} stops`}
                  rightLabel={`${fmtMiles(t.total_trip_miles ?? 0)} mi`}
                  onClick={() => navigate("/reports")}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {profile && (
        <SessionWizard
          open={showWizard}
          profile={profile}
          onCreate={createSession}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </AppShell>
  );
}

/* ---- bits ---- */
function ActionTile({ testId, icon, title, sub, tone = "navy", onClick }) {
  const styles = {
    orange: "bg-[var(--tm-orange)] text-white hover:brightness-105",
    navy:   "bg-[var(--tm-navy)]   text-white hover:brightness-110",
    ghost:  "bg-white text-[var(--tm-navy)] border border-[var(--tm-border)] cursor-default opacity-90",
  }[tone];
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={!onClick}
      className={`${styles} rounded-xl p-5 shadow-[0_8px_24px_rgba(14,31,71,0.10)] flex items-center gap-3 text-left transition`}
    >
      <span className="h-10 w-10 rounded-md bg-white/15 flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base md:text-lg font-black tracking-tight">{title}</span>
        <span className="block text-xs opacity-90 font-semibold">{sub}</span>
      </span>
      {onClick && <ChevronRight className="h-5 w-5 opacity-90" />}
    </button>
  );
}
function Section({ title, icon, actionLabel, onAction, children }) {
  return (
    <div className="bg-white border border-[var(--tm-border)] rounded-xl shadow-[0_2px_8px_rgba(14,31,71,0.04)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--tm-border)]">
        <div className="inline-flex items-center gap-2">
          {icon}
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--tm-navy)]">{title}</h3>
        </div>
        {actionLabel && (
          <button
            type="button"
            onClick={onAction}
            className="text-xs text-[var(--tm-blue)] font-bold inline-flex items-center gap-1 hover:underline"
          >
            {actionLabel} <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="p-2">
        {children}
      </div>
    </div>
  );
}
function Empty({ children }) {
  return (
    <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold px-2 py-2">{children}</div>
  );
}
function Listrow({ testId, icon, title, sub, rightLabel, actionLabel, onClick }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors"
    >
      <span className="h-9 w-9 rounded-full border border-[var(--tm-border)] flex items-center justify-center text-[var(--tm-navy)] flex-shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)] truncate">{title}</span>
        <span className="block text-[11px] text-[var(--tm-navy)]/70 font-semibold mt-0.5 truncate">{sub}</span>
      </span>
      {rightLabel && <span className="text-sm font-bold text-[var(--tm-navy)] tabular-nums">{rightLabel}</span>}
      {actionLabel && <span className="text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)]">{actionLabel}</span>}
      <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)] flex-shrink-0" />
    </button>
  );
}

function fmtMiles(n) {
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
