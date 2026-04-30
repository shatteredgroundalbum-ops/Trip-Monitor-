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
    <div className="min-h-screen relative overflow-hidden bg-[#0A0A0A] text-white flex flex-col">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1731531702939-0b0a9733501e?crop=entropy&cs=srgb&fm=jpg&q=85)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/60 via-[#0A0A0A]/80 to-[#0A0A0A]" />

      <div className="relative z-10 flex-1 flex flex-col justify-between p-8 md:p-12 max-w-md mx-auto w-full">
        {/* Brand */}
        <div className="flex flex-col items-center pt-6" data-testid="brand-header">
          <BrandLogo size={140} />
          <div className="mt-3 font-black tracking-tight text-3xl">
            <span className="text-white">Trip </span>
            <span className="text-[#3B82F6]">Monitor</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[#FF5F15] font-bold mt-1">
            Driver Edition
          </div>
        </div>

        <div className="space-y-6 my-12">
          <h1
            className="font-black tracking-tight leading-[0.95] text-center"
            style={{ fontFamily: "Chivo, sans-serif", fontSize: "clamp(2.25rem, 7vw, 3.5rem)" }}
          >
            Log the miles.<br />
            <span className="text-[#FF5F15]">Skip the paper.</span>
          </h1>
          <p className="text-neutral-400 text-base leading-relaxed text-center max-w-sm mx-auto">
            Digital RTI trip sheets, built for the cab. Export as JPEG, PDF, or email — identical to the printed form.
          </p>
        </div>

        <div className="space-y-4">
          <Button
            data-testid="google-login-btn"
            onClick={handleLogin}
            className="w-full h-14 bg-[#FF5F15] hover:bg-[#E04F0E] text-white font-bold rounded-sm text-base tracking-wide transition-colors"
          >
            Sign in with Google
          </Button>
          <p className="text-xs text-neutral-500 text-center">
            For Riverside Transport drivers · Ver. 111022 A
          </p>
        </div>
      </div>
    </div>
  );
}
