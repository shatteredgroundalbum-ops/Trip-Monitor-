import React from "react";

/**
 * App brand wordmark (text-only, no monogram tile).
 *
 * RULE: This component must ONLY be used on the Dashboard. No other
 * page in the app should display the full app name in its header.
 *
 * The Trip Monitor logo IMAGE remains reserved for the splash screen.
 * RTI branding is reserved for the printed trip-sheet form (PaperSheet).
 */
export function BrandLockupCompact({ className = "" }) {
  return (
    <div className={`leading-tight ${className}`} data-testid="brand-lockup">
      <div className="font-black text-base md:text-lg tracking-tight">
        <span className="text-[var(--tm-navy)]">Trip </span>
        <span className="text-[var(--tm-blue)]">Monitor</span>
      </div>
      <div className="text-[8px] md:text-[9px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold mt-0.5">
        Driver Edition
      </div>
    </div>
  );
}
