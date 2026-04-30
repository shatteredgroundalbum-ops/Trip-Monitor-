import React from "react";
import { Button } from "../components/ui/button";
import BrandLogo from "../components/app/BrandLogo";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Login() {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-white text-[var(--tm-navy)] flex flex-col">
      {/* Subtle brand glow background */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(30,120,255,0.08) 0%, rgba(255,255,255,0) 60%)",
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col justify-between p-8 md:p-12 max-w-md mx-auto w-full">
        {/* Brand */}
        <div className="flex flex-col items-center pt-6" data-testid="brand-header">
          <BrandLogo size={200} />
          <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--tm-orange)] font-bold mt-2">
            Riverside Transport · Trip Sheet
          </div>
        </div>

        <div className="space-y-6 my-12">
          <h1
            className="font-black tracking-tight leading-[0.95] text-center text-[var(--tm-navy)]"
            style={{ fontFamily: "Chivo, sans-serif", fontSize: "clamp(2.25rem, 7vw, 3.5rem)" }}
          >
            Log the miles.<br />
            <span className="text-[var(--tm-orange)]">Skip the paper.</span>
          </h1>
          <p className="text-[var(--tm-text-soft)] text-base leading-relaxed text-center max-w-sm mx-auto">
            Digital RTI trip sheets, built for the cab. Export as JPEG, PDF, or email — identical to the printed form.
          </p>
        </div>

        <div className="space-y-4">
          <Button
            data-testid="google-login-btn"
            onClick={handleLogin}
            className="w-full h-14 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md text-base tracking-wide transition-colors shadow-[0_8px_24px_-12px_rgba(255,95,21,0.55)]"
          >
            Sign in with Google
          </Button>
          <p className="text-xs text-[var(--tm-text-muted)] text-center">
            For Riverside Transport drivers · Ver. 111022 A
          </p>
        </div>
      </div>
    </div>
  );
}
