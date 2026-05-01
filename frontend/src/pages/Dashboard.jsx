import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import DriverProfileDialog from "../components/app/DriverProfileDialog";
import SessionWizard from "../components/app/SessionWizard";
import TripSheetForm from "../components/app/TripSheetForm";
import FinishExportDialog from "../components/app/FinishExportDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { LogOut, UserCog, CheckCircle2, Save, Eye, History, Truck } from "lucide-react";
import PaperSheet from "../components/app/PaperSheet";
import { BrandLockupCompact } from "../components/app/BrandLogo";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
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
        } else {
          setShowWizard(true);
        }
      } catch { /* ignore */ }
      finally { setBootstrapped(true); }
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
        setShowWizard(true);
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

  return (
    <div className="min-h-screen bg-white text-[var(--tm-navy)]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[var(--tm-border)]">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
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

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 pb-44">
        {session ? (
          <>
            <div className="mb-6">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold mb-1">Active Trip</div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[var(--tm-navy)]">Order #{session.order_number}</h1>
              <div className="text-sm text-[var(--tm-text-soft)] mt-1 flex items-center gap-2">
                <Save className="h-3 w-3" /> Auto-saving as you type
              </div>
            </div>
            <TripSheetForm session={session} onChange={setSession} />
          </>
        ) : (
          <div className="mt-16 text-center text-[var(--tm-text-soft)]" data-testid="empty-state">
            <Truck className="h-12 w-12 mx-auto mb-4 text-[var(--tm-blue)]" />
            <h2 className="text-2xl font-black text-[var(--tm-navy)] tracking-tight">No active trip</h2>
            <p className="text-sm mt-2">Start a new trip to fill out your sheet.</p>
            <Button data-testid="start-new-trip-btn" onClick={() => setShowWizard(true)}
              className="mt-6 h-14 px-8 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md shadow-[0_8px_24px_-12px_rgba(255,95,21,0.55)]">
              Start New Trip
            </Button>
          </div>
        )}
      </main>

      {session && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-[var(--tm-border)]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 flex gap-2">
            <Button data-testid="preview-btn" variant="outline" onClick={() => setShowPreview(true)}
              className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <Eye className="h-4 w-4 mr-1" /> Preview
            </Button>
            <Button data-testid="finish-btn" onClick={() => setShowFinish(true)}
              className="flex-1 h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md shadow-[0_8px_24px_-12px_rgba(255,95,21,0.55)]">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Finish &amp; Export
            </Button>
          </div>
        </div>
      )}

      <DriverProfileDialog open={showProfile} initial={profile}
        onSaved={(p) => {
          setProfile(p);
          setShowProfile(false);
          if (!session) setShowWizard(true);
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
              No, Start New
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
              <PaperSheet ref={previewRef} session={session} profile={profile} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {session && (
        <FinishExportDialog open={showFinish} onOpenChange={setShowFinish}
          session={session} profile={profile} />
      )}
    </div>
  );
}
