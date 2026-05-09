import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { isSetup, getDeviceId, getIdentity } from "./local-auth";
import { isUnlocked, setAuthedUser as setSessUnlocked, clearUnlock, getSelectedRole } from "./auth-storage";
import { api } from "./api";

/**
 * Local-only auth context. No network auth, no OAuth, no passwords.
 *
 * The device PIN unlock happens entirely client-side via
 * `local-auth.js`. After the PIN succeeds we call `/api/auth/local`
 * with the device_id so the backend can issue a session cookie for
 * data reads — the backend does NOT verify identity, it merely
 * mirrors the device's locally-proven state.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [setup, setSetup] = useState(null); // null=unknown, true/false
  const [loading, setLoading] = useState(true);

  const issueDeviceSession = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const role = getSelectedRole() || undefined;
      const identity = await getIdentity();
      await api.post("/auth/local", {
        device_id: deviceId,
        role,
        display_username: identity.display_username || undefined,
        driver_id: identity.driver_id || undefined,
      });
      const me = await api.get("/auth/me");
      setUser(me.data);
      return me.data;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const done = await isSetup();
      setSetup(done);
      if (done && isUnlocked()) {
        // Try the existing session first; if it's expired we'll
        // re-issue a new one via /auth/local.
        try {
          const me = await api.get("/auth/me");
          setUser(me.data);
        } catch {
          await issueDeviceSession();
        }
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [issueDeviceSession]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  /** Called after a successful local PIN / fingerprint verification. */
  const unlockDevice = useCallback(async () => {
    setSessUnlocked({ unlocked: true });
    setSetup(true);
    await issueDeviceSession();
  }, [issueDeviceSession]);

  const logout = async () => {
    clearUnlock();
    setUser(null);
    setSetup(null);
    // Fire-and-forget the backend logout — the redirect must not
    // wait for the network. Local-device auth is the source of
    // truth; the backend session cookie is best-effort cleanup.
    try { api.post("/auth/logout").catch(() => {}); } catch { /* ignore */ }
    // Per spec: logout returns to the PIN login screen, NOT the
    // role-selection screen. Role only appears during first-time
    // setup. If somehow no PIN was ever set up (extremely rare —
    // implies device data was wiped between login and logout),
    // /pin-login itself bounces back to /setup-access-code.
    window.location.href = "/pin-login";
  };

  return (
    <AuthContext.Provider value={{ user, setUser, setup, loading, logout, checkAuth, unlockDevice }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
