import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { TIME_ZONES } from "../../data/constants";
import { api } from "../../lib/api";
import { toast } from "sonner";

export default function DriverProfileDialog({ open, initial, onSaved }) {
  const [form, setForm] = useState({
    full_name: "", home_terminal: "", time_zone: "America/Chicago",
    driver_id: "", truck_assignment_type: "Permanent",
    truck_number: "", license_plate: "", home_address: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) setForm((p) => ({ ...p, ...initial }));
  }, [initial]);

  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.full_name || !form.home_terminal || !form.driver_id) {
      toast.error("Please fill full name, home terminal and driver ID");
      return;
    }
    if (form.truck_assignment_type === "Permanent" && !form.truck_number) {
      toast.error("Truck # required for Permanent assignment");
      return;
    }
    setSaving(true);
    try {
      const res = await api.post("/profile", form);
      toast.success("Profile saved");
      onSaved(res.data);
    } catch (e) {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        data-testid="profile-dialog"
        className="max-w-lg bg-[#171717] border-[#262626] text-white rounded-sm"
        hideClose
      >
        <DialogHeader>
          <DialogTitle className="text-white">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#FF5F15] font-bold block mb-2">
              One-time setup
            </span>
            <span className="text-2xl font-black tracking-tight">Driver Profile</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <Field label="Full Name *">
            <Input data-testid="profile-fullname" value={form.full_name} onChange={(e) => update("full_name", e.target.value)}
              className="bg-[#0A0A0A] border-[#262626] text-white h-12 rounded-sm" />
          </Field>
          <Field label="Driver ID *">
            <Input data-testid="profile-driverid" value={form.driver_id} onChange={(e) => update("driver_id", e.target.value)}
              className="bg-[#0A0A0A] border-[#262626] text-white h-12 rounded-sm" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Home Terminal *">
              <Input data-testid="profile-terminal" value={form.home_terminal} onChange={(e) => update("home_terminal", e.target.value)}
                className="bg-[#0A0A0A] border-[#262626] text-white h-12 rounded-sm" />
            </Field>
            <Field label="Time Zone">
              <Select value={form.time_zone} onValueChange={(v) => update("time_zone", v)}>
                <SelectTrigger data-testid="profile-tz" className="bg-[#0A0A0A] border-[#262626] text-white h-12 rounded-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#171717] border-[#262626] text-white">
                  {TIME_ZONES.map((tz) => (<SelectItem key={tz} value={tz}>{tz}</SelectItem>))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Truck Assignment">
            <Select value={form.truck_assignment_type} onValueChange={(v) => update("truck_assignment_type", v)}>
              <SelectTrigger data-testid="profile-assign-type" className="bg-[#0A0A0A] border-[#262626] text-white h-12 rounded-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#171717] border-[#262626] text-white">
                <SelectItem value="Permanent">Permanent</SelectItem>
                <SelectItem value="Slip Seat">Slip Seat</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={form.truck_assignment_type === "Permanent" ? "Truck # *" : "Preferred Truck #"}>
              <Input data-testid="profile-truck" value={form.truck_number || ""} onChange={(e) => update("truck_number", e.target.value)}
                className="bg-[#0A0A0A] border-[#262626] text-white h-12 rounded-sm" />
            </Field>
            <Field label="License Plate">
              <Input data-testid="profile-plate" value={form.license_plate || ""} onChange={(e) => update("license_plate", e.target.value)}
                className="bg-[#0A0A0A] border-[#262626] text-white h-12 rounded-sm" />
            </Field>
          </div>
          <Field label="Home Address (optional)">
            <Input data-testid="profile-address" value={form.home_address || ""} onChange={(e) => update("home_address", e.target.value)}
              className="bg-[#0A0A0A] border-[#262626] text-white h-12 rounded-sm" />
          </Field>
        </div>

        <DialogFooter className="mt-4">
          <Button data-testid="profile-save-btn" onClick={submit} disabled={saving}
            className="w-full h-14 bg-[#FF5F15] hover:bg-[#E04F0E] text-white font-bold rounded-sm">
            {saving ? "Saving..." : "Save Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-neutral-400">{label}</Label>
      {children}
    </div>
  );
}
