import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import SocialAuthRow from "../components/app/SocialAuthRow";
import { getLastEmail, getSelectedRole } from "../lib/auth-storage";
import { ROLE_LABEL } from "../data/constants";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Login() {
  const navigate = useNavigate();
  const [entered, setEntered] = useState(false);
  const [email, setEmail] = useState(getLastEmail());
  const [password, setPassword] = useState("");
  const role = getSelectedRole();
  const roleLabel = ROLE_LABEL[role];

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleGoogleLogin = () => {
    // Immediate redirect — no artificial delay, no intermediate UI.
    // The page is leaving anyway; an in-app spinner only adds a visible
    // "Login to Google" interstitial that isn't required by the OAuth
    // flow. Emergent OAuth → Google account picker happens directly.
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleSocial = (provider) => {
    if (provider === "google") return handleGoogleLogin();
  };

  const handleEmailLogin = (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Enter your email and password");
      return;
    }
    toast.message("Email sign-in coming soon", {
      description: "Use Google for now — full email sign-in arrives once provider keys are wired.",
    });
  };

  const handleForgot = () => {
    toast.message("Password reset coming soon", {
      description: "Email password-reset arrives once the email provider key is wired.",
    });
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
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(30,120,255,0.12) 0%, rgba(255,255,255,0) 55%), radial-gradient(ellipse at bottom right, rgba(14,31,71,0.06) 0%, rgba(255,255,255,0) 50%)",
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col justify-center p-7 md:p-12 max-w-md mx-auto w-full">
        <button
          type="button"
          data-testid="login-back-to-role"
          onClick={() => navigate("/")}
          className="self-start mb-4 inline-flex items-center gap-1 text-xs text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] font-bold uppercase tracking-[0.2em]"
        >
          <ArrowLeft className="h-3 w-3" /> Change role
        </button>

        <div className="space-y-2 mb-7">
          <div data-testid="signin-overline" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] font-bold flex-wrap">
            <span className="h-px w-8 bg-[var(--tm-blue)]" aria-hidden />
            <span className="text-[var(--tm-orange)]">Driver Edition</span>
            <span className="text-[var(--tm-text-muted)]">·</span>
            <span className="text-[var(--tm-blue)]">Sign in</span>
            {roleLabel && (
              <span data-testid="login-role-chip" className="px-2 py-0.5 ml-1 rounded-full bg-[var(--tm-navy)] text-white text-[9px] tracking-[0.2em]">
                {roleLabel}
              </span>
            )}
          </div>
          <h1
            data-testid="signin-headline"
            className="font-black tracking-tight leading-[0.95] text-[var(--tm-navy)]"
            style={{ fontFamily: "Chivo, sans-serif", fontSize: "clamp(2rem, 7vw, 3rem)" }}
          >
            Welcome back
          </h1>
          <p className="text-[var(--tm-text-soft)] text-sm">
            Sign in to keep your trip sheets rolling.
          </p>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-3">
          <Field label="Email">
            <Input data-testid="login-email" type="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required
              className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
          </Field>
          <Field label="Password">
            <Input data-testid="login-password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required
              className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
          </Field>

          <div className="flex justify-end">
            <button type="button" onClick={handleForgot} data-testid="forgot-password-btn"
              className="text-xs text-[var(--tm-blue)] font-bold hover:underline">
              Forgot password?
            </button>
          </div>

          <Button
            data-testid="login-submit"
            type="submit"
            className="w-full h-13 mt-1 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold rounded-md text-base shadow-[0_8px_24px_-12px_rgba(14,31,71,0.55)]"
          >
            Login
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--tm-border)]" />
          <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold">or continue with</span>
          <div className="h-px flex-1 bg-[var(--tm-border)]" />
        </div>

        <SocialAuthRow onProvider={handleSocial} />

        <div className="mt-8 text-center text-sm text-[var(--tm-text-soft)]">
          New here?{" "}
          <Link to="/signup" className="text-[var(--tm-blue)] font-bold hover:underline" data-testid="goto-signup">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-soft)] mb-1.5">{label}</div>
      {children}
    </div>
  );
}
