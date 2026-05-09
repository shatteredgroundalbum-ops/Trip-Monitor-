import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RoleSelection from "./RoleSelection";
import { isSetup } from "../lib/local-auth";
import { getSelectedRole } from "../lib/auth-storage";

/**
 * App entry router.
 *
 * Per spec:
 *   • Choose Role appears ONLY on first-time setup (no role saved
 *     and no PIN set up yet).
 *   • Returning users skip role selection entirely — go straight to
 *     PIN login.
 *   • Logout returns to /pin-login (handled in auth.jsx), so a
 *     normal logout never reaches this entry router.
 *
 * Decision tree:
 *   isSetup()           → /pin-login   (PIN exists; just unlock)
 *   !isSetup && hasRole → /setup-access-code  (role chosen, PIN pending)
 *   !isSetup && !hasRole→ render <RoleSelection /> (true first-time)
 */
export default function Welcome() {
  const navigate = useNavigate();
  const [decision, setDecision] = useState(null); // "show-role" | "redirected"

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const done = await isSetup();
        if (cancelled) return;
        if (done) {
          navigate("/pin-login", { replace: true });
          return;
        }
        const role = getSelectedRole();
        if (role) {
          navigate("/setup-access-code", { replace: true });
          return;
        }
        setDecision("show-role");
      } catch {
        // On any error fall back to first-time experience.
        if (!cancelled) setDecision("show-role");
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  if (decision !== "show-role") {
    // Brief blank while the redirect resolves — avoids flashing the
    // role selection screen for returning users.
    return (
      <div className="min-h-screen bg-white text-[var(--tm-navy)] flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.3em] text-[var(--tm-text-muted)]">Loading...</div>
      </div>
    );
  }
  return <RoleSelection />;
}
