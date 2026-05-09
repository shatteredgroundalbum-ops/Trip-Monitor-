import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import AppShell from "../components/app/AppShell";
import SessionWizard from "../components/app/SessionWizard";
import TripSheetForm from "../components/app/TripSheetForm";
import FinishExportDialog from "../components/app/FinishExportDialog";
import BadgeUnlockedModal from "../components/app/BadgeUnlockedModal";
import InstallPrompt from "../components/app/InstallPrompt";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import {
  CheckCircle2, Save, Eye, ChevronRight, FileText, AlertTriangle, Plus,
  Gauge, Route, ListChecks, Truck, CalendarDays, Trophy, Clock,
} from "lucide-react";
import DynamicPaperSheet from "../components/app/DynamicPaperSheet";
import { ensureDefaultTemplate, getActiveTemplate } from "../lib/template-store";
import { getStorageUsage, isAboveQuotaWarning } from "../lib/storage-location";
import { toast } from "sonner";

/**
 * Operational dashboard. Wrapped in AppShell so the top header,
 * hamburger and bottom-nav stay consistent with the rest of the app.
 *
 * Per the navigation spec, this screen NEVER opens popups for
 * navigation. The bell goes to /notifications, the hamburger goes to
 * full screens, the bottom nav goes to full screens. Popups remain
 * only for: continue-session prompt, finish/export, paper preview,
 * trip-sheet workspace, and badge-unlocked celebration.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [template, setTemplate] = useState(null);

  const [showWizard, setShowWizard] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  const [storageUsage, setStorageUsage] = useState({ percent: 0 });
  const [bootstrapped, setBootstrapped] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureDefaultTemplate();
      const active = await getActiveTemplate();
      if (!cancelled) setTemplate(active);
      try {
        const u = await getStorageUsage();
        if (!cancelled) setStorageUsage(u);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshStats = async () => {
    try {
      const [s, recent, ach] = await Promise.all([
        api.get("/stats"),
        api.get("/trip-sessions"),
        api.get("/achievements"),
      ]);
      setStats(s.data);
      setAchievements(ach.data);
      setRecentTrips((recent.data || []).filter((t) => t.status === "finished").slice(0, 3));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [p, s] = await Promise.all([api.get("/profile"), api.get("/trip-sessions/active")]);
        setProfile(p.data);
        if (!p.data) {
          // No profile yet — push them to the User Profile screen to fill it in.
          navigate("/user-profile");
          return;
        }
        if (s.data) { setShowContinue(true); setSession(s.data); }
      } catch { /* ignore */ }
      finally {
        await refreshStats();
        setBootstrapped(true);
      }
    })();
  }, [user, navigate]);

  const createSession = async (payload) => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ seq: i + 1 }));
    rows[0].departure_date = payload.initial_date;
    try {
      const res = await api.post("/trip-sessions", { ...payload, rows });
      setSession(res.data);
      setShowWizard(false);
      setShowSheet(true);
      toast.success("Trip started");
    } catch {
      toast.error("Could not start trip");
    }
  };

  const continueSession = (yes) => {
    setShowContinue(false);
    if (yes) toast.success("Resumed active session");
    else (async () => {
      if (session) await api.put(`/trip-sessions/${session.session_id}`, { status: "abandoned" });
      setSession(null);
    })();
  };

  const upNext = useMemo(() => null, []);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen bg-white text-[var(--tm-navy)] flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.3em] text-[var(--tm-text-muted)]">Loading...</div>
      </div>
    );
  }

  const driverFirstName = (profile?.full_name || user?.name || "Driver").split(" ")[0];
  const storageWarn = isAboveQuotaWarning(storageUsage.percent);
  const dispatchUpdates = DEMO_DISPATCH;
  const alertCount = storageWarn ? 1 : 0;

  return (
    <AppShell active="dashboard" hideTitleBlock alertCount={alertCount}>
      {/* GREETING */}
      <section className="mb-5" data-testid="dashboard-greeting">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[var(--tm-navy)]">
          Hey, {driverFirstName}! <span aria-hidden="true">👋</span>
        </h1>
        <p className="text-sm text-[var(--tm-text-soft)] font-semibold mt-1">
          Ready to roll? Let&apos;s get your day moving.
        </p>
      </section>

      {storageWarn && (
        <button
          type="button"
          data-testid="dashboard-storage-warning"
          onClick={() => navigate("/settings")}
          className="w-full text-left mb-4 flex items-start gap-3 p-3 rounded-md bg-[var(--tm-orange)]/10 border-2 border-[var(--tm-orange)] hover:bg-[var(--tm-orange)]/15 transition"
        >
          <AlertTriangle className="h-4 w-4 text-[var(--tm-orange)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-[var(--tm-orange)] uppercase tracking-wider">
              Storage at {storageUsage.percent}%
            </div>
            <div className="text-[11px] text-[var(--tm-text-soft)] mt-0.5">
              Tap to open Settings and pick a Trip Monitor folder.
            </div>
          </div>
        </button>
      )}

      {/* TWO-UP */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5" data-testid="primary-cards">
        <ActiveTripCard
          session={session}
          onOpen={() => setShowSheet(true)}
          onStartNew={() => setShowWizard(true)}
        />
        <DispatchCard
          updates={dispatchUpdates}
          onViewAll={() => navigate("/messages")}
        />
      </section>

      {/* METRICS */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5" data-testid="stats-grid">
        <Metric testId="stat-miles-today"   label="Miles Today"   value={fmtMiles(stats?.miles_today ?? 0)}
                sub="Rolled up from finished trips" icon={<Gauge className="h-5 w-5" strokeWidth={1.5} />} />
        <Metric testId="stat-lifetime-miles" label="Lifetime Miles" value={fmtMiles(stats?.miles_lifetime ?? 0)}
                sub={`${stats?.trips_total ?? 0} trips total`}     icon={<Route className="h-5 w-5" strokeWidth={1.5} />} />
        <Metric testId="stat-total-stops"    label="Total Stops"    value={String(stats?.total_stops ?? 0)}
                sub="Across finished trips"                         icon={<ListChecks className="h-5 w-5" strokeWidth={1.5} />} />
        <Metric testId="stat-truck"          label="Current Truck"  value={profile?.truck_number || "—"}
                sub={profile?.truck_assignment_type ? capitalize(profile.truck_assignment_type) : "—"}
                icon={<Truck className="h-5 w-5" strokeWidth={1.5} />} />
      </section>

      {/* UP NEXT */}
      <section className="mb-5" data-testid="up-next-section">
        <UpNextCard upNext={upNext} onCreate={() => setShowWizard(true)} />
      </section>

      {/* MILESTONES */}
      <section className="mb-5" data-testid="milestones-section">
        <MilestonesPanel achievements={achievements} stats={stats} profile={profile} navigate={navigate} />
      </section>

      {/* RECENT TRIPS */}
      <section data-testid="recent-trips-section" className="mb-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--tm-navy)]">Recent Trips</h3>
          <button
            type="button"
            onClick={() => navigate("/reports")}
            className="text-xs text-[var(--tm-blue)] font-bold hover:underline inline-flex items-center gap-1"
            data-testid="see-all-history-btn"
          >
            See all <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        {recentTrips.length === 0 ? (
          <div className="text-[12px] text-[var(--tm-text-soft)] font-semibold px-1 py-1.5">
            No finished trips yet — finish one and it&apos;ll show up here.
          </div>
        ) : (
          <div className="bg-white border border-[var(--tm-border)] rounded-xl shadow-[0_2px_8px_rgba(14,31,71,0.04)] divide-y divide-[var(--tm-border)] overflow-hidden">
            {recentTrips.map((t) => {
              const finished = !!t.finished_at;
              return (
                <button
                  key={t.session_id}
                  type="button"
                  onClick={() => navigate("/reports")}
                  data-testid={`recent-trip-${t.session_id}`}
                  className="w-full px-3 py-3 flex items-center gap-3 hover:bg-[var(--tm-surface)] transition-colors text-left"
                >
                  <span className="h-9 w-9 rounded-full border border-[var(--tm-border)] flex items-center justify-center text-[var(--tm-navy)] flex-shrink-0">
                    {finished ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.6} /> : <Clock className="h-4 w-4" strokeWidth={1.6} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[var(--tm-navy)] truncate">Order #{t.order_number}</div>
                    <div className="text-[11px] text-[var(--tm-navy)]/65 font-semibold mt-0.5">
                      {formatDate(t.finished_at || t.created_at)} · {t.row_count ?? "—"} stops
                    </div>
                  </div>
                  <div className="text-sm font-bold text-[var(--tm-navy)] tabular-nums">{fmtMiles(t.total_trip_miles ?? 0)} mi</div>
                  <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)] flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* DIALOGS — confirmations / workspaces only, NEVER navigation */}
      {profile && (
        <SessionWizard
          open={showWizard}
          profile={profile}
          onCreate={createSession}
          onCancel={() => setShowWizard(false)}
        />
      )}

      <Dialog open={showContinue}>
        <DialogContent
          data-testid="continue-dialog"
          className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]"
          hideClose
        >
          <DialogHeader>
            <DialogTitle className="text-[var(--tm-navy)]">
              <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold block mb-2">Session In Progress</span>
              <span className="text-xl font-black tracking-tight">Continue current session?</span>
            </DialogTitle>
            <DialogDescription className="text-[var(--tm-text-soft)]">
              Pick up where you left off, or discard and start a new trip.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-row">
            <Button
              data-testid="continue-no-btn" variant="outline"
              onClick={() => continueSession(false)}
              className="h-12 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
            >No, Discard</Button>
            <Button
              data-testid="continue-yes-btn"
              onClick={() => { continueSession(true); setShowSheet(true); }}
              className="h-12 flex-1 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
            >Yes, Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {session && (
        <Dialog open={showSheet} onOpenChange={setShowSheet}>
          <DialogContent
            data-testid="trip-sheet-dialog"
            className="max-w-5xl w-[96vw] bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)] overflow-hidden p-0 max-h-[92vh] flex flex-col"
          >
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-[var(--tm-border)] text-left">
              <DialogTitle className="text-[var(--tm-navy)]">
                <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold block mb-1">Active Trip</span>
                <span className="text-2xl font-black tracking-tight">Order #{session.order_number}</span>
              </DialogTitle>
              <DialogDescription className="text-[var(--tm-text-soft)] inline-flex items-center gap-1.5">
                <Save className="h-3 w-3" /> Auto-saving as you type
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-auto px-4 pb-4">
              <TripSheetForm session={session} onChange={setSession} mileageMode={profile?.mileage_mode || "workflow"} />
            </div>
            <div className="border-t border-[var(--tm-border)] px-4 py-3 flex flex-col gap-2 bg-white">
              {!(Number(session?.total_trip_miles) > 0) && (
                <div data-testid="finish-miles-warning" className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-orange)] flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--tm-orange)] animate-pulse" />
                  Enter Total Trip Miles at the top before you can finish
                </div>
              )}
              <div className="flex gap-2">
                <Button data-testid="preview-btn" variant="outline" onClick={() => setShowPreview(true)}
                        className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
                  <Eye className="h-4 w-4 mr-1" /> Preview
                </Button>
                <Button data-testid="finish-btn"
                        onClick={() => setShowFinish(true)}
                        disabled={!(Number(session?.total_trip_miles) > 0)}
                        className="flex-1 h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md shadow-[0_8px_24px_-12px_rgba(255,95,21,0.55)] disabled:opacity-60 disabled:cursor-not-allowed">
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Finish &amp; Export
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {session && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-5xl bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)] overflow-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="text-[var(--tm-navy)]">Paper Preview</DialogTitle>
              <DialogDescription className="text-[var(--tm-text-soft)]">
                How the trip sheet will look when exported as JPEG, PDF, or printed.
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-auto max-h-[75vh] flex justify-center bg-[var(--tm-surface-2)] p-4 rounded-md">
              <DynamicPaperSheet ref={previewRef} session={session} profile={profile} template={template} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {session && (
        <FinishExportDialog open={showFinish} onOpenChange={setShowFinish}
                            session={session} profile={profile} template={template} />
      )}

      {achievements && <BadgeUnlockedModal data={achievements} />}

      <InstallPrompt />
    </AppShell>
  );
}

