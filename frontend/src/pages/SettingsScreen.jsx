import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import {
  HardDrive, Bell, Cloud, FileDown, Wifi, Sparkles, Save as SaveIcon,
  ShieldCheck, FolderOpen, Sun, ChevronRight,
} from "lucide-react";
import {
  getDestinationConfig, STORAGE_MODES, isAboveQuotaWarning, getStorageUsage,
} from "../lib/storage-location";
import StorageSettingsDialog from "../components/app/StorageSettingsDialog";
import { toast } from "sonner";

/**
 * Settings — full screen, app behavior & preferences only.
 * Storage location, notification toggles, theme, autosave, exports,
 * offline / backup / behavior toggles. Profile and security are NOT
 * here — they live in /user-profile and /account.
 */
export default function SettingsScreen() {
  const [storagePath, setStoragePath] = useState("");
  const [storageOpen, setStorageOpen] = useState(false);
  const [usage, setUsage] = useState({ percent: 0 });

  // Lightweight preference state. Wired to localStorage so the toggles
  // persist across sessions; deeper integration arrives with the
  // settings backend.
  const [prefs, setPrefs] = useState(() => loadPrefs());
  useEffect(() => { savePrefs(prefs); }, [prefs]);
  const setPref = (k, v) => setPrefs((p) => ({ ...p, [k]: v }));

  useEffect(() => {
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
      try {
        const u = await getStorageUsage();
        setUsage(u);
      } catch { /* ignore */ }
    })();
  }, [storageOpen]);

  return (
    <AppShell overline="Hamburger Menu" pageTitle="Settings" alertCount={isAboveQuotaWarning(usage.percent) ? 1 : 0}>
      <div data-testid="settings-screen" className="flex flex-col gap-4">
        {/* STORAGE */}
        <Card>
          <Header icon={<HardDrive className="h-4 w-4" />} title="Storage" />
          <Row
            testId="settings-storage-location"
            title="Storage Location"
            sub={storagePath}
            actionLabel="Change"
            onClick={() => setStorageOpen(true)}
          />
          <Notice icon={<ShieldCheck className="h-4 w-4 text-[var(--tm-blue)]" />}>
            Your saved Trip Monitor documents are stored separately from the
            app at: <span className="font-bold">{storagePath || "the chosen Trip Monitor folder"}</span>.
            Deleting or uninstalling Trip Monitor will <span className="font-black">not</span> delete
            these files. To permanently remove them, manually delete the
            Trip Monitor folder from your device or external storage.
          </Notice>
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
        </Card>

        {/* DISPLAY */}
        <Card>
          <Header icon={<Sun className="h-4 w-4" />} title="Theme &amp; Display" />
          <SegRow
            testId="settings-theme"
            title="Theme"
            value={prefs.theme}
            onChange={(v) => setPref("theme", v)}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Card>

        {/* NOTIFICATIONS */}
        <Card>
          <Header icon={<Bell className="h-4 w-4" />} title="Notifications" />
          <Toggle testId="settings-notif-dispatch" title="Dispatch updates" value={prefs.notifDispatch} onChange={(v) => setPref("notifDispatch", v)} />
          <Toggle testId="settings-notif-storage"  title="Storage warnings" value={prefs.notifStorage}  onChange={(v) => setPref("notifStorage",  v)} />
          <Toggle testId="settings-notif-export"   title="Export complete"  value={prefs.notifExport}   onChange={(v) => setPref("notifExport",   v)} />
          <Toggle testId="settings-notif-app"      title="App updates"      value={prefs.notifApp}      onChange={(v) => setPref("notifApp",      v)} />
        </Card>

        {/* AUTOSAVE */}
        <Card>
          <Header icon={<SaveIcon className="h-4 w-4" />} title="Autosave" />
          <Toggle testId="settings-autosave-on" title="Autosave trips while typing" value={prefs.autosave} onChange={(v) => setPref("autosave", v)} />
          <SegRow
            testId="settings-autosave-interval"
            title="Autosave interval"
            value={prefs.autosaveInterval}
            onChange={(v) => setPref("autosaveInterval", v)}
            options={[
              { value: "instant", label: "Instant" },
              { value: "5s",      label: "5s" },
              { value: "30s",     label: "30s" },
            ]}
          />
        </Card>

        {/* EXPORT */}
        <Card>
          <Header icon={<FileDown className="h-4 w-4" />} title="Export" />
          <SegRow
            testId="settings-export-format"
            title="Default export format"
            value={prefs.exportFormat}
            onChange={(v) => setPref("exportFormat", v)}
            options={[
              { value: "pdf",  label: "PDF" },
              { value: "jpeg", label: "JPEG" },
              { value: "png",  label: "PNG" },
            ]}
          />
        </Card>

        {/* OFFLINE / BACKUP */}
        <Card>
          <Header icon={<Wifi className="h-4 w-4" />} title="Offline &amp; Backup" />
          <Toggle testId="settings-offline" title="Offline mode (queue uploads when no signal)" value={prefs.offline} onChange={(v) => setPref("offline", v)} />
          <Toggle testId="settings-backup"  title="Daily backup to Trip Monitor folder"        value={prefs.backup}  onChange={(v) => setPref("backup",  v)} />
        </Card>

        {/* APP BEHAVIOR */}
        <Card>
          <Header icon={<Sparkles className="h-4 w-4" />} title="App Behavior" />
          <Toggle testId="settings-haptics" title="Haptic feedback on tap" value={prefs.haptics} onChange={(v) => setPref("haptics", v)} />
          <Toggle testId="settings-confirm-finish" title="Confirm before finishing a trip" value={prefs.confirmFinish} onChange={(v) => setPref("confirmFinish", v)} />
        </Card>
      </div>

      <StorageSettingsDialog open={storageOpen} onClose={() => setStorageOpen(false)} />
    </AppShell>
  );
}

