import React from "react";

/**
 * App brand lockup (text-only). Used in dashboard / history headers.
 *
 * The Trip Monitor logo IMAGE is reserved for the splash screen ONLY.
 * It must NOT appear in the in-app navigation, headers, or any other screen.
 *
 * RTI branding is reserved for the printed trip-sheet form (PaperSheet) ONLY.
 * It must NOT appear anywhere in the app interface.
 */
export function BrandLockupCompact({ className = "" }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="brand-lockup">
      {/* Small monogram tile to give the lockup presence (no logo image) */}
      <div
        aria-hidden
        className="h-9 w-9 flex items-center justify-center rounded-md font-black text-white text-sm tracking-tight"
        style={{
          background: "linear-gradient(135deg, var(--tm-navy) 0%, var(--tm-blue) 100%)",
        }}
      >
        TM
      </div>
      <div className="leading-tight">
        <div className="font-black text-base tracking-tight">
          <span className="text-[var(--tm-navy)]">Trip </span>
          <span className="text-[var(--tm-blue)]">Monitor</span>
        </div>
        <div className="text-[8px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold mt-0.5">
          Driver Edition
        </div>
      </div>
    </div>
  );
}
