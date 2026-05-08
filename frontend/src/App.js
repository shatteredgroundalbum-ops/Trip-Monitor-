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
  // 3-stage cinematic intro, run once per session:
  //   1. CornerBoxx Technology pre-splash (instant cover, holds while
  //      the app finishes booting, then fades out).
  //   2. Trip Monitor splash (~7.4s) — MOUNTED THE MOMENT the pre-splash
  //      starts fading, so the cross-dissolve goes pre-splash → splash
  //      directly. The Welcome page sitting in <Routes> never flashes
  //      through the gap.
  //   3. → Welcome / landing page.
  //
  // Phases: "pre" (only pre-splash) → "crossfade" (both mounted, pre on
  // top fading out, main visible underneath) → "main" (pre unmounted,
  // main only) → "done" (both unmounted, sessionStorage flag set).
  const [phase, setPhase] = React.useState(() => {
    try { return sessionStorage.getItem("tm_splash_seen") ? "done" : "pre"; }
    catch { return "pre"; }
  });
  const finish = () => {
    try { sessionStorage.setItem("tm_splash_seen", "1"); } catch { /* ignore */ }
    setPhase("done");
  };
  if (phase === "done") return null;

  // SplashScreen mounts as soon as we leave the "pre" phase. While
  // phase === "crossfade" it sits at z-100 underneath the still-fading
  // pre-splash (z-120), so by the time pre-splash hits opacity 0 the
  // main splash is already at full opacity 1 with the video playing.
  const mainMounted = phase === "crossfade" || phase === "main";
  const preMounted  = phase === "pre" || phase === "crossfade";
  return (
    <>
      {mainMounted && <SplashScreen onComplete={finish} />}
      {preMounted && (
        <PreSplashScreen
          onFadeStart={() => setPhase("crossfade")}
          onComplete={() => setPhase("main")}
        />
      )}
    </>
  );
}

export default App;
