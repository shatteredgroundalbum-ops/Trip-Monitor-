import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { Button } from "../ui/button";
import {
  UserCog, History, FileText, IdCard, HardDrive, Fingerprint, LogOut, Eye,
} from "lucide-react";
import {
  enrollFingerprint, disableFingerprint, isFingerprintEnrolled, isFingerprintSupported,
} from "../../lib/local-auth";
import { toast } from "sonner";

/**
 * Slide-in side menu opened by the dashboard hamburger icon.
 *
 * Per spec: Profile / My Account belongs ONLY here. The bottom nav
 * never duplicates account functionality.
 *
 * All previously-top-bar icons (history, templates, profile, license,
 * storage, fingerprint, logout) live in this single drawer so the
 * dashboard header stays clean (bell + hamburger only).
 */
export default function DashboardMenu({
  open, onClose,
  hasActiveSession,
  onOpenProfile, onOpenHistory, onOpenTemplates, onOpenLicense, onOpenStorage,
  onOpenPreview, onLogout,
  storageWarning, websiteFeaturesEnabled,
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        data-testid="dashboard-menu"
        className="w-[88vw] max-w-sm bg-white text-[var(--tm-navy)] border-l border-[var(--tm-border)] p-0"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-[var(--tm-border)] text-left">
          <SheetTitle className="text-[var(--tm-navy)] text-lg font-black tracking-tight">Menu</SheetTitle>
          <SheetDescription className="text-[var(--tm-text-soft)] text-xs">
            Account, templates, storage and device settings.
          </SheetDescription>
        </SheetHeader>

        <div className="p-3 flex flex-col gap-1.5">
          <MenuRow
            testId="menu-profile"
            icon={<UserCog className="h-4 w-4" />}
            label="My Account"
            sub="Profile, role &amp; preferences"
            onClick={() => { onClose(); onOpenProfile(); }}
          />
          <MenuRow
            testId="menu-templates"
            icon={<FileText className="h-4 w-4" />}
            label="Trip Sheet Templates"
            sub="Upload, build &amp; map templates"
            onClick={() => { onClose(); onOpenTemplates(); }}
          />
          <MenuRow
            testId="menu-history"
            icon={<History className="h-4 w-4" />}
            label="Trip History"
            sub="All finished trips &amp; exports"
            onClick={() => { onClose(); onOpenHistory(); }}
          />
          {hasActiveSession && (
            <MenuRow
              testId="menu-preview"
              icon={<Eye className="h-4 w-4" />}
              label="Preview Active Trip Sheet"
              sub="See it as it will export"
              onClick={() => { onClose(); onOpenPreview(); }}
            />
          )}
          <MenuRow
            testId="menu-storage"
            icon={<HardDrive className="h-4 w-4" />}
            label="Storage Location"
            sub={storageWarning ? "⚠ Storage past warning threshold" : "Internal, folder, or SD card"}
            onClick={() => { onClose(); onOpenStorage(); }}
            warn={storageWarning}
          />
          {websiteFeaturesEnabled && (
            <MenuRow
              testId="menu-license"
              icon={<IdCard className="h-4 w-4" />}
              label="Website License &amp; Premium"
              sub="License ID and premium features"
              onClick={() => { onClose(); onOpenLicense(); }}
            />
          )}
          <MenuFingerprintRow />
          <div className="my-2 border-t border-[var(--tm-border)]" />
          <Button
            data-testid="menu-logout"
            variant="outline"
            onClick={() => { onClose(); onLogout(); }}
            className="h-11 w-full justify-start gap-2 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MenuRow({ testId, icon, label, sub, onClick, warn = false }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={[
        "w-full text-left flex items-center gap-3 px-3 py-3 rounded-md border transition-colors",
        warn
          ? "bg-[var(--tm-orange)]/10 border-[var(--tm-orange)] hover:bg-[var(--tm-orange)]/15"
          : "bg-white border-[var(--tm-border)] hover:bg-[var(--tm-surface)]",
      ].join(" ")}
    >
      <span
        className={[
          "h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0",
          warn
            ? "bg-[var(--tm-orange)] text-white"
            : "bg-[var(--tm-surface-2)] text-[var(--tm-navy)]",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className="block text-sm font-bold text-[var(--tm-navy)] truncate"
          dangerouslySetInnerHTML={{ __html: label }}
        />
        <span
          className="block text-[11px] text-[var(--tm-text-soft)] truncate"
          dangerouslySetInnerHTML={{ __html: sub }}
        />
      </span>
    </button>
  );
}

function MenuFingerprintRow() {
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
  const onClick = async () => {
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
    <button
      type="button"
      data-testid="menu-fingerprint"
      disabled={busy}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-md border bg-white border-[var(--tm-border)] hover:bg-[var(--tm-surface)] transition-colors disabled:opacity-60"
    >
      <span
        className={[
          "h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0",
          enrolled ? "bg-[var(--tm-blue)] text-white" : "bg-[var(--tm-surface-2)] text-[var(--tm-navy)]",
        ].join(" ")}
      >
        <Fingerprint className="h-4 w-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">Fingerprint Unlock</span>
        <span className="block text-[11px] text-[var(--tm-text-soft)]">
          {enrolled ? "Enabled — tap to disable" : "Tap to enable (fingerprint only)"}
        </span>
      </span>
    </button>
  );
}
