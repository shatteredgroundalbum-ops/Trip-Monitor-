import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { isUnlocked } from "./lib/auth-storage";
import Welcome from "./pages/Welcome";
import SetupAccessCode from "./pages/SetupAccessCode";
import PinLogin from "./pages/PinLogin";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import TemplateSetup from "./pages/TemplateSetup";
import AccountScreen from "./pages/AccountScreen";
import UserProfileScreen from "./pages/UserProfileScreen";
import SettingsScreen from "./pages/SettingsScreen";
import NewTripScreen from "./pages/NewTripScreen";
import CreateTripScreen from "./pages/CreateTripScreen";import MessagesScreen from "./pages/MessagesScreen";
import DocumentsScreen from "./pages/DocumentsScreen";
import DocumentViewerScreen from "./pages/DocumentViewerScreen";
import NotificationsScreen from "./pages/NotificationsScreen";
import ReportsScreen from "./pages/ReportsScreen";
import ReportPreviewScreen from "./pages/ReportPreviewScreen";
import AnalyticsScreen from "./pages/AnalyticsScreen";
import SupportScreen from "./pages/SupportScreen";
import LegalScreen from "./pages/LegalScreen";
import ComingSoonScreen from "./pages/ComingSoonScreen";
import SplashScreen from "./components/app/SplashScreen";
import PreSplashScreen from "./components/app/PreSplashScreen";
import OfflineBanner from "./components/app/OfflineBanner";
import { Toaster } from "./components/ui/sonner";

/**
 * ProtectedRoute — redirects based on local-device auth state:
 *   - not set up  → /setup-access-code
 *   - set up but locked → /pin-login
 *   - unlocked    → renders the protected route
 */
