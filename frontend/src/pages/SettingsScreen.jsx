import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { Input } from "../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import {
  HardDrive, Bell, Cloud, FileDown, Wifi, Sparkles, Save as SaveIcon,
  ShieldCheck, FolderOpen, Sun, ChevronRight, RefreshCw, Database, AlertTriangle,
  Smartphone, Lock, Eye, RotateCcw, Wand2, Info, Volume2, Vibrate, FileText,
  Accessibility, Zap, Image as ImageIcon, Trash2, Activity, Clock,
} from "lucide-react";
import {
  getDestinationConfig, STORAGE_MODES, isAboveQuotaWarning, getStorageUsage,
} from "../lib/storage-location";
import StorageSettingsDialog from "../components/app/StorageSettingsDialog";
import {
  isFingerprintEnrolled, isFingerprintSupported,
  enrollFingerprint, disableFingerprint,
} from "../lib/local-auth";
import { DEVELOPMENT_MODE, PREMIUM_LOCKS_ENABLED, isPremiumUnlocked } from "../lib/feature-flags";
import { toast } from "sonner";

/**
 * Settings — full-screen, sections-based app preference cockpit.
 *
 * Per spec, every row must:
 *   - control real app behavior, OR
 *   - open a real settings workflow, OR
 *   - display real system information.
 *
 * Profile/security recovery and account ownership live in /account.
 * Identity (name, role, avatar) lives in /user-profile. This screen
 * is operational/preference only.
 *
 * Persistence:
 *   - Most preferences live in localStorage under PREFS_KEY so they
 *     persist across launches without a backend round-trip.
 *   - Accessibility/density/text-size are also reflected onto
 *     document.documentElement via data-* attrs and CSS classes so
 *     downstream components can opt-in via attribute selectors.
 *   - Backup metadata reuses the Account screen's storage key so the
 *     "last backup at" timestamp is shared across both screens.
 */
const PREFS_KEY = "tm_settings_prefs_v1";
const BACKUP_KEY = "tm_account_backup_meta_v1";

const DEFAULT_PREFS = {
  // Backup
  backups_enabled: true,
  backup_frequency: "daily",      // off | daily | weekly | manual
  // Notifications
  notifDispatch: true, notifMessages: true, notifStorage: true,
  notifExport: true,   notifBackup: true,    notifReminders: true,
  notifSound: true,    notifVibration: true,
  // Appearance
  theme: "system",          // system | light | dark
  accent: "orange",         // orange | blue | green | purple
  fontSize: "medium",       // small | medium | large
  density: "comfortable",   // comfortable | compact
  animationLevel: "full",   // full | reduced | off
  reduceMotion: false,
  // App behavior
  autosave: true,
  autosaveInterval: "instant", // instant | 5s | 30s
  offlineMode: true,
  startupBehavior: "dashboard",  // dashboard | last_screen | new_trip
  resumeLastScreen: false,
  exportFormat: "pdf",           // pdf | jpeg | png
  defaultTemplateId: "",
  // Documents & exports
  pdfPageSize: "letter",         // letter | a4 | legal
  jpegQuality: 85,               // 60 - 100
  compression: "balanced",       // small | balanced | high
  docNaming: "{order}_{date}",   // pattern
  autoOrganize: true,
  // Security
  requirePinOnStartup: true,
  autoLockTimer: "5m",          // off | 1m | 5m | 15m | never
  sessionTimeout: "8h",         // 1h | 8h | 24h | never
  // Connectivity
  wifiOnlyUploads: true,
  backgroundSync: true,
  dataUsage: "normal",          // low | normal | full
  // Accessibility
  largerText: false,
  highContrast: false,
  reducedAnimations: false,
  touchTarget: "default",       // default | large | xl
};

const ACCENT_OPTIONS = [
  { value: "orange", color: "#FF5F15", label: "Orange" },
  { value: "blue",   color: "#1E78FF", label: "Blue" },
  { value: "green",  color: "#16a34a", label: "Green" },
  { value: "purple", color: "#a855f7", label: "Purple" },
];

