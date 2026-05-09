import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  Fingerprint, KeyRound, ShieldCheck, IdCard, FileText, Trash2,
  ChevronRight, Info, Package, Wrench,
} from "lucide-react";
import {
  isFingerprintEnrolled, isFingerprintSupported,
} from "../lib/local-auth";
import { DEVELOPMENT_MODE, isPremiumUnlocked } from "../lib/feature-flags";
import { toast } from "sonner";

/**
 * Account screen — administrative / security side of the user record.
 *
 * NOT the driver profile (that lives at /user-profile). This screen
 * covers identity, authentication, license, recovery and device-level
 * housekeeping.
 */
export default function AccountScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [fpSupported, setFpSupported] = useState(false);
  const [fpEnrolled, setFpEnrolled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get("/profile");
        setProfile(p.data);
      } catch { /* ignore */ }
      try {
        setFpSupported(await isFingerprintSupported());
        setFpEnrolled(await isFingerprintEnrolled());
      } catch { /* ignore */ }
    })();
  }, []);

  const appVersion = process.env.REACT_APP_VERSION || "1.0.0";
  const driverId = profile?.driver_id || user?.driver_id || "—";

  return (
    <AppShell overline="Hamburger Menu" pageTitle="Account">
      <div className="flex flex-col gap-3" data-testid="account-screen">
        <Row
          testId="account-identity"
          icon={<IdCard className="h-4 w-4" />}
          title="Identity"
          sub={`Driver ID · ${driverId}`}
        />

        <SectionHeader>Login &amp; Security</SectionHeader>
        <Row
          testId="account-pin"
          icon={<KeyRound className="h-4 w-4" />}
          title="PIN"
          sub="6-digit unlock PIN"
          actionLabel="Change"
          onClick={() => toast.info("PIN change flow coming soon")}
        />
        <Row
          testId="account-fingerprint"
          icon={<Fingerprint className="h-4 w-4" />}
          title="Fingerprint Unlock"
          sub={fpSupported ? (fpEnrolled ? "Enabled" : "Disabled") : "Not supported on this device"}
          actionLabel={fpSupported ? "Manage" : null}
          onClick={() => navigate("/settings")}
        />
        <Row
          testId="account-recovery"
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Account Recovery"
          sub="Recovery phrase · master code"
          actionLabel="View"
          onClick={() => toast.info("Recovery flow coming soon")}
        />

        <SectionHeader>Subscription</SectionHeader>
        <Row
          testId="account-license"
          icon={<Package className="h-4 w-4" />}
          title="License / Subscription"
          sub={DEVELOPMENT_MODE
            ? "Development mode · all premium features unlocked"
            : (isPremiumUnlocked() ? "Premium · all features unlocked" : "Free · Driver Edition")}
          actionLabel={DEVELOPMENT_MODE ? "Dev" : "Upgrade"}
          onClick={() => toast.info(
            DEVELOPMENT_MODE
              ? "Development mode is on — premium gating bypassed."
              : "License management coming soon"
          )}
        />
        <Row
          testId="account-role"
          icon={<Wrench className="h-4 w-4" />}
          title="Driver Role"
          sub="Company Driver · Lease Purchase Operator · Owner Operator"
          actionLabel="Change"
          onClick={() => navigate("/user-profile")}
        />

        <SectionHeader>Data &amp; Storage</SectionHeader>
        <Row
          testId="account-storage-ownership"
          icon={<Info className="h-4 w-4" />}
          title="Storage Ownership"
          sub="Your documents are stored outside the app in the Trip Monitor folder you select. Uninstalling the app does not delete them."
          actionLabel="Settings"
          onClick={() => navigate("/settings")}
        />

        <SectionHeader>About</SectionHeader>
        <Row
          testId="account-version"
          icon={<Info className="h-4 w-4" />}
          title="App Version"
          sub={appVersion}
        />
        <Row
          testId="account-legal"
          icon={<FileText className="h-4 w-4" />}
          title="Legal · Terms · Privacy"
          actionLabel="View"
          onClick={() => toast.info("Legal docs coming soon")}
        />

        <SectionHeader>Danger Zone</SectionHeader>
        <Row
          testId="account-reset"
          icon={<Trash2 className="h-4 w-4" />}
          title="Reset / Delete Account"
          sub="Wipe local device data and start over"
          tone="danger"
          actionLabel="Reset"
          onClick={() => toast.info("Reset flow opens a confirmation dialog (coming soon)")}
        />
      </div>
    </AppShell>
  );
}

function SectionHeader({ children }) {
  return (
    <div className="mt-3 mb-1 px-1 text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--tm-navy)]/70">
      {children}
    </div>
  );
}

function Row({ testId, icon, title, sub, actionLabel, onClick, tone }) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={testId}
      className={[
        "w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors",
        "shadow-[0_2px_8px_rgba(14,31,71,0.04)]",
        tone === "danger"
          ? "bg-white border-[var(--tm-orange)]/40 hover:bg-[var(--tm-orange)]/5"
          : "bg-white border-[var(--tm-border)] hover:bg-[var(--tm-surface)]",
      ].join(" ")}
    >
      <span
        className={[
          "h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0",
          tone === "danger"
            ? "bg-[var(--tm-orange)]/10 text-[var(--tm-orange-deep)]"
            : "bg-[var(--tm-surface-2)] text-[var(--tm-navy)]",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">{title}</span>
        {sub && <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{sub}</span>}
      </span>
      {actionLabel && (
        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)]">
          {actionLabel} <ChevronRight className="h-3 w-3" />
        </span>
      )}
    </Component>
  );
}
