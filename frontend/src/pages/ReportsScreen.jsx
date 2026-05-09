import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { api } from "../lib/api";
import { Input } from "../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import {
  FileBarChart2, FileSpreadsheet, FileImage, FileText, Route, ListChecks,
  Truck, ChevronRight, Search, FilterX, Archive as ArchiveIcon, Trash2,
  RotateCcw, FolderOpen, HardDrive, Printer, Settings as SettingsIcon,
  CheckCheck, Eye, Download, Share2, AlertTriangle, History as HistoryIcon,
  Calendar as CalendarIcon, Hash, IdCard,
} from "lucide-react";
import {
  listReports, seedReportsFromTrips, filterReports, archiveReport,
  deleteReport, REPORT_TYPES, REPORT_FORMATS, REPORT_STATUSES,
  reportTypeLabel, reportFormatLabel,
} from "../lib/report-store";
import { loadPrintSettings, savePrintSettings, resetPrintSettings,
  PAGE_SIZES, ORIENTATIONS, MARGINS } from "../lib/print-settings";
import { getStorageUsage, getDestinationConfig, formatBytes } from "../lib/storage-location";
import { toast } from "sonner";

/**
 * /reports — official records, summaries, and exports.
 *
 * Per spec, distinct from Analytics (trends) and from New Trip → Trip
 * History (live operational list). This screen focuses on completed
 * trip records, generated summaries, exports, and printable output.
 *
 * Sections (see PRD): Overview · Types · Filters · Generated List ·
 * Export Options · Print Settings · Report History · Storage Location
 * · Archive Management. Preview opens as its own full screen at
 * /reports/:id (NOT a popup).
 */
