import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { Button } from "../components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import {
  ArrowLeft, ZoomIn, ZoomOut, RotateCw, Share2, Download, Trash2,
  Edit3, FolderInput, Paperclip, Lock, Unlock, EyeOff, Eye, FileText,
  Archive as ArchiveIcon, RotateCcw,
} from "lucide-react";
import {
  listDocuments, upsertDocument, deleteDocument, archiveDocument,
  lockDocument, hideDocument, categoryLabel, DOCUMENT_CATEGORIES,
  categoryPath,
} from "../lib/document-store";
import { formatBytes } from "../lib/storage-location";
import { toast } from "sonner";

/**
 * /documents/:id — full-screen document viewer.
 *
 * Renders the stored thumbnail (if image), or a placeholder for
 * PDFs/other types since the actual binary lives outside the app.
 * Supports zoom, rotate, share, export, rename, move (reassign
 * category), attach to trip, archive, lock, hide, delete.
 *
 * Per spec this is its OWN screen — never a popup modal.
 */
export default function DocumentViewerScreen() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [docs, setDocs] = useState(() => listDocuments());
  const doc = useMemo(() => docs.find((d) => d.id === id) || null, [docs, id]);

  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveValue, setMoveValue] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachValue, setAttachValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef(null);

  const reload = () => setDocs([...listDocuments()]);

  useEffect(() => { if (doc) { setRenameValue(doc.name); setMoveValue(doc.category); setAttachValue(doc.orderNumber || ""); } }, [doc]);

  if (!doc) {
    return (
      <AppShell overline="Documents" pageTitle="Document not found">
        <div data-testid="doc-viewer-missing" className="bg-white border border-[var(--tm-border)] rounded-xl p-6 max-w-lg">
          <p className="text-sm font-bold text-[var(--tm-navy)]">This document no longer exists in the index.</p>
          <p className="text-[12px] text-[var(--tm-navy)]/70 font-semibold mt-1">It may have been deleted or never existed.</p>
          <Button onClick={() => navigate("/documents")} data-testid="doc-viewer-back-missing"
            className="mt-3 h-10 bg-[var(--tm-navy)] text-white rounded-md font-bold">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Documents
          </Button>
        </div>
      </AppShell>
    );
  }

  const isImage = doc.fileType === "image";

  const onShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: doc.name, text: `${doc.name} — ${categoryLabel(doc.category)}` });
        toast.success("Shared");
      } else {
        toast.info("Sharing isn't supported on this device.");
      }
    } catch { /* user cancelled */ }
  };
  const onExport = () => {
    if (!doc.thumbnail) { toast.info("No cached preview to export — use Open file from your Trip Monitor folder."); return; }
    try {
      const a = document.createElement("a");
      a.href = doc.thumbnail;
      a.download = doc.name || "document";
      a.click();
      toast.success(`Exported preview of ${doc.name}`);
    } catch { toast.error("Export failed"); }
  };

  const onRename = () => {
    const name = renameValue.trim();
    if (!name) { toast.error("Filename can't be empty"); return; }
    upsertDocument({ id: doc.id, name });
    reload(); setRenameOpen(false); toast.success("Renamed");
  };
  const onMove = () => {
    upsertDocument({
      id: doc.id, category: moveValue,
      location: `Trip Monitor / ${categoryPath(moveValue)}`,
    });
    reload(); setMoveOpen(false); toast.success(`Moved to ${categoryLabel(moveValue)}`);
  };
  const onAttach = () => {
    upsertDocument({ id: doc.id, orderNumber: attachValue.trim() || null });
    reload(); setAttachOpen(false);
    toast.success(attachValue.trim() ? `Attached to #${attachValue.trim()}` : "Detached from trip");
  };

  const onArchive = () => { archiveDocument(doc.id, !doc.archived); reload(); toast.success(doc.archived ? "Restored" : "Archived"); };
  const onLock    = () => { lockDocument(doc.id, !doc.locked); reload(); toast.success(doc.locked ? "Unlocked" : "Locked"); };
  const onHide    = () => { hideDocument(doc.id, !doc.hidden); reload(); toast.success(doc.hidden ? "Visible" : "Hidden"); };
  const doDelete  = () => {
    deleteDocument(doc.id);
    setConfirmDelete(false);
    toast.success("Document removed");
    navigate("/documents");
  };

  return (
    <AppShell overline="Documents" pageTitle="Document Viewer">
      <div data-testid="doc-viewer-screen" className="flex flex-col gap-4">
        <button type="button" data-testid="doc-viewer-back" onClick={() => navigate("/documents")}
          className="self-start inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)] hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Documents
        </button>

        {/* HEADER */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)]">
          <div className="flex flex-wrap items-start gap-3">
            <span className="h-10 w-10 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 data-testid="doc-viewer-title" className="text-lg md:text-xl font-black tracking-tight text-[var(--tm-navy)] truncate">{doc.name}</h2>
                <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-surface-2)] text-[var(--tm-navy)]/80 text-[9px] tracking-widest uppercase font-black">{categoryLabel(doc.category)}</span>
                {doc.fileType && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-blue)]/10 text-[var(--tm-blue)] text-[9px] tracking-widest uppercase font-black">{doc.fileType}</span>}
                {doc.locked && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-orange)]/10 text-[var(--tm-orange-deep)] text-[9px] tracking-widest uppercase font-black">Locked</span>}
                {doc.archived && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-text-muted)] text-white text-[9px] tracking-widest uppercase font-black">Archived</span>}
              </div>
              <div className="text-[12px] text-[var(--tm-navy)]/75 font-semibold mt-1">
                {doc.location || "—"} · {formatBytes(doc.sizeBytes || 0)}
                {doc.orderNumber ? ` · attached to #${doc.orderNumber}` : ""}
              </div>
            </div>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl p-3 flex flex-wrap items-center gap-2">
          <Tool testId="doc-viewer-zoomout" icon={<ZoomOut className="h-4 w-4" />} label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} />
          <span className="text-xs font-bold tracking-wider text-[var(--tm-navy)] tabular-nums px-1" data-testid="doc-viewer-zoom-level">{Math.round(zoom * 100)}%</span>
          <Tool testId="doc-viewer-zoomin" icon={<ZoomIn className="h-4 w-4" />} label="Zoom in"
            onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} />
          <span className="mx-2 hidden md:inline-block h-5 w-px bg-[var(--tm-border)]" />
          <Tool testId="doc-viewer-rotate" icon={<RotateCw className="h-4 w-4" />} label="Rotate"
            onClick={() => setRotate((r) => (r + 90) % 360)} />

          <span className="ml-auto flex flex-wrap items-center gap-2">
            <ExportButton testId="doc-viewer-share"   onClick={onShare}  icon={<Share2 className="h-4 w-4" />}>Share</ExportButton>
            <ExportButton testId="doc-viewer-export"  onClick={onExport} icon={<Download className="h-4 w-4" />}>Export</ExportButton>
            <ExportButton testId="doc-viewer-rename"  onClick={() => setRenameOpen(true)} icon={<Edit3 className="h-4 w-4" />}>Rename</ExportButton>
            <ExportButton testId="doc-viewer-move"    onClick={() => setMoveOpen(true)} icon={<FolderInput className="h-4 w-4" />}>Move</ExportButton>
            <ExportButton testId="doc-viewer-attach"  onClick={() => setAttachOpen(true)} icon={<Paperclip className="h-4 w-4" />}>Attach to trip</ExportButton>
          </span>
        </div>

        {/* PREVIEW */}
        <div className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-xl p-6 overflow-auto"
          data-testid="doc-viewer-preview-frame">
          <div className="mx-auto bg-white shadow-[0_24px_60px_rgba(14,31,71,0.10)] origin-center"
            style={{ width: 720, minHeight: 540, transform: `scale(${zoom}) rotate(${rotate}deg)`, transformOrigin: "top center" }}>
            {isImage && doc.thumbnail ? (
              <img src={doc.thumbnail} alt={doc.name} className="w-full h-auto block" />
            ) : (
              <div className="p-12 flex flex-col items-center justify-center gap-3 min-h-[540px]">
                <FileText className="h-16 w-16 text-[var(--tm-navy)]/40" strokeWidth={1.2} />
                <div className="text-sm font-bold text-[var(--tm-navy)]">{doc.name}</div>
                <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold text-center max-w-md">
                  Inline preview is only stored for images. Open this file from your
                  Trip Monitor folder ({doc.location || "Documents"}) to view its full
                  content.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECONDARY ACTIONS */}
        <div className="flex flex-wrap gap-2">
          <SecondaryButton testId="doc-viewer-archive-toggle" onClick={onArchive}
            icon={doc.archived ? <RotateCcw className="h-4 w-4" /> : <ArchiveIcon className="h-4 w-4" />}>
            {doc.archived ? "Restore" : "Archive"}
          </SecondaryButton>
          <SecondaryButton testId="doc-viewer-lock-toggle" onClick={onLock}
            icon={doc.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}>
            {doc.locked ? "Unlock" : "Lock"}
          </SecondaryButton>
          <SecondaryButton testId="doc-viewer-hide-toggle" onClick={onHide}
            icon={doc.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}>
            {doc.hidden ? "Show" : "Hide"}
          </SecondaryButton>
          <Button data-testid="doc-viewer-delete" onClick={() => setConfirmDelete(true)}
            variant="outline"
            className="h-10 bg-white border-[var(--tm-orange)]/40 text-[var(--tm-orange-deep)] hover:bg-[var(--tm-orange)]/10 rounded-md font-bold">
            <Trash2 className="mr-1 h-4 w-4" /> Delete record
          </Button>
        </div>
      </div>

      {/* RENAME */}
      <Dialog open={renameOpen} onOpenChange={(v) => { if (!v) setRenameOpen(false); }}>
        <DialogContent data-testid="doc-rename-dialog" className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription className="text-[var(--tm-text-soft)]">Update the index entry. The file in your Trip Monitor folder is not renamed automatically.</DialogDescription>
          </DialogHeader>
          <Input data-testid="doc-rename-input" ref={inputRef} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="h-10" />
          <DialogFooter className="gap-2 flex-row">
            <Button variant="outline" onClick={() => setRenameOpen(false)} className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">Cancel</Button>
            <Button data-testid="doc-rename-confirm" onClick={onRename} className="h-11 flex-1 bg-[var(--tm-navy)] text-white rounded-md font-bold">Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MOVE */}
      <Dialog open={moveOpen} onOpenChange={(v) => { if (!v) setMoveOpen(false); }}>
        <DialogContent data-testid="doc-move-dialog" className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]">
          <DialogHeader>
            <DialogTitle>Move to category</DialogTitle>
            <DialogDescription className="text-[var(--tm-text-soft)]">Re-categorize the document. Updates the suggested storage path too.</DialogDescription>
          </DialogHeader>
          <select data-testid="doc-move-select" value={moveValue} onChange={(e) => setMoveValue(e.target.value)}
            className="h-10 w-full rounded-md border border-[var(--tm-border)] bg-white px-2 text-sm font-bold text-[var(--tm-navy)]">
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <DialogFooter className="gap-2 flex-row">
            <Button variant="outline" onClick={() => setMoveOpen(false)} className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">Cancel</Button>
            <Button data-testid="doc-move-confirm" onClick={onMove} className="h-11 flex-1 bg-[var(--tm-navy)] text-white rounded-md font-bold">Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ATTACH TO TRIP */}
      <Dialog open={attachOpen} onOpenChange={(v) => { if (!v) setAttachOpen(false); }}>
        <DialogContent data-testid="doc-attach-dialog" className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]">
          <DialogHeader>
            <DialogTitle>Attach to trip</DialogTitle>
            <DialogDescription className="text-[var(--tm-text-soft)]">Type an Order or Trip number, or leave empty to detach.</DialogDescription>
          </DialogHeader>
          <Input data-testid="doc-attach-input" value={attachValue} onChange={(e) => setAttachValue(e.target.value)} placeholder="Order # / Trip ID" className="h-10" />
          <DialogFooter className="gap-2 flex-row">
            <Button variant="outline" onClick={() => setAttachOpen(false)} className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">Cancel</Button>
            <Button data-testid="doc-attach-confirm" onClick={onAttach} className="h-11 flex-1 bg-[var(--tm-navy)] text-white rounded-md font-bold">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRM */}
      <Dialog open={confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(false); }}>
        <DialogContent data-testid="doc-delete-dialog" className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /> Delete this document?</DialogTitle>
            <DialogDescription className="text-[var(--tm-text-soft)]">Removes the index entry. The file in your Trip Monitor folder is not deleted automatically — remove it manually if needed.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-row">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">Cancel</Button>
            <Button data-testid="doc-delete-confirm" onClick={doDelete} className="h-11 flex-1 bg-[var(--tm-orange)] text-white rounded-md font-bold">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/* ---- bits ---- */
function Tool({ testId, icon, label, onClick, disabled }) {
  return (
    <button type="button" data-testid={testId} aria-label={label} title={label} onClick={onClick} disabled={disabled}
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
function SecondaryButton({ testId, icon, onClick, children }) {
  return (
    <Button data-testid={testId} onClick={onClick} variant="outline"
      className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md font-bold inline-flex items-center gap-1.5">
      {icon}{children}
    </Button>
  );
}
