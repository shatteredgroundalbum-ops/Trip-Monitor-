import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import {
  IdCard, KeyRound, Fingerprint, ShieldCheck, Package, HardDrive, FolderOpen,
  Cloud, RefreshCw, Info, Smartphone, Scale, FileText, ChevronRight, AlertTriangle,
  LogOut, RotateCcw, Trash2, Briefcase, Mail, Activity, Database,
} from "lucide-react";
import {
  isFingerprintEnrolled, isFingerprintSupported,
  enrollFingerprint, disableFingerprint,
} from "../lib/local-auth";
import { getDestinationConfig, STORAGE_MODES, getStorageUsage, isAboveQuotaWarning } from "../lib/storage-location";
import { DEVELOPMENT_MODE, isPremiumUnlocked } from "../lib/feature-flags";
import { toast } from "sonner";
import LogoutConfirmDialog from "../components/app/LogoutConfirmDialog";

/**
 * Account — app access, security, subscription/license, recovery,
 * legal, and account-level controls. NOT the driver work profile
 * (lives in /user-profile) and NOT app preferences (lives in /settings).
 *
 * Layout per spec, every row navigates / toggles / shows read-only data:
 *   1. Account Overview
 *   2. Login & Security
 *   3. Subscription / License
 *   4. Storage Ownership
 *   5. Backup & Restore
 *   6. App Information
 *   7. Legal
 *   8. Account Actions  ← danger zone
 */
const BACKUP_KEY = "tm_account_backup_meta_v1";