/* ───────────────────── sub-components ───────────────────── */

function ActiveTripCard({ session, onOpen, onStartNew }) {
  if (!session) {
    return (
      <button
        type="button"
        data-testid="active-trip-card-empty"
        onClick={onStartNew}
        className="text-left bg-[var(--tm-navy)] text-white rounded-xl p-5 shadow-[0_8px_24px_rgba(14,31,71,0.12)] flex items-center gap-4 hover:brightness-110 transition"
      >
        <span className="h-11 w-11 rounded-md bg-[var(--tm-blue)] flex items-center justify-center flex-shrink-0">
          <Plus className="h-5 w-5 text-white" strokeWidth={2} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-[0.3em] text-white/70 font-bold">Ready to roll</span>
          <span className="block text-xl font-black tracking-tight">Start a New Trip</span>
          <span className="block text-xs text-white/80 mt-1">Order #, BOL, 8 stops ready to fill.</span>
        </span>
        <ChevronRight className="h-5 w-5 text-white/80 flex-shrink-0" />
      </button>
    );
  }
  const stops = session.row_count ?? (Array.isArray(session.rows) ? session.rows.length : 0);
  const route = session.load_type
    ? capitalize(session.load_type.replace(/[-_]/g, " "))
    : (session.bol_number ? `BOL #${session.bol_number}` : "In progress");
  return (
    <button
      type="button"
      data-testid="active-trip-card"
      onClick={onOpen}
      className="text-left bg-[var(--tm-navy)] text-white rounded-xl p-5 shadow-[0_8px_24px_rgba(14,31,71,0.12)] flex flex-col gap-3 hover:brightness-110 transition"
    >
      <div className="flex items-center gap-3">
        <span className="h-11 w-11 rounded-md bg-[var(--tm-blue)] flex items-center justify-center flex-shrink-0">
          <FileText className="h-5 w-5 text-white" strokeWidth={1.6} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-base md:text-lg font-black tracking-tight">Continue Active Trip</div>
          <span className="inline-block px-2 py-0.5 rounded-full bg-[#16a34a] text-white text-[10px] tracking-[0.15em] uppercase font-black leading-none">
            In Progress
          </span>
        </div>
      </div>
      <div>
        <div className="text-xl font-black tracking-tight">Order #{session.order_number}</div>
        <div className="text-xs text-white/80 mt-1">
          {stops} stop{stops === 1 ? "" : "s"}{route ? ` · ${route}` : ""}
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm font-bold text-[var(--tm-blue)] hover:underline">Open Trip Sheet</span>
        <ChevronRight className="h-5 w-5 text-white/80" />
      </div>
    </button>
  );
}

