import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import {
  ArrowLeft, Search, Send, Paperclip, MessageSquare, ShieldAlert, Truck,
  User2, FileText, X, Hash,
} from "lucide-react";
import { listContacts, startConversation } from "../lib/message-store";
import { listDocuments, categoryLabel } from "../lib/document-store";
import { toast } from "sonner";

/**
 * /messages/compose — full-screen New Message composer.
 *
 * Recipient picker, optional trip number, message body, attach from
 * Documents. On send: starts (or reuses) a conversation and navigates
 * to its full-screen thread.
 */
export default function MessageComposeScreen() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState(() => listContacts());
  const [contactQ, setContactQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [trip, setTrip] = useState("");
  const [body, setBody] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachIds, setAttachIds] = useState([]);

  useEffect(() => { setContacts(listContacts()); }, []);

  const filtered = useMemo(() => {
    if (!contactQ) return contacts;
    const q = contactQ.toLowerCase();
    return contacts.filter((c) => `${c.name} ${c.company} ${c.role}`.toLowerCase().includes(q));
  }, [contacts, contactQ]);

  const docs = listDocuments();

  const onSend = () => {
    if (!selected) { toast.error("Pick a recipient"); return; }
    if (!body.trim() && attachIds.length === 0) { toast.error("Write something or attach a file"); return; }
    const cid = startConversation({
      contactId: selected.id,
      tripId: trip.trim() || null,
      message: body,
      attachmentRefs: attachIds,
    });
    if (cid) {
      toast.success("Sent");
      navigate(`/messages/${encodeURIComponent(cid)}`);
    }
  };

  return (
    <AppShell overline="Messages" pageTitle="New Message">
      <div data-testid="compose-screen" className="flex flex-col gap-4">
        <button type="button" data-testid="compose-back" onClick={() => navigate("/messages")}
          className="self-start inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)] hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Messages
        </button>

        {/* RECIPIENT */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <User2 className="h-4 w-4" />
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 flex-1">Recipient</div>
            {selected && <button type="button" data-testid="compose-clear-recipient" onClick={() => setSelected(null)} className="text-xs font-bold text-[var(--tm-blue)] hover:underline">Change</button>}
          </div>

          {selected ? (
            <SelectedRecipient contact={selected} />
          ) : (
            <>
              <FieldWithIcon icon={<Search className="h-4 w-4" />}>
                <Input data-testid="compose-contact-search" value={contactQ} onChange={(e) => setContactQ(e.target.value)} placeholder="Search by name, company, or role…" className="pl-8 h-10 text-sm" />
              </FieldWithIcon>
              <div className="flex flex-col">
                {filtered.length === 0 ? (
                  <div className="text-[12px] font-semibold text-[var(--tm-navy)]/70 px-1 py-2">No matching contacts.</div>
                ) : filtered.map((c) => (
                  <button key={c.id} type="button" data-testid={`compose-pick-${c.id}`}
                    onClick={() => setSelected(c)}
                    className="flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors text-left">
                    <Avatar contact={c} />
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-bold text-[var(--tm-navy)] block truncate">{c.name}</span>
                      <span className="text-[11px] text-[var(--tm-navy)]/70 font-semibold block truncate">{c.company}{c.online ? " · Online" : ""}</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-surface-2)] text-[var(--tm-navy)]/80 text-[9px] tracking-widest uppercase font-black">{roleLabel(c.role)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* TRIP NUMBER */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4" />
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--tm-navy)]/70">Trip / Order #</div>
            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-muted)] ml-auto">Optional</span>
          </div>
          <Input data-testid="compose-trip" value={trip} onChange={(e) => setTrip(e.target.value)} placeholder="e.g. 66758" className="h-10 text-sm" />
        </div>

        {/* MESSAGE */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--tm-navy)]/70">Message</div>
          </div>
          <textarea data-testid="compose-body" value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Type your message…" rows={6}
            className="w-full rounded-md border border-[var(--tm-border)] bg-white p-3 text-sm font-semibold text-[var(--tm-navy)] resize-none" />

          {/* ATTACHMENTS */}
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" data-testid="compose-attach"
              onClick={() => setPickerOpen(true)}
              className="h-9 px-3 rounded-md border border-[var(--tm-border)] bg-white text-[var(--tm-navy)] text-xs font-bold tracking-wide inline-flex items-center gap-1.5 hover:bg-[var(--tm-surface)]">
              <Paperclip className="h-4 w-4" /> Attach from Documents
            </button>
            {attachIds.map((id) => {
              const d = docs.find((x) => x.id === id);
              return (
                <span key={id} className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md pl-2 pr-1 py-1 text-[var(--tm-navy)]">
                  <FileText className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">{d?.name || "Attached file"}</span>
                  <button type="button" data-testid={`compose-attach-remove-${id}`}
                    onClick={() => setAttachIds((arr) => arr.filter((x) => x !== id))}
                    className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-[var(--tm-surface-2)]" aria-label="Remove">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center gap-2">
          <Button data-testid="compose-cancel" variant="outline"
            onClick={() => navigate("/messages")}
            className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md font-bold">Cancel</Button>
          <Button data-testid="compose-send" onClick={onSend}
            disabled={!selected || (!body.trim() && attachIds.length === 0)}
            className="h-11 flex-1 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white rounded-md font-bold inline-flex items-center justify-center gap-1.5">
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </div>

      <AttachmentPicker
        open={pickerOpen}
        selected={attachIds}
        onCancel={() => setPickerOpen(false)}
        onConfirm={(ids) => { setAttachIds(ids); setPickerOpen(false); }}
      />
    </AppShell>
  );
}

/* ---- bits ---- */

function FieldWithIcon({ icon, children }) {
  return (
    <div className="relative">
      <span className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tm-navy)]/60">{icon}</span>
      {children}
    </div>
  );
}

