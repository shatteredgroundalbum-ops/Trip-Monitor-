import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import PaperSheet from "./PaperSheet";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Image, FileText, Mail, Loader2 } from "lucide-react";

export default function FinishExportDialog({ open, onOpenChange, session, profile }) {
  const [doJpeg, setDoJpeg] = useState(true);
  const [doPdf, setDoPdf] = useState(true);
  const [doEmail, setDoEmail] = useState(false);
  const [recipient, setRecipient] = useState(profile?.dispatcher_email || "");
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState("");
  const paperRef = useRef(null);

  const baseName = `TripSheet_${session.order_number || "NO-ORDER"}_${(profile?.full_name || "driver").replace(/\s+/g, "_")}`;

  const captureCanvas = async () => {
    const el = paperRef.current;
    if (!el) throw new Error("Paper sheet not ready");
    return await html2canvas(el, { backgroundColor: "#FFFFFF", scale: 2, useCORS: true });
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportJpeg = async () => {
    const canvas = await captureCanvas();
    return await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${baseName}.jpg`);
        resolve(blob);
      }, "image/jpeg", 0.95);
    });
  };

  const exportPdf = async () => {
    const canvas = await captureCanvas();
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    let w = pageW - 40;
    let h = w / ratio;
    if (h > pageH - 40) { h = pageH - 40; w = h * ratio; }
    pdf.addImage(imgData, "JPEG", (pageW - w) / 2, 20, w, h);
    pdf.save(`${baseName}.pdf`);
  };

  const openMailApp = () => {
    const subject = `Trip Sheet — ${profile?.full_name || ""} — ${new Date().toLocaleDateString()} — Order #${session.order_number}`;
    const lines = [
      "Hello,",
      "",
      "Please find the trip sheet attached.",
      "",
      `Driver: ${profile?.full_name || ""}`,
      `Driver ID: ${session.driver_id || ""}`,
      `Tractor #: ${session.truck_number || ""}`,
      `Order #: ${session.order_number || ""}`,
      `BOL #: ${session.bol_number || ""}`,
      "",
      "Note: please attach the JPEG or PDF saved to your device.",
      "",
      "Thanks,",
      profile?.full_name || "",
    ];
    const body = lines.join("\r\n");
    const to = recipient ? encodeURIComponent(recipient) : "";
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleFinish = async () => {
    if (!doJpeg && !doPdf && !doEmail) {
      toast.error("Pick at least one export option");
      return;
    }
    setBusy(true);
    try {
      if (doJpeg) {
        setBusyStep("Generating JPEG...");
        toast.loading("Saving JPEG to your device...", { id: "exp" });
        await exportJpeg();
      }
      if (doPdf) {
        setBusyStep("Generating PDF...");
        toast.loading("Saving PDF to your device...", { id: "exp" });
        await exportPdf();
      }
      if (doEmail) {
        setBusyStep("Opening mail app...");
        toast.loading("Opening your mail app...", { id: "exp" });
        // tiny delay so the user sees the toast before app switch
        await new Promise((r) => setTimeout(r, 250));
        openMailApp();
      }
      try { await api.post(`/trip-sessions/${session.session_id}/finish`); } catch { /* ignore */ }
      toast.success("Trip sheet exported & finished", { id: "exp" });
      onOpenChange(false);
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error("Export failed: " + (e?.message || "unknown"), { id: "exp" });
    } finally {
      setBusy(false);
      setBusyStep("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent data-testid="finish-dialog" className="max-w-lg bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--tm-navy)]">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold block mb-2">
              Finish &amp; Export
            </span>
            <span className="text-2xl font-black tracking-tight">Send your trip sheet</span>
          </DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)]">
            Pick one or more options. Email opens your device&apos;s mail app with the message pre-filled — attach the JPEG or PDF before sending.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Option icon={<Image className="h-5 w-5" />} label="Save as JPEG"
            description="Downloads the trip sheet image to your device"
            checked={doJpeg} onCheckedChange={setDoJpeg} testId="export-jpeg" />
          <Option icon={<FileText className="h-5 w-5" />} label="Export as PDF"
            description="Letter-size PDF identical to the paper form"
            checked={doPdf} onCheckedChange={setDoPdf} testId="export-pdf" />
          <Option icon={<Mail className="h-5 w-5" />} label="Open email app"
            description="Opens your mail app with subject and body pre-filled"
            checked={doEmail} onCheckedChange={setDoEmail} testId="export-email" />

          {doEmail && (
            <div data-testid="email-recipient-row" className="pl-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-soft)] mb-1">Recipient (optional pre-fill)</div>
              <Input
                data-testid="email-recipient-input"
                type="email"
                placeholder="dispatcher@example.com"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] h-12 rounded-md"
              />
              {profile?.dispatcher_email && recipient !== profile.dispatcher_email && (
                <button
                  type="button"
                  onClick={() => setRecipient(profile.dispatcher_email)}
                  className="text-xs text-[var(--tm-blue)] mt-1 underline"
                >
                  Use saved dispatcher: {profile.dispatcher_email}
                </button>
              )}
            </div>
          )}
        </div>

        <Button data-testid="finish-export-btn" onClick={handleFinish} disabled={busy}
          className="w-full h-14 mt-4 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md disabled:opacity-90">
          {busy ? (
            <span className="inline-flex items-center gap-2" data-testid="export-busy-label">
              <Loader2 className="h-4 w-4 animate-spin" />
              {busyStep || "Working..."}
            </span>
          ) : (
            "Finish & Export"
          )}
        </Button>

        {/* Hidden render target for html2canvas */}
        <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
          <PaperSheet ref={paperRef} session={session} profile={profile} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Option({ icon, label, description, checked, onCheckedChange, testId }) {
  return (
    <label
      className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-colors ${
        checked ? "bg-[var(--tm-surface)] border-[var(--tm-orange)]" : "bg-white border-[var(--tm-border)] hover:border-[var(--tm-blue)]"
      }`}
    >
      <Checkbox data-testid={testId} checked={checked} onCheckedChange={onCheckedChange}
        className="mt-0.5 border-[var(--tm-border)] data-[state=checked]:bg-[var(--tm-orange)] data-[state=checked]:border-[var(--tm-orange)]" />
      <div className="flex-1">
        <div className="flex items-center gap-2 font-bold text-[var(--tm-navy)]">
          <span className="text-[var(--tm-orange)]">{icon}</span>
          {label}
        </div>
        <div className="text-xs text-[var(--tm-text-soft)] mt-1">{description}</div>
      </div>
    </label>
  );
}
