import React, { useEffect, useState } from "react";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { ROLE_LABEL } from "../data/constants";
import { Save, User } from "lucide-react";

/**
 * User Profile screen — driver identity & work profile (NOT account
 * security or billing). Inline editable fields so it behaves like a
 * full screen, not a popup.
 */
export default function UserProfileScreen() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    full_name: "", driver_id: "", company_name: "",
    truck_number: "", truck_assignment_type: "permanent",
    home_terminal: "", contact_phone: "", contact_email: "",
    avatar_url: "", load_type: "Warehouse-Water",
    role: user?.role || "company_driver",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get("/profile");
        if (p.data) setForm((f) => ({ ...f, ...p.data }));
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/profile", form);
      if (r.data) setForm((f) => ({ ...f, ...r.data }));
      toast.success("Profile saved");
    } catch {
      toast.error("Could not save profile");
    } finally { setSaving(false); }
  };

  return (
    <AppShell overline="Hamburger Menu" pageTitle="User Profile">
      <div data-testid="user-profile-screen" className="flex flex-col gap-4">
        {/* Identity card */}
        <Card>
          <Header icon={<User className="h-4 w-4" />} title="Driver Identity" />
          <Field label="Full Name">
            <Input data-testid="up-full-name" value={form.full_name || ""} onChange={update("full_name")} placeholder="e.g. Richard Murphy" />
          </Field>
          <Field label="Driver ID">
            <Input data-testid="up-driver-id" value={form.driver_id || ""} onChange={update("driver_id")} placeholder="e.g. RT-1042" />
          </Field>
          <Field label="Driver Photo URL (optional)">
            <Input data-testid="up-avatar" value={form.avatar_url || ""} onChange={update("avatar_url")} placeholder="https://..." />
          </Field>
        </Card>

        {/* Work assignment */}
        <Card>
          <Header title="Work Assignment" />
          <Field label="Company Name">
            <Input data-testid="up-company" value={form.company_name || ""} onChange={update("company_name")} placeholder="e.g. RTI Trucking" />
          </Field>
          <Field label="Home Terminal">
            <Input data-testid="up-terminal" value={form.home_terminal || ""} onChange={update("home_terminal")} placeholder="e.g. Atlanta, GA" />
          </Field>
          <Field label="Truck / Tractor Number">
            <Input data-testid="up-truck" value={form.truck_number || ""} onChange={update("truck_number")} placeholder="e.g. 710909" />
          </Field>
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
          <Field label="Default Load Type">
            <Input data-testid="up-load-type" value={form.load_type || ""} onChange={update("load_type")} placeholder="e.g. Warehouse-Water" />
          </Field>
          <Field label="Role">
            <select
              data-testid="up-role"
              value={form.role || "company_driver"}
              onChange={update("role")}
              className="h-10 w-full rounded-md border border-[var(--tm-border)] bg-white px-3 text-sm font-semibold text-[var(--tm-navy)]"
            >
              <option value="company_driver">{ROLE_LABEL?.company_driver || "Company Driver"}</option>
              <option value="lto">{ROLE_LABEL?.lto || "LPO"}</option>
              <option value="owner_operator">{ROLE_LABEL?.owner_operator || "Owner Operator"}</option>
            </select>
          </Field>
        </Card>

        {/* Contact */}
        <Card>
          <Header title="Contact" />
          <Field label="Phone">
            <Input data-testid="up-phone" type="tel" value={form.contact_phone || ""} onChange={update("contact_phone")} placeholder="e.g. 555-0123" />
          </Field>
          <Field label="Email">
            <Input data-testid="up-email" type="email" value={form.contact_email || ""} onChange={update("contact_email")} placeholder="driver@example.com" />
          </Field>
        </Card>

        <div className="flex gap-2 pt-1">
          <Button
            data-testid="up-save"
            onClick={save}
            disabled={saving || loading}
            className="h-12 flex-1 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
          >
            <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

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
