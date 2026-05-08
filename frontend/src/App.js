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
  // Data-driven 4-phase intro:
  //   pre  — CornerBoxx pre-splash. Stays up just long enough to (a)
  //          let a human read the brand AND (b) buffer the Trip Monitor
  //          splash video enough to play through smoothly.
  //   gap  — 800 ms of plain white between the two brand stamps so the
  //          transition reads as "fade out → fade in," never overlap.
  //   main — Trip Monitor splash fades IN, plays its full video, slides
  //          up + fades out at the very end.
  //   done — everything unmounted, Welcome visible.
  //
  // Pre-splash duration is NOT hardcoded. It is the MAX of:
  //   • MIN_LEGIBILITY_MS  — minimum readable time on screen
  //   • time until splash <video> fires `canplaythrough`
  // …capped by HARD_CAP_MS in case the video can't load (slow network,
  // 404, error). On the cap path, SplashScreen will fall back to its
  // static logo image — still safe.
  const MIN_LEGIBILITY_MS = 1500;
  const HARD_CAP_MS = 5000;

  const [phase, setPhase] = React.useState(() => {
    try { return sessionStorage.getItem("tm_splash_seen") ? "done" : "pre"; }
    catch { return "pre"; }
  });
  // Two independent gates that must BOTH be true before we leave "pre".
  const [minHoldDone, setMinHoldDone] = React.useState(false);
  const [splashReady, setSplashReady] = React.useState(false);
  // Drives PreSplashScreen's fade-out animation.
  const fadeOutPre = phase === "pre" && minHoldDone && splashReady;
  const [shieldOpacity, setShieldOpacity] = React.useState(1);
  const [mainOpacity, setMainOpacity]     = React.useState(0);

  // Minimum legibility hold — independent of network conditions.
  React.useEffect(() => {
    if (phase !== "pre") return undefined;
    const t = setTimeout(() => setMinHoldDone(true), MIN_LEGIBILITY_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Preload the splash video so we know exactly when it can play.
  // Mirror the same source-selection logic SplashScreen uses (smallest
  // first via canPlayType) so the preload hits the same URL the real
  // <video> tag will request — letting the browser HTTP-cache do the
  // work. Listening for canplaythrough = "buffered enough to play
  // through smoothly," which is the actual ready signal we want.
  React.useEffect(() => {
    if (phase === "done") return undefined;
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    // Smallest-first probe — same order as SplashScreen's <source> tags.
    if (v.canPlayType('video/webm; codecs="vp9"')) {
      v.src = "/trip-monitor-splash.webm";
    } else if (v.canPlayType('video/mp4; codecs="avc1.42E01E"')) {
      v.src = "/trip-monitor-splash.lite.mp4";
    } else {
      // No supported variant — splash will fall back to its static
      // image (which loads instantly), so advance immediately.
      setSplashReady(true);
      return undefined;
    }
    const ready = () => setSplashReady(true);
    v.addEventListener("canplaythrough", ready, { once: true });
    v.addEventListener("error", ready, { once: true });
    const cap = setTimeout(ready, HARD_CAP_MS);
    v.load();
    return () => {
      clearTimeout(cap);
      v.removeEventListener("canplaythrough", ready);
      v.removeEventListener("error", ready);
      v.src = "";
      v.load();
    };
  }, [phase]);

  // Gap → main hand-off (fixed 800 ms breath).
  React.useEffect(() => {
    if (phase !== "gap") return undefined;
    const t = setTimeout(() => setPhase("main"), 800);
    return () => clearTimeout(t);
  }, [phase]);

  // Main fade-in: 800 ms opacity 0 → 1 once SplashScreen mounts.
  React.useEffect(() => {
    if (phase !== "main") { setMainOpacity(0); return undefined; }
    const id = requestAnimationFrame(() => setMainOpacity(1));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  // Sync the shield fade-out with SplashScreen's built-in slide-up
  // (begins at durationMs - 1100 = 6300 ms after mount) so Welcome
  // dissolves in cinematically rather than snap-cutting.
  React.useEffect(() => {
    if (phase !== "main") return undefined;
    const t = setTimeout(() => setShieldOpacity(0), 6300);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "done") return null;

  const finish = () => {
    try { sessionStorage.setItem("tm_splash_seen", "1"); } catch { /* ignore */ }
    setPhase("done");
  };

  return (
    <>
      {/* White shield — sits above <Routes> for the entire intro so
          Welcome never flashes through any transition. Fades out in
          sync with the Trip Monitor splash's own slide-up at the end. */}
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
        <PreSplashScreen
          fadeOut={fadeOutPre}
          onComplete={() => setPhase("gap")}
        />
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
