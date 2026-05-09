import React, { useEffect, useState } from "react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import {
  UserCog, History, FileText, IdCard, HardDrive, Fingerprint, LogOut, Eye, Menu,
} from "lucide-react";
import {
  enrollFingerprint, disableFingerprint, isFingerprintEnrolled, isFingerprintSupported,
} from "../../lib/local-auth";
import { toast } from "sonner";

/**
 * Compact dropdown menu anchored to the hamburger icon.
 *
 * Per spec:
 *   • NO X button (closed by tap-outside or item-select).
 *   • Slides DOWN from under the hamburger, not from the side.
 *   • Tablet-first compact list — not a giant detached side sheet.
 *   • Profile / My Account lives ONLY here (never in bottom nav).
 *
 * The trigger is the hamburger button itself; the dropdown anchors
 * to it via Radix DropdownMenu so positioning is automatic.
 */
export default function DashboardMenu({
  hasActiveSession,
  onOpenProfile, onOpenHistory, onOpenTemplates, onOpenLicense, onOpenStorage,
  onOpenPreview, onLogout,
  storageWarning, websiteFeaturesEnabled,
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
        className="w-60 bg-white text-[var(--tm-navy)] border border-[var(--tm-border)] rounded-md p-1.5 shadow-[0_24px_60px_rgba(14,31,71,0.18)]"
      >
        <Row testId="menu-profile" icon={<UserCog className="h-4 w-4" />} label="My Account" onSelect={onOpenProfile} />
        <Row testId="menu-templates" icon={<FileText className="h-4 w-4" />} label="Templates" onSelect={onOpenTemplates} />
        <Row testId="menu-history" icon={<History className="h-4 w-4" />} label="History" onSelect={onOpenHistory} />
        {hasActiveSession && (
          <Row testId="menu-preview" icon={<Eye className="h-4 w-4" />} label="Preview Trip Sheet" onSelect={onOpenPreview} />
        )}
        <Row
          testId="menu-storage"
          icon={<HardDrive className="h-4 w-4" />}
          label="Storage"
          onSelect={onOpenStorage}
          warn={storageWarning}
        />
        {websiteFeaturesEnabled && (
          <Row testId="menu-license" icon={<IdCard className="h-4 w-4" />} label="License & Premium" onSelect={onOpenLicense} />
        )}
        <FingerprintRow />
        <DropdownMenuSeparator className="my-1.5 bg-[var(--tm-border)]" />
        <Row
          testId="menu-logout"
          icon={<LogOut className="h-4 w-4" />}
          label="Sign out"
          onSelect={onLogout}
          tone="danger"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Row({ testId, icon, label, onSelect, warn = false, tone }) {
  const toneClass =
    tone === "danger"
      ? "text-[var(--tm-orange-deep)] hover:bg-[var(--tm-orange)]/10 focus:bg-[var(--tm-orange)]/10"
      : warn
        ? "text-[var(--tm-orange-deep)] hover:bg-[var(--tm-orange)]/10 focus:bg-[var(--tm-orange)]/10"
        : "text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] focus:bg-[var(--tm-surface)]";
  return (
    <DropdownMenuItem
      data-testid={testId}
      onSelect={(e) => { e.preventDefault?.(); onSelect && onSelect(); }}
      className={`text-sm font-semibold gap-2.5 px-2.5 py-2 rounded cursor-pointer ${toneClass}`}
    >
      <span className="text-[var(--tm-navy)] opacity-90">{icon}</span>
      <span>{label}</span>
    </DropdownMenuItem>
  );
}

function FingerprintRow() {
  const [supported, setSupported] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      setSupported(await isFingerprintSupported());
      setEnrolled(await isFingerprintEnrolled());
    })();
  }, []);
  if (!supported) return null;
  const onSelect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enrolled) {
        await disableFingerprint();
        setEnrolled(false);
        toast.success("Fingerprint unlock disabled");
      } else {
        await enrollFingerprint();
        setEnrolled(true);
        toast.success("Fingerprint unlock enabled");
      }
    } catch (err) {
      toast.error(err?.message || "Fingerprint setup cancelled");
    } finally { setBusy(false); }
  };
  return (
    <DropdownMenuItem
      data-testid="menu-fingerprint"
      disabled={busy}
      onSelect={(e) => { e.preventDefault?.(); onSelect(); }}
      className={`text-sm font-semibold gap-2.5 px-2.5 py-2 rounded cursor-pointer ${
        enrolled
          ? "text-[var(--tm-blue)] hover:bg-[var(--tm-blue)]/10 focus:bg-[var(--tm-blue)]/10"
          : "text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] focus:bg-[var(--tm-surface)]"
      }`}
    >
      <Fingerprint className="h-4 w-4" />
      <span>{enrolled ? "Fingerprint: On" : "Fingerprint Unlock"}</span>
    </DropdownMenuItem>
  );
}
