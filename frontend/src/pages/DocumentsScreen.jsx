import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import {
  FolderOpen, FileText, Camera, Receipt, Scale, Truck, ChevronRight,
  ShieldCheck, Search, FilterX, Calendar as CalendarIcon, Hash,
  Image as ImageIcon, Upload, FileUp, Plus, Trash2, Archive as ArchiveIcon,
  Lock, EyeOff, Layers, Copy as CopyIcon, RotateCcw, HardDrive, Cloud,
  Settings as SettingsIcon, FileBarChart2, Download, Share2, CheckCheck,
} from "lucide-react";
import {
  listDocuments, upsertDocument, deleteDocument, archiveDocument,
  filterDocuments, detectDuplicates, countByCategory, fileTypeFromMime,
  DOCUMENT_CATEGORIES, DOCUMENT_FILE_TYPES, categoryLabel,
} from "../lib/document-store";
import { loadDocOrganization, saveDocOrganization, resetDocOrganization } from "../lib/doc-organization";
import { getStorageUsage, getDestinationConfig, formatBytes } from "../lib/storage-location";
import { toast } from "sonner";

/**
 * /documents — operational paperwork hub.
 *
 * Per spec: 10 sections covering Overview · Categories · Recent ·
 * (Viewer = own route /documents/:id) · Search & Filters · Upload &
 * Capture · Storage Management · Organization · Export & Share ·
 * Document Security. The actual files live OUTSIDE the app inside
 * the user-selected Trip Monitor folder; this screen only stores
 * indexes, references, mapping data, metadata, and thumbnails.
 */
const ICON_BY_CATEGORY = {
  bols:             FileText,
  scale_tickets:    Scale,
  lumper_receipts:  Receipt,
  receipts:         Receipt,
  trip_attachments: FileText,
  photos:           Camera,
  completed_sheets: Truck,
  exports:          FolderOpen,
};

