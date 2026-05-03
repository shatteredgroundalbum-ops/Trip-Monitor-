import React, { useEffect, useState, useCallback } from "react";
import { Button } from "../ui/button";
import {
  HardDrive, FolderOpen, Smartphone, UsbIcon, FileQuestion,
  CheckCircle2, AlertTriangle, RefreshCw, Folder,
} from "lucide-react";
import {
  STORAGE_MODES, isFileSystemAccessSupported, pickDestinationFolder,
  selectInAppDestination, getDestinationConfig, getStorageUsage,
  isAboveQuotaWarning, formatBytes, QUOTA_WARNING_PCT,
} from "../../lib/storage-location";
import { toast } from "sonner";

const MODE_ICONS = {
  app: <Smartphone className="h-5 w-5" />,
  documents: <FolderOpen className="h-5 w-5" />,
  sdcard: <UsbIcon className="h-5 w-5" />,
  custom: <Folder className="h-5 w-5" />,
};

/**
 * Reusable storage destination picker. Used both during initial setup
 * (Step 5) and from the Dashboard settings dialog. Renders 4 mode cards
 * + a live storage-usage meter; tapping a card either flips to in-app
 * mode or opens the OS folder picker.
 *
 * Props:
 *   - onSelected({mode, folder_name})  optional — fires after a successful pick
 *   - compact                         smaller padding for the setup wizard
 *   - showHeader                      hide the title block when embedded
 */
export default function StorageWizard({ onSelected, compact = false, showHeader = true }) {
  const [config, setConfig] = useState({ mode: "app", folder_name: "" });
  const [usage, setUsage] = useState({ usage: 0, quota: 0, percent: 0, supported: false });
  const [busy, setBusy] = useState(false);
  const fsaSupported = isFileSystemAccessSupported();

  const refresh = useCallback(async () => {
    setConfig(await getDestinationConfig());
    setUsage(await getStorageUsage());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handlePick = async (mode) => {
    if (mode === "app") {
      setBusy(true);
      try {
        await selectInAppDestination();
        await refresh();
        toast.success("Saving inside the app");
        onSelected?.({ mode: "app", folder_name: "" });
      } catch (err) {
        toast.error(err?.message || "Could not switch storage mode");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!fsaSupported) {
      toast.error("This browser doesn't support folder picking — try Chrome or Edge");
      return;
    }
    setBusy(true);
    try {
      const result = await pickDestinationFolder(mode);
      if (!result) return; // user cancelled
      await refresh();
      toast.success(`Saving to ${result.folder_name || STORAGE_MODES[mode].label}`);
      onSelected?.(result);
    } catch (err) {
      toast.error(err?.message || "Could not pick folder");
    } finally {
      setBusy(false);
    }
  };

  const warn = isAboveQuotaWarning(usage.percent);

  return (
    <div data-testid="storage-wizard" className={compact ? "space-y-3" : "space-y-4"}>
      {showHeader && (
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-md bg-[var(--tm-navy)] text-white flex items-center justify-center shrink-0">
            <HardDrive className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-black tracking-tight text-[var(--tm-navy)] text-2xl leading-tight">
              Where should your trip data live?
            </h2>
            <p className="text-sm text-[var(--tm-text-soft)] mt-1">
              Pick once now — you can change it any time from the Dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Storage usage meter */}
      <div data-testid="storage-usage-meter" className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-[var(--tm-text-muted)]">
            In-app storage used
          </div>
          <button
            type="button"
            onClick={refresh}
            data-testid="storage-usage-refresh"
            className="text-[var(--tm-blue)] hover:text-[var(--tm-navy)]"
            aria-label="Refresh storage stats"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-baseline justify-between text-sm">
          <div className="font-mono tabular-nums text-[var(--tm-navy)] font-bold" data-testid="storage-usage-text">
            {usage.supported
              ? `${formatBytes(usage.usage)} / ${formatBytes(usage.quota)}`
              : "Quota unavailable"}
          </div>
          <div className={`text-xs font-bold ${warn ? "text-[var(--tm-orange)]" : "text-[var(--tm-text-soft)]"}`} data-testid="storage-usage-pct">
            {usage.supported ? `${usage.percent}%` : ""}
          </div>
        </div>
        <div className="h-1.5 mt-2 w-full bg-[var(--tm-border)] rounded-full overflow-hidden">
          <div
            data-testid="storage-usage-bar"
            className={`h-full transition-all ${warn ? "bg-[var(--tm-orange)]" : "bg-[var(--tm-blue)]"}`}
            style={{ width: `${Math.min(100, usage.percent)}%` }}
          />
        </div>
        {warn && (
          <div data-testid="storage-quota-warning" className="mt-2 flex items-start gap-2 text-[11px] text-[var(--tm-orange)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              You&apos;re past {QUOTA_WARNING_PCT}% of in-app storage. Pick a folder destination below or archive old templates to free space.
            </span>
          </div>
        )}
      </div>

      {!fsaSupported && (
        <div className="flex items-start gap-2 text-[11px] text-[var(--tm-text-soft)] bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-3" data-testid="storage-fsa-hint">
          <FileQuestion className="h-3.5 w-3.5 text-[var(--tm-blue)] shrink-0 mt-0.5" />
          <span>
            Your browser doesn&apos;t support folder picking yet. We&apos;ll save in-app and download exports through your browser. For folder destinations, use Chrome or Edge on a desktop or Android device.
          </span>
        </div>
      )}

      <div className="grid gap-2" data-testid="storage-mode-list">
        {Object.values(STORAGE_MODES).map((mode) => (
          <ModeCard
            key={mode.id}
            mode={mode}
            icon={MODE_ICONS[mode.id]}
            active={config.mode === mode.id}
            disabled={busy || (mode.needsFsa && !fsaSupported)}
            currentFolder={config.mode === mode.id ? config.folder_name : ""}
            onClick={() => handlePick(mode.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ModeCard({ mode, icon, active, disabled, currentFolder, onClick }) {
  return (
    <button
      type="button"
      data-testid={`storage-mode-${mode.id}`}
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left flex items-start gap-3 p-3 rounded-md border-2 transition-colors ${
        active
          ? "bg-[var(--tm-surface)] border-[var(--tm-orange)]"
          : "bg-white border-[var(--tm-border)] hover:border-[var(--tm-blue)]"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className={`h-10 w-10 rounded-md flex items-center justify-center shrink-0 ${
        active ? "bg-[var(--tm-orange)] text-white" : "bg-[var(--tm-surface)] text-[var(--tm-navy)]"
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-bold text-[var(--tm-navy)]">{mode.label}</div>
          {active && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-[var(--tm-orange)]">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--tm-text-soft)] mt-0.5">{mode.blurb}</div>
        {active && currentFolder && (
          <div className="text-[10px] uppercase tracking-wider text-[var(--tm-blue)] font-bold mt-1 truncate" data-testid={`storage-mode-${mode.id}-folder`}>
            {currentFolder}
          </div>
        )}
      </div>
    </button>
  );
}
