import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { US_STATES, DRIVER_TYPES, TRUCK_MAKES, TRUCK_COLORS, ROLE_LABEL } from "../../data/constants";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Trophy } from "lucide-react";

const STEP_TITLES = ["About you", "Your truck", "Experience & milestones"];
const STEP_BLURBS = [
  "Used to auto-fill your name on every trip sheet. Address fields are optional.",
  "Tell us how you're seated and what you drive — milestones use this later.",
  "Your career baseline. We'll seed achievements and start tracking from here.",
];

const DEFAULT_FORM = {
  full_name: "",
  // personal
  address: "",
  city: "",
  state: "",
  zip_code: "",
  phone: "",
  // driver info
  truck_assignment_type: "Permanent",
  company_id: "",
  truck_make: "",
  truck_color: "",
  truck_color_other: "",
  truck_number: "",
  license_plate: "",
  // experience
  years_experience: "",
  lifetime_miles: "",
  // legacy carry-overs (still supported by backend)
  driver_id: "",
  home_terminal: "",
  time_zone: "America/Chicago",
  dispatcher_email: "",
};

export default function DriverProfileDialog({ open, initial, role, onSaved }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const isEdit = !!initial;
  const roleLabel = role ? ROLE_LABEL[role] : null;

  useEffect(() => {
    if (initial) setForm((p) => ({ ...p, ...initial }));
  }, [initial]);

  useEffect(() => { if (open) setStep(1); }, [open]);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validateStep = () => {
    if (step === 1) {
      if (!form.full_name.trim()) return "Enter your full name";
      return null;
    }
    if (step === 2) {
      if (!form.truck_assignment_type) return "Pick a driver type";
      if (form.truck_color === "Other" && !form.truck_color_other.trim()) return "Tell us the color";
      return null;
    }
    if (step === 3) {
      if (form.years_experience === "" || Number.isNaN(Number(form.years_experience))) return "Enter years of experience";
      if (Number(form.years_experience) < 0 || Number(form.years_experience) > 80) return "Years must be 0–80";
      if (form.lifetime_miles === "" || Number.isNaN(Number(form.lifetime_miles))) return "Enter total lifetime miles";
      if (Number(form.lifetime_miles) < 0) return "Miles must be 0 or more";
      return null;
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) { toast.error(err); return; }
    setStep((s) => s + 1);
  };

  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    const err = validateStep();
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      // Coerce numeric fields
      payload.years_experience = Number(form.years_experience);
      payload.lifetime_miles = Number(form.lifetime_miles);
      // Drop empty optional strings to keep the doc clean
      ["address","city","state","zip_code","phone","company_id","truck_make","truck_color","truck_color_other","truck_number","license_plate","driver_id","home_terminal","dispatcher_email"]
        .forEach((k) => { if (!payload[k]) delete payload[k]; });
      const res = await api.post("/profile", payload);
      toast.success(isEdit ? "Profile updated" : "Welcome — let's roll!");
      onSaved(res.data);
    } catch (e) {
      const msg = e?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        data-testid="profile-dialog"
        className="max-w-lg bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md max-h-[90vh] overflow-y-auto"
        hideClose={!isEdit}
      >
        <DialogHeader>
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold">
              {isEdit ? "Edit profile" : "One-time setup"}
            </span>
            <div className="flex items-center gap-2">
              {roleLabel && (
                <span data-testid="profile-role-chip" className="px-2 py-0.5 rounded-full bg-[var(--tm-navy)] text-white text-[9px] tracking-[0.2em] uppercase">
                  {roleLabel}
                </span>
              )}
              <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold">
                Step {step} / 3
              </span>
            </div>
          </div>
          <DialogTitle className="text-[var(--tm-navy)]">
            <span className="text-2xl font-black tracking-tight">{STEP_TITLES[step - 1]}</span>
          </DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)]">
            {STEP_BLURBS[step - 1]}
          </DialogDescription>
          <div className="h-1 w-full bg-[var(--tm-surface-2)] rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-[var(--tm-blue)] transition-[width] duration-300 ease-out"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {step === 1 && <PersonalStep form={form} update={update} />}
          {step === 2 && <DriverInfoStep form={form} update={update} />}
          {step === 3 && <ExperienceStep form={form} update={update} />}
        </div>

        <DialogFooter className="mt-4 gap-2 flex-row">
          {step > 1 && (
            <Button data-testid="profile-back-btn" variant="outline" onClick={back} disabled={saving}
              className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
          {step < 3 ? (
            <Button data-testid="profile-next-btn" onClick={next}
              className="flex-1 h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md">
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button data-testid="profile-save-btn" onClick={submit} disabled={saving}
              className="flex-1 h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md">
              {saving ? "Saving..." : (
                <span className="inline-flex items-center"><Check className="h-4 w-4 mr-1" /> {isEdit ? "Save changes" : "Finish setup"}</span>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PersonalStep({ form, update }) {
  return (
    <>
      <Field label="Full Name *">
        <Input data-testid="profile-fullname" value={form.full_name}
          onChange={(e) => update("full_name", e.target.value)}
          className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
      </Field>
      <Field label="Address (optional)">
        <Input data-testid="profile-address" value={form.address}
          onChange={(e) => update("address", e.target.value)}
          className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
      </Field>
      <div className="grid grid-cols-[1fr_100px_120px] gap-2">
        <Field label="City">
          <Input data-testid="profile-city" value={form.city}
            onChange={(e) => update("city", e.target.value)}
            className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
        </Field>
        <Field label="State">
          <Select value={form.state} onValueChange={(v) => update("state", v)}>
            <SelectTrigger data-testid="profile-state" className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md">
              <SelectValue placeholder="--" />
            </SelectTrigger>
            <SelectContent className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] max-h-60">
              {US_STATES.map((s) => <SelectItem key={s.code} value={s.code}>{s.code}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="ZIP">
          <Input data-testid="profile-zip" value={form.zip_code}
            onChange={(e) => update("zip_code", e.target.value)}
            className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
        </Field>
      </div>
      <Field label="Phone (optional)">
        <Input data-testid="profile-phone" type="tel" value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
      </Field>
    </>
  );
}

function DriverInfoStep({ form, update }) {
  return (
    <>
      <div>
        <Label className="text-xs uppercase tracking-wider text-[var(--tm-text-soft)]">Driver Type *</Label>
        <div className="grid grid-cols-2 gap-2 mt-1.5" data-testid="profile-driver-type">
          {DRIVER_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`profile-driver-type-${t.id.replace(/\s+/g, "-").toLowerCase()}`}
              onClick={() => update("truck_assignment_type", t.id)}
              className={`h-auto p-3 rounded-md border-2 text-left transition-colors ${
                form.truck_assignment_type === t.id
                  ? "bg-[var(--tm-orange)] border-[var(--tm-orange)] text-white"
                  : "bg-white border-[var(--tm-border)] text-[var(--tm-text-soft)] hover:border-[var(--tm-blue)]"
              }`}
            >
              <div className="font-bold text-sm">{t.label}</div>
              <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${form.truck_assignment_type === t.id ? "text-white/80" : "text-[var(--tm-text-muted)]"}`}>
                {t.blurb}
              </div>
            </button>
          ))}
        </div>
      </div>

      <Field label="Company ID (if applicable)">
        <Input data-testid="profile-company-id" value={form.company_id}
          onChange={(e) => update("company_id", e.target.value)}
          placeholder="e.g. RTI-DRV-204"
          className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
      </Field>

      <Field label="Truck Make">
        <Select value={form.truck_make} onValueChange={(v) => update("truck_make", v)}>
          <SelectTrigger data-testid="profile-truck-make" className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md">
            <SelectValue placeholder="Pick a make" />
          </SelectTrigger>
          <SelectContent className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] max-h-60">
            {TRUCK_MAKES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      <div>
        <Label className="text-xs uppercase tracking-wider text-[var(--tm-text-soft)]">Truck Color</Label>
        <div className="grid grid-cols-6 gap-2 mt-1.5" data-testid="profile-truck-color">
          {TRUCK_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`color-${c.id.toLowerCase()}`}
              onClick={() => update("truck_color", c.id)}
              title={c.id}
              className={`h-12 rounded-md border-2 flex flex-col items-center justify-center text-[9px] uppercase tracking-wider font-bold transition-all ${
                form.truck_color === c.id
                  ? "border-[var(--tm-orange)] ring-2 ring-[var(--tm-orange)]/30"
                  : "border-[var(--tm-border)] hover:border-[var(--tm-blue)]"
              }`}
              style={c.swatch ? { background: c.swatch, color: ["White","Silver","Gray","Yellow"].includes(c.id) ? "#0E1F47" : "#fff" } : { background: "#fff", color: "var(--tm-navy)" }}
            >
              {c.id === "Other" ? "Other" : ""}
            </button>
          ))}
        </div>
        {form.truck_color === "Other" && (
          <Input data-testid="profile-truck-color-other"
            placeholder="Specify the color"
            value={form.truck_color_other}
            onChange={(e) => update("truck_color_other", e.target.value)}
            className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-10 rounded-md mt-2" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Truck #">
          <Input data-testid="profile-truck" value={form.truck_number || ""} onChange={(e) => update("truck_number", e.target.value)}
            className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
        </Field>
        <Field label="License Plate (optional)">
          <Input data-testid="profile-plate" value={form.license_plate || ""} onChange={(e) => update("license_plate", e.target.value)}
            className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
        </Field>
      </div>
    </>
  );
}

function ExperienceStep({ form, update }) {
  return (
    <>
      <div className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-[var(--tm-orange)] text-white flex items-center justify-center shrink-0">
          <Trophy className="h-5 w-5" />
        </div>
        <div className="text-xs text-[var(--tm-text-soft)] leading-relaxed">
          We use these two numbers to <strong className="text-[var(--tm-navy)]">unlock your existing milestones</strong>{" "}
          (years-of-service + mileage tiers) and start tracking new ones from here.
        </div>
      </div>

      <Field label="Years of Driving Experience *">
        <Input data-testid="profile-years"
          inputMode="numeric"
          type="number"
          min="0" max="80"
          value={form.years_experience}
          onChange={(e) => update("years_experience", e.target.value)}
          placeholder="e.g. 12"
          className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
      </Field>
      <Field label="Total Lifetime Miles Driven *">
        <Input data-testid="profile-lifetime-miles"
          inputMode="numeric"
          type="number"
          min="0"
          value={form.lifetime_miles}
          onChange={(e) => update("lifetime_miles", e.target.value)}
          placeholder="e.g. 850000"
          className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
      </Field>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-[var(--tm-text-soft)]">{label}</Label>
      {children}
    </div>
  );
}
