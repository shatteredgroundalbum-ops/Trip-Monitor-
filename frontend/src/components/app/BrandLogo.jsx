import React from "react";

/**
 * Trip Monitor — Driver Edition logo.
 * Uses the uploaded asset. `tag` controls whether the "Driver Edition" tag is shown.
 */
export default function BrandLogo({ size = 80, tag = false, className = "" }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <img
        src="/trip-monitor-logo.webp"
        alt="Trip Monitor — Driver Edition"
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain" }}
        data-testid="brand-logo"
      />
      {tag && (
        <div
          className="mt-2 text-[10px] uppercase tracking-[0.3em] text-[#FF5F15] font-bold"
          data-testid="brand-tag"
        >
          Driver Edition
        </div>
      )}
    </div>
  );
}

/** Compact horizontal lockup for header/navbar usage. */
export function BrandLockupCompact({ className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} data-testid="brand-lockup">
      <img
        src="/trip-monitor-logo.webp"
        alt="Trip Monitor"
        className="h-9 w-9 object-contain"
      />
      <div>
        <div className="font-black text-base leading-none tracking-tight">
          <span className="text-white">Trip </span>
          <span className="text-[#3B82F6]">Monitor</span>
        </div>
        <div className="text-[8px] uppercase tracking-[0.25em] text-neutral-500 leading-none mt-0.5">
          Driver Edition
        </div>
      </div>
    </div>
  );
}
