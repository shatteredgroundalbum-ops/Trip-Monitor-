import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import SocialAuthRow from "../components/app/SocialAuthRow";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function CreateAccount() {
  const [entered, setEntered] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);

  const handleGoogleSignup = () => {
    setRedirecting(true);
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    setTimeout(() => {
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    }, 100);
  };

  const handleSocial = (provider) => {
    if (provider === "google") return handleGoogleSignup();
  };

  const handleEmailSignup = (e) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast.error("Fill in name, email, and password");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    toast.message("Email sign-up coming soon", {
      description: "Please use Google for now — full email sign-up arrives once provider keys are wired.",
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
            "radial-gradient(ellipse at top, rgba(30,120,255,0.10) 0%, rgba(255,255,255,0) 55%), radial-gradient(ellipse at bottom right, rgba(14,31,71,0.06) 0%, rgba(255,255,255,0) 50%)",
        }}
      />

      <div className="relative z-10 flex-1 flex flex-col justify-center p-7 md:p-12 max-w-md mx-auto w-full">
        <div className="space-y-2 mb-7">
          <div data-testid="signup-overline" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] font-bold">
            <span className="h-px w-8 bg-[var(--tm-blue)]" aria-hidden />
            <span className="text-[var(--tm-orange)]">Driver Edition</span>
            <span className="text-[var(--tm-text-muted)]">·</span>
            <span className="text-[var(--tm-blue)]">Get started</span>
          </div>
          <h1
            data-testid="signup-headline"
            className="font-black tracking-tight leading-[0.95] text-[var(--tm-navy)]"
            style={{ fontFamily: "Chivo, sans-serif", fontSize: "clamp(2rem, 7vw, 3rem)" }}
          >
            Create your account
          </h1>
          <p className="text-[var(--tm-text-soft)] text-sm">
            Takes 30 seconds. We&apos;ll set up your driver profile next.
          </p>
        </div>

        <form onSubmit={handleEmailSignup} className="space-y-3">
          <Field label="Full name">
            <Input data-testid="signup-name" autoComplete="name"
              value={name} onChange={(e) => setName(e.target.value)} required
              className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
          </Field>
          <Field label="Email">
            <Input data-testid="signup-email" type="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} required
              className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
          </Field>
          <Field label="Password">
            <Input data-testid="signup-password" type="password" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required
              className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
          </Field>
          <Field label="Confirm password">
            <Input data-testid="signup-confirm" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} required
              className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
          </Field>

          <Button
            data-testid="signup-submit"
            type="submit"
            disabled={redirecting}
            className="w-full h-13 mt-2 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md text-base shadow-[0_8px_24px_-12px_rgba(255,95,21,0.55)]"
          >
            Create account
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--tm-border)]" />
          <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold">or continue with</span>
          <div className="h-px flex-1 bg-[var(--tm-border)]" />
        </div>

        <SocialAuthRow onProvider={handleSocial} />

        <div className="mt-8 text-center text-sm text-[var(--tm-text-soft)]">
          Already have an account?{" "}
          <Link to="/login" className="text-[var(--tm-blue)] font-bold hover:underline" data-testid="goto-login">
            Sign in
          </Link>
        </div>
      </div>

      {redirecting && (
        <div
          data-testid="redirect-overlay"
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(6px)",
            animation: "tm-fade-in 200ms ease-out forwards",
          }}
        >
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-[var(--tm-surface-2)]" />
            <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-[var(--tm-blue)] border-t-transparent animate-spin" />
          </div>
          <div className="mt-6 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-[var(--tm-blue)] font-bold">
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting to Google
          </div>
        </div>
      )}
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
