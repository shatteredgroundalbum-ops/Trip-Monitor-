import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { useAuth } from "../lib/auth";
import { ROLE_LABEL } from "../data/constants";
import { isAboveQuotaWarning, getStorageUsage, getDestinationConfig, STORAGE_MODES } from "../lib/storage-location";
import { isFingerprintEnrolled, isFingerprintSupported } from "../lib/local-auth";
import {
  Camera, Trash2, Save, Pencil, ChevronRight, BadgeCheck, Truck, Briefcase,
  PhoneCall, Mail, MapPin, ShieldAlert, FileText, IdCard, Award, Activity,
  CheckCircle2, Circle, RefreshCw, Download, RotateCcw, Sun, Palette,
  HardDrive, Cloud, Fingerprint, AlertTriangle, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

/**
 * User Profile screen — driver identity & work profile.
 *
 * NOT account/security/billing (lives in /account) and NOT app
 * preferences (lives in /settings). This screen is the driver's
 * personal app-facing profile, structured per spec:
 *
 *   1. Hero (avatar, name, ID, company, role chip, status pill)
 *   2. Driver Status selector
 *   3. Personal Information
 *   4. Work Information
 *   5. App Personalization (light)
 *   6. Quick Stats
 *   7. Document Shortcuts (open Documents screen)
 *   8. Connected Features (view-only summary)
 *   9. Profile Actions (edit / change role / export / sync)
 *  10. Danger Zone (reset / delete — confirmation required)
 *
 * Backend stores known fields via PUT /api/profile; spec-extras
 * (status, emergency contact, dispatcher name, DOT/CDL, trailer type,
 * preferred load type, personalization) persist to localStorage.
 */
const STATUS_OPTIONS = [
  { value: "available", label: "Available", color: "#16a34a" },
  { value: "on_duty",   label: "On Duty",   color: "#0ea5e9" },
  { value: "off_duty",  label: "Off Duty",  color: "#94a3b8" },
  { value: "on_trip",   label: "On Trip",   color: "var(--tm-blue)" },
  { value: "home_time", label: "Home Time", color: "#a855f7" },
  { value: "vacation",  label: "Vacation",  color: "var(--tm-orange)" },
];

const ROLE_OPTIONS = [
  { value: "company_driver", label: ROLE_LABEL?.company_driver || "Company Driver" },
  { value: "lto",            label: "Lease Purchase Operator" },
  { value: "owner_operator", label: ROLE_LABEL?.owner_operator || "Owner Operator" },
];

const ACCENT_OPTIONS = [
  { value: "orange", color: "#FF5F15", label: "Orange" },
  { value: "blue",   color: "#1E78FF", label: "Blue" },
  { value: "green",  color: "#16a34a", label: "Green" },
  { value: "purple", color: "#a855f7", label: "Purple" },
];

const BANNER_OPTIONS = [
  { value: "navy",  label: "Solid Navy" },
  { value: "blue",  label: "Solid Blue" },
  { value: "geo",   label: "Navy Geometric" },
];

// Avatar customization options — applied to the round avatar frame
// in the hero card. Cosmetic only.
const AVATAR_SHAPE_OPTIONS = [
  { value: "rounded", label: "Rounded" },
  { value: "circle",  label: "Circle" },
  { value: "square",  label: "Square" },
];
const AVATAR_BORDER_OPTIONS = [
  { value: "thin",  label: "Thin" },
  { value: "thick", label: "Thick" },
  { value: "none",  label: "None" },
];

// Lightweight theme preview row — actual theme application happens in
// Settings; here we only render a swatch + label so users can see what
// they have currently selected.
const THEME_OPTIONS = [
  { value: "system", label: "System", swatchA: "#0E1F47", swatchB: "#FFFFFF" },
  { value: "light",  label: "Light",  swatchA: "#FFFFFF", swatchB: "#0E1F47" },
  { value: "dark",   label: "Dark",   swatchA: "#0E1F47", swatchB: "#1E78FF" },
];

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact",     label: "Compact" },
];