/* ---- bits ---- */

function Card({ children }) {
  return (
    <div className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-3">
      {children}
    </div>
  );
}
function Header({ icon, title }) {
  return (
    <div className="flex items-center gap-2 -mb-1">
      {icon}
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--tm-navy)]/70" dangerouslySetInnerHTML={{ __html: title }} />
    </div>
  );
}
function Notice({ icon, children }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md bg-[var(--tm-surface)] border border-[var(--tm-border)]">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <p className="text-[12px] text-[var(--tm-navy)] font-semibold leading-snug">{children}</p>
    </div>
  );
}
function Row({ testId, title, sub, actionLabel, onClick }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-md bg-white border border-[var(--tm-border)] hover:bg-[var(--tm-surface)] transition-colors"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">{title}</span>
        {sub && <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold truncate">{sub}</span>}
      </span>
      {actionLabel && (
        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)]">
          {actionLabel} <ChevronRight className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}
function Toggle({ testId, title, value, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value ? "true" : "false"}
      data-testid={testId}
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors"
    >
      <span className="text-sm font-semibold text-[var(--tm-navy)]">{title}</span>
      <span
        className={`relative inline-block w-10 h-6 rounded-full transition-colors ${
          value ? "bg-[var(--tm-blue)]" : "bg-[var(--tm-border)]"
        }`}
      >
        <span
          className={`absolute top-0.5 ${value ? "left-[18px]" : "left-0.5"} h-5 w-5 rounded-full bg-white shadow transition-all`}
        />
      </span>
    </button>
  );
}
function SegRow({ testId, title, value, onChange, options }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-3 px-3 py-2">
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
              value === o.value
                ? "bg-[var(--tm-navy)] text-white"
                : "bg-white text-[var(--tm-navy)] hover:bg-[var(--tm-surface)]",
            ].join(" ")}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const PREFS_KEY = "tm_settings_prefs_v1";
const DEFAULT_PREFS = {
  theme: "system",
  notifDispatch: true, notifStorage: true, notifExport: true, notifApp: true,
  autosave: true, autosaveInterval: "instant",
  exportFormat: "pdf",
  offline: true, backup: true,
  haptics: true, confirmFinish: true,
};
function loadPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; }
  catch { return { ...DEFAULT_PREFS }; }
}
function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
