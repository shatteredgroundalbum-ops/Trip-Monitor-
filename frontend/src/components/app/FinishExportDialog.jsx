import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import PaperSheet from "./PaperSheet";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Image, FileText, Mail } from "lucide-react";

export default function FinishExportDialog({ open, onOpenChange, session, profile }) {
  const [doJpeg, setDoJpeg] = useState(true);
  const [doPdf, setDoPdf] = useState(true);
  const [doEmail, setDoEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const paperRef = useRef(null);

  const baseName = `RTI_TripSheet_${session.order_number || "NO-ORDER"}_${(profile?.full_name || "driver").replace(/\s+/g, "_")}`;

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
    await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob, `${baseName}.jpg`);
        resolve();
      }, "image/jpeg", 0.95);
    });
  };

  const exportPdf = async () => {
    const canvas = await captureCanvas();
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    // Letter portrait
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

  const sendEmail = () => {
    const subject = `RTI Trip Sheet — ${profile?.full_name || ""} — ${new Date().toLocaleDateString()} — Order #${session.order_number}`;
    const body = `Hello,%0D%0A%0D%0APlease find attached the RTI Trip Sheet.%0D%0A%0D%0A` +
      `Driver: ${profile?.full_name || ""}%0D%0A` +
      `Driver ID: ${session.driver_id}%0D%0A` +
      `Tractor #: ${session.truck_number || ""}%0D%0A` +
      `Order #: ${session.order_number}%0D%0A` +
      `BOL #: ${session.bol_number}%0D%0A%0D%0A` +
      `Note: please attach the JPEG or PDF saved to your device.%0D%0A%0D%0AThanks.`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
  };

  const handleFinish = async () => {
    if (!doJpeg && !doPdf && !doEmail) {
      toast.error("Pick at least one export option");
      return;
    }
    setBusy(true);
    try {
      if (doJpeg) await exportJpeg();
      if (doPdf) await exportPdf();
      if (doEmail) sendEmail();
      await api.post(`/trip-sessions/${session.session_id}/finish`);
      toast.success("Trip sheet exported and finished");
      onOpenChange(false);
      // reload to clear active session
      setTimeout(() => window.location.reload(), 300);
    } catch (e) {
      toast.error("Export failed: " + (e?.message || "unknown"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="finish-dialog" className="max-w-lg bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">
        <DialogHeader>
          <DialogTitle className="text-[var(--tm-navy)]">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold block mb-2">
              Finish &amp; Export
            </span>
            <span className="text-2xl font-black tracking-tight">Send your trip sheet</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Option icon={<Image className="h-5 w-5" />} label="Save as JPEG"
            description="Downloads to your photo gallery"
            checked={doJpeg} onCheckedChange={setDoJpeg} testId="export-jpeg" />
          <Option icon={<FileText className="h-5 w-5" />} label="Export as PDF"
            description="Saves a PDF identical to the paper form"
            checked={doPdf} onCheckedChange={setDoPdf} testId="export-pdf" />
          <Option icon={<Mail className="h-5 w-5" />} label="Email"
            description="Opens your mail app with subject & body prefilled — attach the saved file"
            checked={doEmail} onCheckedChange={setDoEmail} testId="export-email" />
        </div>

        <Button data-testid="finish-export-btn" onClick={handleFinish} disabled={busy}
          className="w-full h-14 mt-4 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md">
          {busy ? "Exporting..." : "Finish & Export"}
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
