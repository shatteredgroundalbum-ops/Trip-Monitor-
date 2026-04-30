import React from "react";

/**
 * Trip Monitor — Driver Edition logo. The logo image itself is NEVER recolored
 * or filtered — displayed exactly as uploaded.
 */
export default function BrandLogo({ size = 80, className = "" }) {
  return (
    <img
      src="/trip-monitor-logo.webp"
      alt="Trip Monitor — Driver Edition"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain" }}
      className={className}
      data-testid="brand-logo"
    />
  );
}

/** Compact horizontal lockup for header/navbar usage. */
export function BrandLockupCompact({ className = "" }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="brand-lockup">
      <img
        src="/trip-monitor-logo.webp"
        alt="Trip Monitor"
        className="h-10 w-10 object-contain"
      />
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
