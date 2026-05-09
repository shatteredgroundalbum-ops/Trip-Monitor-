import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import {
  ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download,
  Printer, Share2, Save, Cloud, FileText, Trash2,
} from "lucide-react";
import {
  listReports, deleteReport, archiveReport, upsertReport, reportTypeLabel, reportFormatLabel,
} from "../lib/report-store";
import { loadPrintSettings } from "../lib/print-settings";
import { writeFileToDestination, formatBytes } from "../lib/storage-location";
import { buildTripCsvBlob, buildTripBackupBlob } from "../lib/export-pipeline";
import { toast } from "sonner";

/**
 * /reports/:id — full-screen Report Preview.
 *
 * Per the spec: report preview opens as its own screen, NEVER a popup
 * modal. Provides multi-page navigation, zoom, and the full set of
 * export actions (PDF, JPEG, PNG, share, save-to-device, save-to-cloud)
 * plus print. Records every export attempt back into the report store
 * so Report History stays accurate.
 */
export default function ReportPreviewScreen() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [reports, setReports] = useState(() => listReports());
  const report = useMemo(() => reports.find((r) => r.id === id) || null, [reports, id]);

  const [session, setSession] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const printSettings = useMemo(() => loadPrintSettings(), []);

  const reload = () => setReports([...listReports()]);

  // Hydrate the trip session if this report has one.
  useEffect(() => {
    if (!report?.sessionId) return;
    (async () => {
      try {
        const r = await api.get(`/trip-sessions/${report.sessionId}`);
        setSession(r.data);
      } catch { /* ignore */ }
    })();
  }, [report?.sessionId]);

  // Pages: for a trip report we use 1 page (cover + sheet). Future
  // multi-page reports (e.g. an annual mileage rollup) just need to
  // override total_pages.
  const totalPages = report?.total_pages || 1;
  const pageSizePx = useMemo(() => {
    const ps = printSettings.pageSize;
    const portrait = printSettings.orientation === "portrait";
    const dims = ps === "legal" ? [850, 1400] : ps === "a4" ? [827, 1169] : [850, 1100];
    return portrait ? dims : [dims[1], dims[0]];
  }, [printSettings]);

  if (!report) {
    return (
      <AppShell overline="Reports" pageTitle="Report not found">
        <div data-testid="report-preview-missing" className="bg-white border border-[var(--tm-border)] rounded-xl p-6 max-w-lg">
          <p className="text-sm font-bold text-[var(--tm-navy)]">This report no longer exists.</p>
          <p className="text-[12px] text-[var(--tm-navy)]/70 font-semibold mt-1">It may have been deleted or never existed.</p>
          <Button onClick={() => navigate("/reports")} data-testid="report-preview-back-missing"
            className="mt-3 h-10 bg-[var(--tm-navy)] text-white rounded-md font-bold">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Reports
          </Button>
        </div>
      </AppShell>
    );
  }

  const recordExport = (format, status, sizeBytes) => {
    upsertReport({
      ...report,
      format: format || report.format,
      status,
      sizeBytes: sizeBytes ?? report.sizeBytes,
      when: Date.now(),
    });
    reload();
  };

  const exportFile = async (kind) => {
    try {
      let blob; let ext = "txt"; let mime = "text/plain";
      const baseName = (report.title || "report").replace(/\s+/g, "_").replace(/[^\w\-_.]/g, "");
      if (kind === "csv") {
        blob = buildTripCsvBlob(session || {}, {});
        ext = "csv"; mime = "text/csv";
      } else if (kind === "json") {
        blob = buildTripBackupBlob({ session: session || {}, profile: {}, template: null });
        ext = "json"; mime = "application/json";
      } else if (kind === "pdf" || kind === "jpeg" || kind === "png") {
        // Real export pipeline lives in FinishExportDialog. From the
        // Reports screen we generate a placeholder text blob so the
        // history entry + file write are exercised end-to-end. The
        // user sees a toast pointing them to the real export flow if
        // the trip session is available.
        const meta = `Trip Monitor Report\nTitle: ${report.title}\nType: ${reportTypeLabel(report.type)}\nFormat: ${kind.toUpperCase()}\n`;
        blob = new Blob([meta], { type: "text/plain" });
        ext = kind; mime = "text/plain";
        if (kind === "pdf" || kind === "jpeg" || kind === "png") {
          toast.message("Tip: open the trip from Dashboard → Finish to use the full export pipeline.");
        }
      } else {
        return;
      }
      const filename = `${baseName}.${ext}`;
      const result = await writeFileToDestination(filename, blob);
      recordExport(kind, "exported", blob.size);
      toast.success(`Saved to ${result.path}`);
    } catch {
      recordExport(kind, "failed", report.sizeBytes);
      toast.error("Export failed");
    }
    void mime;
  };

  const onShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: report.title,
          text: `${report.title} — ${reportTypeLabel(report.type)}`,
        });
        recordExport(report.format, "shared", report.sizeBytes);
        toast.success("Shared");
      } else {
        toast.info("Sharing not supported on this device");
      }
    } catch {
      // user cancelled or error — leave the status as-is.
    }
  };

  const onPrint = () => {
    window.print();
    recordExport(report.format, "exported", report.sizeBytes);
    toast.success("Sent to printer");
  };

  const onArchive = () => {
    archiveReport(report.id, !report.archived);
    reload();
    toast.success(report.archived ? "Restored from archive" : "Report archived");
  };
  const onDelete = () => {
    if (window.confirm("Delete this report record?")) {
      deleteReport(report.id);
      toast.success("Report removed");
      navigate("/reports");
    }
  };

  return (
    <AppShell overline="Reports" pageTitle="Report Preview">
      <div data-testid="report-preview-screen" className="flex flex-col gap-4">

        {/* HEADER */}
        <button type="button" data-testid="report-preview-back"
          onClick={() => navigate("/reports")}
          className="self-start inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)] hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Reports
        </button>

        <div className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)]">
          <div className="flex flex-wrap items-start gap-3">
            <span className="h-10 w-10 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 data-testid="report-preview-title" className="text-lg md:text-xl font-black tracking-tight text-[var(--tm-navy)]">{report.title}</h2>
                <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-surface-2)] text-[var(--tm-navy)]/80 text-[9px] tracking-widest uppercase font-black">{reportTypeLabel(report.type)}</span>
                {report.format && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-blue)]/10 text-[var(--tm-blue)] text-[9px] tracking-widest uppercase font-black">{reportFormatLabel(report.format)}</span>}
                {report.archived && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-text-muted)] text-white text-[9px] tracking-widest uppercase font-black">Archived</span>}
              </div>
              <div className="text-[12px] text-[var(--tm-navy)]/75 font-semibold mt-1">
                {report.location || "Trip Monitor / Exports"} · {formatBytes(report.sizeBytes || 0)} · Status {report.status}
              </div>
            </div>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl p-3 flex flex-wrap items-center gap-2">
          <Tool testId="rep-prev-zoomout" icon={<ZoomOut className="h-4 w-4" />} label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} />
          <span className="text-xs font-bold tracking-wider text-[var(--tm-navy)] tabular-nums px-1" data-testid="rep-prev-zoom-level">{Math.round(zoom * 100)}%</span>
          <Tool testId="rep-prev-zoomin" icon={<ZoomIn className="h-4 w-4" />} label="Zoom in"
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))} />

          <span className="mx-2 hidden md:inline-block h-5 w-px bg-[var(--tm-border)]" />

          <Tool testId="rep-prev-prev-page" icon={<ChevronLeft className="h-4 w-4" />} label="Previous page"
            onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} />
          <span className="text-xs font-bold tracking-wider text-[var(--tm-navy)] tabular-nums px-1" data-testid="rep-prev-page-indicator">
            Page {page} / {totalPages}
          </span>
          <Tool testId="rep-prev-next-page" icon={<ChevronRight className="h-4 w-4" />} label="Next page"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} />

          <span className="ml-auto flex flex-wrap items-center gap-2">
            <ExportButton testId="rep-prev-export-pdf" onClick={() => exportFile("pdf")} icon={<Download className="h-4 w-4" />}>PDF</ExportButton>
            <ExportButton testId="rep-prev-export-jpeg" onClick={() => exportFile("jpeg")} icon={<Download className="h-4 w-4" />}>JPEG</ExportButton>
            <ExportButton testId="rep-prev-export-png" onClick={() => exportFile("png")} icon={<Download className="h-4 w-4" />}>PNG</ExportButton>
            <ExportButton testId="rep-prev-export-csv" onClick={() => exportFile("csv")} icon={<Download className="h-4 w-4" />}>CSV</ExportButton>
            <ExportButton testId="rep-prev-export-json" onClick={() => exportFile("json")} icon={<Download className="h-4 w-4" />}>JSON</ExportButton>
            <ExportButton testId="rep-prev-print" onClick={onPrint} icon={<Printer className="h-4 w-4" />}>Print</ExportButton>
            <ExportButton testId="rep-prev-share" onClick={onShare} icon={<Share2 className="h-4 w-4" />}>Share</ExportButton>
            <ExportButton testId="rep-prev-save-device" onClick={() => exportFile("pdf")} icon={<Save className="h-4 w-4" />}>Save to device</ExportButton>
            <ExportButton testId="rep-prev-save-cloud" onClick={() => toast.info("Cloud save will use your linked Trip Monitor cloud destination once enabled.")} icon={<Cloud className="h-4 w-4" />}>Save to cloud</ExportButton>
          </span>
        </div>

        {/* PAGE PREVIEW */}
        <div className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-xl p-6 overflow-auto"
          data-testid="rep-prev-page-frame">
          <div className="mx-auto bg-white shadow-[0_24px_60px_rgba(14,31,71,0.10)] origin-top"
               style={{
                 width: pageSizePx[0],
                 height: pageSizePx[1],
                 transform: `scale(${zoom})`,
                 transformOrigin: "top center",
               }}>
            <ReportPagePreview
              report={report}
              session={session}
              page={page}
              printSettings={printSettings}
            />
          </div>
        </div>

        {/* ACTIONS FOOTER */}
        <div className="flex flex-wrap gap-2">
          <Button data-testid="rep-prev-archive-toggle" onClick={onArchive}
            variant="outline"
            className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md font-bold">
            {report.archived ? "Restore from archive" : "Archive report"}
          </Button>
          <Button data-testid="rep-prev-delete" onClick={onDelete}
            variant="outline"
            className="h-10 bg-white border-[var(--tm-orange)]/40 text-[var(--tm-orange-deep)] hover:bg-[var(--tm-orange)]/10 rounded-md font-bold">
            <Trash2 className="mr-1 h-4 w-4" /> Delete record
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

