import React, { useEffect, useState } from "react";
import { Button } from "../components/ui/button";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Login() {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Slide-up entrance — slight delay so it overlaps the splash exit
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-white text-[var(--tm-navy)] flex flex-col"
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(6%)",
        transition: "opacity 600ms ease-out, transform 700ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Brand-tinted ambient glow (electric blue, very subtle) */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(30,120,255,0.12) 0%, rgba(255,255,255,0) 55%), radial-gradient(ellipse at bottom right, rgba(14,31,71,0.06) 0%, rgba(255,255,255,0) 50%)",
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col justify-center p-8 md:p-12 max-w-md mx-auto w-full">
        <div className="space-y-7">
          <div data-testid="signin-overline" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] font-bold">
            <span className="h-px w-8 bg-[var(--tm-blue)]" aria-hidden />
            <span className="text-[var(--tm-orange)]">Driver Edition</span>
            <span className="text-[var(--tm-text-muted)]">·</span>
            <span className="text-[var(--tm-blue)]">Sign in</span>
          </div>
          <h1
            data-testid="signin-headline"
            className="font-black tracking-tight leading-[0.95] text-[var(--tm-navy)]"
            style={{ fontFamily: "Chivo, sans-serif", fontSize: "clamp(2.5rem, 8vw, 4rem)" }}
          >
            Log the miles.<br />
            <span className="text-[var(--tm-blue)]">Skip the paper.</span>
          </h1>
          <p className="text-[var(--tm-text-soft)] text-base leading-relaxed max-w-sm">
            Digital trip sheets, built for the cab. Export as JPEG, PDF, or email — paper-perfect, every time.
          </p>
        </div>

        <div className="space-y-3 mt-12">
          <Button
            data-testid="google-login-btn"
            onClick={handleLogin}
            className="w-full h-14 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold rounded-md text-base tracking-wide transition-colors shadow-[0_8px_28px_-12px_rgba(14,31,71,0.55)]"
          >
            Sign in with Google
          </Button>
          <p className="text-xs text-[var(--tm-text-muted)] text-center">
            By continuing, you agree to use Trip Monitor responsibly while on duty.
          </p>
        </div>
      </div>
    </div>
  );
}
