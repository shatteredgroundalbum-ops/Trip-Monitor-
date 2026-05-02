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
import { ArrowLeft, Eye, Edit3, FileText, Image as ImageIcon, Mail, Truck, Printer } from "lucide-react";
import PaperSheet from "../components/app/PaperSheet";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { toast } from "sonner";

export default function History() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [reopening, setReopening] = useState(null);
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

  const reopen = async (sessionId) => {
    try {
      await api.post(`/trip-sessions/${sessionId}/reopen`);
      toast.success("Trip re-opened for editing");
      navigate("/dashboard");
    } catch {
      toast.error("Could not reopen trip");
    }
  };

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
        let w = pageW - 40;
        let h = w / ratio;
        if (h > pageH - 40) { h = pageH - 40; w = h * ratio; }
        pdf.addImage(imgData, "JPEG", (pageW - w) / 2, 20, w, h);
        pdf.save(`${baseName}.pdf`);
        toast.success("PDF saved", { id: "h-exp" });
      } else if (kind === "print") {
        toast.loading("Opening print dialog...", { id: "h-exp" });
        const canvas = await captureCanvas();
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const printWin = window.open("", "_blank", "width=900,height=1200");
        if (!printWin) {
          toast.error("Pop-up blocked — allow pop-ups to print", { id: "h-exp" });
          return;
        }
        printWin.document.open();
        printWin.document.write(`<!doctype html><html><head><title>${baseName}</title>
<style>@page { size: letter portrait; margin: 0.4in; } html, body { margin: 0; padding: 0; background: #fff; } img { width: 100%; height: auto; display: block; }</style></head><body>
<img src="${imgData}" alt="Trip Sheet" />
<script>window.onload = () => { setTimeout(() => { window.focus(); window.print(); }, 250); };</script>
</body></html>`);
        printWin.document.close();
        toast.success("Print dialog opened", { id: "h-exp" });
      } else if (kind === "email") {
        const subject = `Trip Sheet — ${profile?.full_name || ""} — ${formatDate(viewing.finished_at || viewing.created_at)} — Order #${viewing.order_number}`;
        const lines = [
          "Hello,", "",
          "Please find the trip sheet attached.", "",
          `Driver: ${profile?.full_name || ""}`,
          `Order #: ${viewing.order_number || ""}`,
          `BOL #: ${viewing.bol_number || ""}`, "",
          "Note: please attach the JPEG or PDF saved to your device.", "",
          "Thanks,", profile?.full_name || "",
        ];
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

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 pb-12">
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold mb-1">Archive</div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[var(--tm-navy)]">Trip History</h1>
          <p className="text-sm text-[var(--tm-text-soft)] mt-1">
            {finishedSessions.length} finished {finishedSessions.length === 1 ? "trip" : "trips"} · view, re-export, or re-open
          </p>
        </div>

        {busy && (
          <div className="text-sm text-[var(--tm-text-muted)] uppercase tracking-wider">Loading trips...</div>
        )}

        {!busy && finishedSessions.length === 0 && (
          <div className="mt-16 text-center text-[var(--tm-text-soft)]" data-testid="history-empty">
            <Truck className="h-12 w-12 mx-auto mb-4 text-[var(--tm-blue)]" />
            <h2 className="text-2xl font-black text-[var(--tm-navy)] tracking-tight">No finished trips yet</h2>
            <p className="text-sm mt-2">Once you finish a trip, it shows up here.</p>
          </div>
        )}

        <div className="space-y-3">
          {finishedSessions.map((s) => (
            <div
              key={s.session_id}
              data-testid={`history-row-${s.session_id}`}
              className="bg-[var(--tm-surface)] border border-[var(--tm-border)] hover:border-[var(--tm-blue)] transition-colors rounded-md p-4 flex flex-col md:flex-row md:items-center gap-3"
            >
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
                <Button
                  data-testid={`history-view-${s.session_id}`}
                  variant="outline"
                  onClick={() => setViewing(s)}
                  className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface-2)] rounded-md"
                >
                  <Eye className="h-4 w-4 mr-1" /> View
                </Button>
                <Button
                  data-testid={`history-reopen-${s.session_id}`}
                  onClick={() => setReopening(s)}
                  className="h-10 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
                >
                  <Edit3 className="h-4 w-4 mr-1" /> Re-open
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>

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
            <AlertDialogCancel className="bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="reopen-confirm-btn"
              onClick={() => { const id = reopening.session_id; setReopening(null); reopen(id); }}
              className="bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
            >
              Re-open
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
