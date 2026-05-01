import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { TIME_ZONES } from "../../data/constants";
import { api } from "../../lib/api";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

const STEP_TITLES = ["You & your terminal", "Your truck", "Preferences"];

export default function DriverProfileDialog({ open, initial, onSaved }) {
  const [form, setForm] = useState({
    full_name: "", home_terminal: "", time_zone: "America/Chicago",
    driver_id: "", truck_assignment_type: "Permanent",
    truck_number: "", license_plate: "", home_address: "",
    dispatcher_email: "",
  });
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const isEdit = !!initial;

  useEffect(() => {
    if (initial) setForm((p) => ({ ...p, ...initial }));
  }, [initial]);

  // Reset step to 1 each time dialog opens
  useEffect(() => { if (open) setStep(1); }, [open]);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validateStep = () => {
    if (step === 1) {
      if (!form.full_name) return "Enter your full name";
      if (!form.driver_id) return "Enter your driver ID";
      if (!form.home_terminal) return "Enter your home terminal";
      return null;
    }
    if (step === 2) {
      if (form.truck_assignment_type === "Permanent" && !form.truck_number) {
        return "Truck # is required for Permanent assignment";
      }
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
      if (!payload.dispatcher_email) delete payload.dispatcher_email;
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
        className="max-w-lg bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md"
        hideClose={!isEdit}
      >
        <DialogHeader>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold">
              {isEdit ? "Edit profile" : "One-time setup"}
            </span>
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold">
              Step {step} / 3
            </span>
          </div>
          <DialogTitle className="text-[var(--tm-navy)]">
            <span className="text-2xl font-black tracking-tight">{STEP_TITLES[step - 1]}</span>
          </DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)]">
            {step === 1 && "Used to auto-fill the driver fields on every trip sheet."}
            {step === 2 && "Tells us whether you're permanently assigned or slip-seating each shift."}
            {step === 3 && "Optional — saves your dispatcher email and home address for quicker exports."}
          </DialogDescription>
          {/* Progress bar */}
          <div className="h-1 w-full bg-[var(--tm-surface-2)] rounded-full overflow-hidden mt-2">
            <div
              className="h-full bg-[var(--tm-blue)] transition-[width] duration-300 ease-out"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {step === 1 && (
            <>
              <Field label="Full Name *">
                <Input data-testid="profile-fullname" value={form.full_name} onChange={(e) => update("full_name", e.target.value)}
                  className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
              </Field>
              <Field label="Driver ID *">
                <Input data-testid="profile-driverid" value={form.driver_id} onChange={(e) => update("driver_id", e.target.value)}
                  className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Home Terminal *">
                  <Input data-testid="profile-terminal" value={form.home_terminal} onChange={(e) => update("home_terminal", e.target.value)}
                    className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
                </Field>
                <Field label="Time Zone">
                  <Select value={form.time_zone} onValueChange={(v) => update("time_zone", v)}>
                    <SelectTrigger data-testid="profile-tz" className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
                      {TIME_ZONES.map((tz) => (<SelectItem key={tz} value={tz}>{tz}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Truck Assignment">
                <Select value={form.truck_assignment_type} onValueChange={(v) => update("truck_assignment_type", v)}>
                  <SelectTrigger data-testid="profile-assign-type" className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
                    <SelectItem value="Permanent">Permanent</SelectItem>
                    <SelectItem value="Slip Seat">Slip Seat</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={form.truck_assignment_type === "Permanent" ? "Truck # *" : "Preferred Truck #"}>
                  <Input data-testid="profile-truck" value={form.truck_number || ""} onChange={(e) => update("truck_number", e.target.value)}
                    className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
                </Field>
                <Field label="License Plate">
                  <Input data-testid="profile-plate" value={form.license_plate || ""} onChange={(e) => update("license_plate", e.target.value)}
                    className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
                </Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <Field label="Home Address (optional)">
                <Input data-testid="profile-address" value={form.home_address || ""} onChange={(e) => update("home_address", e.target.value)}
                  className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
              </Field>
              <Field label="Default Dispatcher Email (optional)">
                <Input data-testid="profile-dispatcher" type="email" placeholder="dispatcher@example.com"
                  value={form.dispatcher_email || ""}
                  onChange={(e) => update("dispatcher_email", e.target.value)}
                  className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md" />
              </Field>
            </>
          )}
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

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-[var(--tm-text-soft)]">{label}</Label>
      {children}
    </div>
  );
}
