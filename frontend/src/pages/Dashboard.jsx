import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import DriverProfileDialog from "../components/app/DriverProfileDialog";
import SessionWizard from "../components/app/SessionWizard";
import TripSheetForm from "../components/app/TripSheetForm";
import FinishExportDialog from "../components/app/FinishExportDialog";
import AchievementsPanel from "../components/app/AchievementsPanel";
import WeeklyTrend from "../components/app/WeeklyTrend";
import InstallPrompt from "../components/app/InstallPrompt";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { LogOut, UserCog, CheckCircle2, Save, Eye, History, Truck, Gauge, Route, ListChecks, ArrowRight, Plus, FileText } from "lucide-react";
import PaperSheet from "../components/app/PaperSheet";
import DynamicPaperSheet from "../components/app/DynamicPaperSheet";
import { ensureDefaultTemplate, getActiveTemplate } from "../lib/template-store";
import { BrandLockupCompact } from "../components/app/BrandLogo";
import { ROLE_LABEL } from "../data/constants";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);
  const [stats, setStats] = useState(null);
  const [weekly, setWeekly] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [template, setTemplate] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showContinue, setShowContinue] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    if (!loading && !user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  // Ensure there's always an active template and load it for export rendering.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await ensureDefaultTemplate();
      const active = await getActiveTemplate();
      if (!cancelled) setTemplate(active);
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshStats = async () => {
    try {
      const [s, recent, ach, week] = await Promise.all([
        api.get("/stats"),
        api.get("/trip-sessions"),
        api.get("/achievements"),
        api.get("/stats/week"),
      ]);
      setStats(s.data);
      setAchievements(ach.data);
      setWeekly(week.data);
      const finished = (recent.data || []).filter((t) => t.status === "finished").slice(0, 3);
      setRecentTrips(finished);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [p, s] = await Promise.all([api.get("/profile"), api.get("/trip-sessions/active")]);
        const prof = p.data;
        const active = s.data;
        setProfile(prof);
        if (!prof) {
          setShowProfile(true);
        } else if (active) {
          setShowContinue(true);
          setSession(active);
        }
      } catch { /* ignore */ }
      finally {
        await refreshStats();
        setBootstrapped(true);
      }
    })();
  }, [user]);

  const createSession = async (payload) => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ seq: i + 1 }));
    rows[0].departure_date = payload.initial_date;
    try {
      const res = await api.post("/trip-sessions", { ...payload, rows });
      setSession(res.data);
      setShowWizard(false);
      toast.success("Trip started");
    } catch {
      toast.error("Could not start trip");
    }
  };

  const continueSession = (yes) => {
    setShowContinue(false);
    if (yes) {
      toast.success("Resumed active session");
    } else {
      (async () => {
        if (session) await api.put(`/trip-sessions/${session.session_id}`, { status: "abandoned" });
        setSession(null);
      })();
    }
  };

  if (loading || !bootstrapped) {
    return (
      <div className="min-h-screen bg-white text-[var(--tm-navy)] flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.3em] text-[var(--tm-text-muted)]">Loading...</div>
      </div>
    );
  }

  const driverFirstName = (profile?.full_name || user?.name || "Driver").split(" ")[0];

  return (
    <div className="min-h-screen bg-white text-[var(--tm-navy)]">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[var(--tm-border)]">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <BrandLockupCompact />
          <div className="flex items-center gap-2">
            {session && (
              <Button data-testid="header-preview-btn" variant="outline" size="sm"
                onClick={() => setShowPreview(true)}
                className="h-9 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
                <Eye className="h-4 w-4" />
              </Button>
            )}
            <Button data-testid="history-btn" variant="outline" size="sm"
              onClick={() => navigate("/history")}
              className="h-9 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <History className="h-4 w-4" />
            </Button>
            <Button data-testid="template-setup-btn" variant="outline" size="sm"
              onClick={() => navigate("/templates")}
              title="Trip sheet template"
              className="h-9 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <FileText className="h-4 w-4" />
            </Button>
            <Button data-testid="edit-profile-btn" variant="outline" size="sm"
              onClick={() => setShowProfile(true)}
              className="h-9 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <UserCog className="h-4 w-4" />
            </Button>
            <Button data-testid="logout-btn" variant="outline" size="sm"
              onClick={logout}
              className="h-9 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 pb-56">
        {/* Greeting */}
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--tm-blue)] font-bold">Dashboard</div>
            {user?.role && ROLE_LABEL[user.role] && (
              <span data-testid="dashboard-role-chip" className="px-2 py-0.5 rounded-full bg-[var(--tm-navy)] text-white text-[9px] tracking-[0.2em] uppercase font-bold">
                {ROLE_LABEL[user.role]}
              </span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[var(--tm-navy)]">
            Hey, {driverFirstName} 👋
          </h1>
          <p className="text-sm text-[var(--tm-text-soft)] mt-1">
            {session ? "You have an active trip in progress." : "Ready to roll? Start a new trip below."}
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" data-testid="stats-grid">
          <StatCard
            icon={<Gauge className="h-4 w-4" />}
            label="Miles today"
            value={fmtMiles(stats?.miles_today ?? 0)}
            sub="rolled up from finished trips"
            testId="stat-miles-today"
            tone="orange"
          />
          <StatCard
            icon={<Route className="h-4 w-4" />}
            label="Lifetime miles"
            value={fmtMiles(stats?.miles_lifetime ?? 0)}
            sub={`${stats?.trips_total ?? 0} trips total`}
            testId="stat-lifetime-miles"
            tone="blue"
          />
          <StatCard
            icon={<ListChecks className="h-4 w-4" />}
            label="Total stops"
            value={stats?.total_stops ?? 0}
            sub="across finished trips"
            testId="stat-total-stops"
            tone="navy"
          />
          <StatCard
            icon={<Truck className="h-4 w-4" />}
            label="Current truck"
            value={profile?.truck_number || "—"}
            sub={profile?.truck_assignment_type || "—"}
            testId="stat-truck"
            tone="navy"
          />
        </div>

        {/* Achievements panel */}
        {achievements && (
          <div className="mb-6">
            <AchievementsPanel data={achievements} />
          </div>
        )}

        {/* This week — 7-bar trend */}
        {weekly && (
          <div className="mb-6">
            <WeeklyTrend data={weekly} />
          </div>
        )}

        {/* Active trip OR Start new trip CTA */}
        {session ? (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold mb-1">Active Trip</div>
                <h2 className="text-2xl md:text-3xl font-black tracking-tight text-[var(--tm-navy)]">Order #{session.order_number}</h2>
                <div className="text-xs text-[var(--tm-text-soft)] mt-1 flex items-center gap-2">
                  <Save className="h-3 w-3" /> Auto-saving as you type
                </div>
              </div>
            </div>
            <TripSheetForm session={session} onChange={setSession} mileageMode={profile?.mileage_mode || "workflow"} />
          </section>
        ) : (
          <section className="mb-8">
            <div className="bg-gradient-to-br from-[var(--tm-navy)] to-[var(--tm-blue-deep)] rounded-md p-6 md:p-8 text-white shadow-[0_12px_36px_-16px_rgba(14,31,71,0.6)]">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/70 font-bold mb-2">Ready to roll</div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">No active trip</h2>
              <p className="text-sm text-white/80 mt-1 mb-5 max-w-md">
                Start a fresh trip sheet — Order #, BOL # (optional), and 8 stop rows ready to fill.
              </p>
              <Button data-testid="start-new-trip-btn" onClick={() => setShowWizard(true)}
                className="h-12 px-6 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md">
                <Plus className="h-4 w-4 mr-1" /> Start New Trip
              </Button>
            </div>
          </section>
        )}

        {/* Recent trips */}
        <section data-testid="recent-trips-section">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--tm-navy)]">Recent trips</h3>
            <button
              type="button"
              onClick={() => navigate("/history")}
              className="text-xs text-[var(--tm-blue)] font-bold hover:underline inline-flex items-center gap-1"
              data-testid="see-all-history-btn"
            >
              See all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {recentTrips.length === 0 ? (
            <div className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-6 text-sm text-[var(--tm-text-soft)] text-center">
              No finished trips yet — finish one and it&apos;ll show up here.
            </div>
          ) : (
            <div className="grid gap-2">
              {recentTrips.map((t) => (
                <div
                  key={t.session_id}
                  className="flex items-center gap-3 bg-white border border-[var(--tm-border)] hover:border-[var(--tm-blue)] rounded-md p-3 transition-colors cursor-pointer"
                  onClick={() => navigate("/history")}
                  data-testid={`recent-trip-${t.session_id}`}
                >
                  <div className="h-10 w-10 rounded-md bg-[var(--tm-surface-2)] flex items-center justify-center text-[var(--tm-navy)]">
                    <Route className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--tm-blue)] font-bold">
                      {formatDate(t.finished_at || t.created_at)} · {t.load_type}
                    </div>
                    <div className="text-sm font-bold text-[var(--tm-navy)] truncate">
                      Order #{t.order_number}{t.bol_number ? ` · BOL #${t.bol_number}` : ""}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--tm-text-muted)] flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {session && (
        <div
          className="fixed left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-[var(--tm-border)]"
          style={{ bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 56px)" }}
        >
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-3 flex flex-col gap-2">
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
        </div>
      )}

      <DriverProfileDialog open={showProfile} initial={profile} role={user?.role}
        onSaved={(p) => {
          setProfile(p);
          setShowProfile(false);
          refreshStats();
        }} />

      {profile && (
        <SessionWizard open={showWizard} profile={profile}
          onCreate={createSession} onCancel={() => setShowWizard(false)} />
      )}

      <Dialog open={showContinue}>
        <DialogContent data-testid="continue-dialog" className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md" hideClose>
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
            <Button data-testid="continue-no-btn" variant="outline" onClick={() => continueSession(false)}
              className="h-12 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              No, Discard
            </Button>
            <Button data-testid="continue-yes-btn" onClick={() => continueSession(true)}
              className="h-12 flex-1 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md">
              Yes, Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {session && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-5xl bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md overflow-auto max-h-[90vh]">
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

      <InstallPrompt />
    </div>
  );
}

function StatCard({ icon, label, value, sub, testId, tone = "navy" }) {
  const toneClasses = {
    navy: "bg-[var(--tm-navy)] text-white",
    blue: "bg-[var(--tm-blue)] text-white",
    orange: "bg-[var(--tm-orange)] text-white",
  }[tone];
  return (
    <div
      data-testid={testId}
      className="bg-white border border-[var(--tm-border)] rounded-md p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold">{label}</div>
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${toneClasses}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl md:text-3xl font-black tracking-tight text-[var(--tm-navy)] truncate" title={String(value)}>
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] mt-1 truncate">{sub}</div>
    </div>
  );
}

function truncate(s, n) {
  if (!s) return s;
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtMiles(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1) + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "K";
  return v.toLocaleString();
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}
