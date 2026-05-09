import React, { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  HardDrive, Fingerprint, Gauge, FolderOpen, ShieldCheck,
} from "lucide-react";
import {
  enrollFingerprint, disableFingerprint, isFingerprintEnrolled, isFingerprintSupported,
} from "../../lib/local-auth";
import { getDestinationConfig, STORAGE_MODES } from "../../lib/storage-location";
import { toast } from "sonner";

/**
 * Settings dialog — opened from the hamburger "Settings" item.
 *
 * Sections:
 *   1. Storage Location — opens StorageSettingsDialog (where the user
 *      picks the external Trip Monitor folder; documents live there,
 *      not inside the app sandbox).
 *   2. Storage Notice — explicit reassurance that uninstalling Trip
 *      Monitor will NOT delete the user's saved documents.
 *   3. Fingerprint Unlock — enable / disable on-device biometric.
 *   4. Mileage Mode — informational; full editor is in User Profile.
 */
export default function SettingsDialog({
  open, onClose,
  profile,
  onOpenStorage,
  onOpenUserProfile,
}) {
  const [storagePath, setStoragePath] = useState("");
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const cfg = await getDestinationConfig();
        const modeMeta = STORAGE_MODES?.[cfg?.mode];
        const label = cfg?.handle_label || modeMeta?.label || "Internal app storage";
        const subPath = cfg?.subfolder ? `/${cfg.subfolder}` : "";
        setStoragePath(`${label}${subPath} / Trip Monitor`);
      } catch {
        setStoragePath("Internal app storage (default) / Trip Monitor");
      }
    })();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        data-testid="settings-dialog"
        className="max-w-md bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]"
      >
        <DialogHeader>
          <DialogTitle className="text-[var(--tm-navy)] inline-flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Settings
          </DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)] font-semibold">
            Storage, security and device preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Storage Location */}
          <Section
            testId="settings-storage"
            icon={<HardDrive className="h-4 w-4" />}
            title="Storage Location"
            sub={storagePath || "Internal app storage (default)"}
            onClick={() => { onClose(); onOpenStorage(); }}
            actionLabel="Change"
          />

          {/* Storage Notice — uninstall reassurance. */}
          <div
            data-testid="settings-storage-notice"
            className="flex items-start gap-3 p-3 rounded-md bg-[var(--tm-surface)] border border-[var(--tm-border)]"
          >
            <ShieldCheck className="h-4 w-4 text-[var(--tm-blue)] shrink-0 mt-0.5" />
            <p className="text-[12px] text-[var(--tm-navy)] font-semibold leading-snug">
              Your saved Trip Monitor documents are stored separately from the
              app at: <span className="font-bold">{storagePath || "the chosen Trip Monitor folder"}</span>.
              Deleting or uninstalling Trip Monitor will <span className="font-black">not</span> delete
              these files. To permanently remove them, manually delete the
              Trip Monitor folder from your device or external storage.
            </p>
          </div>

          {/* Folder structure preview */}
          <div className="flex items-start gap-3 p-3 rounded-md bg-white border border-[var(--tm-border)]">
            <FolderOpen className="h-4 w-4 text-[var(--tm-navy)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--tm-navy)]/70 mb-1.5">
                Trip Monitor Folder Layout
              </div>
              <pre className="text-[11px] leading-tight font-mono text-[var(--tm-navy)] whitespace-pre">
{`Trip Monitor/
  Documents/
    BOLs/
    Scale Tickets/
    Lumper Receipts/
    Receipts/
    Trip Attachments/
    Photos/
  Templates/
  Completed Trip Sheets/
  Exports/
  Backups/
  Mapping Data/`}
              </pre>
            </div>
          </div>

          <FingerprintSection />

          {/* Mileage mode (read-only summary; full editor in User Profile) */}
          <Section
            testId="settings-mileage"
            icon={<Gauge className="h-4 w-4" />}
            title="Mileage Mode"
            sub={profile?.mileage_mode === "manual"
              ? "Manual entry"
              : "Workflow (auto-calculated from stops)"}
            onClick={() => { onClose(); onOpenUserProfile(); }}
            actionLabel="Edit"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ testId, icon, title, sub, onClick, actionLabel }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-md bg-white border border-[var(--tm-border)] hover:bg-[var(--tm-surface)] transition-colors"
    >
      <span className="h-9 w-9 rounded-md flex items-center justify-center bg-[var(--tm-surface-2)] text-[var(--tm-navy)] flex-shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">{title}</span>
        <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold truncate">{sub}</span>
      </span>
      {actionLabel && (
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)]">{actionLabel}</span>
      )}
    </button>
  );
}

function FingerprintSection() {
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
    if (busy) return;
    setBusy(true);
    try {
      if (enrolled) { await disableFingerprint(); setEnrolled(false); toast.success("Fingerprint unlock disabled"); }
      else { await enrollFingerprint(); setEnrolled(true); toast.success("Fingerprint unlock enabled"); }
    } catch (err) { toast.error(err?.message || "Fingerprint setup cancelled"); }
    finally { setBusy(false); }
  };
  return (
    <button
      type="button"
      data-testid="settings-fingerprint"
      disabled={busy}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-md bg-white border border-[var(--tm-border)] hover:bg-[var(--tm-surface)] transition-colors disabled:opacity-60"
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
        <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold">
          {enrolled ? "Enabled — tap to disable" : "Tap to enable (fingerprint only)"}
        </span>
      </span>
      <span className="text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)]">
        {enrolled ? "On" : "Off"}
      </span>
    </button>
  );
}