export default function ReportsScreen() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [reports, setReports] = useState(() => listReports());
  const [printSettings, setPrintSettings] = useState(() => loadPrintSettings());
  const [storage, setStorage] = useState({ percent: 0, usage: 0, quota: 0 });
  const [destination, setDestination] = useState(null);

  // Filters
  const [type, setType] = useState("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [trip, setTrip] = useState("");
  const [driver, setDriver] = useState("");
  const [truck, setTruck] = useState("");
  const [status, setStatus] = useState("all");
  const [format, setFormat] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  // Confirmations
  const [confirm, setConfirm] = useState(null); // { kind, payload }

  // Initial load
  useEffect(() => {
    (async () => {
      try {
        const [s, t] = await Promise.all([
          api.get("/stats").catch(() => ({ data: null })),
          api.get("/trip-sessions").catch(() => ({ data: [] })),
        ]);
        setStats(s.data);
        const finished = (t.data || []).filter((r) => r.status === "finished");
        const seeded = seedReportsFromTrips(finished);
        setReports([...seeded]);
      } catch { /* ignore */ }
      try {
        setStorage(await getStorageUsage());
        setDestination(await getDestinationConfig());
      } catch { /* ignore */ }
    })();
  }, []);

  // Derived
  const visible = useMemo(() => filterReports(reports, {
    type, q, status, format,
    from: from ? new Date(from).getTime() : null,
    to: to ? new Date(to).getTime() + 24 * 3600_000 - 1 : null,
    trip, driver, truck,
    includeArchived: showArchived,
  }), [reports, type, q, from, to, trip, driver, truck, status, format, showArchived]);

  const overview = useMemo(() => {
    const all = reports;
    const oneWeek = Date.now() - 7 * 24 * 3600_000;
    const exported = all.filter((r) => r.status === "exported" || r.format);
    const last = exported.reduce((acc, r) => (r.when > acc ? r.when : acc), 0);
    const reportsBytes = all.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);
    return {
      total: all.length,
      thisWeek: all.filter((r) => r.when >= oneWeek).length,
      lastExport: last || null,
      bytes: reportsBytes,
    };
  }, [reports]);

  const recentExports = useMemo(() =>
    [...reports].filter((r) => r.format).sort((a, b) => b.when - a.when).slice(0, 6),
  [reports]);
  const failedExports = useMemo(() => reports.filter((r) => r.status === "failed"), [reports]);
  const sharedExports = useMemo(() => reports.filter((r) => r.status === "shared"), [reports]);

  const archivedCount = reports.filter((r) => r.archived).length;

  // Mutators
  const reload = () => setReports([...listReports()]);
  const onResetFilters = () => {
    setType("all"); setQ(""); setFrom(""); setTo(""); setTrip("");
    setDriver(""); setTruck(""); setStatus("all"); setFormat("all");
  };
  const onPreview = (r) => navigate(`/reports/${encodeURIComponent(r.id)}`);
  const onArchive = (r) => { archiveReport(r.id, !r.archived); reload(); toast.success(r.archived ? "Restored from archive" : "Report archived"); };
  const onDelete = (r) => setConfirm({ kind: "delete-one", payload: r });
  const onClearExports = () => setConfirm({ kind: "clear-exports" });

  const applyConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === "delete-one" && confirm.payload?.id) {
      deleteReport(confirm.payload.id);
      reload(); toast.success("Report removed");
    } else if (confirm.kind === "clear-exports") {
      // Delete only "exported" rows.
      const remain = reports.filter((r) => r.status !== "exported");
      try { localStorage.setItem("tm_report_history_v1", JSON.stringify({ version: 1, items: remain })); } catch { /* ignore */ }
      reload(); toast.success("Exported copies cleared");
    }
    setConfirm(null);
  };

  const onSavePrint = (next) => {
    const saved = savePrintSettings(next);
    setPrintSettings(saved);
    toast.success("Print settings saved");
  };
  const onResetPrint = () => { setPrintSettings(resetPrintSettings()); toast.success("Print settings reset"); };

  // Friendly storage label.
  const storageMode = destination?.mode || "app";
  const STORAGE_LABEL = {
    app: "App-managed storage",
    documents: "Trip Monitor / (Documents)",
    sdcard: "SD card · Trip Monitor folder",
    custom: destination?.label || "Custom folder",
  }[storageMode];

  return (
    <AppShell overline="Hamburger Menu" pageTitle="Reports">
      <div data-testid="reports-screen" className="flex flex-col gap-4">

        {/* 1. REPORT OVERVIEW */}
        <Card>
          <CardHeader icon={<FileBarChart2 className="h-4 w-4" />} title="Report Overview" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile testId="rep-ov-total" label="Total Reports" value={String(overview.total)} icon={<FileText className="h-4 w-4" />} />
            <Tile testId="rep-ov-week"  label="This Week"     value={String(overview.thisWeek)} icon={<HistoryIcon className="h-4 w-4" />} />
            <Tile testId="rep-ov-last"  label="Last Export"   value={overview.lastExport ? formatRelative(overview.lastExport) : "—"} icon={<Download className="h-4 w-4" />} />
            <Tile testId="rep-ov-storage" label="Reports Size" value={formatBytes(overview.bytes)} icon={<HardDrive className="h-4 w-4" />} />
          </div>
        </Card>

        {/* 2. REPORT TYPES */}
        <Card>
          <CardHeader icon={<FileSpreadsheet className="h-4 w-4" />} title="Report Types" right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">Tap to filter</span>
          )} />
          <Chips
            testId="rep-type"
            value={type}
            onChange={setType}
            options={[{ value: "all", label: "All" }, ...REPORT_TYPES]}
          />
        </Card>

        {/* 3. FILTERS & SEARCH */}
        <Card>
          <CardHeader icon={<Search className="h-4 w-4" />} title="Filter & Search" right={(
            <button type="button" onClick={onResetFilters}
                    className="text-xs font-bold text-[var(--tm-blue)] hover:underline inline-flex items-center gap-1"
                    data-testid="rep-filters-reset">
              <FilterX className="h-3 w-3" /> Reset
            </button>
          )} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FieldWithIcon icon={<Search className="h-4 w-4" />}>
              <Input data-testid="rep-search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search by title, trip number, location…" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
            <FieldWithIcon icon={<Hash className="h-4 w-4" />}>
              <Input data-testid="rep-filter-trip" value={trip} onChange={(e) => setTrip(e.target.value)}
                placeholder="Trip / Order #" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
            <FieldWithIcon icon={<IdCard className="h-4 w-4" />}>
              <Input data-testid="rep-filter-driver" value={driver} onChange={(e) => setDriver(e.target.value)}
                placeholder="Driver" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
            <FieldWithIcon icon={<Truck className="h-4 w-4" />}>
              <Input data-testid="rep-filter-truck" value={truck} onChange={(e) => setTruck(e.target.value)}
                placeholder="Truck #" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
            <FieldWithIcon icon={<CalendarIcon className="h-4 w-4" />}>
              <Input data-testid="rep-filter-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                placeholder="From" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
            <FieldWithIcon icon={<CalendarIcon className="h-4 w-4" />}>
              <Input data-testid="rep-filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
                placeholder="To" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
          </div>
          <Chips testId="rep-status" value={status} onChange={setStatus}
            options={[{ value: "all", label: "Any status" }, ...REPORT_STATUSES]} />
          <Chips testId="rep-format" value={format} onChange={setFormat}
            options={[{ value: "all", label: "Any format" }, ...REPORT_FORMATS]} />
        </Card>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <ActionPill
            testId="rep-toggle-archive"
            icon={<ArchiveIcon className="h-4 w-4" />}
            label={showArchived ? "Hide archived" : `Show archived${archivedCount ? ` (${archivedCount})` : ""}`}
            onClick={() => setShowArchived((v) => !v)}
            active={showArchived}
          />
          <ActionPill
            testId="rep-clear-exports"
            icon={<Trash2 className="h-4 w-4" />}
            label="Clear exported copies"
            onClick={onClearExports}
            danger
          />
        </div>

        {/* 4. GENERATED REPORTS LIST */}
        <Card>
          <CardHeader icon={<FileText className="h-4 w-4" />} title="Generated Reports" right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">
              {visible.length} item{visible.length === 1 ? "" : "s"}
            </span>
          )} />
          {visible.length === 0 ? (
            <Empty>
              No reports match these filters. Once a trip is finished and exported,
              it will appear here as an official record.
            </Empty>
          ) : (
            <div className="flex flex-col">
              {visible.map((r) => (
                <ReportRow
                  key={r.id} r={r}
                  onPreview={() => onPreview(r)}
                  onArchive={() => onArchive(r)}
                  onDelete={() => onDelete(r)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* 6. EXPORT OPTIONS */}
        <Card>
          <CardHeader icon={<Download className="h-4 w-4" />} title="Export Options" right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">Open a report to use</span>
          )} />
          <p className="text-[12px] text-[var(--tm-navy)]/75 font-semibold leading-snug">
            Open any report from the list above to access PDF, JPEG, PNG, share, save-to-device,
            and save-to-cloud actions. Files land in your selected Trip Monitor folder
            <span className="font-bold"> ({STORAGE_LABEL})</span>.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <FormatBadge label="PDF" />
            <FormatBadge label="JPEG" />
            <FormatBadge label="PNG" />
            <FormatBadge label="Share" />
            <FormatBadge label="Save to device" />
            <FormatBadge label="Save to cloud" />
          </div>
        </Card>

        {/* 7. PRINT SETTINGS */}
        <Card>
          <CardHeader icon={<Printer className="h-4 w-4" />} title="Print Settings" right={(
            <button type="button" onClick={onResetPrint}
                    data-testid="rep-print-reset"
                    className="text-xs font-bold text-[var(--tm-blue)] hover:underline inline-flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )} />
          <PrintSettingsPanel value={printSettings} onChange={onSavePrint} />
        </Card>

        {/* 8. REPORT HISTORY */}
        <Card>
          <CardHeader icon={<HistoryIcon className="h-4 w-4" />} title="Report History" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <HistoryColumn title="Recent Exports" icon={<Download className="h-3 w-3" />} testId="rep-hist-recent">
              {recentExports.length === 0 ? <Empty>No exports yet.</Empty> :
                recentExports.map((r) => <MiniRow key={r.id} r={r} onClick={() => onPreview(r)} />)}
            </HistoryColumn>
            <HistoryColumn title="Shared Reports" icon={<Share2 className="h-3 w-3" />} testId="rep-hist-shared">
              {sharedExports.length === 0 ? <Empty>No shared reports yet.</Empty> :
                sharedExports.map((r) => <MiniRow key={r.id} r={r} onClick={() => onPreview(r)} />)}
            </HistoryColumn>
            <HistoryColumn title="Failed Exports" icon={<AlertTriangle className="h-3 w-3" />} testId="rep-hist-failed">
              {failedExports.length === 0 ? <Empty>No failed exports.</Empty> :
                failedExports.map((r) => <MiniRow key={r.id} r={r} onClick={() => onPreview(r)} />)}
            </HistoryColumn>
          </div>
        </Card>

        {/* 9. STORAGE LOCATION */}
        <Card>
          <CardHeader icon={<FolderOpen className="h-4 w-4" />} title="Storage Location" />
          <NavRow testId="rep-storage-path"
            icon={<FolderOpen className="h-4 w-4" />}
            title={STORAGE_LABEL}
            sub={`Reports save under Trip Monitor / Exports · Completed Trip Sheets · Documents`}
            onClick={() => navigate("/settings")}
          />
          <NavRow testId="rep-storage-usage"
            icon={<HardDrive className="h-4 w-4" />}
            title={`${storage.percent}% used`}
            sub={`${formatBytes(storage.usage)} of ${formatBytes(storage.quota || 1)} available`}
            onClick={() => navigate("/settings")}
            tone={storage.percent >= 90 ? "warn" : "default"}
          />
        </Card>

        {/* 10. ARCHIVE MANAGEMENT */}
        <Card>
          <CardHeader icon={<ArchiveIcon className="h-4 w-4" />} title="Archive Management" />
          <p className="text-[12px] text-[var(--tm-navy)]/75 font-semibold leading-snug">
            Archive old reports to keep the active list tidy without deleting your records.
            You can restore archived reports anytime, or delete exported copies once they've
            been saved to your Trip Monitor folder. Destructive actions always ask for
            confirmation.
          </p>
          <div className="flex flex-wrap gap-2">
            <ActionPill
              testId="rep-arch-toggle"
              icon={<ArchiveIcon className="h-4 w-4" />}
              label={showArchived ? "Hide archived" : `Show archived${archivedCount ? ` (${archivedCount})` : ""}`}
              onClick={() => setShowArchived((v) => !v)}
              active={showArchived}
            />
            <ActionPill
              testId="rep-arch-clear-exports"
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete exported copies"
              onClick={onClearExports}
              danger
            />
          </div>
        </Card>

        {/* Footer summary */}
        <Notice>
          Reports are official records — exports save to your Trip Monitor folder, never inside the app.
          {stats?.miles_lifetime != null && (
            <> · Lifetime miles {fmt(stats.miles_lifetime)} across {stats.trips_total ?? 0} trips.</>
          )}
        </Notice>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={applyConfirm}
        testId="rep-confirm"
        icon={<Trash2 className="h-4 w-4" />}
        danger
        title={confirm?.kind === "delete-one" ? "Delete this report?" : "Delete exported copies?"}
        body={confirm?.kind === "delete-one"
          ? "This removes the record from your reports list. The actual exported file in your Trip Monitor folder is not affected."
          : "Removes every exported-status entry from your reports list. The actual files in your Trip Monitor folder are NOT touched."}
        confirmLabel="Delete"
      />
    </AppShell>
  );
}

/* ───────────────────────── reusable bits ───────────────────────── */

function Card({ warn = false, children }) {
  return (
    <div className={[
      "rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-3",
      warn ? "bg-[var(--tm-orange)]/5 border border-[var(--tm-orange)]/40"
           : "bg-white border border-[var(--tm-border)]",
    ].join(" ")}>{children}</div>
  );
}
function CardHeader({ icon, title, right }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 flex-1">{title}</div>
      {right}
    </div>
  );
}
function Tile({ testId, label, value, icon }) {
  return (
    <div data-testid={testId} className="bg-white border border-[var(--tm-border)] rounded-lg p-3 flex flex-col gap-1">
      <span className="text-[var(--tm-navy)]" aria-hidden="true">{icon}</span>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold mt-1">{label}</div>
      <div className="text-2xl font-black tracking-tight text-[var(--tm-navy)] truncate" title={String(value)}>{value}</div>
    </div>
  );
}
function Empty({ children }) {
  return <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold px-1 py-2 leading-snug">{children}</div>;
}
function Notice({ children }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-[var(--tm-surface)] border border-[var(--tm-border)]">
      <p className="text-[12px] text-[var(--tm-navy)] font-semibold leading-snug">{children}</p>
    </div>
  );
}
function FieldWithIcon({ icon, children }) {
  return (
    <div className="relative">
      <span className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tm-navy)]/60">{icon}</span>
      {children}
    </div>
  );
}
function Chips({ testId, value, onChange, options }) {
  return (
    <div data-testid={testId} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button"
            data-testid={`${testId}-${o.value}`}
            onClick={() => onChange(o.value)}
            className={[
              "h-7 px-2.5 rounded-full text-[11px] font-bold tracking-wide transition-colors",
              active ? "bg-[var(--tm-navy)] text-white" : "bg-white text-[var(--tm-navy)] border border-[var(--tm-border)] hover:bg-[var(--tm-surface)]",
            ].join(" ")}
          >{o.label}</button>
        );
      })}
    </div>
  );
}
function ActionPill({ testId, icon, label, onClick, active = false, danger = false }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className={[
        "h-9 px-3.5 rounded-full border text-xs font-bold tracking-wide inline-flex items-center gap-1.5 transition-colors",
        danger ? "bg-white border-[var(--tm-orange)]/40 text-[var(--tm-orange-deep)] hover:bg-[var(--tm-orange)]/10"
        : active ? "bg-[var(--tm-navy)] text-white border-[var(--tm-navy)]"
                 : "bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)]",
      ].join(" ")}>
      {icon}{label}
    </button>
  );
}
function FormatBadge({ label }) {
  return (
    <span className="bg-[var(--tm-surface-2)] border border-[var(--tm-border)] text-[var(--tm-navy)] text-[11px] font-bold tracking-wider uppercase rounded-md px-2.5 py-2 text-center">
      {label}
    </span>
  );
}
function NavRow({ testId, icon, title, sub, onClick, tone = "default" }) {
  const tonecls = tone === "warn" ? "bg-[var(--tm-orange)]/5" : "";
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className={`w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors ${tonecls}`}>
      <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center flex-shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)] truncate">{title}</span>
        {sub && <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug truncate">{sub}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)]" />
    </button>
  );
}

