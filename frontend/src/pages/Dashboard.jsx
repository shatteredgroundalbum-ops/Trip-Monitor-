import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import DriverProfileDialog from "../components/app/DriverProfileDialog";
import SessionWizard from "../components/app/SessionWizard";
import TripSheetForm from "../components/app/TripSheetForm";
import FinishExportDialog from "../components/app/FinishExportDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Truck, LogOut, UserCog, CheckCircle2, Save, Eye } from "lucide-react";
import PaperSheet from "../components/app/PaperSheet";
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
    // Prefill row 1 departure date with chosen date
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
      // abandon + start new
      (async () => {
        if (session) await api.put(`/trip-sessions/${session.session_id}`, { status: "abandoned" });
        setSession(null);
        setShowWizard(true);
      })();
    }
  };

  if (loading || !bootstrapped) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.3em] text-neutral-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/95 backdrop-blur border-b border-[#262626]">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5" data-testid="app-header">
            <div className="h-9 w-9 flex items-center justify-center bg-[#FF5F15] rounded-sm">
              <Truck className="h-5 w-5 text-black" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-black text-lg tracking-tight leading-none">RTI</div>
              <div className="text-[9px] uppercase tracking-[0.2em] text-neutral-500 leading-none mt-0.5">Trip Sheet</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button data-testid="edit-profile-btn" variant="outline" size="sm"
              onClick={() => setShowProfile(true)}
              className="h-9 bg-transparent border-[#262626] text-white hover:bg-[#171717] rounded-sm">
              <UserCog className="h-4 w-4" />
            </Button>
            <Button data-testid="logout-btn" variant="outline" size="sm"
              onClick={logout}
              className="h-9 bg-transparent border-[#262626] text-white hover:bg-[#171717] rounded-sm">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 pb-32">
        {session ? (
          <>
            <div className="mb-6">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#FF5F15] font-bold mb-1">Active Trip</div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">Order #{session.order_number}</h1>
              <div className="text-sm text-neutral-400 mt-1 flex items-center gap-2">
                <Save className="h-3 w-3" /> Auto-saving as you type
              </div>
            </div>
            <TripSheetForm session={session} onChange={setSession} />
          </>
        ) : (
          <div className="mt-16 text-center text-neutral-400" data-testid="empty-state">
            <Truck className="h-12 w-12 mx-auto mb-4 text-[#FF5F15]" />
            <h2 className="text-2xl font-black text-white tracking-tight">No active trip</h2>
            <p className="text-sm mt-2">Start a new trip to fill out your sheet.</p>
            <Button data-testid="start-new-trip-btn" onClick={() => setShowWizard(true)}
              className="mt-6 h-14 px-8 bg-[#FF5F15] hover:bg-[#E04F0E] text-white font-bold rounded-sm">
              Start New Trip
            </Button>
          </div>
        )}
      </main>

      {/* Sticky action bar */}
      {session && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-[#0A0A0A]/95 backdrop-blur border-t border-[#262626]">
          <div className="max-w-4xl mx-auto px-4 md:px-6 py-3 flex gap-2">
            <Button data-testid="preview-btn" variant="outline" onClick={() => setShowPreview(true)}
              className="h-12 bg-transparent border-[#262626] text-white hover:bg-[#171717] rounded-sm">
              <Eye className="h-4 w-4 mr-1" /> Preview
            </Button>
            <Button data-testid="finish-btn" onClick={() => setShowFinish(true)}
              className="flex-1 h-12 bg-[#FF5F15] hover:bg-[#E04F0E] text-white font-bold rounded-sm">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Finish &amp; Export
            </Button>
          </div>
        </div>
      )}

      {/* Profile dialog */}
      <DriverProfileDialog open={showProfile} initial={profile}
        onSaved={(p) => {
          setProfile(p);
          setShowProfile(false);
          if (!session) setShowWizard(true);
        }} />

      {/* Session wizard */}
      {profile && (
        <SessionWizard open={showWizard} profile={profile}
          onCreate={createSession} onCancel={() => setShowWizard(false)} />
      )}

      {/* Continue session prompt */}
      <Dialog open={showContinue}>
        <DialogContent data-testid="continue-dialog" className="max-w-sm bg-[#171717] border-[#262626] text-white rounded-sm" hideClose>
          <DialogHeader>
            <DialogTitle className="text-white">
              <span className="text-[10px] uppercase tracking-[0.25em] text-[#FF5F15] font-bold block mb-2">Session In Progress</span>
              <span className="text-xl font-black tracking-tight">Continue current session?</span>
            </DialogTitle>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-row">
            <Button data-testid="continue-no-btn" variant="outline" onClick={() => continueSession(false)}
              className="h-12 flex-1 bg-[#0A0A0A] border-[#262626] text-white hover:bg-[#262626] rounded-sm">
              No, Start New
            </Button>
            <Button data-testid="continue-yes-btn" onClick={() => continueSession(true)}
              className="h-12 flex-1 bg-[#FF5F15] hover:bg-[#E04F0E] text-white font-bold rounded-sm">
              Yes, Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      {session && (
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-5xl bg-[#171717] border-[#262626] text-white rounded-sm overflow-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="text-white">Paper Preview</DialogTitle>
            </DialogHeader>
            <div className="overflow-auto max-h-[75vh] flex justify-center bg-neutral-800 p-4 rounded-sm">
              <PaperSheet ref={previewRef} session={session} profile={profile} />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Finish dialog */}
      {session && (
        <FinishExportDialog open={showFinish} onOpenChange={setShowFinish}
          session={session} profile={profile} />
      )}
    </div>
  );
}
