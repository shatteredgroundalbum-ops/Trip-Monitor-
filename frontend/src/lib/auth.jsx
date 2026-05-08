import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { isSetup, getDeviceId, getIdentity } from "./local-auth";
import { isUnlocked, setAuthedUser as setSessUnlocked, clearUnlock, getSelectedRole } from "./auth-storage";

/**
 * Fully offline auth context. No network calls, no OAuth, no server sessions.
 *
 * The device PIN unlock happens entirely client-side via local-auth.js.
 * After the PIN succeeds we construct a user object from the device's
 * local identity (display_username, driver_id, role) — no backend needed.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [setup, setSetup] = useState(null); // null=unknown, true/false
  const [loading, setLoading] = useState(true);

  const buildLocalUser = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const identity = await getIdentity();
      const role = getSelectedRole() || null;
      return {
        user_id: deviceId,
        email: '',
        name: identity?.display_username || '',
        role,
      };
    } catch {
      return null;
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const done = await isSetup();
      setSetup(done);
      if (done && isUnlocked()) {
        const localUser = await buildLocalUser();
        setUser(localUser);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [buildLocalUser]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  /** Called after a successful local PIN / fingerprint verification. */
  const unlockDevice = useCallback(async () => {
    setSessUnlocked({ unlocked: true });
    setSetup(true);
    const localUser = await buildLocalUser();
    setUser(localUser);
  }, [buildLocalUser]);

  const logout = async () => {
    clearUnlock();
    setUser(null);
    setSetup(null);
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user, setUser, setup, loading, logout, checkAuth, unlockDevice }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);