function DispatchCard({ updates, onViewAll }) {
  return (
    <div data-testid="dispatch-card"
         className="bg-white border border-[var(--tm-border)] rounded-xl p-5 shadow-[0_8px_24px_rgba(14,31,71,0.08)] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base md:text-lg font-black tracking-tight text-[var(--tm-navy)]">Dispatch Updates</h2>
        {updates.length > 0 && (
          <span data-testid="dispatch-new-badge"
                className="px-2 py-0.5 rounded-full bg-[var(--tm-blue)]/10 text-[var(--tm-blue)] text-[10px] tracking-[0.15em] uppercase font-black">
            {updates.length} New
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col gap-3">
        {updates.length === 0 ? (
          <div className="text-sm text-[var(--tm-text-soft)]">No new updates from dispatch.</div>
        ) : (
          updates.slice(0, 2).map((u) => (
            <div key={u.id} className="flex items-start gap-3">
              <span className={[
                "h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0",
                u.tone === "warn" ? "bg-[var(--tm-orange)] text-white" : "bg-[var(--tm-blue)] text-white",
              ].join(" ")}>
                {u.tone === "warn"
                  ? <AlertTriangle className="h-4 w-4" strokeWidth={2} />
                  : <FileText className="h-4 w-4" strokeWidth={1.8} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[var(--tm-navy)] truncate">{u.title}</div>
                <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{u.body}</div>
                <div className="text-[10px] text-[var(--tm-text-muted)] font-bold mt-0.5 uppercase tracking-wider">{u.when}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <button
        type="button"
        data-testid="dispatch-view-all"
        onClick={onViewAll}
        className="self-start mt-3 text-sm font-bold text-[var(--tm-orange)] inline-flex items-center gap-1 hover:underline"
      >
        Open Messages <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function Metric({ testId, label, value, sub, icon }) {
  return (
    <div data-testid={testId} className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-1">
      <span className="text-[var(--tm-navy)]" aria-hidden="true">{icon}</span>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold mt-1.5">{label}</div>
      <div className="text-2xl md:text-3xl font-black tracking-tight text-[var(--tm-navy)] truncate" title={String(value)}>{value}</div>
      <div className="text-[11px] text-[var(--tm-text-soft)] font-semibold truncate">{sub}</div>
    </div>
  );
}

function UpNextCard({ upNext, onCreate }) {
  return (
    <button
      type="button"
      data-testid="up-next-card"
      onClick={onCreate}
      className="w-full text-left bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex items-center gap-3 hover:bg-[var(--tm-surface)] transition-colors"
    >
      <span className="h-10 w-10 rounded-md border border-[var(--tm-border)] flex items-center justify-center text-[var(--tm-navy)] flex-shrink-0">
        <CalendarDays className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold">Up Next</div>
        {upNext ? (
          <>
            <div className="text-base font-black tracking-tight text-[var(--tm-navy)]">Order #{upNext.order_number}</div>
            <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold mt-0.5">
              {upNext.date} · {upNext.stops} stops · {upNext.miles} mi
            </div>
          </>
        ) : (
          <>
            <div className="text-base font-black tracking-tight text-[var(--tm-navy)]">Plan your next trip</div>
            <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold mt-0.5">
              Tap to schedule the next order — pre-fills mileage and stops.
            </div>
          </>
        )}
      </div>
      <ChevronRight className="h-5 w-5 text-[var(--tm-text-muted)] flex-shrink-0" />
    </button>
  );
}

function MilestonesPanel({ achievements, stats, profile, navigate }) {
  const lifetime = Number(stats?.miles_lifetime || 0);
  const startDate = profile?.created_at ? new Date(profile.created_at) : null;
  const yearsOfService = startDate
    ? (Date.now() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000)
    : 0;
  const mileageMilestones = useMemo(() => {
    const targets = [100_000, 250_000];
    const fromAch = (achievements?.badges || [])
      .filter((b) => b.category === "miles" && Number(b.threshold) > 0)
      .map((b) => Number(b.threshold))
      .sort((a, b) => a - b);
    const list = fromAch.length >= 2 ? fromAch.slice(0, 2) : targets;
    return list.map((t) => ({
      key: `miles-${t}`,
      label: `${fmtMiles(t)} Miles`,
      value: lifetime,
      target: t,
      unit: "mi",
      icon: <Trophy className="h-4 w-4" strokeWidth={1.6} />,
    }));
  }, [achievements, lifetime]);

  const rows = [
    ...mileageMilestones,
    {
      key: "service-1y",
      label: "1 Year of Service",
      value: yearsOfService,
      target: 1,
      unit: "yr",
      icon: <CalendarDays className="h-4 w-4" strokeWidth={1.6} />,
    },
  ].slice(0, 3);

  return (
    <div className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--tm-navy)]">Milestones</h3>
        <button
          type="button"
          data-testid="milestones-view-all"
          onClick={() => navigate("/analytics")}
          className="text-xs text-[var(--tm-blue)] font-bold hover:underline inline-flex items-center gap-1"
        >
          View all <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((r) => {
          const pct = Math.max(0, Math.min(100, (r.value / r.target) * 100));
          const completed = pct >= 100;
          return (
            <div key={r.key} className="flex items-center gap-3" data-testid={`milestone-${r.key}`}>
              <span className="h-8 w-8 rounded-md flex items-center justify-center text-[var(--tm-navy)] flex-shrink-0">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[var(--tm-navy)]">{r.label}</div>
                <div className="h-1.5 mt-1.5 rounded-full bg-[var(--tm-surface-2)] overflow-hidden">
                  <div className="h-full bg-[var(--tm-navy)]" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="text-[11px] font-bold text-[var(--tm-navy)] tabular-nums whitespace-nowrap">
                {completed
                  ? "Completed"
                  : r.unit === "yr"
                    ? `${r.value.toFixed(1)} / 1 yr`
                    : `${fmtMiles(r.value)} / ${fmtMiles(r.target)}`}
              </div>
              <span className={[
                "h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0",
                completed ? "border-[var(--tm-navy)] text-[var(--tm-navy)]" : "border-[var(--tm-border)] text-transparent",
              ].join(" ")}>
                {completed && <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────── helpers ───────────────────── */
function fmtMiles(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "K";
  return v.toLocaleString();
}
function formatDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

const DEMO_DISPATCH = [
  { id: "d1", title: "Schedule Change", body: "Pickup time updated for the next order.", when: "Today, 8:30 AM", tone: "info" },
  { id: "d2", title: "New Message",     body: "Check in at gate 3 for the next pickup.", when: "Today, 7:45 AM", tone: "warn" },
];
