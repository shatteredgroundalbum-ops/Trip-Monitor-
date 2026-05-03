import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import DynamicPaperSheet from "./DynamicPaperSheet";
import TripRecap from "./TripRecap";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { api } from "../../lib/api";
import { Image, FileText, Mail, Loader2, Printer, Table as TableIcon, Database } from "lucide-react";
import { writeFileToDestination, getDestinationConfig } from "../../lib/storage-location";
import { buildTripCsvBlob, buildTripBackupBlob, safeBaseName } from "../../lib/export-pipeline";

export default function FinishExportDialog({ open, onOpenChange, session, profile, template }) {
  const [doJpeg, setDoJpeg] = useState(true);
  const [doPdf, setDoPdf] = useState(true);
  const [doCsv, setDoCsv] = useState(false);
  const [doBackup, setDoBackup] = useState(false);
  const [doPrint, setDoPrint] = useState(false);
  const [doEmail, setDoEmail] = useState(false);
  const [recipient, setRecipient] = useState(profile?.dispatcher_email || "");
  const [busy, setBusy] = useState(false);
  const [busyStep, setBusyStep] = useState("");
  const [progress, setProgress] = useState(0);
  const [recapSessionId, setRecapSessionId] = useState(null);
  const [destination, setDestination] = useState({ mode: "app", folder_name: "" });
  const paperRef = useRef(null);

  const baseName = safeBaseName(session, profile);

  React.useEffect(() => {
    if (!open) return;
    getDestinationConfig().then(setDestination);
  }, [open]);

  /** Animate progress smoothly toward target over duration ms. Returns when done. */
  const animateTo = (start, end, durationMs) =>
    new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - startedAt) / durationMs);
        setProgress(Math.round(start + (end - start) * t));
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

  const captureCanvas = async () => {
    const el = paperRef.current;
    if (!el) throw new Error("Paper sheet not ready");
    return await html2canvas(el, { backgroundColor: "#FFFFFF", scale: 2, useCORS: true });
  };

  const downloadBlob = async (blob, filename) => {
    return await writeFileToDestination(filename, blob);
  };

  /**
   * Run a phase: animate the bar from `fromPct` toward `toPct` while the work runs.
   * The animation always finishes its full sweep BEFORE returning, so the user
   * sees the bar actually fill the segment instead of jumping.
   */
  const runPhase = async (label, work, fromPct, toPct, animateMs = 1500) => {
    setBusyStep(label);
    const animPromise = animateTo(fromPct, toPct, animateMs);
    const result = await work();
    await animPromise; // wait for animation to actually reach toPct
    return result;
  };

  const exportJpegPhase = (fromPct, toPct) =>
    runPhase("Saving JPEG...", async () => {
      const canvas = await captureCanvas();
      const blob = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.95));
      if (blob) await downloadBlob(blob, `${baseName}.jpg`);
      return blob;
    }, fromPct, toPct, 1600);

  const exportPdfPhase = (fromPct, toPct) =>
    runPhase("Saving PDF...", async () => {
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
      const blob = pdf.output("blob");
      await downloadBlob(blob, `${baseName}.pdf`);
    }, fromPct, toPct, 1900);

  const exportCsvPhase = (fromPct, toPct) =>
    runPhase("Saving CSV...", async () => {
      const blob = buildTripCsvBlob(session, profile);
      await downloadBlob(blob, `${baseName}.csv`);
    }, fromPct, toPct, 800);

  const exportBackupPhase = (fromPct, toPct) =>
    runPhase("Saving backup...", async () => {
      const blob = buildTripBackupBlob({ session, profile, template });
      await downloadBlob(blob, `${baseName}.backup.json`);
    }, fromPct, toPct, 800);

  /** Open the OS print dialog with the paper sheet rendered as a printable page. */
  const printPhase = (fromPct, toPct) =>
    runPhase("Opening print dialog...", async () => {
      const canvas = await captureCanvas();
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const printWin = window.open("", "_blank", "width=900,height=1200");
      if (!printWin) {
        toast.error("Pop-up blocked — allow pop-ups to print");
        return;
      }
      printWin.document.open();
      printWin.document.write(`<!doctype html><html><head><title>${baseName}</title>
<style>
  @page { size: letter portrait; margin: 0.4in; }
  html, body { margin: 0; padding: 0; background: #fff; }
  img { width: 100%; height: auto; display: block; }
</style></head><body>
<img src="${imgData}" alt="Trip Sheet" />
<script>
  window.onload = () => { setTimeout(() => { window.focus(); window.print(); }, 250); };
</script>
</body></html>`);
      printWin.document.close();
    }, fromPct, toPct, 1200);

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
    if (!doJpeg && !doPdf && !doCsv && !doBackup && !doPrint && !doEmail) {
      toast.error("Pick at least one export option");
      return;
    }
    const miles = Number(session?.total_trip_miles || 0);
    if (!miles || miles <= 0) {
      toast.error("Enter the round-trip total miles before finishing");
      onOpenChange(false);
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const phases = [];
      if (doJpeg) phases.push("jpeg");
      if (doPdf) phases.push("pdf");
      if (doCsv) phases.push("csv");
      if (doBackup) phases.push("backup");
      if (doPrint) phases.push("print");
      if (doEmail) phases.push("email");
      // Reserve last 5% for the "Finishing trip..." finalization animation
      const slice = Math.floor(95 / phases.length);
      let cursor = 0;
      for (const phase of phases) {
        const from = cursor;
        const to = cursor + slice;
        if (phase === "jpeg") await exportJpegPhase(from, to);
        else if (phase === "pdf") await exportPdfPhase(from, to);
        else if (phase === "csv") await exportCsvPhase(from, to);
        else if (phase === "backup") await exportBackupPhase(from, to);
        else if (phase === "print") await printPhase(from, to);
        else if (phase === "email") {
          await runPhase("Opening mail app...", async () => {
            await new Promise((r) => setTimeout(r, 250));
            openMailApp();
          }, from, to, 800);
        }
        cursor = to;
      }
      // Final settle animation 95 → 100 — driver sees the bar reach the end.
      await runPhase("Finishing trip...", async () => {
        try { await api.post(`/trip-sessions/${session.session_id}/finish`); } catch { /* ignore */ }
      }, cursor, 100, 700);
      // Hold the 100% complete bar visibly for 600ms before closing.
      await new Promise((r) => setTimeout(r, 600));
      toast.success("Trip sheet exported & finished");
      const finishedSessionId = session.session_id;
      onOpenChange(false);
      // Pop the internal Trip Recap so the driver sees miles + milestone progress.
      setTimeout(() => setRecapSessionId(finishedSessionId), 250);
    } catch (e) {
      toast.error("Export failed: " + (e?.message || "unknown"));
    } finally {
      setBusy(false);
      setBusyStep("");
      setProgress(0);
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
            Pick one or more options. Each runs in order, with a progress bar so you can see what&apos;s happening.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div data-testid="export-destination-chip" className="flex items-center justify-between text-[11px] uppercase tracking-wider font-bold bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md px-3 py-2">
            <span className="text-[var(--tm-text-muted)]">Saving to</span>
            <span className="text-[var(--tm-navy)] truncate ml-2 max-w-[60%]" title={destination.folder_name || "In-app"}>
              {destination.mode === "app"
                ? "Browser downloads / in-app"
                : (destination.folder_name || destination.mode)}
            </span>
          </div>
          <Option icon={<Image className="h-5 w-5" />} label="Save as JPEG"
            description="Image of the trip sheet"
            checked={doJpeg} onCheckedChange={setDoJpeg} testId="export-jpeg" disabled={busy} />
          <Option icon={<FileText className="h-5 w-5" />} label="Export as PDF"
            description="Letter-size PDF identical to the paper form"
            checked={doPdf} onCheckedChange={setDoPdf} testId="export-pdf" disabled={busy} />
          <Option icon={<TableIcon className="h-5 w-5" />} label="Save as CSV"
            description="Spreadsheet with one row per stop + trip metadata"
            checked={doCsv} onCheckedChange={setDoCsv} testId="export-csv" disabled={busy} />
          <Option icon={<Database className="h-5 w-5" />} label="Structured backup (JSON)"
            description="Full trip + template — re-importable by future versions"
            checked={doBackup} onCheckedChange={setDoBackup} testId="export-backup" disabled={busy} />
          <Option icon={<Printer className="h-5 w-5" />} label="Print"
            description="Opens your device&apos;s print dialog (network or attached printer)"
            checked={doPrint} onCheckedChange={setDoPrint} testId="export-print" disabled={busy} />
          <Option icon={<Mail className="h-5 w-5" />} label="Open email app"
            description="Opens your mail app with subject and body pre-filled"
            checked={doEmail} onCheckedChange={setDoEmail} testId="export-email" disabled={busy} />

          {doEmail && (
            <div data-testid="email-recipient-row" className="pl-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-soft)] mb-1">Recipient (optional pre-fill)</div>
              <Input
                data-testid="email-recipient-input"
                type="email"
                placeholder="dispatcher@example.com"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={busy}
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

        {busy && (
          <div data-testid="export-progress" className="mt-3 space-y-2" aria-live="polite">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-2 text-[var(--tm-navy)] font-bold">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--tm-blue)]" />
                {busyStep || "Working..."}
              </span>
              <span data-testid="export-progress-pct" className="font-mono text-[var(--tm-text-soft)] tabular-nums">
                {progress}%
              </span>
            </div>
            <div className="h-2 w-full bg-[var(--tm-surface-2)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--tm-blue)] transition-[width] duration-150 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <Button data-testid="finish-export-btn" onClick={handleFinish} disabled={busy}
          className="w-full h-14 mt-4 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md disabled:opacity-90">
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress}% — {busyStep || "Working..."}
            </span>
          ) : (
            "Finish & Export"
          )}
        </Button>

        {/* Hidden render target for html2canvas */}
        <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden>
          <DynamicPaperSheet ref={paperRef} session={session} profile={profile} template={template} />
        </div>
      </DialogContent>

      <TripRecap
        sessionId={recapSessionId}
        open={!!recapSessionId}
        onClose={() => {
          setRecapSessionId(null);
          // Refresh dashboard data after the driver sees their recap.
          setTimeout(() => window.location.reload(), 200);
        }}
      />
    </Dialog>
  );
}

function Option({ icon, label, description, checked, onCheckedChange, testId, disabled }) {
  return (
    <label
      className={`flex items-start gap-3 p-4 rounded-md border transition-colors ${
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
      } ${
        checked ? "bg-[var(--tm-surface)] border-[var(--tm-orange)]" : "bg-white border-[var(--tm-border)] hover:border-[var(--tm-blue)]"
      }`}
    >
      <Checkbox data-testid={testId} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}
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
