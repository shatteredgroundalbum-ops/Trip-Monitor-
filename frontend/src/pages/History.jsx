import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { ArrowLeft, Eye, Edit3, Download, FileText, Image as ImageIcon, Mail, Truck } from "lucide-react";
import { BrandLockupCompact } from "../components/app/BrandLogo";
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
    } catch (e) {
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
    const baseName = `RTI_TripSheet_${viewing.order_number || "NO-ORDER"}_${(profile?.full_name || "driver").replace(/\s+/g, "_")}`;
    try {
      if (kind === "jpeg") {
        const canvas = await captureCanvas();
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `${baseName}.jpg`; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, "image/jpeg", 0.95);
      } else if (kind === "pdf") {
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
      } else if (kind === "email") {
        const subject = `RTI Trip Sheet — ${profile?.full_name || ""} — ${formatDate(viewing.finished_at || viewing.created_at)} — Order #${viewing.order_number}`;
        const body = `Hello,%0D%0A%0D%0APlease find attached the RTI Trip Sheet.%0D%0A%0D%0A` +
          `Driver: ${profile?.full_name || ""}%0D%0AOrder #: ${viewing.order_number}%0D%0ABOL #: ${viewing.bol_number}%0D%0A%0D%0AThanks.`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
      }
    } catch (e) {
      toast.error("Export failed");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center">
        <div className="text-sm uppercase tracking-[0.3em] text-neutral-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/95 backdrop-blur border-b border-[#262626]">
        <div className="max-w-4xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <BrandLockupCompact />
          <Button data-testid="back-to-dashboard-btn" variant="outline" size="sm"
            onClick={() => navigate("/dashboard")}
            className="h-9 bg-transparent border-[#262626] text-white hover:bg-[#171717] rounded-sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 pb-12">
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#FF5F15] font-bold mb-1">Archive</div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Trip History</h1>
          <p className="text-sm text-neutral-400 mt-1">
            {finishedSessions.length} finished {finishedSessions.length === 1 ? "trip" : "trips"} · view, re-export, or re-open
          </p>
        </div>

        {busy && (
          <div className="text-sm text-neutral-500 uppercase tracking-wider">Loading trips...</div>
        )}

        {!busy && finishedSessions.length === 0 && (
          <div className="mt-16 text-center text-neutral-400" data-testid="history-empty">
            <Truck className="h-12 w-12 mx-auto mb-4 text-[#FF5F15]" />
            <h2 className="text-2xl font-black text-white tracking-tight">No finished trips yet</h2>
            <p className="text-sm mt-2">Once you finish a trip, it shows up here.</p>
          </div>
        )}

        <div className="space-y-3">
          {finishedSessions.map((s) => (
            <div
              key={s.session_id}
              data-testid={`history-row-${s.session_id}`}
              className="bg-[#171717] border border-[#262626] hover:border-[#FF5F15]/50 transition-colors rounded-sm p-4 flex flex-col md:flex-row md:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.25em] text-neutral-500 mb-1">
                  {formatDate(s.finished_at || s.created_at)} · {s.load_type}
                </div>
                <div className="font-black text-white text-lg leading-tight truncate">
                  Order #{s.order_number}
                </div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  BOL #{s.bol_number} · {countFilledRows(s.rows)} stops · Truck {s.truck_number || "—"}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  data-testid={`history-view-${s.session_id}`}
                  variant="outline"
                  onClick={() => setViewing(s)}
                  className="h-10 bg-transparent border-[#262626] text-white hover:bg-[#262626] rounded-sm"
                >
                  <Eye className="h-4 w-4 mr-1" /> View
                </Button>
                <Button
                  data-testid={`history-reopen-${s.session_id}`}
                  onClick={() => setReopening(s)}
                  className="h-10 bg-[#FF5F15] hover:bg-[#E04F0E] text-white font-bold rounded-sm"
                >
                  <Edit3 className="h-4 w-4 mr-1" /> Re-open
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* View finished trip dialog */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className="max-w-5xl bg-[#171717] border-[#262626] text-white rounded-sm overflow-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-white">
              <div className="flex items-center gap-2 flex-wrap">
                <span>Order #{viewing?.order_number}</span>
                <span className="text-xs text-neutral-500 font-normal">
                  · {formatDate(viewing?.finished_at || viewing?.created_at)}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 mb-3">
            <Button data-testid="history-export-jpeg" variant="outline" onClick={() => exportFile("jpeg")}
              className="h-10 bg-transparent border-[#262626] text-white hover:bg-[#262626] rounded-sm">
              <ImageIcon className="h-4 w-4 mr-1" /> JPEG
            </Button>
            <Button data-testid="history-export-pdf" variant="outline" onClick={() => exportFile("pdf")}
              className="h-10 bg-transparent border-[#262626] text-white hover:bg-[#262626] rounded-sm">
              <FileText className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button data-testid="history-export-email" variant="outline" onClick={() => exportFile("email")}
              className="h-10 bg-transparent border-[#262626] text-white hover:bg-[#262626] rounded-sm">
              <Mail className="h-4 w-4 mr-1" /> Email
            </Button>
          </div>
          <div className="overflow-auto max-h-[70vh] flex justify-center bg-neutral-800 p-4 rounded-sm">
            {viewing && <PaperSheet ref={paperRef} session={viewing} profile={profile} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Re-open confirmation */}
      <AlertDialog open={!!reopening} onOpenChange={(v) => !v && setReopening(null)}>
        <AlertDialogContent className="bg-[#171717] border-[#262626] text-white rounded-sm" data-testid="reopen-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Re-open this trip?</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              {activeSession
                ? "You have an active trip in progress. Re-opening will mark the active trip as abandoned."
                : "The trip will become editable again. Finalize it later by tapping Finish & Export."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#0A0A0A] border-[#262626] text-white hover:bg-[#262626] rounded-sm">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="reopen-confirm-btn"
              onClick={() => { const id = reopening.session_id; setReopening(null); reopen(id); }}
              className="bg-[#FF5F15] hover:bg-[#E04F0E] text-white font-bold rounded-sm"
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
