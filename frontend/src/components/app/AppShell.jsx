import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAuth } from "../../lib/auth";
import BottomNav from "./BottomNav";
import DashboardMenu from "./DashboardMenu";
import LogoutConfirmDialog from "./LogoutConfirmDialog";
import { BrandLockupCompact } from "./BrandLogo";
import { isAboveQuotaWarning } from "../../lib/storage-location";

/**
 * Shared app chrome — sticky top header + fixed bottom navigation.
 *
 * Per spec:
 *   • Tap button = go to screen. No popup-based navigation.
 *   • Top toolbar shows ONLY the bell + hamburger on the right.
 *   • Hamburger items navigate to full screens via react-router.
 *   • Bottom-nav items navigate to full screens via react-router.
 *   • Logout is the only menu item that triggers a confirmation popup.
 *
 * Usage:
 *   <AppShell active="documents" pageTitle="Documents" overline="Operational">
 *     ...page body...
 *   </AppShell>
 *
 * `active` selects which bottom-nav tab gets the orange-glow icon.
 * Pass undefined / null when the screen isn't on the bottom nav.
 *
 * The header is intentionally light: brand on the left, bell + menu on
 * the right. No other icons. Optional `pageTitle` + `overline` render
 * just below the sticky header to anchor the screen.
 */
export default function AppShell({
  active,                 // "dashboard" | "new-trip" | "studio" | "messages" | "documents" | undefined
  pageTitle,              // string — rendered as h1 under the header
  overline,               // small uppercase text above the title
  bottomBadges = {},      // { messages: 2, ... }
  alertCount = 0,         // number shown in bell badge
  children,
  contentClassName = "",
  hideTitleBlock = false, // dashboard sets its own greeting block
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-[var(--tm-navy)] pb-24">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[var(--tm-border)]">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            data-testid="header-brand-home"
            className="text-left focus:outline-none"
            aria-label="Trip Monitor home"
          >
            <BrandLockupCompact />
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="header-bell"
              onClick={() => navigate("/notifications")}
              className="relative h-10 w-10 rounded-md inline-flex items-center justify-center text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" strokeWidth={1.6} />
              {alertCount > 0 && (
                <span
                  data-testid="header-bell-badge"
                  className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[var(--tm-orange)] text-white text-[10px] font-black flex items-center justify-center leading-none"
                >
                  {alertCount}
                </span>
              )}
            </button>
            <DashboardMenu
              triggerTestId="header-menu"
              onOpenAccount={() => navigate("/account")}
              onOpenUserProfile={() => navigate("/user-profile")}
              onOpenAnalytics={() => navigate("/analytics")}
              onOpenReports={() => navigate("/reports")}
              onOpenSettings={() => navigate("/settings")}
              onOpenSupport={() => navigate("/support")}
              onLogout={() => setLogoutOpen(true)}
            />
          </div>
        </div>
      </header>

      <main className={`max-w-5xl mx-auto px-4 md:px-6 py-5 ${contentClassName}`}>
        {!hideTitleBlock && (overline || pageTitle) && (
          <div className="mb-5" data-testid="page-title-block">
            {overline && (
              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--tm-blue)] font-bold mb-1">
                {overline}
              </div>
            )}
            {pageTitle && (
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[var(--tm-navy)]">
                {pageTitle}
              </h1>
            )}
          </div>
        )}
        {children}
      </main>

      <BottomNav
        active={active}
        onSelect={(key) => {
          if (key === active) return;
          if (key === "dashboard") navigate("/dashboard");
          else if (key === "new-trip")  navigate("/new-trip");
          else if (key === "studio")    navigate("/studio");
          else if (key === "messages")  navigate("/messages");
          else if (key === "documents") navigate("/documents");
        }}
        badges={bottomBadges}
      />

      <LogoutConfirmDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={async () => { setLogoutOpen(false); await logout(); }}
      />
    </div>
  );
}

/** Tiny helper that screens use to compute the bell badge count. */
export function useStorageAlertCount(percent) {
  return isAboveQuotaWarning(percent) ? 1 : 0;
}
