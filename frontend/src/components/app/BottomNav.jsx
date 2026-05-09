import React from "react";
import {
  DashboardGaugeIcon,
  NewTripIcon,
  StudioIcon,
  ReportsIcon,
  MessagesIcon,
} from "./DashboardIcons";

/**
 * Fixed bottom navigation toolbar — Dashboard · New Trip · Studio · Reports · Messages.
 *
 * Active rule (per spec): the icon SHAPE itself emits a subtle orange glow.
 *   - No circle backgrounds.
 *   - No filled tiles.
 *   - Inactive icons are thin navy line-art.
 *   - Active icons get an orange drop-shadow on the SVG shape only.
 *
 * The Profile / My Account icon is intentionally NOT in this toolbar —
 * it lives only inside the hamburger menu (per dashboard spec).
 */
const ITEMS = [
  { key: "dashboard", label: "Dashboard", Icon: DashboardGaugeIcon },
  { key: "new-trip",  label: "New Trip",  Icon: NewTripIcon },
  { key: "studio",    label: "Studio",    Icon: StudioIcon },
  { key: "reports",   label: "Reports",   Icon: ReportsIcon },
  { key: "messages",  label: "Messages",  Icon: MessagesIcon },
];

export default function BottomNav({ active, onSelect, badges = {} }) {
  return (
    <nav
      data-testid="bottom-nav"
      className="fixed left-0 right-0 bottom-0 z-40 bg-white border-t border-[var(--tm-border)] shadow-[0_-4px_14px_rgba(14,31,71,0.06)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="max-w-5xl mx-auto px-2 flex items-stretch justify-between h-16">
        {ITEMS.map(({ key, label, Icon }) => {
          const isActive = active === key;
          const badge = badges[key];
          return (
            <button
              key={key}
              type="button"
              data-testid={`bottom-nav-${key}`}
              data-active={isActive ? "true" : "false"}
              onClick={() => onSelect && onSelect(key)}
              className={[
                "flex-1 flex flex-col items-center justify-center gap-1 select-none",
                "text-[10px] uppercase tracking-[0.12em] font-bold",
                "transition-colors duration-150",
                isActive
                  ? "text-[var(--tm-orange)]"
                  : "text-[var(--tm-navy)] hover:text-[var(--tm-blue)]",
              ].join(" ")}
            >
              <span
                className="relative inline-flex"
                style={
                  isActive
                    ? { filter: "drop-shadow(0 0 5px var(--tm-orange)) drop-shadow(0 0 1px var(--tm-orange))" }
                    : undefined
                }
              >
                <Icon />
                {badge ? (
                  <span
                    data-testid={`bottom-nav-${key}-badge`}
                    className="absolute -top-1 -right-1.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--tm-orange)] text-white text-[9px] font-black flex items-center justify-center leading-none"
                  >
                    {badge}
                  </span>
                ) : null}
              </span>
              <span className={isActive ? "" : "text-[var(--tm-navy)]"}>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
