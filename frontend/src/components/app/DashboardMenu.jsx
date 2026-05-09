import React from "react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import {
  UserCircle, IdCard, BarChart3, FileSpreadsheet, Settings, LifeBuoy, LogOut, Menu,
} from "lucide-react";

/**
 * Compact dropdown menu anchored to the hamburger icon.
 *
 * Per spec, the hamburger contains exactly:
 *   - Account
 *   - User Profile
 *   - Analytics
 *   - Reports
 *   - Settings
 *   - Support
 *   ─── separator ───
 *   - Logout
 *
 * Behavior:
 *   • Each item navigates to a FULL SCREEN — never opens a popup.
 *   • Logout is the only item that triggers a confirmation popup.
 *   • NO X close button.
 *   • Slides DOWN from under the hamburger (anchored via Radix).
 *   • Closes by tapping the hamburger again, tapping outside, or
 *     selecting an item.
 */
export default function DashboardMenu({
  onOpenAccount, onOpenUserProfile,
  onOpenAnalytics, onOpenReports, onOpenSettings, onOpenSupport,
  onLogout,
  triggerTestId = "header-menu",
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={triggerTestId}
          className="h-10 w-10 rounded-md inline-flex items-center justify-center text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-blue)]"
          aria-label="Menu"
        >
          <Menu className="h-5 w-5" strokeWidth={1.6} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-testid="dashboard-menu"
        align="end"
        sideOffset={8}
        className="w-56 bg-white text-[var(--tm-navy)] border border-[var(--tm-border)] rounded-md p-1.5 shadow-[0_24px_60px_rgba(14,31,71,0.18)]"
      >
        <Row testId="menu-account"      icon={<IdCard className="h-4 w-4" />}          label="Account"      onSelect={onOpenAccount} />
        <Row testId="menu-user-profile" icon={<UserCircle className="h-4 w-4" />}      label="User Profile" onSelect={onOpenUserProfile} />
        <Row testId="menu-analytics"    icon={<BarChart3 className="h-4 w-4" />}       label="Analytics"    onSelect={onOpenAnalytics} />
        <Row testId="menu-reports"      icon={<FileSpreadsheet className="h-4 w-4" />} label="Reports"      onSelect={onOpenReports} />
        <Row testId="menu-settings"     icon={<Settings className="h-4 w-4" />}        label="Settings"     onSelect={onOpenSettings} />
        <Row testId="menu-support"      icon={<LifeBuoy className="h-4 w-4" />}        label="Support"      onSelect={onOpenSupport} />
        <DropdownMenuSeparator className="my-1.5 bg-[var(--tm-border)]" />
        <Row
          testId="menu-logout"
          icon={<LogOut className="h-4 w-4" />}
          label="Logout"
          onSelect={onLogout}
          tone="danger"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({ testId, icon, label, onSelect, tone }) {
  const toneClass =
    tone === "danger"
      ? "text-[var(--tm-orange-deep)] hover:bg-[var(--tm-orange)]/10 focus:bg-[var(--tm-orange)]/10"
      : "text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] focus:bg-[var(--tm-surface)]";
  return (
    <DropdownMenuItem
      data-testid={testId}
      onSelect={() => {
        // Defer navigation a tick so Radix can close the menu portal
        // before the route unmounts. Without this, on mobile browsers
        // the closing portal can swallow the next pointer event,
        // which makes the hamburger feel broken on the second tap.
        if (onSelect) setTimeout(onSelect, 0);
      }}
      className={`text-sm font-semibold gap-2.5 px-2.5 py-2 rounded cursor-pointer ${toneClass}`}
    >
      <span className="opacity-90">{icon}</span>
      <span>{label}</span>
    </DropdownMenuItem>
  );
}