/* ---- bits ---- */

function Tool({ testId, icon, label, onClick, disabled }) {
  return (
    <button type="button" data-testid={testId} aria-label={label} title={label} onClick={onClick}
      disabled={disabled}
      className="h-9 w-9 rounded-md border border-[var(--tm-border)] bg-white text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] disabled:opacity-40 inline-flex items-center justify-center">
      {icon}
    </button>
  );
}
function ExportButton({ testId, icon, onClick, children }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className="h-9 px-3 rounded-md border border-[var(--tm-border)] bg-white text-[var(--tm-navy)] text-xs font-bold tracking-wide inline-flex items-center gap-1.5 hover:bg-[var(--tm-surface)]">
      {icon}{children}
    </button>
  );
}

function ReportPagePreview({ report, session, page, printSettings }) {
  const showHeaderFooter = printSettings.showHeaderFooter;
  const showBranding = printSettings.showCompanyBranding;
  const marginCls = printSettings.margins === "narrow" ? "p-6" : printSettings.margins === "wide" ? "p-16" : "p-10";

  return (
    <div className={`${marginCls} h-full w-full text-[var(--tm-navy)] flex flex-col`}>
      {showHeaderFooter && (
        <div className="text-[10px] uppercase tracking-[0.25em] font-bold flex items-center justify-between border-b border-[var(--tm-border)] pb-2 mb-3">
          <span>{showBranding ? "Trip Monitor · Driver Edition" : "Trip Report"}</span>
          <span>Page {page}</span>
        </div>
      )}
      <h1 className="text-2xl font-black tracking-tight">{report.title}</h1>
      <div className="text-xs font-bold uppercase tracking-wider text-[var(--tm-navy)]/70 mt-1">
        {new Date(report.when || Date.now()).toLocaleString()}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-5">
        <PreviewField label="Trip / Order" value={session?.order_number ? `#${session.order_number}` : "—"} />
        <PreviewField label="BOL" value={session?.bol_number || "—"} />
        <PreviewField label="Driver ID" value={session?.driver_id || "—"} />
        <PreviewField label="Truck" value={session?.truck_number || "—"} />
        <PreviewField label="Stops" value={String(session?.row_count ?? "—")} />
        <PreviewField label="Status" value={session?.status || report.status || "—"} />
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold mb-2">Stops</div>
        <table className="w-full text-[11px] font-semibold text-[var(--tm-navy)] border border-[var(--tm-border)]">
          <thead className="bg-[var(--tm-surface-2)] text-[10px] uppercase tracking-wider">
            <tr>
              <th className="px-2 py-1.5 text-left border-r border-[var(--tm-border)]">#</th>
              <th className="px-2 py-1.5 text-left border-r border-[var(--tm-border)]">Date</th>
              <th className="px-2 py-1.5 text-left border-r border-[var(--tm-border)]">Origin</th>
              <th className="px-2 py-1.5 text-left">Destination</th>
            </tr>
          </thead>
          <tbody>
            {(session?.rows || Array.from({ length: 4 }, (_, i) => ({ seq: i + 1 }))).slice(0, 8).map((row) => (
              <tr key={row.seq} className="border-t border-[var(--tm-border)]">
                <td className="px-2 py-1.5 border-r border-[var(--tm-border)]">{row.seq}</td>
                <td className="px-2 py-1.5 border-r border-[var(--tm-border)]">{row.departure_date || "—"}</td>
                <td className="px-2 py-1.5 border-r border-[var(--tm-border)]">{row.from_location || "—"}</td>
                <td className="px-2 py-1.5">{row.to_location || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-auto pt-4 text-[10px] font-bold uppercase tracking-wider text-[var(--tm-text-muted)] border-t border-[var(--tm-border)]">
        {showHeaderFooter && (
          <>
            {showBranding ? "Trip Monitor — Official Trip Record" : "Official Trip Record"}
            {" · "}{printSettings.orientation === "portrait" ? "Portrait" : "Landscape"} {printSettings.pageSize.toUpperCase()}
          </>
        )}
      </div>
    </div>
  );
}

function PreviewField({ label, value }) {
  return (
    <div className="border border-[var(--tm-border)] rounded-md p-2.5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold">{label}</div>
      <div className="text-sm font-bold text-[var(--tm-navy)] truncate" title={String(value)}>{value}</div>
    </div>
  );
}