export default function AccountScreen() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState(null);
  const [fpSupported, setFpSupported] = useState(false);
  const [fpEnrolled, setFpEnrolled] = useState(false);
  const [fpBusy, setFpBusy] = useState(false);
  const [storageUsage, setStorageUsage] = useState({ percent: 0 });
  const [destLabel, setDestLabel] = useState("Internal app storage");
  const [destMode, setDestMode] = useState("internal");
  const [backup, setBackup] = useState(() => loadBackupMeta());
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const p = await api.get("/profile"); setProfile(p.data); } catch { /* ignore */ }
      try { setFpSupported(await isFingerprintSupported()); setFpEnrolled(await isFingerprintEnrolled()); } catch { /* ignore */ }
      try { setStorageUsage(await getStorageUsage()); } catch { /* ignore */ }
      try {
        const cfg = await getDestinationConfig();
        const m = STORAGE_MODES?.[cfg?.mode];
        setDestLabel(`${cfg?.handle_label || m?.label || "Internal app storage"} / Trip Monitor`);
        setDestMode(cfg?.mode || "internal");
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const platform = useMemo(() => detectPlatform(), []);
  const appVersion = process.env.REACT_APP_VERSION || "1.0.0";
  const buildNumber = process.env.REACT_APP_BUILD || `dev.${new Date().toISOString().slice(0, 10)}`;

  const accountName = profile?.full_name || user?.name || "—";
  const accountEmail = user?.email || profile?.dispatcher_email || "—";
  const accountId = user?.id || user?.user_id || profile?.user_id || "—";
  const accountRole = (user?.role || profile?.role || "company_driver").replace(/_/g, " ");

  const subscriptionLabel = DEVELOPMENT_MODE
    ? "Development Mode — premium features unlocked"
    : (isPremiumUnlocked() ? "Premium · all features unlocked" : "Free · Driver Edition");
  const subscriptionStatus = DEVELOPMENT_MODE ? "DEV" : (isPremiumUnlocked() ? "ACTIVE" : "FREE");
  const subscriptionExpiry = DEVELOPMENT_MODE ? "—" : (isPremiumUnlocked() ? "Auto-renews · perpetual" : "—");

  const fpToggle = async () => {
    if (!fpSupported || fpBusy) return;
    setFpBusy(true);
    try {
      if (fpEnrolled) { await disableFingerprint(); setFpEnrolled(false); toast.success("Biometric unlock disabled"); }
      else { await enrollFingerprint(); setFpEnrolled(true); toast.success("Biometric unlock enabled"); }
    } catch (err) { toast.error(err?.message || "Biometric setup cancelled"); }
    finally { setFpBusy(false); }
  };

  const runBackupNow = () => {
    try {
      const out = {
        profile,
        device_id: deviceId,
        version: appVersion,
        backed_up_at: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `trip-monitor-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const meta = { last_backup_at: new Date().toISOString(), location: destLabel };
      saveBackupMeta(meta);
      setBackup(meta);
      toast.success("Backup downloaded");
    } catch { toast.error("Backup failed"); }
  };

  const performReset = async () => {
    setResetOpen(false);
    try {
      // Reset just the device-side profile + extras + backup metadata.
      // Account-level wipe (PIN, recovery, license) is a separate flow.
      localStorage.removeItem("tm_profile_extras_v1");
      localStorage.removeItem(BACKUP_KEY);
      localStorage.removeItem("tm_settings_prefs_v1");
      toast.success("Account setup reset on this device");
      navigate("/dashboard");
    } catch { toast.error("Reset failed"); }
  };
  const performDelete = async () => {
    setDeleteOpen(false);
    try {
      // Wipe everything we own on the device, then sign out → PIN.
      localStorage.removeItem("tm_profile_extras_v1");
      localStorage.removeItem(BACKUP_KEY);
      localStorage.removeItem("tm_settings_prefs_v1");
      try { await api.delete?.("/profile"); } catch { /* ignore — endpoint may not exist yet */ }
      toast.success("Profile data deleted on this device");
      await logout();
    } catch { toast.error("Delete failed"); }
  };

  const performRestore = () => {
    setRestoreOpen(false);
    try {
      const inp = document.createElement("input");
      inp.type = "file"; inp.accept = "application/json";
      inp.onchange = async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        try {
          const text = await f.text();
          const json = JSON.parse(text);
          if (json?.profile) {
            await api.post("/profile", json.profile).catch(() => {});
            toast.success("Profile restored from backup");
            navigate("/user-profile");
          } else {
            toast.error("Backup file does not contain a profile");
          }
        } catch { toast.error("Could not parse backup file"); }
      };
      inp.click();
    } catch { toast.error("Restore failed"); }
  };

  if (loading) {
    return (
      <AppShell overline="Hamburger Menu" pageTitle="Account">
        <div className="text-sm text-[var(--tm-text-soft)] font-semibold">Loading account…</div>
      </AppShell>
    );
  }

  const storageWarn = isAboveQuotaWarning(storageUsage.percent);

  return (
    <AppShell overline="Hamburger Menu" pageTitle="Account" alertCount={storageWarn ? 1 : 0}>
      <div data-testid="account-screen" className="flex flex-col gap-4">

        {/* 1. ACCOUNT OVERVIEW */}
        <Card>
          <CardHeader icon={<IdCard className="h-4 w-4" />} title="Account Overview" />
          <ReadOnlyRow icon={<IdCard className="h-4 w-4" />}     label="Account Name"  value={accountName} />
          <ReadOnlyRow icon={<Mail className="h-4 w-4" />}       label="Account Email" value={accountEmail} />
          <ReadOnlyRow icon={<Database className="h-4 w-4" />}   label="Account ID"    value={accountId} mono />
          <ReadOnlyRow icon={<Activity className="h-4 w-4" />}   label="Account Type"  value={DEVELOPMENT_MODE ? "Developer (dev mode)" : (isPremiumUnlocked() ? "Premium" : "Free")} />
          <NavRow
            testId="acct-role-link"
            icon={<Briefcase className="h-4 w-4" />}
            title="App Role"
            sub={capitalize(accountRole)}
            actionLabel="Change in Profile"
            onClick={() => navigate("/user-profile")}
          />
        </Card>

        {/* 2. LOGIN & SECURITY */}
        <Card>
          <CardHeader icon={<KeyRound className="h-4 w-4" />} title="Login & Security" />
          <NavRow testId="acct-change-pin" icon={<KeyRound className="h-4 w-4" />}
            title="Change PIN" sub="6-digit unlock code" actionLabel="Open"
            onClick={() => navigate("/change-pin")} />
          <ToggleRow testId="acct-biometric" icon={<Fingerprint className="h-4 w-4" />}
            title="Fingerprint / Biometric Unlock"
            sub={fpSupported ? (fpEnrolled ? "Enabled — tap to disable" : "Tap to enable") : "Not supported on this device"}
            value={fpEnrolled} disabled={!fpSupported || fpBusy} onToggle={fpToggle} />
          <ReadOnlyRow icon={<ShieldCheck className="h-4 w-4" />}
            label="Passkey Status"
            value={fpEnrolled ? "Active (device-bound)" : "Not configured"} />
          <NavRow testId="acct-recovery" icon={<ShieldCheck className="h-4 w-4" />}
            title="Login Recovery Method" sub="Recovery phrase or master code" actionLabel="Set up"
            onClick={() => navigate("/recovery")} />
        </Card>

        {/* 3. SUBSCRIPTION / LICENSE */}
        <Card>
          <CardHeader icon={<Package className="h-4 w-4" />} title="Subscription / License" />
          <ReadOnlyRow icon={<Package className="h-4 w-4" />}    label="Current Plan"    value={subscriptionLabel} />
          <ReadOnlyRow icon={<Activity className="h-4 w-4" />}   label="License Status"  value={subscriptionStatus} mono />
          <ReadOnlyRow icon={<ShieldCheck className="h-4 w-4" />} label="Premium Access" value={DEVELOPMENT_MODE ? "Bypassed (dev)" : (isPremiumUnlocked() ? "Granted" : "Locked")} />
          <ReadOnlyRow icon={<Info className="h-4 w-4" />}       label="Expiration"      value={subscriptionExpiry} />
          <NavRow testId="acct-license"
            icon={<Package className="h-4 w-4" />}
            title="Manage License"
            sub={DEVELOPMENT_MODE ? "Disabled while in development mode" : "Upgrade or change plan"}
            actionLabel={DEVELOPMENT_MODE ? "Dev" : "Open"}
            onClick={() => navigate("/license")} />
        </Card>

        {/* 4. STORAGE OWNERSHIP */}
        <Card>
          <CardHeader icon={<HardDrive className="h-4 w-4" />} title="Storage Ownership" />
          <ReadOnlyRow icon={<FolderOpen className="h-4 w-4" />} label="Trip Monitor Folder" value={destLabel} mono />
          <ReadOnlyRow icon={<Database className="h-4 w-4" />}   label="Storage Mode"        value={modeLabel(destMode)} />
          {storageWarn && (
            <div data-testid="acct-storage-warn" className="flex items-start gap-2 p-2.5 rounded-md bg-[var(--tm-orange)]/10 border border-[var(--tm-orange)]/40">
              <AlertTriangle className="h-4 w-4 text-[var(--tm-orange)] shrink-0 mt-0.5" />
              <p className="text-[12px] text-[var(--tm-orange-deep)] font-bold">
                Storage at {storageUsage.percent}% — past warning threshold.
              </p>
            </div>
          )}
          <Notice icon={<ShieldCheck className="h-4 w-4 text-[var(--tm-blue)]" />}>
            Saved files live <span className="font-black">outside</span> the app at the path above. Deleting or uninstalling Trip Monitor will not delete those files. To remove them permanently, delete the Trip Monitor folder from your device or external storage.
          </Notice>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <NavRow testId="acct-open-folder" icon={<FolderOpen className="h-4 w-4" />}
              title="Open Folder Location" sub="Jump to the Trip Monitor folder cards"
              actionLabel="Open" onClick={() => navigate("/documents")} />
            <NavRow testId="acct-change-storage" icon={<HardDrive className="h-4 w-4" />}
              title="Change Storage Location" sub="Internal · folder · SD card"
              actionLabel="Settings" onClick={() => navigate("/settings")} />
          </div>
        </Card>

        {/* 5. BACKUP & RESTORE */}
        <Card>
          <CardHeader icon={<Cloud className="h-4 w-4" />} title="Backup & Restore" />
          <ReadOnlyRow
            icon={<Cloud className="h-4 w-4" />} label="Backup Status"
            value={backup?.last_backup_at ? "On · last backup recorded" : "No backups yet"} />
          <ReadOnlyRow
            icon={<Activity className="h-4 w-4" />} label="Last Backup"
            value={backup?.last_backup_at ? formatDateTime(backup.last_backup_at) : "Never"} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ActionRow testId="acct-backup-now"
              icon={<Cloud className="h-4 w-4" />} title="Backup Now"
              sub="Download a JSON backup of your account and profile"
              onClick={runBackupNow} />
            <ActionRow testId="acct-restore"
              icon={<RefreshCw className="h-4 w-4" />} title="Restore from Backup"
              sub="Pick a Trip Monitor backup file and restore"
              onClick={() => setRestoreOpen(true)} danger />
          </div>
        </Card>

        {/* 6. APP INFORMATION */}
        <Card>
          <CardHeader icon={<Info className="h-4 w-4" />} title="App Information" />
          <ReadOnlyRow icon={<Info className="h-4 w-4" />}      label="App Version"  value={appVersion} mono />
          <ReadOnlyRow icon={<Info className="h-4 w-4" />}      label="Build Number" value={buildNumber} mono />
          <ReadOnlyRow
            icon={<Smartphone className="h-4 w-4" />} label="Device ID / Install ID"
            value={deviceId} mono copyable />
          <ReadOnlyRow icon={<Smartphone className="h-4 w-4" />} label="Platform"     value={platform} />
          <ReadOnlyRow icon={<Database className="h-4 w-4" />}   label="Storage Mode" value={modeLabel(destMode)} />
        </Card>

        {/* 7. LEGAL */}
        <Card>
          <CardHeader icon={<Scale className="h-4 w-4" />} title="Legal" />
          <NavRow testId="acct-legal-terms"   icon={<Scale className="h-4 w-4" />}        title="Terms of Use"
            actionLabel="Open" onClick={() => navigate("/legal#terms")} />
          <NavRow testId="acct-legal-privacy" icon={<ShieldCheck className="h-4 w-4" />}  title="Privacy Policy"
            actionLabel="Open" onClick={() => navigate("/legal#privacy")} />
          <NavRow testId="acct-legal-licenses" icon={<FileText className="h-4 w-4" />}    title="Open-Source Licenses"
            actionLabel="Open" onClick={() => navigate("/legal#licenses")} />
          <NavRow testId="acct-legal-storage" icon={<Database className="h-4 w-4" />}     title="Data Storage Notice"
            actionLabel="Open" onClick={() => navigate("/legal#storage")} />
        </Card>

        {/* 8. ACCOUNT ACTIONS — danger zone */}
        <Card warn>
          <CardHeader icon={<AlertTriangle className="h-4 w-4 text-[var(--tm-orange-deep)]" />} title="Account Actions" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <ActionRow testId="acct-signout"
              icon={<LogOut className="h-4 w-4" />} title="Sign Out"
              sub="Lock the app — keeps profile & documents intact"
              onClick={() => setLogoutOpen(true)} />
            <ActionRow testId="acct-reset"
              icon={<RotateCcw className="h-4 w-4" />} title="Reset Account Setup"
              sub="Clear preferences and start setup again"
              onClick={() => setResetOpen(true)} danger />
            <ActionRow testId="acct-delete"
              icon={<Trash2 className="h-4 w-4" />} title="Delete Profile Data"
              sub="Permanently remove on-device profile data"
              onClick={() => setDeleteOpen(true)} danger />
          </div>
        </Card>

        <p className="text-[11px] text-[var(--tm-text-soft)] font-semibold px-1">
          Account · {accountId} · {appVersion}
        </p>
      </div>

      {/* Confirmations — the only popups allowed on this screen */}
      <LogoutConfirmDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={async () => { setLogoutOpen(false); await logout(); }}
      />
      <ConfirmDialog
        open={resetOpen}
        onCancel={() => setResetOpen(false)}
        onConfirm={performReset}
        testId="acct-reset-dialog"
        icon={<RotateCcw className="h-4 w-4" />}
        title="Reset Account Setup?"
        body="Clears app preferences, settings and backup metadata on this device. Your synced profile, trips and documents are not affected."
        confirmLabel="Reset"
      />
      <ConfirmDialog
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={performDelete}
        testId="acct-delete-dialog"
        icon={<Trash2 className="h-4 w-4" />} danger
        title="Delete Profile Data?"
        body="This permanently removes your profile data from this device and signs you out. Documents stored in the Trip Monitor folder are not removed by this action."
        confirmLabel="Delete profile data"
      />
      <ConfirmDialog
        open={restoreOpen}
        onCancel={() => setRestoreOpen(false)}
        onConfirm={performRestore}
        testId="acct-restore-dialog"
        icon={<RefreshCw className="h-4 w-4" />}
        title="Restore from Backup?"
        body="You'll be asked to pick a Trip Monitor backup JSON file. Restoring overwrites your synced profile data. This action cannot be undone."
        confirmLabel="Pick backup file"
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
function ReadOnlyRow({ icon, label, value, mono, copyable }) {
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(String(value)); toast.success("Copied"); }
    catch { /* ignore */ }
  };
  return (
    <div className="flex items-center gap-3 px-2 py-2.5 border-b border-[var(--tm-border)]/50 last:border-b-0">
      <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/65 font-bold">{label}</div>
        <div className={[
          "text-sm font-bold text-[var(--tm-navy)] truncate",
          mono && "font-mono text-[12px]",
        ].filter(Boolean).join(" ")} title={String(value)}>{value}</div>
      </div>
      {copyable && (
        <button
          type="button"
          onClick={onCopy}
          data-testid="copy-row"
          className="text-xs text-[var(--tm-blue)] font-bold uppercase tracking-wider hover:underline"
        >Copy</button>
      )}
    </div>
  );
}
function NavRow({ testId, icon, title, sub, actionLabel = "Open", onClick }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors border-b border-[var(--tm-border)]/50 last:border-b-0"
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
function ToggleRow({ testId, icon, title, sub, value, disabled, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value ? "true" : "false"}
      data-testid={testId}
      onClick={onToggle}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors disabled:opacity-60 border-b border-[var(--tm-border)]/50 last:border-b-0 text-left"
    >
      <span className={[
        "h-9 w-9 rounded-md inline-flex items-center justify-center flex-shrink-0",
        value ? "bg-[var(--tm-blue)] text-white" : "bg-[var(--tm-surface-2)] text-[var(--tm-navy)]",
      ].join(" ")}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">{title}</span>
        {sub && <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{sub}</span>}
      </span>
      <span className={`relative inline-block w-10 h-6 rounded-full transition-colors ${value ? "bg-[var(--tm-blue)]" : "bg-[var(--tm-border)]"}`}>
        <span className={`absolute top-0.5 ${value ? "left-[18px]" : "left-0.5"} h-5 w-5 rounded-full bg-white shadow transition-all`} />
      </span>
    </button>
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
          <DialogTitle className="text-[var(--tm-navy)] inline-flex items-center gap-2">
            {icon} {title}
          </DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)] font-semibold leading-snug">
            {body}
          </DialogDescription>
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
function capitalize(s) { return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s; }
function modeLabel(mode) {
  const map = { internal: "Internal app storage", folder: "External folder (OPFS / FS Access)", sd: "SD Card / external", external: "External" };
  return map[mode] || (mode ? mode : "Internal app storage");
}
function formatDateTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
function detectPlatform() {
  const ua = navigator.userAgent || "";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  return "Web";
}
function getOrCreateDeviceId() {
  try {
    const k = "tm_device_id";
    let v = localStorage.getItem(k);
    if (!v) {
      v = "tm-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now().toString(36);
      localStorage.setItem(k, v);
    }
    return v;
  } catch { return "tm-unknown"; }
}
function loadBackupMeta() {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || "null"); }
  catch { return null; }
}
function saveBackupMeta(meta) {
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}
