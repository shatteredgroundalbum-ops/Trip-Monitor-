import React, { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { CalendarIcon, ChevronRight, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function SessionWizard({ open, profile, onCreate, onCancel }) {
  const [step, setStep] = useState(1);
  const [sessionType, setSessionType] = useState("");
  const [chosenDate, setChosenDate] = useState(new Date());
  const [loadType, setLoadType] = useState("");
  const [subType, setSubType] = useState(""); // Dairy | Water
  const [truckNumber, setTruckNumber] = useState(profile?.truck_number || "");
  const [orderNumber, setOrderNumber] = useState("");
  const [bolNumber, setBolNumber] = useState("");

  const reset = () => {
    setStep(1); setSessionType(""); setChosenDate(new Date());
    setLoadType(""); setSubType(""); setOrderNumber(""); setBolNumber("");
  };

  const finalLoadType = loadType === "Store" ? "Store" : loadType === "Warehouse" ? `Warehouse-${subType}` : "";
  const hasTemperature = finalLoadType === "Store" || finalLoadType === "Warehouse-Dairy";

  const handleSubmit = () => {
    if (!orderNumber) {
      toast.error("Order # is required");
      return;
    }
    if (profile?.truck_assignment_type === "Slip Seat" && !truckNumber) {
      toast.error("Truck # required");
      return;
    }
    const dateStr = format(chosenDate, "MM/dd/yyyy");
    onCreate({
      session_type: sessionType,
      load_type: finalLoadType,
      has_temperature: hasTemperature,
      driver_id: profile?.driver_id || profile?.company_id || "",
      truck_number: truckNumber || profile?.truck_number || "",
      order_number: orderNumber,
      bol_number: bolNumber,
      initial_date: dateStr,
    });
    reset();
  };

  const next = () => setStep((s) => s + 1);
  const back = () => setStep((s) => Math.max(1, s - 1));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Dialog open={open}>
      <DialogContent
        data-testid="session-wizard"
        className="max-w-lg bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md"
        hideClose
      >
        <DialogTitle className="sr-only">Start a new trip</DialogTitle>
        <DialogDescription className="sr-only">
          Three-step wizard to start a new trip session.
        </DialogDescription>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold">
          <span>Start New Trip</span>
          <span className="text-[var(--tm-text-muted)]">· Step {step} / 3</span>
        </div>

        {step === 1 && (
          <div className="space-y-4 mt-2">
            <h2 className="text-2xl font-black tracking-tight">When is this trip?</h2>
            <div className="grid grid-cols-3 gap-2">
              {["Previous", "New", "Future"].map((t) => (
                <button
                  key={t}
                  data-testid={`session-type-${t.toLowerCase()}`}
                  onClick={() => { setSessionType(t); if (t === "New") setChosenDate(new Date()); }}
                  className={`h-20 rounded-md border text-sm font-bold uppercase tracking-wider transition-colors ${
                    sessionType === t
                      ? "bg-[var(--tm-orange)] border-[var(--tm-orange)] text-white"
                      : "bg-white border-[var(--tm-border)] text-[var(--tm-text-soft)] hover:border-[var(--tm-blue)]"
                  }`}
                >{t}</button>
              ))}
            </div>

            {sessionType && sessionType !== "New" && (
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider text-[var(--tm-text-soft)]">Select Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button data-testid="session-date-btn" variant="outline"
                      className="w-full h-12 justify-start bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md hover:bg-[var(--tm-surface-2)]">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(chosenDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]" align="start">
                    <Calendar mode="single" selected={chosenDate}
                      onSelect={(d) => d && setChosenDate(d)}
                      disabled={(d) => sessionType === "Previous" ? d > today : d < today}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={onCancel}
                className="h-12 rounded-md bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface-2)]">Cancel</Button>
              <Button data-testid="wizard-next-1" disabled={!sessionType} onClick={next}
                className="flex-1 h-12 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold">
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 mt-2">
            <h2 className="text-2xl font-black tracking-tight">Load Type</h2>
            <div className="grid grid-cols-2 gap-2">
              {["Store", "Warehouse"].map((t) => (
                <button
                  key={t}
                  data-testid={`load-type-${t.toLowerCase()}`}
                  onClick={() => { setLoadType(t); setSubType(""); }}
                  className={`h-20 rounded-md border text-sm font-bold uppercase tracking-wider transition-colors ${
                    loadType === t
                      ? "bg-[var(--tm-orange)] border-[var(--tm-orange)] text-white"
                      : "bg-white border-[var(--tm-border)] text-[var(--tm-text-soft)] hover:border-[var(--tm-blue)]"
                  }`}
                >{t}</button>
              ))}
            </div>

            {loadType === "Warehouse" && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-[var(--tm-text-soft)]">Dairy or Water?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {["Dairy", "Water"].map((t) => (
                    <button
                      key={t}
                      data-testid={`subtype-${t.toLowerCase()}`}
                      onClick={() => setSubType(t)}
                      className={`h-16 rounded-md border text-sm font-bold uppercase tracking-wider transition-colors ${
                        subType === t
                          ? "bg-[var(--tm-orange)] border-[var(--tm-orange)] text-white"
                          : "bg-white border-[var(--tm-border)] text-[var(--tm-text-soft)] hover:border-[var(--tm-blue)]"
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={back}
                className="h-12 rounded-md bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface-2)]">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button data-testid="wizard-next-2"
                disabled={!loadType || (loadType === "Warehouse" && !subType)}
                onClick={next}
                className="flex-1 h-12 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold">
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 mt-2">
            <h2 className="text-2xl font-black tracking-tight">Trip Details</h2>
            <div className="space-y-3">
              <div className="p-3 bg-white border border-[var(--tm-border)] rounded-md">
                <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] mb-1">Driver / Company ID (from profile)</div>
                <div data-testid="wizard-driverid" className="font-bold">{profile?.driver_id || profile?.company_id || "—"}</div>
              </div>

              {profile?.truck_assignment_type === "Slip Seat" && (
                <div>
                  <Label className="text-xs uppercase tracking-wider text-[var(--tm-text-soft)]">Truck # (Slip Seat) *</Label>
                  <Input data-testid="wizard-truck" value={truckNumber} onChange={(e) => setTruckNumber(e.target.value)}
                    className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md mt-1.5" />
                </div>
              )}

              <div>
                <Label className="text-xs uppercase tracking-wider text-[var(--tm-text-soft)]">Order # *</Label>
                <Input data-testid="wizard-order" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)}
                  className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md mt-1.5" />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-[var(--tm-text-soft)]">BOL # (optional)</Label>
                <Input data-testid="wizard-bol" value={bolNumber} onChange={(e) => setBolNumber(e.target.value)}
                  className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md mt-1.5" />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={back}
                className="h-12 rounded-md bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface-2)]">
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button data-testid="wizard-create-btn" onClick={handleSubmit}
                className="flex-1 h-12 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold">
                Start Trip
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
