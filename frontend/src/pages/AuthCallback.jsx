import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Truck } from "lucide-react";

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
        setUser(res.data);
        window.history.replaceState(null, "", "/dashboard");
        navigate("/dashboard", { replace: true, state: { user: res.data } });
      } catch (e) {
        setError(e?.response?.data?.detail || "Authentication failed");
        setTimeout(() => navigate("/", { replace: true }), 2000);
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen bg-white text-[var(--tm-navy)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 flex items-center justify-center bg-[var(--tm-orange)] rounded-md animate-pulse">
          <Truck className="h-7 w-7 text-[var(--tm-navy)]" strokeWidth={2.5} />
        </div>
        <div className="text-sm text-[var(--tm-text-soft)] tracking-wider uppercase">
          {error || "Signing you in..."}
        </div>
      </div>
    </div>
  );
}