function SelectedRecipient({ contact }) {
  return (
    <div data-testid="compose-recipient-selected" className="flex items-center gap-3 p-2 rounded-md bg-[var(--tm-surface)] border border-[var(--tm-border)]">
      <Avatar contact={contact} />
      <span className="flex-1 min-w-0">
        <span className="text-sm font-bold text-[var(--tm-navy)] block truncate">{contact.name}</span>
        <span className="text-[11px] text-[var(--tm-navy)]/70 font-semibold block truncate">{contact.company}</span>
      </span>
      <span className="px-1.5 py-0.5 rounded-full bg-white border border-[var(--tm-border)] text-[var(--tm-navy)]/80 text-[9px] tracking-widest uppercase font-black">{roleLabel(contact.role)}</span>
    </div>
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
      <DialogContent data-testid="compose-attach-picker" className="max-w-md bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2"><Paperclip className="h-4 w-4" /> Attach from Documents</DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)] font-semibold leading-snug">
            Files stay in your Trip Monitor folder — only a reference is shared in the message.
          </DialogDescription>
        </DialogHeader>
        <Input data-testid="compose-attach-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" className="h-9" />
        <div className="max-h-[40vh] overflow-auto flex flex-col gap-1">
          {filtered.length === 0 ? (
            <div className="text-[12px] font-semibold text-[var(--tm-navy)]/70 px-1 py-2">No matching documents.</div>
          ) : filtered.map((d) => {
            const on = picked.includes(d.id);
            return (
              <button key={d.id} type="button" data-testid={`compose-attach-pick-${d.id}`}
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
          <Button data-testid="compose-attach-confirm" onClick={() => onConfirm(picked)} className="h-11 flex-1 bg-[var(--tm-navy)] text-white rounded-md font-bold">
            Attach {picked.length ? `(${picked.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function roleLabel(role) {
  return role === "dispatch" ? "Dispatch"
       : role === "support"  ? "Support"
       : role === "driver"   ? "Driver"
       : role === "fleet"    ? "Fleet"
       : "Contact";
}