export default function UserProfileScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [storageUsage, setStorageUsage] = useState({ percent: 0 });
  const [destLabel, setDestLabel] = useState("Internal app storage");
  const [fpSupported, setFpSupported] = useState(false);
  const [fpEnrolled, setFpEnrolled] = useState(false);

  // Backend-tracked fields
  const [form, setForm] = useState({
    full_name: "", driver_id: "", company_id: "", phone: "",
    home_terminal: "", truck_number: "", truck_assignment_type: "permanent",
    address: "", city: "", state: "", zip_code: "",
    years_experience: 0,
  });
  // Local-only personalization & extras
  const [extras, setExtras] = useState(() => loadExtras());
  useEffect(() => { saveExtras(extras); }, [extras]);
  const setEx = (k, v) => setExtras((e) => ({ ...e, [k]: v }));

  // Bootstrap
  useEffect(() => {
    (async () => {
      try {
        const [p, s, ach] = await Promise.all([
          api.get("/profile"),
          api.get("/stats"),
          api.get("/achievements"),
        ]);
        if (p.data) setForm((f) => ({ ...f, ...p.data }));
        setStats(s.data);
        setAchievements(ach.data);
      } catch { /* ignore */ }
      try { setStorageUsage(await getStorageUsage()); } catch { /* ignore */ }
      try {
        const cfg = await getDestinationConfig();
        const m = STORAGE_MODES?.[cfg?.mode];
        setDestLabel(`${cfg?.handle_label || m?.label || "Internal app storage"} / Trip Monitor`);
      } catch { /* ignore */ }
      try {
        setFpSupported(await isFingerprintSupported());
        setFpEnrolled(await isFingerprintEnrolled());
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveProfile = async () => {
    // Validate phone & email per spec.
    if (form.phone && !/^[\d\s\-+().]{7,}$/.test(form.phone)) {
      toast.error("Phone number looks invalid");
      return;
    }
    if (extras.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extras.email)) {
      toast.error("Email address looks invalid");
      return;
    }
    setSaving(true);
    try {
      // Send only known backend fields; backend rejects unknowns.
      const payload = {
        full_name: form.full_name || "Driver",
        driver_id: form.driver_id || undefined,
        company_id: form.company_id || undefined,
        phone: form.phone || undefined,
        home_terminal: form.home_terminal || undefined,
        truck_number: form.truck_number || undefined,
        truck_assignment_type: form.truck_assignment_type || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        zip_code: form.zip_code || undefined,
        years_experience: Number(form.years_experience) || undefined,
      };
      const r = await api.post("/profile", payload);
      if (r.data) setForm((f) => ({ ...f, ...r.data }));
      saveExtras(extras);
      toast.success("Profile saved");
    } catch {
      toast.error("Could not save profile");
    } finally { setSaving(false); }
  };

  const exportProfile = () => {
    try {
      const out = { profile: form, extras, exported_at: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `trip-monitor-profile-${(form.driver_id || "driver").replace(/\W/g, "")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Profile exported");
    } catch { toast.error("Export failed"); }
  };

  const syncProfile = async () => {
    setSaving(true);
    try {
      const r = await api.get("/profile");
      if (r.data) setForm((f) => ({ ...f, ...r.data }));
      toast.success("Profile synced");
    } catch { toast.error("Sync failed"); }
    finally { setSaving(false); }
  };

  const performReset = () => {
    setExtras({ ...DEFAULT_EXTRAS });
    setConfirmReset(false);
    toast.success("Profile personalization reset");
  };
  const performDelete = async () => {
    try {
      // Wipe local extras only — actual account deletion lives in Account.
      saveExtras({ ...DEFAULT_EXTRAS });
      toast.success("Local profile cleared. Account deletion lives in Account.");
      setConfirmDelete(false);
      navigate("/account");
    } catch { toast.error("Could not clear profile"); }
  };

  const initials = (form.full_name || user?.name || "D").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const status = STATUS_OPTIONS.find((s) => s.value === extras.status) || STATUS_OPTIONS[0];
  const role = ROLE_OPTIONS.find((r) => r.value === (extras.role || form.role || user?.role)) || ROLE_OPTIONS[0];
  const milestonesEarned = (achievements?.badges || []).filter((b) => b.earned).length;
  const yearsWithCompany = useMemo(() => {
    if (!extras.company_start_date) return null;
    try {
      const d = new Date(extras.company_start_date).getTime();
      return ((Date.now() - d) / (365.25 * 86400 * 1000)).toFixed(1);
    } catch { return null; }
  }, [extras.company_start_date]);

  if (loading) {
    return (
      <AppShell overline="Hamburger Menu" pageTitle="Profile">
        <div className="text-sm text-[var(--tm-text-soft)] font-semibold">Loading profile…</div>
      </AppShell>
    );
  }

  return (
    <AppShell overline="Hamburger Menu" pageTitle="Profile" hideTitleBlock>
      <div data-testid="profile-screen" className="flex flex-col gap-4">
        {/* HERO */}
        <div
          className="relative overflow-hidden rounded-2xl text-white p-5 md:p-6 shadow-[0_8px_24px_rgba(14,31,71,0.12)]"
          style={{ background: bannerBg(extras.banner || "navy") }}
          data-testid="profile-hero"
        >
          <div className="flex items-center gap-4">
            <AvatarBlock
              avatarUrl={extras.avatar_url || form.avatar_url}
              initials={initials}
              accent={extras.accent || "orange"}
              shape={extras.avatar_shape || "rounded"}
              border={extras.avatar_border || "thin"}
              onChange={(url) => setEx("avatar_url", url)}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/70 font-bold">Driver</div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight truncate">{form.full_name || "Add your name"}</h1>
              <div className="mt-0.5 text-[12px] text-white/85 font-bold tracking-wide truncate">
                @{extras.display_name || makeHandle(form.full_name)}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-white/15 text-white text-[10px] font-black tracking-[0.15em] uppercase">
                  {role.label}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/15 text-white text-[10px] font-black tracking-[0.15em] uppercase"
                  data-testid="profile-status-pill"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
                  {status.label}
                </span>
                {milestonesEarned > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/15 text-white text-[10px] font-black tracking-[0.15em] uppercase">
                    <Award className="h-3 w-3" /> {milestonesEarned} earned
                  </span>
                )}
              </div>
              <div className="text-[12px] text-white/80 font-semibold mt-2 truncate">
                {form.driver_id ? `ID · ${form.driver_id}` : "Add your driver ID"}
                {form.company_id ? ` · ${form.company_id}` : ""}
              </div>
            </div>
          </div>
        </div>

        {/* DRIVER STATUS */}
        <Card>
          <CardHeader icon={<Activity className="h-4 w-4" />} title="Driver Status" />
          <div className="flex flex-wrap gap-2" data-testid="profile-status-selector">
            {STATUS_OPTIONS.map((o) => {
              const active = o.value === status.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  data-testid={`status-${o.value}`}
                  onClick={() => setEx("status", o.value)}
                  className={[
                    "px-3.5 h-9 rounded-full border text-xs font-bold tracking-wide inline-flex items-center gap-1.5 transition-colors",
                    active
                      ? "bg-[var(--tm-navy)] text-white border-[var(--tm-navy)]"
                      : "bg-white text-[var(--tm-navy)] border-[var(--tm-border)] hover:bg-[var(--tm-surface)]",
                  ].join(" ")}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />
                  {o.label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* PERSONAL INFORMATION */}
        <Card>
          <CardHeader icon={<IdCard className="h-4 w-4" />} title="Personal Information" />
          <Field label="Full Name"><Input data-testid="up-full-name" value={form.full_name || ""} onChange={update("full_name")} placeholder="e.g. Richard Murphy" /></Field>
          <Field label="Display Name (Username)"><Input data-testid="up-display-name" value={extras.display_name || ""} onChange={(e) => setEx("display_name", normalizeHandle(e.target.value))} placeholder="e.g. richard.m — letters, numbers, dot, underscore" /></Field>
          <Field label="Phone Number"><Input data-testid="up-phone" type="tel" value={form.phone || ""} onChange={update("phone")} placeholder="e.g. 555-0123" /></Field>
          <Field label="Email Address"><Input data-testid="up-email" type="email" value={extras.email || ""} onChange={(e) => setEx("email", e.target.value)} placeholder="driver@example.com" /></Field>
          <Field label="Emergency Contact"><Input data-testid="up-ec" value={extras.emergency_contact || ""} onChange={(e) => setEx("emergency_contact", e.target.value)} placeholder="Name · Relationship · Phone" /></Field>
          <Field label="Address (optional)"><Input data-testid="up-address" value={form.address || ""} onChange={update("address")} placeholder="Street" /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="City"><Input data-testid="up-city" value={form.city || ""} onChange={update("city")} /></Field>
            <Field label="State"><Input data-testid="up-state" value={form.state || ""} onChange={update("state")} /></Field>
            <Field label="ZIP"><Input data-testid="up-zip" value={form.zip_code || ""} onChange={update("zip_code")} /></Field>
          </div>
        </Card>

        {/* WORK INFORMATION */}
        <Card>
          <CardHeader icon={<Truck className="h-4 w-4" />} title="Work Information" />
          <Field label="Company Name"><Input data-testid="up-company" value={form.company_id || ""} onChange={update("company_id")} placeholder="e.g. RTI Trucking" /></Field>
          <Field label="Driver ID"><Input data-testid="up-driver-id" value={form.driver_id || ""} onChange={update("driver_id")} placeholder="e.g. RT-1042" /></Field>
          <Field label="Home Terminal"><Input data-testid="up-terminal" value={form.home_terminal || ""} onChange={update("home_terminal")} placeholder="e.g. Atlanta, GA" /></Field>
          <Field label="Dispatcher Name"><Input data-testid="up-dispatcher" value={extras.dispatcher_name || ""} onChange={(e) => setEx("dispatcher_name", e.target.value)} placeholder="e.g. Mike R." /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Assigned Truck #"><Input data-testid="up-truck" value={form.truck_number || ""} onChange={update("truck_number")} placeholder="e.g. 710909" /></Field>
            <Field label="Truck Assignment">
              <select
                data-testid="up-assignment"
                value={form.truck_assignment_type || "permanent"}
                onChange={update("truck_assignment_type")}
                className="h-10 w-full rounded-md border border-[var(--tm-border)] bg-white px-3 text-sm font-semibold text-[var(--tm-navy)]"
              >
                <option value="permanent">Permanent</option>
                <option value="slip-seat">Slip-seat</option>
                <option value="trip">Trip-only</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Trailer Type">
              <select
                data-testid="up-trailer"
                value={extras.trailer_type || "dry_van"}
                onChange={(e) => setEx("trailer_type", e.target.value)}
                className="h-10 w-full rounded-md border border-[var(--tm-border)] bg-white px-3 text-sm font-semibold text-[var(--tm-navy)]"
              >
                <option value="dry_van">Dry Van</option>
                <option value="reefer">Reefer</option>
                <option value="flatbed">Flatbed</option>
                <option value="tanker">Tanker</option>
                <option value="step_deck">Step Deck</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="DOT / CDL Number (optional)"><Input data-testid="up-cdl" value={extras.cdl_number || ""} onChange={(e) => setEx("cdl_number", e.target.value)} placeholder="optional" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Years Driving"><Input data-testid="up-years" type="number" min="0" max="80" value={form.years_experience ?? ""} onChange={update("years_experience")} placeholder="e.g. 8" /></Field>
            <Field label="Preferred Load Type"><Input data-testid="up-load-type" value={extras.preferred_load_type || ""} onChange={(e) => setEx("preferred_load_type", e.target.value)} placeholder="e.g. Warehouse-Water" /></Field>
          </div>
          <Field label="Driver Role">
            <select
              data-testid="up-role"
              value={extras.role || "company_driver"}
              onChange={(e) => setEx("role", e.target.value)}
              className="h-10 w-full rounded-md border border-[var(--tm-border)] bg-white px-3 text-sm font-semibold text-[var(--tm-navy)]"
            >
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </Card>

        {/* APP PERSONALIZATION (light) */}
        <Card>
          <CardHeader icon={<Palette className="h-4 w-4" />} title="Profile Personalization" />
          <ThemePreviewRow
            testId="up-theme"
            title="Theme Preview"
            value={extras.theme || "system"}
            onChange={(v) => setEx("theme", v)}
            options={THEME_OPTIONS}
          />
          <SwatchRow
            testId="up-accent"
            title="Accent Color Preview"
            value={extras.accent || "orange"}
            onChange={(v) => setEx("accent", v)}
            options={ACCENT_OPTIONS}
          />
          <SegRow
            testId="up-avatar-shape"
            title="Avatar Shape"
            value={extras.avatar_shape || "rounded"}
            onChange={(v) => setEx("avatar_shape", v)}
            options={AVATAR_SHAPE_OPTIONS}
          />
          <SegRow
            testId="up-avatar-border"
            title="Avatar Border"
            value={extras.avatar_border || "thin"}
            onChange={(v) => setEx("avatar_border", v)}
            options={AVATAR_BORDER_OPTIONS}
          />
          <SegRow
            testId="up-density"
            title="Display Density Preview"
            value={extras.density || "comfortable"}
            onChange={(v) => setEx("density", v)}
            options={DENSITY_OPTIONS}
          />
          <Hint icon={<Sun className="h-4 w-4 text-[var(--tm-blue)]" />}>
            These are cosmetic previews. Real theme &amp; behavior toggles live in <button onClick={() => navigate("/settings")} className="underline font-bold text-[var(--tm-blue)]">Settings</button>.
          </Hint>
        </Card>

        {/* QUICK STATS */}
        <Card>
          <CardHeader icon={<Award className="h-4 w-4" />} title="Quick Stats" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Tile testId="qs-miles"      label="Lifetime Miles"  value={fmt(stats?.miles_lifetime ?? 0)} />
            <Tile testId="qs-trips"      label="Trips Completed" value={String(stats?.trips_total ?? 0)} />
            <Tile testId="qs-stops"      label="Stops Completed" value={String(stats?.total_stops ?? 0)} />
            <Tile testId="qs-years"      label="Years w/ Company" value={yearsWithCompany ?? "—"} />
            <Tile testId="qs-milestones" label="Milestones Earned" value={String(milestonesEarned)} />
          </div>
          <Hint icon={<Activity className="h-4 w-4 text-[var(--tm-blue)]" />}>
            Detailed analytics live in <button onClick={() => navigate("/analytics")} className="underline font-bold text-[var(--tm-blue)]">Analytics</button>.
          </Hint>
        </Card>

        {/* DOCUMENT SHORTCUTS */}
        <Card>
          <CardHeader icon={<FileText className="h-4 w-4" />} title="Document Shortcuts" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <DocTile testId="doc-cdl"      label="CDL Copy"     onClick={() => navigate("/documents")} />
            <DocTile testId="doc-medical"  label="Medical Card" onClick={() => navigate("/documents")} />
            <DocTile testId="doc-insurance" label="Insurance"   onClick={() => navigate("/documents")} />
            <DocTile testId="doc-permits"  label="Permits"      onClick={() => navigate("/documents")} />
          </div>
          <Hint icon={<FileText className="h-4 w-4 text-[var(--tm-blue)]" />}>
            Files are stored outside the app in your Trip Monitor folder. Profile only links — never stores.
          </Hint>
        </Card>

        {/* SOCIAL / CONNECTED FEATURES (optional, hidden by default) */}
        {extras.social_enabled ? (
          <Card>
            <CardHeader icon={<BadgeCheck className="h-4 w-4" />} title="Social / Connected" />
            <SummaryRow
              testId="cf-driver-badge"
              icon={<Award className="h-4 w-4" />}
              title="Driver Badge"
              value={milestonesEarned > 0 ? `${milestonesEarned} milestones earned` : "No badge yet"}
            />
            <SummaryRow
              testId="cf-rating"
              icon={<Activity className="h-4 w-4" />}
              title="Reputation / Rating"
              value="—"
            />
            <SummaryRow
              testId="cf-achievements"
              icon={<Award className="h-4 w-4" />}
              title="Achievement Showcase"
              value={milestonesEarned > 0 ? `${milestonesEarned} unlocked` : "Hidden"}
            />
            <SummaryRow
              testId="cf-fleet"
              icon={<Truck className="h-4 w-4" />}
              title="Connected Fleet Status"
              value={form.company_id ? `Connected to ${form.company_id}` : "Not connected"}
            />
            <button
              type="button"
              data-testid="social-toggle-off"
              onClick={() => setEx("social_enabled", false)}
              className="self-start text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)] hover:underline"
            >Hide social features</button>
          </Card>
        ) : (
          <button
            type="button"
            data-testid="social-toggle-on"
            onClick={() => setEx("social_enabled", true)}
            className="text-left bg-white border border-dashed border-[var(--tm-border)] rounded-xl px-4 py-3 hover:bg-[var(--tm-surface)] transition-colors flex items-center gap-3"
          >
            <BadgeCheck className="h-4 w-4 text-[var(--tm-navy)]/60" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-[var(--tm-navy)]">Social / Connected Features</span>
              <span className="block text-[12px] text-[var(--tm-navy)]/65 font-semibold">Driver badges, reputation, achievement showcase, fleet status. Hidden — tap to enable.</span>
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)]" />
          </button>
        )}

        {/* PROFILE ACTIONS */}
        <Card>
          <CardHeader icon={<Pencil className="h-4 w-4" />} title="Profile Actions" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <ActionBtn testId="pa-save"   icon={<Save className="h-4 w-4" />}    label={saving ? "Saving…" : "Edit / Save"} onClick={saveProfile} primary />
            <ActionBtn testId="pa-role"   icon={<Briefcase className="h-4 w-4" />} label="Change Role" onClick={() => {
              const next = ROLE_OPTIONS[(ROLE_OPTIONS.findIndex((r) => r.value === (extras.role || "company_driver")) + 1) % ROLE_OPTIONS.length].value;
              setEx("role", next);
              toast.info(`Role set to ${ROLE_OPTIONS.find((r) => r.value === next)?.label}`);
            }} />
            <ActionBtn testId="pa-export" icon={<Download className="h-4 w-4" />}  label="Export Profile" onClick={exportProfile} />
            <ActionBtn testId="pa-sync"   icon={<RefreshCw className="h-4 w-4" />} label="Sync Profile"   onClick={syncProfile} />
          </div>
        </Card>

        {/* DANGER ZONE */}
        <Card warn>
          <CardHeader icon={<AlertTriangle className="h-4 w-4 text-[var(--tm-orange-deep)]" />} title="Danger Zone" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <ActionBtn testId="pa-reset"  icon={<RotateCcw className="h-4 w-4" />} label="Reset Profile Data" onClick={() => setConfirmReset(true)} danger />
            <ActionBtn testId="pa-delete" icon={<Trash2 className="h-4 w-4" />}    label="Delete Profile"     onClick={() => setConfirmDelete(true)} danger />
          </div>
        </Card>

        <div className="text-[11px] text-[var(--tm-text-soft)] font-semibold px-1">
          Saving updates the synced part of your profile to your device. Personalization stays on this device only.
        </div>
      </div>

      {/* Confirmations */}
      <ConfirmDialog
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={performReset}
        testId="reset-profile-dialog"
        icon={<RotateCcw className="h-4 w-4" />}
        title="Reset Profile Personalization?"
        body="This clears your status, accent, banner, density, dispatcher and trailer settings on this device. Your synced profile (name, ID, truck info) is not affected."
        confirmLabel="Reset"
      />
      <ConfirmDialog
        open={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={performDelete}
        testId="delete-profile-dialog"
        icon={<Trash2 className="h-4 w-4" />}
        danger
        title="Delete Profile?"
        body="This clears the profile from this device. To fully delete the account (including PIN, recovery, license), use Account → Reset / Delete Account."
        confirmLabel="Delete on this device"
      />
    </AppShell>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function AvatarBlock({ avatarUrl, initials, accent, shape = "rounded", border = "thin", onChange }) {
  const fileRef = React.useRef(null);
  const onPick = () => fileRef.current?.click();
  const handleFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(f);
  };
  const accentColor = (ACCENT_OPTIONS.find((a) => a.value === accent) || ACCENT_OPTIONS[0]).color;
  const radius = shape === "circle" ? "rounded-full" : shape === "square" ? "rounded-md" : "rounded-2xl";
  const borderWidth = border === "thick" ? "border-[5px]" : border === "none" ? "border-0" : "border-4";
  return (
    <div className="relative shrink-0">
      <div
        className={`h-20 w-20 ${radius} overflow-hidden ${borderWidth} flex items-center justify-center bg-white text-[var(--tm-navy)] text-xl font-black`}
        style={{ borderColor: accentColor }}
        data-testid="profile-avatar"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="absolute -bottom-2 -right-2 flex gap-1">
        <button
          type="button"
          onClick={onPick}
          data-testid="avatar-change"
          className="h-7 w-7 rounded-full bg-[var(--tm-orange)] text-white inline-flex items-center justify-center shadow"
          aria-label="Change photo"
        >
          <Camera className="h-3.5 w-3.5" />
        </button>
        {avatarUrl && (
          <button
            type="button"
            onClick={() => onChange("")}
            data-testid="avatar-remove"
            className="h-7 w-7 rounded-full bg-white text-[var(--tm-orange-deep)] border border-[var(--tm-orange)] inline-flex items-center justify-center"
            aria-label="Remove photo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
      </div>
    </div>
  );
}

function Card({ warn = false, children }) {
  return (
    <div className={[
      "rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-3",
      warn
        ? "bg-[var(--tm-orange)]/5 border border-[var(--tm-orange)]/40"
        : "bg-white border border-[var(--tm-border)]",
    ].join(" ")}>
      {children}
    </div>
  );
}
function CardHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-2 -mb-1">
      {icon}
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--tm-navy)]/70">{title}</div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-[var(--tm-navy)]/65">{label}</Label>
      {children}
    </div>
  );
}
function Tile({ testId, label, value }) {
  return (
    <div data-testid={testId} className="bg-white border border-[var(--tm-border)] rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold">{label}</div>
      <div className="text-xl font-black tracking-tight text-[var(--tm-navy)] mt-0.5">{value}</div>
    </div>
  );
}
function DocTile({ testId, label, onClick }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="rounded-lg border border-[var(--tm-border)] bg-white p-3 hover:bg-[var(--tm-surface)] transition-colors flex flex-col items-start gap-1"
    >
      <FileText className="h-4 w-4 text-[var(--tm-navy)]" strokeWidth={1.6} />
      <div className="text-sm font-bold text-[var(--tm-navy)]">{label}</div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold inline-flex items-center gap-1">
        Open <ChevronRight className="h-3 w-3" />
      </div>
    </button>
  );
}
function SummaryRow({ testId, icon, title, value, warn }) {
  return (
    <div data-testid={testId} className="flex items-center gap-3 px-2 py-2.5">
      <span className={[
        "h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0",
        warn ? "bg-[var(--tm-orange)] text-white" : "bg-[var(--tm-surface-2)] text-[var(--tm-navy)]",
      ].join(" ")}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[var(--tm-navy)]">{title}</div>
        <div className={[
          "text-[12px] font-semibold leading-snug truncate",
          warn ? "text-[var(--tm-orange-deep)]" : "text-[var(--tm-navy)]/70",
        ].join(" ")}>{value}</div>
      </div>
    </div>
  );
}
function ActionBtn({ testId, icon, label, onClick, primary, danger }) {
  return (
    <Button
      type="button"
      data-testid={testId}
      onClick={onClick}
      variant="outline"
      className={[
        "h-11 justify-start gap-2 rounded-md text-sm font-bold",
        primary && "bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white border-[var(--tm-orange)]",
        danger && !primary && "bg-white border-[var(--tm-orange)]/50 text-[var(--tm-orange-deep)] hover:bg-[var(--tm-orange)]/10",
        !primary && !danger && "bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)]",
      ].filter(Boolean).join(" ")}
    >
      {icon}{label}
    </Button>
  );
}
function SwatchRow({ testId, title, value, onChange, options }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-3 px-1 py-2">
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
function SegRow({ testId, title, value, onChange, options }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-3 px-1 py-2">
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
function ThemePreviewRow({ testId, title, value, onChange, options }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-3 px-1 py-2">
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
              className={[
                "h-8 rounded-md inline-flex items-center gap-1.5 pl-1 pr-2 transition-colors border-2",
                active ? "border-[var(--tm-navy)]" : "border-transparent hover:border-[var(--tm-border)]",
              ].join(" ")}
              aria-label={o.label}
            >
              <span className="relative h-6 w-6 rounded-full overflow-hidden ring-1 ring-[var(--tm-border)]">
                <span className="absolute inset-0" style={{ background: o.swatchA }} />
                <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: o.swatchB }} />
              </span>
              <span className="text-xs font-bold text-[var(--tm-navy)]">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
function Hint({ icon, children }) {
  return (
    <div className="flex items-start gap-2 px-2 py-2 rounded-md bg-[var(--tm-surface)] border border-[var(--tm-border)]">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <p className="text-[12px] text-[var(--tm-navy)]/80 font-semibold leading-snug">{children}</p>
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
                  className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
            Cancel
          </Button>
          <Button data-testid={`${testId}-confirm`} onClick={onConfirm}
                  className={[
                    "h-11 flex-1 rounded-md font-bold text-white",
                    danger ? "bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)]" : "bg-[var(--tm-navy)] hover:brightness-110",
                  ].join(" ")}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- helpers ---- */
function fmt(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "K";
  return v.toLocaleString();
}
function bannerBg(kind) {
  if (kind === "blue") return "linear-gradient(135deg, #1E78FF 0%, #0050cf 100%)";
  if (kind === "geo")  return "linear-gradient(135deg, #0E1F47 0%, #1a3268 60%, #1E78FF 130%)";
  return "linear-gradient(135deg, #0E1F47 0%, #122655 100%)";
}

function makeHandle(name) {
  if (!name) return "driver";
  return String(name).trim().toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._]/g, "").slice(0, 24) || "driver";
}
function normalizeHandle(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 24);
}

const EXTRAS_KEY = "tm_profile_extras_v1";
const DEFAULT_EXTRAS = {
  status: "available",
  email: "",
  emergency_contact: "",
  dispatcher_name: "",
  trailer_type: "dry_van",
  cdl_number: "",
  preferred_load_type: "",
  role: "company_driver",
  avatar_url: "",
  accent: "orange",
  banner: "navy",
  density: "comfortable",
  backup_enabled: true,
  company_start_date: "",
  // New per spec
  display_name: "",
  theme: "system",
  avatar_shape: "rounded",
  avatar_border: "thin",
  social_enabled: false,
};
function loadExtras() {
  try { return { ...DEFAULT_EXTRAS, ...JSON.parse(localStorage.getItem(EXTRAS_KEY) || "{}") }; }
  catch { return { ...DEFAULT_EXTRAS }; }
}
function saveExtras(e) {
  try { localStorage.setItem(EXTRAS_KEY, JSON.stringify(e)); } catch { /* ignore */ }
}
