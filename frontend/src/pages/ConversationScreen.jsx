import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import {
  ArrowLeft, Send, Paperclip, Pin, Archive as ArchiveIcon, RotateCcw,
  AlertTriangle, Trash2, MessageSquare, ShieldAlert, Truck, User2,
  CheckCheck, Check, Clock, FileText, X, ChevronRight,
} from "lucide-react";
import {
  getConversation, getContact, sendMessage, markRead, pinConversation,
  archiveConversation, setPriority, deleteConversation,
} from "../lib/message-store";
import { listDocuments, categoryLabel } from "../lib/document-store";
import { toast } from "sonner";

/**
 * /messages/:id — Full conversation thread.
 *
 * Per spec this is its OWN screen — never a popup. Renders sent /
 * received bubbles with delivery status, attachment chips, an
 * attach-from-Documents picker, and a compose row.
 */
export default function ConversationScreen() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [conv, setConv] = useState(() => getConversation(id));
  const contact = useMemo(() => conv ? getContact(conv.contactId) : null, [conv]);
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingAttachIds, setPendingAttachIds] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scrollRef = useRef(null);

  const reload = () => setConv(getConversation(id));

  // Mark as read on open & whenever a new message arrives.
  useEffect(() => { if (id) markRead(id); reload(); }, [id]);

  // Auto-scroll to bottom on message changes.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [conv?.messages?.length]);

  if (!conv) {
    return (
      <AppShell overline="Messages" pageTitle="Conversation not found">
        <div data-testid="conv-missing" className="bg-white border border-[var(--tm-border)] rounded-xl p-6 max-w-lg">
          <p className="text-sm font-bold text-[var(--tm-navy)]">This conversation no longer exists.</p>
          <Button onClick={() => navigate("/messages")} className="mt-3 h-10 bg-[var(--tm-navy)] text-white rounded-md font-bold" data-testid="conv-back-missing">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Messages
          </Button>
        </div>
      </AppShell>
    );
  }

  const onSend = () => {
    const text = draft.trim();
    if (!text && pendingAttachIds.length === 0) return;
    sendMessage(conv.id, text, pendingAttachIds);
    setDraft(""); setPendingAttachIds([]);
    reload();
    toast.success("Sent");
  };
  const onPin     = () => { pinConversation(conv.id, !conv.pinned); reload(); toast.success(conv.pinned ? "Unpinned" : "Pinned"); };
  const onArchive = () => { archiveConversation(conv.id, !conv.archived); reload(); toast.success(conv.archived ? "Restored" : "Archived"); };
  const onPriority= () => { setPriority(conv.id, !conv.priority); reload(); toast.success(conv.priority ? "Standard priority" : "Marked priority"); };
  const onDelete  = () => {
    deleteConversation(conv.id);
    setConfirmDelete(false);
    toast.success("Conversation deleted");
    navigate("/messages");
  };

  return (
    <AppShell overline="Messages" pageTitle={contact?.name || "Conversation"}>
      <div data-testid="conv-screen" className="flex flex-col gap-3">
        <button type="button" data-testid="conv-back" onClick={() => navigate("/messages")}
          className="self-start inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)] hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Messages
        </button>

        {/* HEADER */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex items-center gap-3">
          <Avatar contact={contact} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 data-testid="conv-title" className="text-lg md:text-xl font-black tracking-tight text-[var(--tm-navy)] truncate">{contact?.name || "Unknown"}</h2>
              <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-surface-2)] text-[var(--tm-navy)]/80 text-[9px] tracking-widest uppercase font-black">{roleLabel(contact?.role)}</span>
              {conv.tripId && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-blue)]/10 text-[var(--tm-blue)] text-[9px] tracking-widest uppercase font-black">#{conv.tripId}</span>}
              {conv.priority && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-orange)] text-white text-[9px] tracking-widest uppercase font-black">Priority</span>}
              {conv.archived && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-text-muted)] text-white text-[9px] tracking-widest uppercase font-black">Archived</span>}
            </div>
            <div className="text-[12px] text-[var(--tm-navy)]/75 font-semibold mt-0.5 truncate">
              {contact?.company || ""}{contact?.online ? " · Online" : " · Offline"}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <IconBtn testId="conv-pin"      title={conv.pinned ? "Unpin" : "Pin"}                 onClick={onPin}><Pin className={`h-3.5 w-3.5 ${conv.pinned ? "text-[var(--tm-orange-deep)]" : ""}`} /></IconBtn>
            <IconBtn testId="conv-priority" title={conv.priority ? "Clear priority" : "Mark priority"} onClick={onPriority}><AlertTriangle className={`h-3.5 w-3.5 ${conv.priority ? "text-[var(--tm-orange-deep)]" : ""}`} /></IconBtn>
            <IconBtn testId="conv-archive"  title={conv.archived ? "Restore" : "Archive"}         onClick={onArchive}>
              {conv.archived ? <RotateCcw className="h-3.5 w-3.5" /> : <ArchiveIcon className="h-3.5 w-3.5" />}
            </IconBtn>
            <IconBtn testId="conv-delete"   title="Delete conversation"                            onClick={() => setConfirmDelete(true)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
          </div>
        </div>

        {/* THREAD */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col min-h-[60vh]">
          <div ref={scrollRef} data-testid="conv-thread" className="flex-1 p-4 overflow-auto flex flex-col gap-2">
            {conv.messages.length === 0 ? (
              <div className="text-sm text-[var(--tm-text-soft)] font-semibold m-auto">Send the first message to get started.</div>
            ) : conv.messages.map((m) => (
              <Bubble key={m.id} m={m} contactRole={contact?.role} />
            ))}
          </div>

          {/* COMPOSE */}
          <div className="px-3 pt-3 pb-3 border-t border-[var(--tm-border)] flex flex-col gap-2">
            {pendingAttachIds.length > 0 && (
              <PendingAttachments ids={pendingAttachIds} onRemove={(id2) => setPendingAttachIds((arr) => arr.filter((x) => x !== id2))} />
            )}
            <div className="flex items-center gap-2">
              <button type="button" data-testid="conv-attach"
                onClick={() => setPickerOpen(true)}
                className="h-10 w-10 rounded-md border border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] inline-flex items-center justify-center"
                aria-label="Attach a document">
                <Paperclip className="h-4 w-4" />
              </button>
              <Input data-testid="conv-input" value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…" className="h-10 text-sm flex-1"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              />
              <button type="button" data-testid="conv-send" onClick={onSend}
                className="h-10 px-4 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm inline-flex items-center gap-1.5">
                <Send className="h-4 w-4" /> Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ATTACHMENT PICKER */}
      <AttachmentPicker
        open={pickerOpen}
        selected={pendingAttachIds}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(ids) => { setPendingAttachIds(ids); setPickerOpen(false); }}
      />

      {/* DELETE CONFIRM */}
      <Dialog open={confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(false); }}>
        <DialogContent data-testid="conv-delete-dialog" className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2"><Trash2 className="h-4 w-4" /> Delete this conversation?</DialogTitle>
            <DialogDescription className="text-[var(--tm-text-soft)] font-semibold leading-snug">
              Removes the conversation history from this device. Attached files in your Trip Monitor folder are <span className="font-bold">not</span> deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-row">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">Cancel</Button>
            <Button data-testid="conv-delete-confirm" onClick={onDelete} className="h-11 flex-1 bg-[var(--tm-orange)] text-white rounded-md font-bold">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

