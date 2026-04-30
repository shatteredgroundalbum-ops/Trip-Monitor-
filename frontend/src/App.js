import React, { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import AuthCallback from "./pages/AuthCallback";
import SplashScreen from "./components/app/SplashScreen";
import { Toaster } from "./components/ui/sonner";

function ProtectedRoute({ children }) {
  const location = useLocation();
  const { user, loading } = useAuth();
  if (location.state?.user) return children;
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0F1F] text-white flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.3em] text-blue-300/60">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  // Check URL fragment (not query params) for session_id - synchronous, prevents race conditions
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  // Show splash only once per browser session.
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return !sessionStorage.getItem("tm_splash_seen");
    } catch {
      return true;
    }
  });

  // Skip splash entirely on the OAuth callback to avoid covering the redirect.
  const isAuthCallback =
    typeof window !== "undefined" && window.location.hash?.includes("session_id=");

  useEffect(() => {
    if (isAuthCallback) setShowSplash(false);
  }, [isAuthCallback]);

  const handleSplashComplete = () => {
    try { sessionStorage.setItem("tm_splash_seen", "1"); } catch { /* ignore */ }
    setShowSplash(false);
  };

  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          {showSplash && !isAuthCallback && <SplashScreen onComplete={handleSplashComplete} />}
          <Toaster theme="dark" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
