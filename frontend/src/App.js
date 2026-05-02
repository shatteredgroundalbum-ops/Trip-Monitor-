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
import TemplateLab from "./pages/dev/TemplateLab";
import SplashScreen from "./components/app/SplashScreen";
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
            {/* Hidden internal — Batch-1 dynamic-trip-sheet pipeline harness.
                Not linked from anywhere; reach by typing /dev/template-lab. */}
            <Route path="/dev/template-lab" element={<TemplateLab />} />
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
  const [show, setShow] = React.useState(() => {
    try { return !sessionStorage.getItem("tm_splash_seen"); } catch { return true; }
  });
  const done = () => {
    try { sessionStorage.setItem("tm_splash_seen", "1"); } catch { /* ignore */ }
    setShow(false);
  };
  if (!show) return null;
  return <SplashScreen onComplete={done} />;
}

export default App;