/* ---- bits ---- */

function Bubble({ m, contactRole }) {
  const mine = m.from === "me";
  const align = mine ? "self-end" : "self-start";
  const cls = mine
    ? "bg-[var(--tm-blue)] text-white"
    : "bg-[var(--tm-surface)] text-[var(--tm-navy)] border border-[var(--tm-border)]";
  return (
    <div className={`max-w-[80%] flex flex-col gap-1 ${align}`} data-testid={`conv-bubble-${m.id}`}>
      <div className={`text-sm font-semibold leading-relaxed px-3 py-2.5 rounded-2xl ${cls}`}
           style={{ borderTopRightRadius: mine ? 6 : undefined, borderTopLeftRadius: !mine ? 6 : undefined }}>
        {m.text}
        {(m.attachmentRefs || []).length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {m.attachmentRefs.map((id) => <AttachmentChip key={id} id={id} mine={mine} />)}
          </div>
        )}
      </div>
      <div className={`text-[10px] uppercase tracking-wider font-bold ${mine ? "text-[var(--tm-text-muted)] self-end" : "text-[var(--tm-text-muted)]"} inline-flex items-center gap-1`}>
        <span>{formatTime(m.at)}</span>
        {mine && <StatusIcon status={m.status} />}
        {!mine && contactRole === "dispatch" && <span>· dispatch</span>}
      </div>
    </div>
  );
}
function StatusIcon({ status }) {
  if (status === "read")      return <CheckCheck className="h-3 w-3 text-[var(--tm-blue)]" />;
  if (status === "delivered") return <CheckCheck className="h-3 w-3" />;
  if (status === "sent")      return <Check className="h-3 w-3" />;
  return <Clock className="h-3 w-3" />;
}
function AttachmentChip({ id, mine }) {
  const docs = listDocuments();
  const doc = docs.find((d) => d.id === id);
  const cls = mine
    ? "bg-white/15 text-white border-white/20"
    : "bg-white text-[var(--tm-navy)] border-[var(--tm-border)]";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold border rounded-md px-2 py-1 ${cls}`}>
      <FileText className="h-3 w-3" />
      <span className="truncate max-w-[200px]" title={doc?.name || id}>{doc?.name || "Attached file"}</span>
      {doc && <span className={`text-[9px] tracking-widest uppercase ${mine ? "opacity-80" : "text-[var(--tm-text-muted)]"}`}>{doc.fileType || "file"}</span>}
    </span>
  );
}

function PendingAttachments({ ids, onRemove }) {
  const docs = listDocuments();
  return (
    <div data-testid="conv-pending-attachments" className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const d = docs.find((x) => x.id === id);
        return (
          <span key={id} className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md pl-2 pr-1 py-1 text-[var(--tm-navy)]">
            <FileText className="h-3 w-3" />
            <span className="truncate max-w-[200px]">{d?.name || "Attached file"}</span>
            <button type="button" data-testid={`conv-pending-remove-${id}`}
              onClick={() => onRemove(id)}
              className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-[var(--tm-surface-2)]"
              aria-label="Remove attachment"
            ><X className="h-3 w-3" /></button>
          </span>
        );
      })}
    </div>
  );
}

function AttachmentPicker({ open, selected, onCancel, onConfirm }) {
  const [picked, setPicked] = useState(selected);
  const [q, setQ] = useState("");
  useEffect(() => { setPicked(selected); }, [selected, open]);
  const docs = useMemo(() => listDocuments().filter((d) => !d.archived && !d.hidden), []);
  const filtered = useMemo(() => {
    if (!q) return docs;
    const lc = q.toLowerCase();
    return docs.filter((d) => `${d.name} ${categoryLabel(d.category)} ${d.orderNumber || ""}`.toLowerCase().includes(lc));
  }, [docs, q]);

  const toggle = (id) => setPicked((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent data-testid="conv-attach-picker" className="max-w-md bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2"><Paperclip className="h-4 w-4" /> Attach from Documents</DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)] font-semibold leading-snug">
            Files stay in your Trip Monitor folder — only a reference is shared in the message.
          </DialogDescription>
        </DialogHeader>

        <Input data-testid="conv-attach-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="h-9" />

        <div className="max-h-[40vh] overflow-auto flex flex-col gap-1">
          {filtered.length === 0 ? (
            <div className="text-[12px] font-semibold text-[var(--tm-navy)]/70 px-1 py-2">No matching documents.</div>
          ) : filtered.map((d) => {
            const on = picked.includes(d.id);
            return (
              <button key={d.id} type="button" data-testid={`conv-attach-pick-${d.id}`}
                onClick={() => toggle(d.id)}
                className={`flex items-center gap-2 text-left px-2 py-2 rounded-md border ${on ? "bg-[var(--tm-navy)]/5 border-[var(--tm-navy)]/40" : "bg-white border-[var(--tm-border)] hover:bg-[var(--tm-surface)]"}`}>
                <span className="h-8 w-8 rounded-md bg-[var(--tm-surface-2)] flex items-center justify-center"><FileText className="h-4 w-4 text-[var(--tm-navy)]" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-[var(--tm-navy)] truncate">{d.name}</span>
                  <span className="block text-[11px] text-[var(--tm-navy)]/70 font-semibold truncate">{categoryLabel(d.category)}{d.orderNumber ? ` · #${d.orderNumber}` : ""}</span>
                </span>
                <span className={`h-5 w-5 rounded-full border ${on ? "bg-[var(--tm-orange)] border-[var(--tm-orange)]" : "border-[var(--tm-border)]"}`} />
              </button>
            );
          })}
        </div>

        <DialogFooter className="gap-2 flex-row">
          <Button variant="outline" onClick={onCancel} className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md">Cancel</Button>
          <Button data-testid="conv-attach-confirm" onClick={() => onConfirm(picked)} className="h-11 flex-1 bg-[var(--tm-navy)] text-white rounded-md font-bold">
            Attach {picked.length ? `(${picked.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Avatar({ contact }) {
  const role = contact?.role;
  const bg = role === "dispatch" ? "bg-[var(--tm-blue)] text-white"
           : role === "support"  ? "bg-[var(--tm-navy)] text-white"
           : role === "fleet"    ? "bg-[var(--tm-orange)] text-white"
           : "bg-[var(--tm-surface-2)] text-[var(--tm-navy)]";
  const Icon = role === "dispatch" ? MessageSquare
            : role === "support"  ? ShieldAlert
            : role === "fleet"    ? Truck : User2;
  return (
    <span className={`h-10 w-10 rounded-full ${bg} flex items-center justify-center flex-shrink-0 relative`}>
      <Icon className="h-4 w-4" />
      {contact?.online && (
        <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-white" />
      )}
    </span>
  );
}

function IconBtn({ testId, title, onClick, children }) {
  return (
    <button type="button" data-testid={testId} title={title} onClick={onClick}
      className="h-8 w-8 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] inline-flex items-center justify-center">
      {children}
    </button>
  );
}

function roleLabel(role) {
  return role === "dispatch" ? "Dispatch"
       : role === "support"  ? "Support"
       : role === "driver"   ? "Driver"
       : role === "fleet"    ? "Fleet"
       : "Contact";
}
function formatTime(ms) {
  if (!ms) return "";
  try { return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// keep ChevronRight referenced for future inline previews
void ChevronRight;
