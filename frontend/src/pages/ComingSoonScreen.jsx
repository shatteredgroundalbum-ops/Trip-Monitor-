import React from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { ChevronLeft, Clock } from "lucide-react";

/**
 * Generic full-screen "Coming Soon" placeholder used while specific
 * subflows (Change PIN, Recovery setup, License management, Restore)
 * are still in design. Per the navigation spec, every row in Account
 * must navigate to a full screen, never a popup — this provides that
 * full screen surface so we don't ship dead buttons.
 */
export default function ComingSoonScreen({ title, body, route }) {
  const navigate = useNavigate();
  return (
    <AppShell overline="Account" pageTitle={title}>
      <div className="bg-white border border-[var(--tm-border)] rounded-xl p-6 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-4 max-w-xl">
        <div className="inline-flex items-center gap-2 text-[var(--tm-blue)]">
          <Clock className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Coming soon</span>
        </div>
        <p className="text-sm text-[var(--tm-navy)] font-semibold leading-relaxed">{body}</p>
        <button
          type="button"
          onClick={() => navigate(route || "/account")}
          className="self-start h-10 px-4 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] text-sm font-bold inline-flex items-center gap-1.5"
          data-testid="coming-soon-back"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Account
        </button>
      </div>
    </AppShell>
  );
}