function ProtectedRoute({ children }) {
  const { user, setup, loading } = useAuth();
  // Gate on the synchronous sessionStorage flag as well — user state
  // may still be null for one render cycle after a PIN unlock while
  // checkAuth is in flight; in that case we still let the page mount
  // so we don't bounce back to /pin-login mid-transition.
  if (loading) {
    return (
      <div className="min-h-screen bg-white text-[var(--tm-navy)] flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.3em] text-[var(--tm-text-muted)]">Loading...</div>
      </div>
    );
  }
  if (setup === false) return <Navigate to="/setup-access-code" replace />;
  if (!user && !isUnlocked()) return <Navigate to="/pin-login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/setup-access-code" element={<SetupAccessCode />} />
            <Route path="/pin-login" element={<PinLogin />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/templates" element={<ProtectedRoute><TemplateSetup /></ProtectedRoute>} />
            <Route path="/studio" element={<ProtectedRoute><TemplateSetup /></ProtectedRoute>} />
            <Route path="/new-trip" element={<ProtectedRoute><NewTripScreen /></ProtectedRoute>} />
            <Route path="/new-trip/create" element={<ProtectedRoute><CreateTripScreen /></ProtectedRoute>} />
            <Route path="/messages" element={<ProtectedRoute><MessagesScreen /></ProtectedRoute>} />
            <Route path="/documents" element={<ProtectedRoute><DocumentsScreen /></ProtectedRoute>} />
            <Route path="/documents/:id" element={<ProtectedRoute><DocumentViewerScreen /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><NotificationsScreen /></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute><AccountScreen /></ProtectedRoute>} />
            <Route path="/user-profile" element={<ProtectedRoute><UserProfileScreen /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsScreen /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><ReportsScreen /></ProtectedRoute>} />
            <Route path="/reports/:id" element={<ProtectedRoute><ReportPreviewScreen /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><AnalyticsScreen /></ProtectedRoute>} />
            <Route path="/support" element={<ProtectedRoute><SupportScreen /></ProtectedRoute>} />
            <Route path="/legal" element={<ProtectedRoute><LegalScreen /></ProtectedRoute>} />
            <Route path="/change-pin" element={<ProtectedRoute>
              <ComingSoonScreen
                title="Change PIN"
                body="Full PIN change flow with current-PIN verification, new-PIN entry, and re-enrollment of biometric unlock is on the way. For now, reset your account in Account Actions to set a new PIN at first launch."
              />
            </ProtectedRoute>} />
            <Route path="/recovery" element={<ProtectedRoute>
              <ComingSoonScreen
                title="Login Recovery"
                body="Set up a recovery phrase or master code so you can regain access if you forget your PIN. Coming next — uses on-device key derivation, never stored on a server."
              />
            </ProtectedRoute>} />
            <Route path="/license" element={<ProtectedRoute>
              <ComingSoonScreen
                title="Manage License"
                body="License upgrade, plan switching and billing live here. While Development Mode is on, all premium features are unlocked and this screen is disabled."
              />
            </ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <OfflineBanner />
          <SplashOnce />
          <Toaster theme="light" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

function SplashOnce() {
  // 3-phase intro that lets the splash animation get rolling BEFORE
  // the user ever sees it, so there is never a frozen first frame
  // during the hand-off:
  //
  //   pre    — pre-splash on top (z-120). White shield (z-105) and
  //            SplashScreen (z-100) are already mounted underneath.
  //            The video begins preloading and autoplaying behind
  //            the cover. Pre-splash holds until BOTH (a) min
  //            legibility AND (b) the splash <video> fires `playing`
  //            (real frames being drawn, not just metadata loaded).
  //   reveal — pre-splash has faded out, leaving only the white
  //            shield over the already-playing splash. The shield
  //            then fades out, revealing the splash mid-animation.
  //   done   — splash finishes its built-in slide-up + fade and we
  //            unmount everything. Welcome takes over.
  //
  // sessionStorage gate ensures the entire intro plays once per tab.
  const HARD_CAP_MS = 5000;
  const MIN_LEGIBILITY_MS = 1500;

  const [phase, setPhase] = React.useState(() => {
    try { return sessionStorage.getItem("tm_splash_seen") ? "done" : "pre"; }
    catch { return "pre"; }
  });
  const [minHoldDone, setMinHoldDone] = React.useState(false);
  const [splashPlaying, setSplashPlaying] = React.useState(false);
  // Drives PreSplashScreen's fade-out animation.
  const fadeOutPre = phase === "pre" && minHoldDone && splashPlaying;

  // Minimum legibility hold — independent of network conditions.
  React.useEffect(() => {
    if (phase !== "pre") return undefined;
    const t = setTimeout(() => setMinHoldDone(true), MIN_LEGIBILITY_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Hard cap — if the video never fires `playing` within HARD_CAP_MS
  // (codec error, broken network), advance anyway. SplashScreen has
  // its own fallback to the static logo image on video error.
  React.useEffect(() => {
    if (phase !== "pre") return undefined;
    const t = setTimeout(() => setSplashPlaying(true), HARD_CAP_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // White shield: opaque while pre-splash is on (covers the already-
  // playing splash) and during the brief 'reveal' phase, then fades
  // out so the splash becomes visible mid-animation.
  const shieldOpacity = phase === "reveal" ? 0 : (phase === "done" ? 0 : 1);

  if (phase === "done") return null;

  const finish = () => {
    try { sessionStorage.setItem("tm_splash_seen", "1"); } catch { /* ignore */ }
    setPhase("done");
  };

  return (
    <>
      {/* SplashScreen mounts from t=0 so the video is already playing
          by the time the user sees it. z-100. */}
      <SplashScreen
        onComplete={finish}
        onPlaying={() => setSplashPlaying(true)}
      />
      {/* White shield — covers the splash until the pre-splash is gone
          and we're ready to reveal a mid-animation frame. z-105. */}
      <div
        aria-hidden
        data-testid="splash-shield"
        style={{
          position: "fixed", inset: 0, backgroundColor: "#FFFFFF",
          zIndex: 105, pointerEvents: "none",
          opacity: shieldOpacity,
          transition: "opacity 700ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      {/* Pre-splash on top during pre phase. z-120. Fades out into the
          shield once the splash is genuinely playing AND the min
          legibility hold has elapsed. */}
      {phase === "pre" && (
        <PreSplashScreen
          fadeOut={fadeOutPre}
          onComplete={() => setPhase("reveal")}
        />
      )}
    </>
  );
}

export default App;
