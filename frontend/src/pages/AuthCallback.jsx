import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { markSignedUp, getSelectedRole, clearSelectedRole } from "../lib/auth-storage";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) {
      navigate("/", { replace: true });
      return;
    }
    const sessionId = match[1];

    (async () => {
      try {
        const res = await api.post("/auth/session", { session_id: sessionId });
        markSignedUp(res.data?.email);

        // If a role was picked on the entry screen, persist it to the user record.
        const pendingRole = getSelectedRole();
        let userPayload = res.data;
        if (pendingRole) {
          try {
            await api.post("/auth/role", { role: pendingRole });
            userPayload = { ...userPayload, role: pendingRole };
          } catch { /* non-fatal */ }
          clearSelectedRole();
        }

        setUser(userPayload);
        window.history.replaceState(null, "", "/dashboard");
        navigate("/dashboard", { replace: true, state: { user: userPayload } });
      } catch (e) {
        setError(e?.response?.data?.detail || "Authentication failed");
        setTimeout(() => navigate("/", { replace: true }), 2000);
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen bg-white text-[var(--tm-navy)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-[var(--tm-surface-2)]" />
          <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-[var(--tm-blue)] border-t-transparent animate-spin" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--tm-blue)] font-bold">
          {error ? "Sign-in failed" : "Welcome — signing you in"}
        </div>
        {error && (
          <div className="text-sm text-[var(--tm-text-soft)] max-w-xs text-center">{error}</div>
        )}
      </div>
    </div>
  );
}
