import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import SessionWizard from "../components/app/SessionWizard";
import { api } from "../lib/api";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

/**
 * /new-trip/create — full-screen "Start a new trip" wizard.
 *
 * Per global rule (no popups for navigation), the 3-step session
 * wizard is rendered INLINE here instead of in a Dialog. Reached by
 * tapping "Create New Trip" on the /new-trip launcher.
 */
export default function CreateTripScreen() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get("/profile");
        setProfile(p.data);
      } catch { /* new driver — fall through with empty profile */ }
      finally { setProfileLoaded(true); }
    })();
  }, []);

  const createSession = async (payload) => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ seq: i + 1 }));
    rows[0].departure_date = payload.initial_date;
    try {
      await api.post("/trip-sessions", { ...payload, rows });
      toast.success("Trip started");
      navigate("/dashboard");
    } catch {
      toast.error("Could not start trip");
    }
  };

  return (
    <AppShell active="new-trip" overline="Bottom Nav · New Trip" pageTitle="Start New Trip">
      <div data-testid="create-trip-screen" className="flex flex-col gap-4">
        <button
          type="button"
          data-testid="create-trip-back"
          onClick={() => navigate("/new-trip")}
          className="self-start inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to New Trip
        </button>

        {profileLoaded ? (
          <SessionWizard
            inline
            profile={profile || {}}
            onCreate={createSession}
            onCancel={() => navigate("/new-trip")}
          />
        ) : (
          <div className="bg-white border border-[var(--tm-border)] rounded-xl p-5 text-sm font-semibold text-[var(--tm-text-soft)] max-w-lg">
            Loading profile…
          </div>
        )}
      </div>
    </AppShell>
  );
}