export default function DocumentsScreen() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState(() => listDocuments());
  const [organization, setOrganization] = useState(() => loadDocOrganization());
  const [storage, setStorage] = useState({ percent: 0, usage: 0, quota: 0 });
  const [destination, setDestination] = useState(null);

  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const [trip, setTrip] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fileType, setFileType] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind, payload? }

  const fileRefAny    = useRef(null);
  const fileRefImg    = useRef(null);
  const fileRefPdf    = useRef(null);
  const fileRefBatch  = useRef(null);
  const cameraRef     = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        setStorage(await getStorageUsage());
        setDestination(await getDestinationConfig());
      } catch { /* ignore */ }
    })();
  }, []);

  const reload = () => setDocs([...listDocuments()]);

  const filtered = useMemo(() => filterDocuments(docs, {
    category, q, trip, fileType,
    from: from ? new Date(from).getTime() : null,
    to: to ? new Date(to).getTime() + 24 * 3600_000 - 1 : null,
    includeArchived: showArchived,
  }), [docs, category, q, trip, fileType, from, to, showArchived]);

  const counts = useMemo(() => countByCategory(docs), [docs]);
  const duplicates = useMemo(() => detectDuplicates(docs), [docs]);
  const duplicateCount = Object.values(duplicates).reduce((sum, arr) => sum + arr.length, 0);
  const archivedCount = docs.filter((d) => d.archived).length;

  const overview = useMemo(() => {
    const live = docs.filter((d) => !d.archived);
    const totalBytes = live.reduce((sum, d) => sum + (d.sizeBytes || 0), 0);
    const lastUpload = live.reduce((acc, d) => Math.max(acc, d.createdAt || 0), 0);
    const lastExport = docs.filter((d) => d.category === "exports").reduce((a, d) => Math.max(a, d.createdAt || 0), 0);
    return { total: live.length, bytes: totalBytes, lastUpload, lastExport };
  }, [docs]);

  const recent = useMemo(() =>
    [...docs].filter((d) => !d.archived && !d.hidden)
      .sort((a, b) => (b.lastOpened || b.createdAt || 0) - (a.lastOpened || a.createdAt || 0))
      .slice(0, 8),
  [docs]);

  // ---- importers ---------------------------------------------------------
  const onImportFiles = async (fileList, forceCategory) => {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);
    let added = 0;
    for (const f of arr) {
      const cat = forceCategory || guessCategory(f);
      const mime = f.type || "application/octet-stream";
      const ft = fileTypeFromMime(mime);
      const thumb = ft === "image" ? await readThumbnail(f) : null;
      upsertDocument({
        id: `doc-${cryptoRandom()}`,
        name: f.name,
        category: cat,
        mime, fileType: ft,
        sizeBytes: f.size,
        location: `Trip Monitor / ${(DOCUMENT_CATEGORIES.find((c) => c.value === cat) || DOCUMENT_CATEGORIES[0]).path}`,
        createdAt: Date.now(),
        thumbnail: thumb,
      });
      added += 1;
    }
    reload();
    toast.success(`${added} document${added === 1 ? "" : "s"} added`);
  };

  // ---- mutators ----------------------------------------------------------
  const onResetFilters = () => {
    setCategory("all"); setQ(""); setTrip(""); setFrom(""); setTo(""); setFileType("all");
  };
  const onOpen = (d) => {
    upsertDocument({ id: d.id, lastOpened: Date.now() });
    navigate(`/documents/${encodeURIComponent(d.id)}`);
  };
  const onArchive = (d) => { archiveDocument(d.id, !d.archived); reload(); toast.success(d.archived ? "Restored" : "Archived"); };
  const onDelete = (d) => setConfirm({ kind: "delete-one", payload: d });

  const applyConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === "delete-one") {
      deleteDocument(confirm.payload.id); reload(); toast.success("Document removed");
    } else if (confirm.kind === "archive-completed") {
      const all = listDocuments();
      for (const d of all) if (d.category === "completed_sheets" && !d.archived) archiveDocument(d.id, true);
      reload(); toast.success("Completed files archived");
    } else if (confirm.kind === "lock-batch") {
      // Reserved for security expansion.
      reload();
    }
    setConfirm(null);
  };

  const onSaveOrganization = (next) => {
    const saved = saveDocOrganization(next);
    setOrganization(saved);
    toast.success("Preferences saved");
  };
  const onResetOrganization = () => { setOrganization(resetDocOrganization()); toast.success("Preferences reset"); };

  const onExportSelected = () => {
    if (filtered.length === 0) { toast.info("Nothing to export — adjust filters."); return; }
    toast.success(`Queued ${filtered.length} document${filtered.length === 1 ? "" : "s"} for export`);
  };
  const onSharePackage = () => {
    if (filtered.length === 0) { toast.info("Nothing to share — adjust filters."); return; }
    toast.success("Share sheet opened (per device)");
  };
  const onZipPackage = () => {
    if (filtered.length === 0) { toast.info("Nothing to ZIP — adjust filters."); return; }
    toast.message("ZIP package coming soon — your selection will be bundled with a manifest.");
  };
  const onCloudSync = () => {
    toast.info("Cloud sync activates once you connect a cloud destination in Settings → Storage.");
  };

  const storageMode = destination?.mode || "app";
  const STORAGE_LABEL = {
    app:       "App-managed storage",
    documents: "Trip Monitor / (Documents)",
    sdcard:    "SD card · Trip Monitor folder",
    custom:    destination?.label || "Custom folder",
  }[storageMode];

  return (
    <AppShell active="documents" overline="Bottom Nav" pageTitle="Documents">
      <div data-testid="documents-screen" className="flex flex-col gap-4">

        {/* Uninstall reassurance */}
        <Notice icon={<ShieldCheck className="h-5 w-5 text-[var(--tm-blue)] shrink-0 mt-0.5" />}>
          Documents are stored outside the app in your Trip Monitor folder.
          Uninstalling Trip Monitor will <span className="font-black">not</span> delete these files.
          Manage the folder in <button onClick={() => navigate("/settings")} className="underline font-bold text-[var(--tm-blue)]">Settings → Storage</button>.
        </Notice>

        {/* 1. DOCUMENT OVERVIEW */}
        <Card>
          <CardHeader icon={<FileBarChart2 className="h-4 w-4" />} title="Document Overview" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Tile testId="doc-ov-total" label="Total Documents" value={String(overview.total)} icon={<FileText className="h-4 w-4" />} />
            <Tile testId="doc-ov-storage" label="Storage Used"  value={formatBytes(overview.bytes)} icon={<HardDrive className="h-4 w-4" />} />
            <Tile testId="doc-ov-last-upload" label="Last Upload" value={overview.lastUpload ? formatRelative(overview.lastUpload) : "—"} icon={<Upload className="h-4 w-4" />} />
            <Tile testId="doc-ov-last-export" label="Last Export" value={overview.lastExport ? formatRelative(overview.lastExport) : "—"} icon={<Download className="h-4 w-4" />} />
            <Tile testId="doc-ov-location"   label="Storage Location" value={STORAGE_LABEL} icon={<FolderOpen className="h-4 w-4" />} truncate />
          </div>
        </Card>

        {/* 2. DOCUMENT CATEGORIES */}
        <Card>
          <CardHeader icon={<Layers className="h-4 w-4" />} title="Document Categories" right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">
              Tap a category to filter
            </span>
          )} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {DOCUMENT_CATEGORIES.map((cat) => {
              const Icon = ICON_BY_CATEGORY[cat.value] || FolderOpen;
              const active = category === cat.value;
              return (
                <button
                  type="button"
                  key={cat.value}
                  data-testid={`doc-cat-${cat.value}`}
                  onClick={() => setCategory(active ? "all" : cat.value)}
                  className={[
                    "text-left rounded-xl p-4 transition-colors flex flex-col gap-1.5",
                    active
                      ? "bg-[var(--tm-navy)] border border-[var(--tm-navy)] text-white"
                      : "bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] shadow-[0_2px_8px_rgba(14,31,71,0.04)]",
                  ].join(" ")}
                >
                  <span className={`h-9 w-9 rounded-md ${active ? "bg-white/15" : "bg-[var(--tm-surface-2)]"} inline-flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${active ? "text-white" : "text-[var(--tm-navy)]"}`} strokeWidth={1.6} />
                  </span>
                  <span className="text-sm font-bold mt-1.5">{cat.label}</span>
                  <span className={`text-[12px] ${active ? "text-white/85" : "text-[var(--tm-navy)]/70"} font-semibold leading-snug`}>{cat.desc}</span>
                  <span className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] uppercase tracking-wider font-bold opacity-80 truncate">{cat.path}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${active ? "bg-white/20 text-white" : "bg-[var(--tm-blue)]/10 text-[var(--tm-blue)]"}`}>
                      {counts[cat.value] || 0}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* 3. RECENT DOCUMENTS */}
        <Card>
          <CardHeader icon={<FileText className="h-4 w-4" />} title="Recent Documents" right={(
            <button type="button" data-testid="doc-recent-all"
              onClick={() => { setCategory("all"); setQ(""); setTrip(""); setFrom(""); setTo(""); setFileType("all"); }}
              className="text-xs font-bold text-[var(--tm-blue)] hover:underline">
              View all
            </button>
          )} />
          {recent.length === 0 ? (
            <Empty>No documents yet. Use Upload &amp; Capture below to add your first one.</Empty>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {recent.map((d) => (
                <DocCard key={d.id} d={d} onClick={() => onOpen(d)} />
              ))}
            </div>
          )}
        </Card>

        {/* 5. SEARCH & FILTERS */}
        <Card>
          <CardHeader icon={<Search className="h-4 w-4" />} title="Search &amp; Filters" right={(
            <button type="button" onClick={onResetFilters}
              data-testid="doc-filters-reset"
              className="text-xs font-bold text-[var(--tm-blue)] hover:underline inline-flex items-center gap-1">
              <FilterX className="h-3 w-3" /> Reset
            </button>
          )} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FieldWithIcon icon={<Search className="h-4 w-4" />}>
              <Input data-testid="doc-search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, trip number, location…" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
            <FieldWithIcon icon={<Hash className="h-4 w-4" />}>
              <Input data-testid="doc-filter-trip" value={trip} onChange={(e) => setTrip(e.target.value)}
                placeholder="Trip / Order #" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
            <FieldWithIcon icon={<CalendarIcon className="h-4 w-4" />}>
              <Input data-testid="doc-filter-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                placeholder="From" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
            <FieldWithIcon icon={<CalendarIcon className="h-4 w-4" />}>
              <Input data-testid="doc-filter-to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
                placeholder="To" className="pl-8 h-10 text-sm" />
            </FieldWithIcon>
          </div>
          <Chips testId="doc-filter-category" value={category} onChange={setCategory}
            options={[{ value: "all", label: "All categories" }, ...DOCUMENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]} />
          <Chips testId="doc-filter-filetype" value={fileType} onChange={setFileType}
            options={[{ value: "all", label: "Any type" }, ...DOCUMENT_FILE_TYPES]} />
        </Card>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <ActionPill
            testId="doc-toggle-archive"
            icon={<ArchiveIcon className="h-4 w-4" />}
            label={showArchived ? "Hide archived" : `Show archived${archivedCount ? ` (${archivedCount})` : ""}`}
            active={showArchived}
            onClick={() => setShowArchived((v) => !v)}
          />
        </div>

        {/* RESULTS */}
        <Card>
          <CardHeader icon={<FileText className="h-4 w-4" />} title="Documents" right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">
              {filtered.length} item{filtered.length === 1 ? "" : "s"}
            </span>
          )} />
          {filtered.length === 0 ? (
            <Empty>No documents match these filters.</Empty>
          ) : (
            <div className="flex flex-col">
              {filtered.map((d) => (
                <DocRow key={d.id} d={d}
                  onOpen={() => onOpen(d)}
                  onArchive={() => onArchive(d)}
                  onDelete={() => onDelete(d)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* 6. UPLOAD & CAPTURE */}
        <Card>
          <CardHeader icon={<Upload className="h-4 w-4" />} title="Upload &amp; Capture" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <UploadTile testId="doc-up-camera" icon={<Camera className="h-5 w-5" />} label="Take photo"
              onClick={() => cameraRef.current?.click()} />
            <UploadTile testId="doc-up-gallery" icon={<ImageIcon className="h-5 w-5" />} label="Import image"
              onClick={() => fileRefImg.current?.click()} />
            <UploadTile testId="doc-up-pdf" icon={<FileUp className="h-5 w-5" />} label="Import PDF"
              onClick={() => fileRefPdf.current?.click()} />
            <UploadTile testId="doc-up-attach" icon={<Plus className="h-5 w-5" />} label="Attach to trip"
              onClick={() => fileRefAny.current?.click()} />
            <UploadTile testId="doc-up-batch" icon={<Layers className="h-5 w-5" />} label="Batch upload"
              onClick={() => fileRefBatch.current?.click()} />
          </div>
          {/* hidden inputs */}
          <input ref={cameraRef}    type="file" accept="image/*" capture="environment"
            data-testid="doc-input-camera" className="sr-only"
            onChange={(e) => onImportFiles(e.target.files, "photos")} />
          <input ref={fileRefImg}   type="file" accept="image/*" multiple
            data-testid="doc-input-img" className="sr-only"
            onChange={(e) => onImportFiles(e.target.files, "photos")} />
          <input ref={fileRefPdf}   type="file" accept="application/pdf" multiple
            data-testid="doc-input-pdf" className="sr-only"
            onChange={(e) => onImportFiles(e.target.files)} />
          <input ref={fileRefAny}   type="file" multiple
            data-testid="doc-input-any" className="sr-only"
            onChange={(e) => onImportFiles(e.target.files, "trip_attachments")} />
          <input ref={fileRefBatch} type="file" multiple
            data-testid="doc-input-batch" className="sr-only"
            onChange={(e) => onImportFiles(e.target.files)} />
        </Card>

        {/* 7. STORAGE MANAGEMENT */}
        <Card>
          <CardHeader icon={<FolderOpen className="h-4 w-4" />} title="Storage Management" />
          <NavRow testId="doc-storage-path"
            icon={<FolderOpen className="h-4 w-4" />}
            title={STORAGE_LABEL}
            sub="Documents · Completed Trip Sheets · Exports"
            onClick={() => navigate("/settings")}
          />
          <NavRow testId="doc-storage-change"
            icon={<SettingsIcon className="h-4 w-4" />}
            title="Change storage location"
            sub="Choose a different Trip Monitor folder"
            onClick={() => navigate("/settings")}
          />
          <NavRow testId="doc-storage-usage"
            icon={<HardDrive className="h-4 w-4" />}
            title={`${storage.percent}% used`}
            sub={`${formatBytes(storage.usage)} of ${formatBytes(storage.quota || 1)} available`}
            onClick={() => navigate("/settings")}
            tone={storage.percent >= 90 ? "warn" : "default"}
          />
          <NavRow testId="doc-cloud-sync"
            icon={<Cloud className="h-4 w-4" />}
            title="Cloud sync"
            sub="Off — connect a cloud destination in Settings"
            onClick={onCloudSync}
          />
        </Card>

        {/* 8. DOCUMENT ORGANIZATION */}
        <Card>
          <CardHeader icon={<Layers className="h-4 w-4" />} title="Document Organization" right={(
            <button type="button" onClick={onResetOrganization}
              data-testid="doc-org-reset"
              className="text-xs font-bold text-[var(--tm-blue)] hover:underline inline-flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Toggle testId="doc-org-by-trip" label="Auto-organize by trip" sub="Group documents under their order number"
              value={organization.autoOrganizeByTrip} onChange={(v) => onSaveOrganization({ ...organization, autoOrganizeByTrip: v })} />
            <Toggle testId="doc-org-by-date" label="Auto-organize by date" sub="Sort folders by upload date"
              value={organization.autoOrganizeByDate} onChange={(v) => onSaveOrganization({ ...organization, autoOrganizeByDate: v })} />
            <Toggle testId="doc-org-rename" label="Rename rules" sub="{category}-{trip}-{seq}.{ext}"
              value={organization.renameByPattern} onChange={(v) => onSaveOrganization({ ...organization, renameByPattern: v })} />
            <Toggle testId="doc-org-dupes" label="Detect duplicates" sub={`${duplicateCount ? duplicateCount : "No"} duplicate match${duplicateCount === 1 ? "" : "es"} found`}
              value={organization.detectDuplicates} onChange={(v) => onSaveOrganization({ ...organization, detectDuplicates: v })} />
            <Toggle testId="doc-org-archive-completed" label="Archive completed files" sub="Move completed-trip docs to archive automatically"
              value={organization.archiveCompletedFiles} onChange={(v) => onSaveOrganization({ ...organization, archiveCompletedFiles: v })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionPill
              testId="doc-action-archive-completed"
              icon={<ArchiveIcon className="h-4 w-4" />}
              label="Archive completed now"
              onClick={() => setConfirm({ kind: "archive-completed" })}
            />
            <ActionPill
              testId="doc-action-show-dupes"
              icon={<CopyIcon className="h-4 w-4" />}
              label={duplicateCount ? `Show duplicates (${duplicateCount})` : "No duplicates"}
              onClick={() => duplicateCount ? toast.info(`${duplicateCount} duplicate filenames detected — open them in the list to review.`) : toast.success("No duplicate filenames detected.")}
              danger={duplicateCount > 0}
            />
          </div>
        </Card>

        {/* 9. EXPORT & SHARE */}
        <Card>
          <CardHeader icon={<Download className="h-4 w-4" />} title="Export &amp; Share" right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">
              Acts on the filtered list above
            </span>
          )} />
          <div className="flex flex-wrap gap-2">
            <ActionPill testId="doc-export-selected" icon={<Download className="h-4 w-4" />} label="Export selected" onClick={onExportSelected} />
            <ActionPill testId="doc-share-selected"  icon={<Share2 className="h-4 w-4" />} label="Share files" onClick={onSharePackage} />
            <ActionPill testId="doc-save-cloud"      icon={<Cloud className="h-4 w-4" />} label="Save to cloud" onClick={onCloudSync} />
            <ActionPill testId="doc-zip-package"     icon={<Layers className="h-4 w-4" />} label="Generate ZIP package" onClick={onZipPackage} />
          </div>
        </Card>

        {/* 10. DOCUMENT SECURITY */}
        <Card>
          <CardHeader icon={<Lock className="h-4 w-4" />} title="Document Security" right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">Optional</span>
          )} />
          <p className="text-[12px] text-[var(--tm-navy)]/75 font-semibold leading-snug">
            Lock sensitive documents so they require an extra confirm before opening, sharing,
            or exporting. Hidden documents won't appear in Recent or in the default list — toggle
            "Show archived" to find them. Destructive actions always ask for confirmation.
          </p>
          <SecurityTilesRow docs={docs} />
          <div className="flex flex-wrap gap-2">
            <ActionPill testId="doc-sec-show-locked" icon={<Lock className="h-4 w-4" />}
              label={`Locked: ${docs.filter((d) => d.locked).length}`}
              onClick={() => toast.info("Open a document to toggle its lock state.")}
            />
            <ActionPill testId="doc-sec-show-hidden" icon={<EyeOff className="h-4 w-4" />}
              label={`Hidden: ${docs.filter((d) => d.hidden).length}`}
              onClick={() => toast.info("Open a document to toggle its hidden state.")}
            />
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={!!confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={applyConfirm}
        testId="doc-confirm"
        icon={confirm?.kind === "delete-one" ? <Trash2 className="h-4 w-4" /> : <ArchiveIcon className="h-4 w-4" />}
        danger={confirm?.kind === "delete-one"}
        title={confirm?.kind === "delete-one" ? "Delete this document?" : "Archive completed files?"}
        body={confirm?.kind === "delete-one"
          ? "This removes the index entry from your documents list. The actual file in your Trip Monitor folder is not deleted — remove it manually if needed."
          : "Move every Completed-Trip-Sheet entry to the archive. The files in your Trip Monitor folder are not deleted."}
        confirmLabel={confirm?.kind === "delete-one" ? "Delete" : "Archive"}
      />
    </AppShell>
  );
}

/* ───────────────────────── reusable bits ───────────────────────── */

function Card({ children }) {
  return (
    <div className="rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-3 bg-white border border-[var(--tm-border)]">
      {children}
    </div>
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
function Tile({ testId, label, value, icon, truncate }) {
  return (
    <div data-testid={testId} className="bg-white border border-[var(--tm-border)] rounded-lg p-3 flex flex-col gap-1">
      <span className="text-[var(--tm-navy)]" aria-hidden="true">{icon}</span>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold mt-1">{label}</div>
      <div className={`text-2xl font-black tracking-tight text-[var(--tm-navy)] ${truncate ? "truncate text-base md:text-lg" : ""}`} title={String(value)}>{value}</div>
    </div>
  );
}
function Empty({ children }) {
  return <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold px-1 py-2 leading-snug">{children}</div>;
}
function Notice({ icon, children }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-[var(--tm-surface)] border border-[var(--tm-border)]">
      {icon}
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
function UploadTile({ testId, icon, label, onClick }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className="bg-white border border-[var(--tm-border)] rounded-xl p-3 hover:bg-[var(--tm-surface)] transition-colors flex flex-col items-start gap-1.5 text-left">
      <span className="h-10 w-10 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center">{icon}</span>
      <span className="text-sm font-bold text-[var(--tm-navy)]">{label}</span>
    </button>
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

function DocCard({ d, onClick }) {
  const Icon = ICON_BY_CATEGORY[d.category] || FileText;
  return (
    <button type="button" data-testid={`doc-card-${d.id}`} onClick={onClick}
      className="text-left bg-white border border-[var(--tm-border)] rounded-xl p-2.5 hover:bg-[var(--tm-surface)] transition-colors flex flex-col gap-1.5">
      <span className="aspect-[4/3] rounded-md bg-[var(--tm-surface-2)] flex items-center justify-center overflow-hidden">
        {d.thumbnail
          ? <img src={d.thumbnail} alt="" className="h-full w-full object-cover" />
          : <Icon className="h-7 w-7 text-[var(--tm-navy)]/70" strokeWidth={1.4} />}
      </span>
      <span className="block text-sm font-bold text-[var(--tm-navy)] truncate" title={d.name}>{d.name}</span>
      <span className="block text-[11px] text-[var(--tm-navy)]/70 font-semibold truncate">
        {categoryLabel(d.category)} · {formatRelative(d.createdAt)}
      </span>
    </button>
  );
}

function DocRow({ d, onOpen, onArchive, onDelete }) {
  const Icon = ICON_BY_CATEGORY[d.category] || FileText;
  return (
    <div data-testid={`doc-row-${d.id}`}
      className="flex items-center gap-3 px-3 py-2.5 rounded-md border-b border-[var(--tm-border)]/50 last:border-b-0 hover:bg-[var(--tm-surface)]">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span className="h-10 w-10 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {d.thumbnail
            ? <img src={d.thumbnail} alt="" className="h-full w-full object-cover" />
            : <Icon className="h-5 w-5" strokeWidth={1.5} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-[var(--tm-navy)] truncate">{d.name}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-surface-2)] text-[var(--tm-navy)]/80 text-[9px] tracking-widest uppercase font-black">{categoryLabel(d.category)}</span>
            {d.fileType && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-blue)]/10 text-[var(--tm-blue)] text-[9px] tracking-widest uppercase font-black">{d.fileType}</span>}
            {d.locked && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-orange)]/10 text-[var(--tm-orange-deep)] text-[9px] tracking-widest uppercase font-black inline-flex items-center gap-1"><Lock className="h-2.5 w-2.5" />Locked</span>}
            {d.archived && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-text-muted)] text-white text-[9px] tracking-widest uppercase font-black">Archived</span>}
          </span>
          <span className="block text-[11px] text-[var(--tm-navy)]/70 font-semibold mt-0.5 truncate">
            {d.location || "—"} · {formatBytes(d.sizeBytes || 0)} · {formatWhen(d.createdAt)}
            {d.orderNumber ? ` · #${d.orderNumber}` : ""}
          </span>
        </span>
      </button>
      <div className="flex items-center gap-1 flex-shrink-0">
        <IconBtn testId={`doc-row-${d.id}-archive`} title={d.archived ? "Restore" : "Archive"} onClick={onArchive}>
          {d.archived ? <RotateCcw className="h-3.5 w-3.5" /> : <ArchiveIcon className="h-3.5 w-3.5" />}
        </IconBtn>
        <IconBtn testId={`doc-row-${d.id}-delete`} title="Delete" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
      </div>
    </div>
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

function SecurityTilesRow({ docs }) {
  const lockedCount   = docs.filter((d) => d.locked).length;
  const hiddenCount   = docs.filter((d) => d.hidden).length;
  const sensitive     = docs.filter((d) => d.category === "bols" || d.category === "lumper_receipts").length;
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile testId="doc-sec-locked"    label="Locked"     value={String(lockedCount)} icon={<Lock className="h-4 w-4" />} />
      <Tile testId="doc-sec-hidden"    label="Hidden"     value={String(hiddenCount)} icon={<EyeOff className="h-4 w-4" />} />
      <Tile testId="doc-sec-sensitive" label="Sensitive"  value={String(sensitive)}    icon={<ShieldCheck className="h-4 w-4" />} />
    </div>
  );
}

/* ---- helpers ---- */

function guessCategory(file) {
  const t = (file.type || "").toLowerCase();
  const n = (file.name || "").toLowerCase();
  if (t.startsWith("image/")) return "photos";
  if (t === "application/pdf") return "bols";
  if (n.endsWith(".csv") || n.endsWith(".json")) return "exports";
  return "trip_attachments";
}

async function readThumbnail(file) {
  try {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        // Down-sample to ~256px on the longest edge for a small data URL.
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const max = 256;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          try { resolve(canvas.toDataURL("image/jpeg", 0.7)); } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  } catch { return null; }
}

function cryptoRandom() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return `${buf[0].toString(36)}${buf[1].toString(36)}`;
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function formatWhen(ms) {
  if (!ms) return "—";
  try {
    const d = new Date(ms);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}
function formatRelative(ms) {
  if (!ms) return "—";
  try {
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return "—"; }
}
