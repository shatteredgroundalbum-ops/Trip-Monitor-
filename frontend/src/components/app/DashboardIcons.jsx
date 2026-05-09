import React from "react";

/**
 * Custom inline SVG icons for the bottom navigation toolbar.
 *
 * Design rules (match dashboard mockup spec):
 *   • Thin navy line-art only when inactive (stroke = currentColor).
 *   • No circle backgrounds. No filled shapes.
 *   • When active, the parent applies a drop-shadow filter so the icon
 *     SHAPE itself emits a subtle orange glow — no surrounding circle.
 */

const COMMON = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/**
 * Operational "telemetry / instrument cluster" gauge.
 * Half-arc with tick marks + a needle slightly right of centre.
 * Intentionally NOT a racing speedometer (no full circle, no MPH dial).
 */
export function DashboardGaugeIcon({ className = "" }) {
  return (
    <svg {...COMMON} className={className} aria-hidden="true">
      {/* Outer arc — half-circle instrument cluster */}
      <path d="M3.5 16 A8.5 8.5 0 0 1 20.5 16" />
      {/* Baseline */}
      <path d="M3 18.5 H21" />
      {/* Tick marks along the arc */}
      <path d="M5.4 11.6 L6.4 12.5" />
      <path d="M8.5 8.4 L9.3 9.4" />
      <path d="M12 7.2 L12 8.4" />
      <path d="M15.5 8.4 L14.7 9.4" />
      <path d="M18.6 11.6 L17.6 12.5" />
      {/* Needle — pointing slightly to the right (operational, not redlined) */}
      <path d="M12 16 L15.6 10.5" />
      {/* Pivot dot */}
      <circle cx="12" cy="16" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * "New Trip" — clean plus inside a soft rounded square outline.
 * Thin navy line, no fill.
 */
export function NewTripIcon({ className = "" }) {
  return (
    <svg {...COMMON} className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M12 8 V16" />
      <path d="M8 12 H16" />
    </svg>
  );
}

/**
 * Studio — drafting / template-builder icon. Grid + pencil overlay.
 * Minimal, no circles, no text. Active state glow is applied by caller.
 */
export function StudioIcon({ className = "" }) {
  return (
    <svg {...COMMON} className={className} aria-hidden="true">
      {/* Grid square (template canvas) */}
      <rect x="3.5" y="3.5" width="13" height="13" rx="1" />
      <path d="M3.5 8 H16.5" />
      <path d="M3.5 12 H16.5" />
      <path d="M8 3.5 V16.5" />
      <path d="M12 3.5 V16.5" />
      {/* Pencil — extends beyond the grid for the "drafting" feel */}
      <path d="M14.5 14.5 L20 20" />
      <path d="M19 19 L21 21" />
      <path d="M16.5 16.5 L17.5 17.5" />
    </svg>
  );
}

/**
 * Reports — clipboard with lines. Operational, not chart-y.
 */
export function ReportsIcon({ className = "" }) {
  return (
    <svg {...COMMON} className={className} aria-hidden="true">
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
      <path d="M8.5 11 H15.5" />
      <path d="M8.5 14 H15.5" />
      <path d="M8.5 17 H13" />
    </svg>
  );
}

/**
 * Documents — folder containing a document. Operational paperwork
 * storage (BOLs, scale tickets, lumper receipts, photos, attachments).
 */
export function DocumentsIcon({ className = "" }) {
  return (
    <svg {...COMMON} className={className} aria-hidden="true">
      {/* Folder body */}
      <path d="M3.5 7 A1.5 1.5 0 0 1 5 5.5 H9.5 L11.5 7.5 H19 A1.5 1.5 0 0 1 20.5 9 V18 A1.5 1.5 0 0 1 19 19.5 H5 A1.5 1.5 0 0 1 3.5 18 Z" />
      {/* Document inside the folder */}
      <path d="M8.5 12 H15.5" />
      <path d="M8.5 14.5 H13.5" />
    </svg>
  );
}

/**
 * Messages — speech bubble outline.
 */
export function MessagesIcon({ className = "" }) {
  return (
    <svg {...COMMON} className={className} aria-hidden="true">
      <path d="M4 6 A2 2 0 0 1 6 4 H18 A2 2 0 0 1 20 6 V15 A2 2 0 0 1 18 17 H10 L6 21 V17 A2 2 0 0 1 4 15 Z" />
      <path d="M8 9 H16" />
      <path d="M8 12.5 H13" />
    </svg>
  );
}
