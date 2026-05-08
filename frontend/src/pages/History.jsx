import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { ArrowLeft, Eye, Edit3, FileText, Image as ImageIcon, Mail, Truck, Printer, Download, Archive, CheckSquare, Square, Upload } from "lucide-react";
import PaperSheet from "../components/app/PaperSheet";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { buildBulkExportZip, downloadBlob } from "../lib/bulk-export";
import { getActiveTemplate } from "../lib/template-store";
import { writeFileToDestination, getStorageUsage, isAboveQuotaWarning } from "../lib/storage-location";
import { validateBackup, importBackup, parseBackupFile } from "../lib/import-backup";

export default function History() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [reopening, setReopening] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkExporting, setBulkExporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [showArchive, setShowArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const paperRef = useRef(null);

  useEffect(() => {
    if (!loading && !user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  const refresh = async () => {
    setBusy(true);
    try {
      const [p, s] = await Promise.all([api.get("/profile"), api.get("/trip-sessions")]);
      setProfile(p.data);
      setSessions(s.data || []);
    } finally { setBusy(false); }
  };

  useEffect(() => { if (user) refresh(); }, [user]);

  const finishedSessions = sessions.filter((s) => s.status === "finished");
  const activeSession = sessions.find((s) => s.status === "active");

  // Storage warning for auto-archive
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    if (user && finishedSessions.length > 0) {
      getStorageUsage().then((u) => {
        setStorageWarning(isAboveQuotaWarning(u));
      }).catch(() => {});
    }
  }, [user, finishedSessions.length]);

  // ── Multi-select ──
  const toggleSelect = (sessionId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === finishedSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(finishedSessions.map((s) => s.session_id)));
    }
  };

  // ── Bulk export ──
  const handleBulkExport = async () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one trip to export");
      return;
    }
    setBulkExporting(true);
    setBulkProgress(0);
    try {
      const trips = finishedSessions.filter((s) => selectedIds.has(s.session_id));
      const blob = await buildBulkExportZip(trips, profile, () => getActiveTemplate(), (pct) => setBulkProgress(pct));
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `TripMonitor_Export_${dateStr}.zip`;
      try { await writeFileToDestination(filename, blob); } catch { /* fallback below */ }
      downloadBlob(blob, filename);
      toast.success(`Exported ${trips.length} trip${trips.length === 1 ? "" : "s"} as ZIP`);
    } catch (err) {
      console.error("Bulk export failed:", err);
      toast.error("Bulk export failed");
    } finally {
      setBulkExporting(false);
      setBulkProgress(0);
    }
  };

  // ── Auto-archive ──
  const handleArchive = async () => {
    if (finishedSessions.length === 0) return;
    setArchiving(true);
    setBulkProgress(0);
    try {
      const blob = await buildBulkExportZip(finishedSessions, profile, () => getActiveTemplate(), (pct) => setBulkProgress(pct));
      const dateStr = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `TripMonitor_Archive_${dateStr}.zip`);

      for (const trip of finishedSessions) {
        try { await api.delete(`/trip-sessions/${trip.session_id}`); } catch (err) {
          console.warn(`Failed to delete trip ${trip.session_id}:`, err);
        }
      }
      toast.success(`Archived ${finishedSessions.length} trip${finishedSessions.length === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      setShowArchive(false);
      setStorageWarning(false);
      await refresh();
    } catch (err) {
      console.error("Archive failed:", err);
      toast.error("Archive failed — your trips are still safe");
    } finally {
      setArchiving(false);
      setBulkProgress(0);
    }
  };

  // ── Import backup ──
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await parseBackupFile(file);
      const validation = validateBackup(data);
      if (!validation.ok) {
        toast.error(`Invalid backup: ${validation.errors.join("; ")}`);
        return;
      }
      const result = await importBackup(data, { overwrite: false });
      if (result.skipped.length > 0) {
        toast.warning(`Imported with warnings: ${result.skipped.join("; ")}`);
      } else {
        const count = [result.session, result.profile, result.template].filter(Boolean).length;
        toast.success(`Restored ${count} item${count === 1 ? "" : "s"} from backup`);
      }
      setShowImport(false);
      await refresh();
    } catch (err) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Re-open ──
  const reopen = async (sessionId) => {
    try {
      await api.post(`/trip-sessions/${sessionId}/reopen`);
      toast.success("Trip re-opened for editing");
      navigate("/dashboard");
    } catch {
      toast.error("Could not reopen trip");
    }
  };

  // ── Single-trip export ──
  const captureCanvas = async () => {
    const el = paperRef.current;
    if (!el) throw new Error("Paper not ready");
    return await html2canvas(el, { backgroundColor: "#FFFFFF", scale: 2, useCORS: true });
  };

  const exportFile = async (kind) => {
    if (!viewing) return;
    const baseName = `TripSheet_${viewing.order_number || "NO-ORDER"}_${(profile?.full_name || "driver").replace(/\s+/g, "_")}`;
    try {
      if (kind === "jpeg") {
        toast.loading("Saving JPEG...", { id: "h-exp" });
        const canvas = await captureCanvas();
        await new Promise((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a"); a.href = url; a.download = `${baseName}.jpg`; a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
            resolve();
          }, "image/jpeg", 0.95);
        });
        toast.success("JPEG saved", { id: "h-exp" });
      } else if (kind === "pdf") {
        toast.loading("Saving PDF...", { id: "h-exp" });
        const canvas = await captureCanvas();
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const ratio = canvas.width / canvas.height;
        let w = pageW - 40; let h = w / ratio;
        if (h > pageH - 40) { h = pageH - 40; w = h * ratio; }
        pdf.addImage(imgData, "JPEG", (pageW - w) / 2, 20, w, h);
        pdf.save(`${baseName}.pdf`);
        toast.success("PDF saved", { id: "h-exp" });
      } else if (kind === "print") {
        toast.loading("Opening print dialog...", { id: "h-exp" });
        const canvas = await captureCanvas();
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const printWin = window.open("", "_blank", "width=900,height=1200");
        if (!printWin) { toast.error("Pop-up blocked", { id: "h-exp" }); return; }
        printWin.document.open();
        printWin.document.write(`<!doctype html><html><head><title>${baseName}</title>
<style>@page{size:letter portrait;margin:.4in}html,body{margin:0;padding:0;background:#fff}img{width:100%;height:auto;display:block}</style></head><body>
<img src="${imgData}" alt="Trip Sheet" />
<script>window.onload=()=>{setTimeout(()=>{window.focus();window.print()},250)}</script>
</body></html>`);
        printWin.document.close();
        toast.success("Print dialog opened", { id: "h-exp" });
      } else if (kind === "email") {
        const subject = `Trip Sheet — ${profile?.full_name || ""} — ${formatDate(viewing.finished_at || viewing.created_at)} — Order #${viewing.order_number}`;
        const lines = ["Hello,", "", "Please find the trip sheet attached.", "",
          `Driver: ${profile?.full_name || ""}`, `Order #: ${viewing.order_number || ""}`,
          `BOL #: ${viewing.bol_number || ""}`, "",
          "Note: please attach the JPEG or PDF saved to your device.", "",
          "Thanks,", profile?.full_name || ""];
        const body = lines.join("\r\n");
        const to = profile?.dispatcher_email ? encodeURIComponent(profile.dispatcher_email) : "";
        toast.loading("Opening your mail app...", { id: "h-exp" });
        await new Promise((r) => setTimeout(r, 200));
        window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        toast.success("Mail app opened", { id: "h-exp" });
      }
    } catch {
      toast.error("Export failed", { id: "h-exp" });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-[var(--tm-navy)] flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.3em] text-[var(--tm-text-muted)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[var(--tm-navy)]">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[var(--tm-border)]">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Button data-testid="back-to-dashboard-btn" variant="outline" size="sm"
            onClick={() => navigate("/dashboard")}
            className="h-9 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
          </Button>
          <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold">History</span>
        </div>
      </header>

      {/* Storage warning banner */}
      {storageWarning && (
        <div data-testid="archive-warning-banner"
          className="max-w-4xl mx-auto px-4 md:px-6 mt-4 p-3 bg-orange-50 border border-orange-200 rounded-md flex items-center gap-3">
          <Archive className="h-5 w-5 text-orange-500 shrink-0" />
          <div className="flex-1 text-sm text-orange-800">
            Storage is above 90%. Archive your oldest trips to free up space?
          </div>
          <Button data-testid="archive-open-btn" size="sm"
            onClick={() => setShowArchive(true)}
            className="h-8 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-md shrink-0">
            Archive
          </Button>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 pb-12">
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold mb-1">Archive</div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[var(--tm-navy)]">Trip History</h1>
          <p className="text-sm text-[var(--tm-text-soft)] mt-1">
            {finishedSessions.length} finished {finishedSessions.length === 1 ? "trip" : "trips"} · view, re-export, or re-open
          </p>
        </div>

        {/* Bulk action bar */}
        {finishedSessions.length > 0 && (
          <div data-testid="bulk-action-bar"
            className="mb-4 flex flex-wrap items-center gap-3 p-3 bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md">
            <button data-testid="select-all-toggle" onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-sm text-[var(--tm-navy)] hover:text-[var(--tm-blue)] transition-colors cursor-pointer"
              aria-label={selectedIds.size === finishedSessions.length ? "Deselect all trips" : "Select all trips"}>
              {selectedIds.size === finishedSessions.length
                ? <CheckSquare className="h-4 w-4 text-[var(--tm-blue)]" />
                : <Square className="h-4 w-4" />}
              <span className="font-medium">{selectedIds.size === finishedSessions.length ? "Deselect all" : "Select all"}</span>
            </button>
            {selectedIds.size > 0 && (
              <span data-testid="selected-count" className="text-sm text-[var(--tm-text-soft)]">
                {selectedIds.size} selected
              </span>
            )}
            <Button data-testid="bulk-export-btn" size="sm"
              disabled={selectedIds.size === 0 || bulkExporting}
              onClick={handleBulkExport}
              className="h-8 bg-[var(--tm-blue)] hover:bg-blue-700 text-white font-bold rounded-md disabled:opacity-50">
              <Download className="h-4 w-4 mr-1" />
              {bulkExporting ? `Exporting ${bulkProgress}%...` : `Export ZIP (${selectedIds.size})`}
            </Button>
            {bulkExporting && (
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div data-testid="bulk-progress-bar"
                  className="h-full bg-[var(--tm-blue)] transition-all duration-300"
                  style={{ width: `${bulkProgress}%` }} />
              </div>
            )}
            <div className="ml-auto">
              <Button data-testid="import-backup-btn" size="sm" variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="h-8 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
                <Upload className="h-4 w-4 mr-1" />
                {importing ? "Importing..." : "Import Backup"}
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden"
                data-testid="import-file-input" onChange={handleImportFile} />
            </div>
          </div>
        )}

        {busy && (
          <div className="text-sm text-[var(--tm-text-muted)] uppercase tracking-wider">Loading trips...</div>
        )}

        {!busy && finishedSessions.length === 0 && (
          <div className="mt-16 text-center text-[var(--tm-text-soft)]" data-testid="history-empty">
            <Truck className="h-12 w-12 mx-auto mb-4 text-[var(--tm-blue)]" />
            <h2 className="text-2xl font-black text-[var(--tm-navy)] tracking-tight">No finished trips yet</h2>
            <p className="text-sm mt-2">Once you finish a trip, it shows up here.</p>
            <div className="mt-6">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}
                className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
                <Upload className="h-4 w-4 mr-1" /> Import from backup
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden"
                data-testid="import-file-input-empty" onChange={handleImportFile} />
            </div>
          </div>
        )}

        <div className="space-y-3">
          {finishedSessions.map((s) => (
            <div key={s.session_id} data-testid={`history-row-${s.session_id}`}
              className={`bg-[var(--tm-surface)] border rounded-md p-4 flex flex-col md:flex-row md:items-center gap-3 transition-colors ${
                selectedIds.has(s.session_id) ? "border-[var(--tm-blue)] bg-blue-50/30" : "border-[var(--tm-border)] hover:border-[var(--tm-blue)]"
              }`}>
              <button data-testid={`select-trip-${s.session_id}`} onClick={() => toggleSelect(s.session_id)}
                className="shrink-0 cursor-pointer"
                aria-label={selectedIds.has(s.session_id) ? `Deselect trip ${s.order_number}` : `Select trip ${s.order_number}`}>
                {selectedIds.has(s.session_id)
                  ? <CheckSquare className="h-5 w-5 text-[var(--tm-blue)]" />
                  : <Square className="h-5 w-5 text-[var(--tm-text-soft)]" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-blue)] font-bold mb-1">
                  {formatDate(s.finished_at || s.created_at)} · {s.load_type}
                </div>
                <div className="font-black text-[var(--tm-navy)] text-lg leading-tight truncate">
                  Order #{s.order_number}
                </div>
                <div className="text-xs text-[var(--tm-text-soft)] mt-0.5">
                  BOL #{s.bol_number} · {countFilledRows(s.rows)} stops · Truck {s.truck_number || "—"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button data-testid={`history-view-${s.session_id}`} variant="outline"
                  onClick={() => setViewing(s)}
                  className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface-2)] rounded-md">
                  <Eye className="h-4 w-4 mr-1" /> View
                </Button>
                <Button data-testid={`history-reopen-${s.session_id}`}
                  onClick={() => setReopening(s)}
                  className="h-10 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md">
                  <Edit3 className="h-4 w-4 mr-1" /> Re-open
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* View / single-export dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-5xl bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md overflow-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-[var(--tm-navy)]">
              <div className="flex items-center gap-2 flex-wrap">
                <span>Order #{viewing?.order_number}</span>
                <span className="text-xs text-[var(--tm-text-muted)] font-normal">
                  · {formatDate(viewing?.finished_at || viewing?.created_at)}
                </span>
              </div>
            </DialogTitle>
            <DialogDescription className="text-[var(--tm-text-soft)]">
              View, re-export, or re-open this finished trip sheet.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 mb-3">
            <Button data-testid="history-export-jpeg" variant="outline" onClick={() => exportFile("jpeg")}
              className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <ImageIcon className="h-4 w-4 mr-1" /> JPEG
            </Button>
            <Button data-testid="history-export-pdf" variant="outline" onClick={() => exportFile("pdf")}
              className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button data-testid="history-export-print" variant="outline" onClick={() => exportFile("print")}
              className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button data-testid="history-export-email" variant="outline" onClick={() => exportFile("email")}
              className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              <Mail className="h-4 w-4 mr-1" /> Email
            </Button>
          </div>
          <div className="overflow-auto max-h-[70vh] flex justify-center bg-[var(--tm-surface-2)] p-4 rounded-md">
            {viewing && <PaperSheet ref={paperRef} session={viewing} profile={profile} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Re-open confirmation */}
      <AlertDialog open={!!reopening} onOpenChange={(v) => !v && setReopening(null)}>
        <AlertDialogContent className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md" data-testid="reopen-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--tm-navy)]">Re-open this trip?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--tm-text-soft)]">
              {activeSession
                ? "You have an active trip in progress. Re-opening will mark the active trip as abandoned."
                : "The trip will become editable again. Finalize it later by tapping Finish & Export."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="reopen-confirm-btn"
              onClick={() => { const id = reopening.session_id; setReopening(null); reopen(id); }}
              className="bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md">Re-open</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-archive confirmation */}
      <AlertDialog open={showArchive} onOpenChange={setShowArchive}>
        <AlertDialogContent className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md" data-testid="archive-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--tm-navy)]">Archive finished trips?</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--tm-text-soft)]">
              This will download a ZIP backup of all {finishedSessions.length} finished trip{finishedSessions.length === 1 ? "" : "s"}, then remove them from the app to free up storage. You can re-import them later from the backup file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {archiving && bulkProgress > 0 && (
            <div className="px-4">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div data-testid="archive-progress-bar" className="h-full bg-[var(--tm-orange)] transition-all duration-300"
                  style={{ width: `${bulkProgress}%` }} />
              </div>
              <p className="text-xs text-[var(--tm-text-soft)] mt-1">Archiving... {bulkProgress}%</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md" disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="archive-confirm-btn" onClick={handleArchive} disabled={archiving}
              className="bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md disabled:opacity-50">
              {archiving ? "Archiving..." : "Archive all trips"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

function countFilledRows(rows) {
  if (!rows) return 0;
  return rows.filter((r) => r.event_code || r.location_name || r.stop_city || r.trailer_number).length;
}