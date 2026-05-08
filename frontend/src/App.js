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
  // 4-phase intro, sequential (no overlap, no double-exposure):
  //   pre  — CornerBoxx pre-splash. Instant on (covers app boot),
  //          holds, fades out into white (~700 ms).
  //   gap  — Plain white shield only, no logo (~800 ms breathing
  //          beat between the two brand stamps).
  //   main — Trip Monitor splash fades IN from white (800 ms),
  //          plays its full video, then slides up + fades out at
  //          the end. The white shield underneath fades in sync
  //          so Welcome is revealed cinematically.
  //   done — everything unmounted, Welcome visible.
  //
  // sessionStorage gate ensures the entire intro plays once per tab.
  const [phase, setPhase] = React.useState(() => {
    try { return sessionStorage.getItem("tm_splash_seen") ? "done" : "pre"; }
    catch { return "pre"; }
  });
  const [shieldOpacity, setShieldOpacity] = React.useState(1);
  const [mainOpacity, setMainOpacity]     = React.useState(0);

  // Gap → main hand-off: 800 ms of plain white, then the Trip Monitor
  // splash mounts and starts its fade-in.
  React.useEffect(() => {
    if (phase === "gap") {
      const t = setTimeout(() => setPhase("main"), 800);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  // Main fade-in: as soon as the SplashScreen mounts, request a frame
  // and animate its wrapper opacity 0 → 1 over 800 ms.
  React.useEffect(() => {
    if (phase === "main") {
      const id = requestAnimationFrame(() => setMainOpacity(1));
      return () => cancelAnimationFrame(id);
    }
    setMainOpacity(0);
    return undefined;
  }, [phase]);

  // Final reveal: SplashScreen begins its built-in slide-up + fade-out
  // at `durationMs - 1100` = 6300 ms after mount. Drop the white
  // shield in sync so Welcome dissolves in cleanly underneath.
  React.useEffect(() => {
    if (phase === "main") {
      const t = setTimeout(() => setShieldOpacity(0), 6300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  if (phase === "done") return null;

  const finish = () => {
    try { sessionStorage.setItem("tm_splash_seen", "1"); } catch { /* ignore */ }
    setPhase("done");
  };

  return (
    <>
      {/* White shield — covers <Routes> through the entire intro so
          Welcome never flashes through. Lower z than both splashes. */}
      <div
        aria-hidden
        data-testid="splash-shield"
        style={{
          position: "fixed", inset: 0, backgroundColor: "#FFFFFF",
          zIndex: 90, pointerEvents: "none",
          opacity: shieldOpacity,
          transition: "opacity 1100ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
      {phase === "pre" && (
        <PreSplashScreen onComplete={() => setPhase("gap")} />
      )}
      {phase === "main" && (
        <div
          aria-hidden={mainOpacity === 0}
          style={{
            opacity: mainOpacity,
            transition: "opacity 800ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <SplashScreen onComplete={finish} />
        </div>
      )}
    </>
  );
}

export default App;