function ReportRow({ r, onPreview, onArchive, onDelete }) {
  const typeIcon = ICON_BY_TYPE[r.type] || <FileText className="h-4 w-4" />;
  const fmtLabel = reportFormatLabel(r.format);
  return (
    <div data-testid={`rep-row-${r.id}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-md border-b border-[var(--tm-border)]/50 last:border-b-0 hover:bg-[var(--tm-surface)]">
      <button type="button" onClick={onPreview} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] flex items-center justify-center flex-shrink-0">{typeIcon}</span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--tm-navy)] truncate">{r.title}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-surface-2)] text-[var(--tm-navy)]/80 text-[9px] tracking-widest uppercase font-black">{reportTypeLabel(r.type)}</span>
            {r.format && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-blue)]/10 text-[var(--tm-blue)] text-[9px] tracking-widest uppercase font-black">{fmtLabel}</span>}
            {r.archived && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-text-muted)] text-white text-[9px] tracking-widest uppercase font-black">Archived</span>}
            {r.status === "failed" && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-orange)] text-white text-[9px] tracking-widest uppercase font-black">Failed</span>}
          </span>
          <span className="block text-[11px] text-[var(--tm-navy)]/70 font-semibold mt-0.5 truncate">
            {formatWhen(r.when)} · {r.location || "—"} · {r.sizeBytes ? formatBytes(r.sizeBytes) : "—"}
          </span>
        </span>
      </button>
      <div className="flex items-center gap-1 flex-shrink-0">
        <IconBtn testId={`rep-row-${r.id}-preview`} title="Preview" onClick={onPreview}><Eye className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn testId={`rep-row-${r.id}-archive`} title={r.archived ? "Restore" : "Archive"} onClick={onArchive}>
          {r.archived ? <RotateCcw className="h-3.5 w-3.5" /> : <ArchiveIcon className="h-3.5 w-3.5" />}
        </IconBtn>
        <IconBtn testId={`rep-row-${r.id}-delete`} title="Delete" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
      </div>
    </div>
  );
}

function HistoryColumn({ title, icon, testId, children }) {
  return (
    <div data-testid={testId} className="bg-white border border-[var(--tm-border)] rounded-lg p-3 flex flex-col gap-1">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold inline-flex items-center gap-1.5 mb-1">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}
function MiniRow({ r, onClick }) {
  return (
    <button type="button" data-testid={`rep-mini-${r.id}`} onClick={onClick}
      className="w-full text-left flex items-center gap-2 py-1.5 hover:bg-[var(--tm-surface)] rounded-md px-1">
      <span className="text-sm font-bold text-[var(--tm-navy)] truncate flex-1 min-w-0">{r.title}</span>
      <span className="text-[10px] text-[var(--tm-text-muted)] font-bold">{reportFormatLabel(r.format)}</span>
    </button>
  );
}

function PrintSettingsPanel({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Select testId="rep-print-page-size" label="Page size" value={value.pageSize} options={PAGE_SIZES}
        onChange={(v) => set({ pageSize: v })} />
      <Select testId="rep-print-orientation" label="Orientation" value={value.orientation} options={ORIENTATIONS}
        onChange={(v) => set({ orientation: v })} />
      <Select testId="rep-print-margins" label="Margins" value={value.margins} options={MARGINS}
        onChange={(v) => set({ margins: v })} />
      <Toggle testId="rep-print-headerfooter" label="Header & footer" sub="Page numbers and document header"
        value={value.showHeaderFooter} onChange={(v) => set({ showHeaderFooter: v })} />
      <Toggle testId="rep-print-branding" label="Company branding" sub="Logo and brand block on cover page"
        value={value.showCompanyBranding} onChange={(v) => set({ showCompanyBranding: v })} />
    </div>
  );
}
function Select({ testId, label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold block mb-1">{label}</span>
      <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-[var(--tm-border)] bg-white px-2 text-sm font-bold text-[var(--tm-navy)]">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function Toggle({ testId, label, sub, value, onChange }) {
  return (
    <button type="button" data-testid={testId} onClick={() => onChange(!value)}
      className="flex items-start gap-3 text-left rounded-md border border-[var(--tm-border)] p-3 hover:bg-[var(--tm-surface)]">
      <span className={`h-5 w-9 rounded-full transition-colors flex-shrink-0 mt-0.5 ${value ? "bg-[var(--tm-orange)]" : "bg-[var(--tm-text-muted)]"}`}>
        <span className={`block h-4 w-4 rounded-full bg-white shadow translate-y-0.5 transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">{label}</span>
        {sub && <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{sub}</span>}
      </span>
      {value && <CheckCheck className="h-4 w-4 text-[var(--tm-orange)] flex-shrink-0" />}
    </button>
  );
}

function IconBtn({ testId, title, onClick, children }) {
  return (
    <button type="button" data-testid={testId} title={title} onClick={onClick}
      className="h-7 w-7 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] inline-flex items-center justify-center">
      {children}
    </button>
  );
}

function ConfirmDialog({ open, onCancel, onConfirm, testId, icon, title, body, confirmLabel = "Confirm", danger = false }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent
        data-testid={testId}
        className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]"
      >
        <DialogHeader>
          <DialogTitle className="text-[var(--tm-navy)] inline-flex items-center gap-2">{icon} {title}</DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)] font-semibold leading-snug">{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 flex-row">
          <Button variant="outline" data-testid={`${testId}-cancel`} onClick={onCancel}
            className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">Cancel</Button>
          <Button data-testid={`${testId}-confirm`} onClick={onConfirm}
            className={[
              "h-11 flex-1 rounded-md font-bold text-white",
              danger ? "bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)]" : "bg-[var(--tm-navy)] hover:brightness-110",
            ].join(" ")}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ICON_BY_TYPE = {
  trip:     <FileBarChart2 className="h-4 w-4" />,
  mileage:  <Route className="h-4 w-4" />,
  stop:     <ListChecks className="h-4 w-4" />,
  driver:   <SettingsIcon className="h-4 w-4" />,
  export:   <Download className="h-4 w-4" />,
  document: <FileImage className="h-4 w-4" />,
};

function fmt(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 10_000) return Math.round(v / 1000) + "K";
  return v.toLocaleString();
}
function formatWhen(ms) {
  if (!ms) return "—";
  try {
    const d = new Date(ms);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}
function formatRelative(ms) {
  try {
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return "—"; }
}
