import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Wrench, KeyRound, ArrowRight } from "lucide-react";
import { DRIVER_ROLES } from "../data/constants";
import { setSelectedRole, hasSignedUpBefore } from "../lib/auth-storage";

const ROLE_ICONS = {
  company_driver: Truck,
  owner_operator: Wrench,
  lto: KeyRound,
};

/**
 * Entry point — the driver picks the role they identify with before signing in
 * or creating an account. Role is stored locally and posted to /api/auth/role
 * after the auth callback succeeds.
 */
export default function RoleSelection() {
  const navigate = useNavigate();
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    return () => clearTimeout(t);
  }, []);

  const pick = (roleId) => {
    setSelectedRole(roleId);
    navigate(hasSignedUpBefore() ? "/login" : "/signup");
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-white text-[var(--tm-navy)] flex flex-col"
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(6%)",
        transition: "opacity 600ms ease-out, transform 700ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      data-testid="role-selection-page"
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top, rgba(30,120,255,0.10) 0%, rgba(255,255,255,0) 55%), radial-gradient(ellipse at bottom right, rgba(14,31,71,0.06) 0%, rgba(255,255,255,0) 50%)",
        }}
      />

      <main className="relative z-10 flex-1 flex flex-col p-7 md:p-12 max-w-md w-full mx-auto pt-12">
        <div className="space-y-2 mb-8 mt-3">
          <div data-testid="role-overline" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] font-bold">
            <span className="h-px w-8 bg-[var(--tm-blue)]" aria-hidden />
            <span className="text-[var(--tm-orange)]">Driver Edition</span>
            <span className="text-[var(--tm-text-muted)]">·</span>
            <span className="text-[var(--tm-blue)]">Choose role</span>
          </div>
          <h1
            data-testid="role-headline"
            className="font-black tracking-tight leading-[0.95] text-[var(--tm-navy)]"
            style={{ fontFamily: "Chivo, sans-serif", fontSize: "clamp(2rem, 7vw, 3rem)" }}
          >
            Who's driving today?
          </h1>
          <p className="text-[var(--tm-text-soft)] text-sm">
            Pick the role that matches you. We'll tailor the rest of the setup around it.
          </p>
        </div>

        <div className="space-y-3" data-testid="role-list">
          {DRIVER_ROLES.map((r) => {
            const Icon = ROLE_ICONS[r.id] || Truck;
            return (
              <button
                key={r.id}
                type="button"
                data-testid={`role-${r.id}`}
                onClick={() => pick(r.id)}
                className="w-full text-left bg-white border-2 border-[var(--tm-border)] hover:border-[var(--tm-blue)] hover:bg-[var(--tm-surface)] rounded-md p-4 flex items-center gap-4 transition-all group shadow-sm hover:shadow-md"
              >
                <div className="h-12 w-12 rounded-md bg-[var(--tm-navy)] text-white flex items-center justify-center shrink-0 group-hover:bg-[var(--tm-blue)] transition-colors">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold mb-0.5">
                    {r.short}
                  </div>
                  <div className="text-base font-bold text-[var(--tm-navy)]">{r.label}</div>
                  <div className="text-xs text-[var(--tm-text-soft)] mt-0.5">{r.blurb}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-[var(--tm-text-muted)] group-hover:text-[var(--tm-blue)] shrink-0" />
              </button>
            );
          })}
        </div>

        <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold mt-8 text-center">
          You can change this later from your profile
        </p>
      </main>
    </div>
  );
}