export default function SettingsScreen() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [storagePath, setStoragePath] = useState("");
  const [storageMode, setStorageMode] = useState("internal");
  const [storageOpen, setStorageOpen] = useState(false);
  const [usage, setUsage] = useState({ percent: 0 });
  const [fpSupported, setFpSupported] = useState(false);
  const [fpEnrolled, setFpEnrolled] = useState(false);
  const [fpBusy, setFpBusy] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [backupMeta, setBackupMeta] = useState(() => loadBackupMeta());
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  // Persist + reflect prefs onto document root for downstream CSS hooks.
  useEffect(() => {
    savePrefs(prefs);
    const root = document.documentElement;
    root.dataset.density = prefs.density;
    root.dataset.fontSize = prefs.fontSize;
    root.dataset.theme = prefs.theme;
    root.dataset.touchTarget = prefs.touchTarget;
    root.classList.toggle("tm-large-text", !!prefs.largerText);
    root.classList.toggle("tm-high-contrast", !!prefs.highContrast);
    root.classList.toggle("tm-reduce-motion", !!(prefs.reduceMotion || prefs.reducedAnimations || prefs.animationLevel !== "full"));
  }, [prefs]);

  // Live online/offline indicator.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getDestinationConfig();
        const m = STORAGE_MODES?.[cfg?.mode];
        setStoragePath(`${cfg?.handle_label || m?.label || "Internal app storage"} / Trip Monitor`);
        setStorageMode(cfg?.mode || "internal");
      } catch {
        setStoragePath("Internal app storage (default) / Trip Monitor");
      }
      try { setUsage(await getStorageUsage()); } catch { /* ignore */ }
      try { setFpSupported(await isFingerprintSupported()); setFpEnrolled(await isFingerprintEnrolled()); } catch { /* ignore */ }
    })();
  }, [storageOpen]);

  const setPref = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));

  const fsApi = useMemo(() => ("showDirectoryPicker" in window), []);

  const fpToggle = async () => {
    if (!fpSupported || fpBusy) return;
    setFpBusy(true);
    try {
      if (fpEnrolled) { await disableFingerprint(); setFpEnrolled(false); toast.success("Fingerprint unlock disabled"); }
      else { await enrollFingerprint(); setFpEnrolled(true); toast.success("Fingerprint unlock enabled"); }
    } catch (err) { toast.error(err?.message || "Fingerprint setup cancelled"); }
    finally { setFpBusy(false); }
  };

  const runBackupNow = () => {
    try {
      const out = { prefs, exported_at: new Date().toISOString(), version: "settings/1" };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `trip-monitor-settings-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const meta = { last_backup_at: new Date().toISOString(), location: storagePath };
      saveBackupMeta(meta); setBackupMeta(meta);
      toast.success("Settings backup downloaded");
    } catch { toast.error("Backup failed"); }
  };

  const performRestore = () => {
    setConfirmRestore(false);
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "application/json";
    inp.onchange = async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try {
        const text = await f.text();
        const json = JSON.parse(text);
        if (json?.prefs) {
          setPrefs((p) => ({ ...DEFAULT_PREFS, ...p, ...json.prefs }));
          toast.success("Settings restored from backup");
        } else { toast.error("Backup file has no settings"); }
      } catch { toast.error("Could not parse backup file"); }
    };
    inp.click();
  };

  const performReset = () => {
    setConfirmReset(false);
    setPrefs({ ...DEFAULT_PREFS });
    toast.success("Settings reset to defaults");
  };

  const performRebuild = () => {
    setConfirmRebuild(false);
    try {
      const purge = ["tm_template_index", "tm_mapping_cache", "tm_grid_analysis_cache"];
      purge.forEach((k) => localStorage.removeItem(k));
      toast.success("Caches purged · indexes will rebuild on next use");
    } catch { toast.error("Could not purge caches"); }
  };

  const storageWarn = isAboveQuotaWarning(usage.percent);
  const offlineQueueCount = (() => {
    try { return JSON.parse(localStorage.getItem("tm_offline_queue") || "[]").length; }
    catch { return 0; }
  })();

  return (
    <AppShell overline="Hamburger Menu" pageTitle="Settings" alertCount={storageWarn ? 1 : 0}>
      <div data-testid="settings-screen" className="flex flex-col gap-4">

        {/* 1. STORAGE SETTINGS */}
        <Card>
          <CardHeader icon={<HardDrive className="h-4 w-4" />} title="Storage" />
          <ReadOnlyRow label="Current Storage Location" value={storagePath} mono />
          <ReadOnlyRow label="Storage Mode" value={modeLabel(storageMode)} />
          <ReadOnlyRow
            label="Cloud Backup Path"
            value={prefs.backups_enabled ? `${storagePath} / Backups` : "Disabled"}
            mono={prefs.backups_enabled}
          />
          <ReadOnlyRow label="External Drive / File-System Access" value={fsApi ? "Available on this device" : "Not available"} />
          <ReadOnlyRow label="USB-C Storage" value={detectMobileType() === "Android" ? "Detect via folder picker" : "Not directly accessible"} />
          <ReadOnlyRow label="SD Card / External" value={fsApi ? "Pick via folder picker" : "Not available"} />
          {storageWarn && (
            <div data-testid="settings-storage-warn" className="flex items-start gap-2 p-2.5 rounded-md bg-[var(--tm-orange)]/10 border border-[var(--tm-orange)]/40">
              <AlertTriangle className="h-4 w-4 text-[var(--tm-orange)] shrink-0 mt-0.5" />
              <p className="text-[12px] text-[var(--tm-orange-deep)] font-bold">
                Storage at {usage.percent}% — past warning threshold. Pick an external folder to keep documents outside the app.
              </p>
            </div>
          )}
          <Notice icon={<ShieldCheck className="h-4 w-4 text-[var(--tm-blue)]" />}>
            Saved files live <span className="font-black">outside</span> the app at the path above. Deleting or uninstalling Trip Monitor will not delete those files. Manually delete the Trip Monitor folder to remove them.
          </Notice>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <NavRow testId="set-open-folder" icon={<FolderOpen className="h-4 w-4" />}
              title="Open Trip Monitor Folder" sub="Jump to Documents"
              onClick={() => navigate("/documents")} />
            <NavRow testId="set-change-storage" icon={<HardDrive className="h-4 w-4" />}
              title="Change Storage Location" sub="Internal · folder · SD card"
              onClick={() => setStorageOpen(true)} />
          </div>
        </Card>

        {/* 2. BACKUP & SYNC */}
        <Card>
          <CardHeader icon={<Cloud className="h-4 w-4" />} title="Backup & Sync" />
          <Toggle testId="set-backups-enabled" title="Enable backups"
            value={prefs.backups_enabled} onChange={(v) => setPref("backups_enabled", v)} />
          <SegRow testId="set-backup-freq" title="Backup frequency"
            value={prefs.backup_frequency} onChange={(v) => setPref("backup_frequency", v)}
            options={[
              { value: "off",    label: "Off" },
              { value: "manual", label: "Manual" },
              { value: "daily",  label: "Daily" },
              { value: "weekly", label: "Weekly" },
            ]} />
          <ReadOnlyRow label="Cloud Sync Status" value={online ? "Online" : "Offline (queued)"} />
          <ReadOnlyRow label="Last Backup" value={backupMeta?.last_backup_at ? formatDateTime(backupMeta.last_backup_at) : "Never"} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ActionRow testId="set-backup-now" icon={<Cloud className="h-4 w-4" />}
              title="Backup Now" sub="Download a JSON snapshot of your settings"
              onClick={runBackupNow} />
            <ActionRow testId="set-restore" icon={<RefreshCw className="h-4 w-4" />}
              title="Restore Backup" sub="Pick a settings backup file" danger
              onClick={() => setConfirmRestore(true)} />
          </div>
        </Card>

        {/* 3. NOTIFICATION SETTINGS */}
        <Card>
          <CardHeader icon={<Bell className="h-4 w-4" />} title="Notifications" />
          <Toggle testId="set-notif-dispatch"  title="Dispatch alerts"      value={prefs.notifDispatch}  onChange={(v) => setPref("notifDispatch", v)} />
          <Toggle testId="set-notif-messages"  title="Message alerts"       value={prefs.notifMessages}  onChange={(v) => setPref("notifMessages", v)} />
          <Toggle testId="set-notif-export"    title="Export notifications" value={prefs.notifExport}    onChange={(v) => setPref("notifExport", v)} />
          <Toggle testId="set-notif-backup"    title="Backup notifications" value={prefs.notifBackup}    onChange={(v) => setPref("notifBackup", v)} />
          <Toggle testId="set-notif-reminders" title="Reminder notifications" value={prefs.notifReminders} onChange={(v) => setPref("notifReminders", v)} />
          <Divider />
          <Toggle testId="set-notif-sound" icon={<Volume2 className="h-4 w-4" />} title="Sound"     value={prefs.notifSound}     onChange={(v) => setPref("notifSound", v)} />
          <Toggle testId="set-notif-vibrate" icon={<Vibrate className="h-4 w-4" />} title="Vibration" value={prefs.notifVibration} onChange={(v) => setPref("notifVibration", v)} />
          <Notice icon={<Info className="h-4 w-4 text-[var(--tm-blue)]" />}>
            Notifications are top-toolbar system alerts only. Driver-to-driver and dispatcher communication uses the Messages tab.
          </Notice>
        </Card>

        {/* 4. DISPLAY & APPEARANCE */}
        <Card>
          <CardHeader icon={<Sun className="h-4 w-4" />} title="Display & Appearance" />
          <SegRow testId="set-theme" title="Theme" value={prefs.theme} onChange={(v) => setPref("theme", v)}
            options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          <SwatchRow testId="set-accent" title="Accent color preview"
            value={prefs.accent} onChange={(v) => setPref("accent", v)}
            options={ACCENT_OPTIONS} />
          <SegRow testId="set-font-size" title="Font size" value={prefs.fontSize} onChange={(v) => setPref("fontSize", v)}
            options={[{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }]} />
          <SegRow testId="set-density" title="Display density" value={prefs.density} onChange={(v) => setPref("density", v)}
            options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
          <SegRow testId="set-anim" title="Animation level" value={prefs.animationLevel} onChange={(v) => setPref("animationLevel", v)}
            options={[{ value: "full", label: "Full" }, { value: "reduced", label: "Reduced" }, { value: "off", label: "Off" }]} />
          <Toggle testId="set-reduce-motion" title="Reduce motion" sub="Honour OS reduce-motion preference globally"
            value={prefs.reduceMotion} onChange={(v) => setPref("reduceMotion", v)} />
        </Card>

        {/* 5. APP BEHAVIOR */}
        <Card>
          <CardHeader icon={<Sparkles className="h-4 w-4" />} title="App Behavior" />
          <Toggle testId="set-autosave" title="Autosave trips while typing"
            value={prefs.autosave} onChange={(v) => setPref("autosave", v)} />
          <SegRow testId="set-autosave-interval" title="Autosave frequency"
            value={prefs.autosaveInterval} onChange={(v) => setPref("autosaveInterval", v)}
            options={[{ value: "instant", label: "Instant" }, { value: "5s", label: "5s" }, { value: "30s", label: "30s" }]} />
          <Toggle testId="set-offline" title="Offline mode (queue uploads when no signal)"
            value={prefs.offlineMode} onChange={(v) => setPref("offlineMode", v)} />
          <SegRow testId="set-startup" title="Startup behavior"
            value={prefs.startupBehavior} onChange={(v) => setPref("startupBehavior", v)}
            options={[{ value: "dashboard", label: "Dashboard" }, { value: "last_screen", label: "Last screen" }, { value: "new_trip", label: "New Trip" }]} />
          <Toggle testId="set-resume-last" title="Resume last screen on launch"
            value={prefs.resumeLastScreen} onChange={(v) => setPref("resumeLastScreen", v)} />
          <SegRow testId="set-export-default" title="Default export format"
            value={prefs.exportFormat} onChange={(v) => setPref("exportFormat", v)}
            options={[{ value: "pdf", label: "PDF" }, { value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }]} />
          <NavRow testId="set-default-template" icon={<FileText className="h-4 w-4" />}
            title="Default trip template"
            sub={prefs.defaultTemplateId ? `Template · ${prefs.defaultTemplateId}` : "Pick from Studio"}
            onClick={() => navigate("/studio")} actionLabel="Studio" />
        </Card>

        {/* 6. DOCUMENT & EXPORT */}
        <Card>
          <CardHeader icon={<FileDown className="h-4 w-4" />} title="Documents & Exports" />
          <SegRow testId="set-pdf-page" title="PDF page size"
            value={prefs.pdfPageSize} onChange={(v) => setPref("pdfPageSize", v)}
            options={[{ value: "letter", label: "Letter" }, { value: "a4", label: "A4" }, { value: "legal", label: "Legal" }]} />
          <NumberRow testId="set-jpeg-quality" title="JPEG quality"
            value={prefs.jpegQuality} min={60} max={100} step={5} suffix="%"
            onChange={(v) => setPref("jpegQuality", v)} />
          <SegRow testId="set-compression" title="Compression"
            value={prefs.compression} onChange={(v) => setPref("compression", v)}
            options={[{ value: "small", label: "Smallest" }, { value: "balanced", label: "Balanced" }, { value: "high", label: "Highest" }]} />
          <TextRow testId="set-doc-naming" title="Document naming pattern"
            value={prefs.docNaming} onChange={(v) => setPref("docNaming", v)}
            sub="Tokens: {order} {date} {driver} {load}" />
          <Toggle testId="set-auto-organize" title="Auto-organize documents into Trip Monitor folder"
            value={prefs.autoOrganize} onChange={(v) => setPref("autoOrganize", v)} />
        </Card>

        {/* 7. SECURITY & ACCESS */}
        <Card>
          <CardHeader icon={<Lock className="h-4 w-4" />} title="Security & Access" />
          <Toggle testId="set-fp" icon={<Smartphone className="h-4 w-4" />}
            title="Fingerprint unlock"
            sub={fpSupported ? (fpEnrolled ? "Enabled" : "Disabled") : "Not supported on this device"}
            value={fpEnrolled}
            disabled={!fpSupported || fpBusy}
            onChange={fpToggle}
          />
          <ReadOnlyRow label="Face Unlock" value={detectFaceUnlockSupport() ? "Supported (uses platform passkey)" : "Not supported on this device"} />
          <Toggle testId="set-pin-startup" title="Require PIN on startup"
            value={prefs.requirePinOnStartup} onChange={(v) => setPref("requirePinOnStartup", v)} />
          <SegRow testId="set-autolock" title="Auto-lock timer"
            value={prefs.autoLockTimer} onChange={(v) => setPref("autoLockTimer", v)}
            options={[
              { value: "off",   label: "Off" },
              { value: "1m",    label: "1m" },
              { value: "5m",    label: "5m" },
              { value: "15m",   label: "15m" },
              { value: "never", label: "Never" },
            ]} />
          <SegRow testId="set-session-timeout" title="Session timeout"
            value={prefs.sessionTimeout} onChange={(v) => setPref("sessionTimeout", v)}
            options={[
              { value: "1h",    label: "1 hr" },
              { value: "8h",    label: "8 hrs" },
              { value: "24h",   label: "24 hrs" },
              { value: "never", label: "Never" },
            ]} />
          <Notice icon={<ShieldCheck className="h-4 w-4 text-[var(--tm-blue)]" />}>
            Account recovery and PIN reset live in <button onClick={() => navigate("/account")} className="underline font-bold text-[var(--tm-blue)]">Account</button>.
          </Notice>
        </Card>

        {/* 8. CONNECTIVITY */}
        <Card>
          <CardHeader icon={<Wifi className="h-4 w-4" />} title="Connectivity" />
          <ReadOnlyRow label="Cloud Connection" value={online ? "Online" : "Offline"} />
          <ReadOnlyRow label="Offline Sync Queue" value={`${offlineQueueCount} item${offlineQueueCount === 1 ? "" : "s"} pending`} />
          <SegRow testId="set-data-usage" title="Data usage"
            value={prefs.dataUsage} onChange={(v) => setPref("dataUsage", v)}
            options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "full", label: "Full" }]} />
          <Toggle testId="set-wifi-only" title="Wi-Fi only uploads"
            value={prefs.wifiOnlyUploads} onChange={(v) => setPref("wifiOnlyUploads", v)} />
          <Toggle testId="set-bg-sync" title="Background sync"
            value={prefs.backgroundSync} onChange={(v) => setPref("backgroundSync", v)} />
        </Card>

        {/* 9. ACCESSIBILITY */}
        <Card>
          <CardHeader icon={<Accessibility className="h-4 w-4" />} title="Accessibility" />
          <Toggle testId="set-larger-text"  title="Larger text"
            value={prefs.largerText} onChange={(v) => setPref("largerText", v)} />
          <Toggle testId="set-high-contrast" title="High contrast mode"
            value={prefs.highContrast} onChange={(v) => setPref("highContrast", v)} />
          <Toggle testId="set-reduced-anim" title="Reduced animations"
            value={prefs.reducedAnimations} onChange={(v) => setPref("reducedAnimations", v)} />
          <SegRow testId="set-touch-target" title="Touch target scaling"
            value={prefs.touchTarget} onChange={(v) => setPref("touchTarget", v)}
            options={[{ value: "default", label: "Default" }, { value: "large", label: "Large" }, { value: "xl", label: "XL" }]} />
        </Card>

        {/* 10. ADVANCED / DEVELOPMENT — hidden in production */}
        {DEVELOPMENT_MODE && (
          <Card warn>
            <CardHeader icon={<Wand2 className="h-4 w-4 text-[var(--tm-orange-deep)]" />} title="Advanced / Development" />
            <ReadOnlyRow label="Development Mode" value="ON · premium features unlocked" />
            <ReadOnlyRow label="Premium Locks Enabled" value={PREMIUM_LOCKS_ENABLED ? "Yes" : "No"} />
            <ReadOnlyRow label="Premium Resolved" value={isPremiumUnlocked() ? "Unlocked" : "Locked"} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <ActionRow testId="dev-debug" icon={<Activity className="h-4 w-4" />}
                title="Debug Tools" sub="Print state to console"
                onClick={() => { console.log("[trip-monitor] prefs", prefs); toast.success("Logged prefs to console"); }} />
              <ActionRow testId="dev-reset-cache" icon={<Trash2 className="h-4 w-4" />}
                title="Reset cached mappings" sub="Drop template/mapping caches" danger
                onClick={() => setConfirmRebuild(true)} />
              <ActionRow testId="dev-rebuild" icon={<RotateCcw className="h-4 w-4" />}
                title="Rebuild indexes" sub="Reset all settings to defaults" danger
                onClick={() => setConfirmReset(true)} />
            </div>
          </Card>
        )}

        {/* 11. ABOUT */}
        <Card>
          <CardHeader icon={<Info className="h-4 w-4" />} title="About" />
          <ReadOnlyRow label="App Version"  value={process.env.REACT_APP_VERSION || "1.0.0"} mono />
          <ReadOnlyRow label="Build Number" value={process.env.REACT_APP_BUILD || `dev.${new Date().toISOString().slice(0, 10)}`} mono />
          <NavRow testId="about-changelog" icon={<Clock className="h-4 w-4" />} title="Changelog"
            actionLabel="Open" onClick={() => navigate("/legal#licenses")} />
          <NavRow testId="about-legal"     icon={<FileText className="h-4 w-4" />} title="Legal Notices"
            actionLabel="Open" onClick={() => navigate("/legal")} />
          <NavRow testId="about-licenses"  icon={<FileText className="h-4 w-4" />} title="Open-Source Licenses"
            actionLabel="Open" onClick={() => navigate("/legal#licenses")} />
        </Card>

        <p className="text-[11px] text-[var(--tm-text-soft)] font-semibold px-1">
          Settings save to this device. Your synced profile, account and documents are not affected by changing settings.
        </p>
      </div>

      <StorageSettingsDialog open={storageOpen} onClose={() => setStorageOpen(false)} />

      {/* Destructive confirmation popups (allowed by spec) */}
      <ConfirmDialog
        open={confirmRestore}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={performRestore}
        testId="restore-confirm"
        icon={<RefreshCw className="h-4 w-4" />}
        title="Restore from backup?"
        body="You'll be asked to pick a Trip Monitor settings backup file. Restoring overwrites your current preferences. Profile, trips and documents are not affected."
        confirmLabel="Pick backup file"
      />
      <ConfirmDialog
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={performReset}
        testId="reset-confirm"
        danger
        icon={<RotateCcw className="h-4 w-4" />}
        title="Reset settings to defaults?"
        body="All preferences on this device return to factory defaults. Your profile, trips and documents are not affected."
        confirmLabel="Reset"
      />
      <ConfirmDialog
        open={confirmRebuild}
        onCancel={() => setConfirmRebuild(false)}
        onConfirm={performRebuild}
        testId="rebuild-confirm"
        danger
        icon={<Trash2 className="h-4 w-4" />}
        title="Drop cached mappings?"
        body="Template and mapping caches will be cleared and rebuilt from scratch on next use. Saved templates and trip data are not affected."
        confirmLabel="Drop caches"
      />
    </AppShell>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Card({ warn = false, children }) {
  return (
    <div className={[
      "rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-2",
      warn
        ? "bg-[var(--tm-orange)]/5 border border-[var(--tm-orange)]/40"
        : "bg-white border border-[var(--tm-border)]",
    ].join(" ")}>{children}</div>
  );
}
function CardHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      {icon}
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--tm-navy)]/70">{title}</div>
    </div>
  );
}
function Divider() {
  return <div className="h-px bg-[var(--tm-border)] my-1" />;
}
function ReadOnlyRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-2 border-b border-[var(--tm-border)]/50 last:border-b-0">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/65 font-bold">{label}</span>
      <span className={[
        "text-sm font-bold text-[var(--tm-navy)] truncate text-right",
        mono && "font-mono text-[12px]",
      ].filter(Boolean).join(" ")} title={String(value)}>{value}</span>
    </div>
  );
}
function NavRow({ testId, icon, title, sub, actionLabel = "Open", onClick }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors border border-[var(--tm-border)] bg-white"
    >
      <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center flex-shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">{title}</span>
        {sub && <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug truncate">{sub}</span>}
      </span>
      <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)]">
        {actionLabel} <ChevronRight className="h-3 w-3" />
      </span>
    </button>
  );
}
function Toggle({ testId, icon, title, sub, value, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value ? "true" : "false"}
      data-testid={testId}
      onClick={() => onChange(!value)}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors disabled:opacity-60 text-left"
    >
      {icon && (
        <span className={[
          "h-8 w-8 rounded-md inline-flex items-center justify-center flex-shrink-0",
          value ? "bg-[var(--tm-blue)] text-white" : "bg-[var(--tm-surface-2)] text-[var(--tm-navy)]",
        ].join(" ")}>{icon}</span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-[var(--tm-navy)]">{title}</span>
        {sub && <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{sub}</span>}
      </span>
      <span className={`relative inline-block w-10 h-6 rounded-full transition-colors ${value ? "bg-[var(--tm-blue)]" : "bg-[var(--tm-border)]"}`}>
        <span className={`absolute top-0.5 ${value ? "left-[18px]" : "left-0.5"} h-5 w-5 rounded-full bg-white shadow transition-all`} />
      </span>
    </button>
  );
}
function SegRow({ testId, title, value, onChange, options }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-3 px-2 py-2 flex-wrap">
      <span className="text-sm font-semibold text-[var(--tm-navy)]">{title}</span>
      <div className="inline-flex rounded-md border border-[var(--tm-border)] overflow-hidden">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            data-testid={`${testId}-${o.value}`}
            onClick={() => onChange(o.value)}
            className={[
              "px-3 h-8 text-xs font-bold transition-colors",
              value === o.value ? "bg-[var(--tm-navy)] text-white" : "bg-white text-[var(--tm-navy)] hover:bg-[var(--tm-surface)]",
            ].join(" ")}
          >{o.label}</button>
        ))}
      </div>
    </div>
  );
}
function SwatchRow({ testId, title, value, onChange, options }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-3 px-2 py-2">
      <span className="text-sm font-semibold text-[var(--tm-navy)]">{title}</span>
      <div className="inline-flex items-center gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              data-testid={`${testId}-${o.value}`}
              onClick={() => onChange(o.value)}
              aria-label={o.label}
              className={[
                "h-7 w-7 rounded-full border-2 transition-transform",
                active ? "border-[var(--tm-navy)] scale-110" : "border-[var(--tm-border)] hover:scale-105",
              ].join(" ")}
              style={{ background: o.color }}
            />
          );
        })}
      </div>
    </div>
  );
}
function NumberRow({ testId, title, value, min, max, step, suffix, onChange }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-3 px-2 py-2">
      <span className="text-sm font-semibold text-[var(--tm-navy)]">{title}</span>
      <div className="inline-flex items-center gap-2">
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 accent-[var(--tm-blue)]"
        />
        <span className="text-sm font-bold text-[var(--tm-navy)] tabular-nums w-10 text-right">{value}{suffix}</span>
      </div>
    </div>
  );
}
function TextRow({ testId, title, sub, value, onChange }) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1.5 px-2 py-1.5">
      <span className="text-sm font-semibold text-[var(--tm-navy)]">{title}</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-sm" />
      {sub && <span className="text-[11px] text-[var(--tm-navy)]/65 font-semibold">{sub}</span>}
    </div>
  );
}
function ActionRow({ testId, icon, title, sub, onClick, danger }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={[
        "w-full text-left flex items-center gap-3 px-3 py-3 rounded-md transition-colors border",
        danger
          ? "bg-white border-[var(--tm-orange)]/40 hover:bg-[var(--tm-orange)]/10"
          : "bg-white border-[var(--tm-border)] hover:bg-[var(--tm-surface)]",
      ].join(" ")}
    >
      <span className={[
        "h-9 w-9 rounded-md inline-flex items-center justify-center flex-shrink-0",
        danger ? "bg-[var(--tm-orange)]/10 text-[var(--tm-orange-deep)]" : "bg-[var(--tm-surface-2)] text-[var(--tm-navy)]",
      ].join(" ")}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">{title}</span>
        <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)] flex-shrink-0" />
    </button>
  );
}
function Notice({ icon, children }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-md bg-[var(--tm-surface)] border border-[var(--tm-border)]">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <p className="text-[12px] text-[var(--tm-navy)] font-semibold leading-snug">{children}</p>
    </div>
  );
}
function ConfirmDialog({ open, onCancel, onConfirm, testId, icon, title, body, confirmLabel = "Confirm", danger = false }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent
        data-testid={testId}
        className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]"
      >
        <DialogHeader>
          <DialogTitle className="text-[var(--tm-navy)] inline-flex items-center gap-2">{icon} {title}</DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)] font-semibold leading-snug">{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 flex-row">
          <Button variant="outline" data-testid={`${testId}-cancel`} onClick={onCancel}
            className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">Cancel</Button>
          <Button data-testid={`${testId}-confirm`} onClick={onConfirm}
            className={[
              "h-11 flex-1 rounded-md font-bold text-white",
              danger ? "bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)]" : "bg-[var(--tm-navy)] hover:brightness-110",
            ].join(" ")}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────── helpers ───────────────────── */
function modeLabel(mode) {
  const map = {
    internal: "Internal app storage",
    folder: "External folder (FS Access)",
    sd: "SD Card / external",
    external: "External",
  };
  return map[mode] || (mode || "Internal app storage");
}
function detectMobileType() {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  return "Desktop";
}
function detectFaceUnlockSupport() {
  // Web has no first-party face-unlock API; if WebAuthn platform
  // authenticator is available, the OS may surface face/iris as the
  // platform passkey. We just report conservatively.
  return typeof window.PublicKeyCredential !== "undefined";
}
function formatDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; }
  catch { return { ...DEFAULT_PREFS }; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
function loadBackupMeta() {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || "null"); }
  catch { return null; }
}
function saveBackupMeta(meta) {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}
