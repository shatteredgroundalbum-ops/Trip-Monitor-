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
import { Image, FileText, Mail } from "lucide-react";

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result || "";
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export default function FinishExportDialog({ open, onOpenChange, session, profile }) {
  const [doJpeg, setDoJpeg] = useState(true);
  const [doPdf, setDoPdf] = useState(true);
  const [doEmail, setDoEmail] = useState(false);
  const [recipient, setRecipient] = useState(profile?.dispatcher_email || "");
  const [busy, setBusy] = useState(false);
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

  const buildJpeg = async () => {
    const canvas = await captureCanvas();
    return await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.95);
    });
  };

  const buildPdfBlob = async () => {
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
    return pdf.output("blob");
  };

  const buildEmailHtml = () => `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0E1F47;font-size:14px;line-height:1.5">
      <p>Hello,</p>
      <p>Please find attached the trip sheet for Order #${session.order_number}.</p>
      <table style="border-collapse:collapse;font-size:13px">
        <tr><td style="padding:2px 8px"><b>Driver:</b></td><td style="padding:2px 8px">${profile?.full_name || ""}</td></tr>
        <tr><td style="padding:2px 8px"><b>Driver ID:</b></td><td style="padding:2px 8px">${session.driver_id || ""}</td></tr>
        <tr><td style="padding:2px 8px"><b>Tractor #:</b></td><td style="padding:2px 8px">${session.truck_number || ""}</td></tr>
        <tr><td style="padding:2px 8px"><b>Order #:</b></td><td style="padding:2px 8px">${session.order_number || ""}</td></tr>
        <tr><td style="padding:2px 8px"><b>BOL #:</b></td><td style="padding:2px 8px">${session.bol_number || ""}</td></tr>
      </table>
      <p style="color:#7B8AA8;font-size:12px;margin-top:24px">Sent automatically by Trip Monitor — Driver Edition.</p>
    </div>
  `;

  const handleFinish = async () => {
    if (!doJpeg && !doPdf && !doEmail) {
      toast.error("Pick at least one export option");
      return;
    }
    if (doEmail && !recipient) {
      toast.error("Enter a recipient email");
      return;
    }
    setBusy(true);
    try {
      let jpegBlob = null;
      let pdfBlob = null;

      if (doJpeg || doEmail) jpegBlob = await buildJpeg();
      if (doPdf || doEmail) pdfBlob = await buildPdfBlob();

      if (doJpeg && jpegBlob) downloadBlob(jpegBlob, `${baseName}.jpg`);
      if (doPdf && pdfBlob) downloadBlob(pdfBlob, `${baseName}.pdf`);

      if (doEmail) {
        const attachments = [];
        if (pdfBlob) {
          attachments.push({
            filename: `${baseName}.pdf`,
            content_b64: await blobToBase64(pdfBlob),
            content_type: "application/pdf",
          });
        }
        if (jpegBlob) {
          attachments.push({
            filename: `${baseName}.jpg`,
            content_b64: await blobToBase64(jpegBlob),
            content_type: "image/jpeg",
          });
        }
        const subject = `Trip Sheet — ${profile?.full_name || ""} — ${new Date().toLocaleDateString()} — Order #${session.order_number}`;
        try {
          await api.post("/email/send-trip-sheet", {
            recipient,
            subject,
            html_body: buildEmailHtml(),
            attachments,
          });
          toast.success(`Emailed to ${recipient}`);
        } catch (err) {
          const msg = err?.response?.data?.detail;
          toast.error(typeof msg === "string" ? msg : "Email failed — check provider settings");
        }
      }

      await api.post(`/trip-sessions/${session.session_id}/finish`);
      toast.success("Trip sheet finished");
      onOpenChange(false);
      setTimeout(() => window.location.reload(), 400);
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
          <DialogDescription className="text-[var(--tm-text-soft)]">
            Pick one or more export formats. Email sends with the JPEG and PDF auto-attached.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Option icon={<Image className="h-5 w-5" />} label="Save as JPEG"
            description="Downloads to your device"
            checked={doJpeg} onCheckedChange={setDoJpeg} testId="export-jpeg" />
          <Option icon={<FileText className="h-5 w-5" />} label="Export as PDF"
            description="Letter-size PDF identical to the paper form"
            checked={doPdf} onCheckedChange={setDoPdf} testId="export-pdf" />
          <Option icon={<Mail className="h-5 w-5" />} label="Email with attachment"
            description="Auto-attaches the JPEG and PDF — no manual attaching"
            checked={doEmail} onCheckedChange={setDoEmail} testId="export-email" />

          {doEmail && (
            <div data-testid="email-recipient-row" className="pl-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-soft)] mb-1">Recipient email</div>
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
