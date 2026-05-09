import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { Input } from "../components/ui/input";
import {
  MessageSquare, Send, Search, ChevronRight, Paperclip, User2, ShieldAlert,
  FilterX, Pin, Archive as ArchiveIcon, AlertTriangle, Truck, LifeBuoy,
  Bell, Volume2, Download, Plus, RotateCcw, MailWarning, Inbox,
  Sparkles, MessagesSquare,
} from "lucide-react";
import {
  listConversations, listContacts, filterConversations, unreadCount,
  totalUnread, archiveConversation, pinConversation,
} from "../lib/message-store";
import { toast } from "sonner";

/**
 * /messages — Communication center.
 *
 * Per spec: 10-section layout (Overview · List · Search · Compose
 * shortcut · Attachments info · Search/Filters · Organization ·
 * Driver/Dispatch · Support · Settings shortcuts). Threads open as
 * their OWN full-screen route (`/messages/:id`) — never a popup.
 * Compose also opens as its own full-screen route.
 */
export default function MessagesScreen() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState(() => listConversations());
  const [contacts, setContacts] = useState(() => listContacts());
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [onlyAttachments, setOnlyAttachments] = useState(false);
  const [pinned, setPinned] = useState("any");
  const [showArchived, setShowArchived] = useState(false);
  const [priority, setPriority] = useState("any");

  const reload = () => { setConversations(listConversations()); setContacts(listContacts()); };

  // Refresh on focus so a recently-replied thread bubbles up.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const visible = useMemo(() => filterConversations(conversations, contacts, {
    q, role, onlyUnread, onlyAttachments, pinned, archived: showArchived, priority,
  }), [conversations, contacts, q, role, onlyUnread, onlyAttachments, pinned, showArchived, priority]);

  const overview = useMemo(() => {
    const live = conversations.filter((c) => !c.archived);
    const totalU = totalUnread(conversations);
    const lastTs = live.reduce((acc, c) => Math.max(acc, c.updatedAt || 0), 0);
    const recentContactIds = [...new Set(
      [...live].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5).map((c) => c.contactId),
    )];
    return { totalUnread: totalU, active: live.length, lastTs, recentContactIds };
  }, [conversations]);

  const dispatchThreads = useMemo(() =>
    visible.filter((c) => contactRole(contacts, c) === "dispatch"), [visible, contacts]);
  const supportThreads = useMemo(() =>
    visible.filter((c) => contactRole(contacts, c) === "support"), [visible, contacts]);

  const onResetFilters = () => {
    setQ(""); setRole("all"); setOnlyUnread(false); setOnlyAttachments(false);
    setPinned("any"); setShowArchived(false); setPriority("any");
  };

  const onOpen = (c) => navigate(`/messages/${encodeURIComponent(c.id)}`);
  const onCompose = () => navigate("/messages/compose");
  const onPin     = (c) => { pinConversation(c.id, !c.pinned); reload(); toast.success(c.pinned ? "Unpinned" : "Pinned to top"); };
  const onArchive = (c) => { archiveConversation(c.id, !c.archived); reload(); toast.success(c.archived ? "Restored" : "Archived"); };

  const archivedCount = conversations.filter((c) => c.archived).length;
  const pinnedCount   = conversations.filter((c) => c.pinned   && !c.archived).length;
  const priorityCount = conversations.filter((c) => c.priority && !c.archived).length;

  return (
    <AppShell active="messages" overline="Bottom Nav" pageTitle="Messages">
      <div data-testid="messages-screen" className="flex flex-col gap-4">

        {/* 1. CONVERSATION OVERVIEW */}
        <Card>
          <CardHeader icon={<MessagesSquare className="h-4 w-4" />} title="Conversation Overview" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile testId="msg-ov-unread"   label="Unread"           value={String(overview.totalUnread)} icon={<MailWarning className="h-4 w-4" />} accent={overview.totalUnread > 0} />
            <Tile testId="msg-ov-active"   label="Active threads"   value={String(overview.active)}      icon={<Inbox className="h-4 w-4" />} />
            <Tile testId="msg-ov-recent"   label="Recent contacts"  value={String(overview.recentContactIds.length)} icon={<User2 className="h-4 w-4" />} />
            <Tile testId="msg-ov-last"     label="Last message"     value={overview.lastTs ? formatRelative(overview.lastTs) : "—"} icon={<MessageSquare className="h-4 w-4" />} />
          </div>
        </Card>

        {/* 4. COMPOSE — shortcut only; full screen at /messages/compose */}
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" data-testid="msg-compose"
            onClick={onCompose}
            className="h-10 px-4 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Compose new message
          </button>
          <ActionPill testId="msg-toggle-unread"     icon={<MailWarning className="h-4 w-4" />} label={onlyUnread ? "Unread only" : "Show unread only"} active={onlyUnread} onClick={() => setOnlyUnread((v) => !v)} />
          <ActionPill testId="msg-toggle-attach"     icon={<Paperclip   className="h-4 w-4" />} label={onlyAttachments ? "With attachments" : "With attachments"} active={onlyAttachments} onClick={() => setOnlyAttachments((v) => !v)} />
          <ActionPill testId="msg-toggle-archived"   icon={<ArchiveIcon className="h-4 w-4" />} label={showArchived ? "Hide archived" : `Show archived${archivedCount ? ` (${archivedCount})` : ""}`} active={showArchived} onClick={() => setShowArchived((v) => !v)} />
        </div>

        {/* 6. MESSAGE SEARCH */}
        <Card>
          <CardHeader icon={<Search className="h-4 w-4" />} title="Search & Filters" right={(
            <button type="button" onClick={onResetFilters} data-testid="msg-filters-reset"
              className="text-xs font-bold text-[var(--tm-blue)] hover:underline inline-flex items-center gap-1">
              <FilterX className="h-3 w-3" /> Reset
            </button>
          )} />
          <FieldWithIcon icon={<Search className="h-4 w-4" />}>
            <Input data-testid="msg-search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, company, trip number, or message…" className="pl-8 h-10 text-sm" />
          </FieldWithIcon>
          <Chips testId="msg-role" value={role} onChange={setRole} options={[
            { value: "all", label: "All roles" },
            { value: "dispatch", label: "Dispatch" },
            { value: "driver", label: "Drivers" },
            { value: "support", label: "Support" },
            { value: "fleet", label: "Fleet" },
          ]} />
          <Chips testId="msg-pinned" value={pinned} onChange={setPinned} options={[
            { value: "any", label: "All" }, { value: "yes", label: "Pinned" }, { value: "no", label: "Unpinned" },
          ]} />
          <Chips testId="msg-priority" value={priority} onChange={setPriority} options={[
            { value: "any", label: "Any priority" }, { value: "yes", label: "Priority" }, { value: "no", label: "Standard" },
          ]} />
        </Card>

        {/* 2. CONVERSATION LIST */}
        <Card>
          <CardHeader icon={<MessageSquare className="h-4 w-4" />} title="Conversations" right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">
              {visible.length} item{visible.length === 1 ? "" : "s"}
            </span>
          )} />
          {visible.length === 0 ? (
            <Empty>No conversations match these filters.</Empty>
          ) : (
            <div className="flex flex-col">
              {visible.map((c) => (
                <ConversationRow
                  key={c.id} c={c} contact={contacts.find((cc) => cc.id === c.contactId)}
                  onOpen={() => onOpen(c)}
                  onPin={() => onPin(c)}
                  onArchive={() => onArchive(c)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* 7. MESSAGE ORGANIZATION */}
        <Card>
          <CardHeader icon={<Pin className="h-4 w-4" />} title="Message Organization" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile testId="msg-org-pinned"    label="Pinned"           value={String(pinnedCount)}    icon={<Pin className="h-4 w-4" />} />
            <Tile testId="msg-org-priority"  label="Priority"         value={String(priorityCount)}  icon={<AlertTriangle className="h-4 w-4" />} />
            <Tile testId="msg-org-dispatch"  label="Dispatch threads" value={String(conversations.filter((c) => contactRole(contacts, c) === "dispatch" && !c.archived).length)} icon={<Truck className="h-4 w-4" />} />
            <Tile testId="msg-org-support"   label="Support threads"  value={String(conversations.filter((c) => contactRole(contacts, c) === "support" && !c.archived).length)} icon={<LifeBuoy className="h-4 w-4" />} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ActionPill testId="msg-show-pinned"    icon={<Pin className="h-4 w-4" />}             label="Show pinned"     onClick={() => { setPinned("yes"); setShowArchived(false); }} />
            <ActionPill testId="msg-show-priority"  icon={<AlertTriangle className="h-4 w-4" />}   label="Show priority"   onClick={() => { setPriority("yes"); setShowArchived(false); }} />
            <ActionPill testId="msg-show-archived"  icon={<ArchiveIcon className="h-4 w-4" />}     label={`Show archived${archivedCount ? ` (${archivedCount})` : ""}`} onClick={() => setShowArchived(true)} />
          </div>
        </Card>

        {/* 8. DRIVER / DISPATCH */}
        <Card>
          <CardHeader icon={<Truck className="h-4 w-4" />} title="Driver & Dispatch" right={(
            <button type="button" data-testid="msg-dispatch-all"
              onClick={() => setRole("dispatch")}
              className="text-xs font-bold text-[var(--tm-blue)] hover:underline">View dispatch only</button>
          )} />
          {dispatchThreads.length === 0 ? (
            <Empty>No active dispatch threads. Compose a message to start one.</Empty>
          ) : (
            <div className="flex flex-col">
              {dispatchThreads.slice(0, 3).map((c) => (
                <CompactRow key={c.id} c={c} contact={contacts.find((cc) => cc.id === c.contactId)} onClick={() => onOpen(c)} />
              ))}
            </div>
          )}
        </Card>

        {/* 9. SUPPORT MESSAGES */}
        <Card>
          <CardHeader icon={<LifeBuoy className="h-4 w-4" />} title="Support" right={(
            <button type="button" data-testid="msg-support-open"
              onClick={() => navigate("/support")}
              className="text-xs font-bold text-[var(--tm-blue)] hover:underline">Open Support</button>
          )} />
          {supportThreads.length === 0 ? (
            <Empty>No support conversations yet. Open the Support screen to start one.</Empty>
          ) : (
            <div className="flex flex-col">
              {supportThreads.slice(0, 3).map((c) => (
                <CompactRow key={c.id} c={c} contact={contacts.find((cc) => cc.id === c.contactId)} onClick={() => onOpen(c)} />
              ))}
            </div>
          )}
        </Card>

        {/* 5. ATTACHMENTS & SHARING — info card */}
        <Card>
          <CardHeader icon={<Paperclip className="h-4 w-4" />} title="Attachments &amp; Sharing" right={(
            <button type="button" data-testid="msg-open-documents"
              onClick={() => navigate("/documents")}
              className="text-xs font-bold text-[var(--tm-blue)] hover:underline inline-flex items-center gap-1">
              Open Documents <ChevronRight className="h-3 w-3" />
            </button>
          )} />
          <p className="text-[12px] text-[var(--tm-navy)]/75 font-semibold leading-snug">
            Attach BOLs, scale tickets, lumper receipts, photos, and exported trip sheets directly
            from your <span className="font-bold">Trip Monitor / Documents</span> folder when you
            open a conversation. Files are referenced — never copied — so attachments stay safely
            in your folder, not inside the app.
          </p>
        </Card>

        {/* 10. MESSAGE SETTINGS SHORTCUTS */}
        <Card>
          <CardHeader icon={<Sparkles className="h-4 w-4" />} title="Message Settings" />
          <NavRow testId="msg-settings-notifications" icon={<Bell className="h-4 w-4" />}    title="Notification preferences" sub="Sound, vibration, banner alerts" onClick={() => navigate("/settings")} />
          <NavRow testId="msg-settings-sound"         icon={<Volume2 className="h-4 w-4" />} title="Message sound"            sub="Toggle in Settings → Sounds" onClick={() => navigate("/settings")} />
          <NavRow testId="msg-settings-autodownload"  icon={<Download className="h-4 w-4" />} title="Auto-download media"     sub="Photos & documents from trusted senders" onClick={() => navigate("/settings")} />
        </Card>

        <Notice>
          Messages live in your Trip Monitor account. Attachments stay in your Trip Monitor folder —
          uninstalling the app does <span className="font-black">not</span> delete attached files.
        </Notice>
      </div>
    </AppShell>
  );
}

/* ───────────────────────── reusable bits ───────────────────────── */

function Card({ children }) {
  return <div className="rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col gap-3 bg-white border border-[var(--tm-border)]">{children}</div>;
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
function Tile({ testId, label, value, icon, accent = false }) {
  return (
    <div data-testid={testId} className={`rounded-lg p-3 flex flex-col gap-1 border ${accent ? "bg-[var(--tm-orange)]/5 border-[var(--tm-orange)]/40" : "bg-white border-[var(--tm-border)]"}`}>
      <span className="text-[var(--tm-navy)]" aria-hidden="true">{icon}</span>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold mt-1">{label}</div>
      <div className={`text-2xl font-black tracking-tight ${accent ? "text-[var(--tm-orange-deep)]" : "text-[var(--tm-navy)]"} truncate`}>{value}</div>
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
function ActionPill({ testId, icon, label, onClick, active = false }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className={[
        "h-9 px-3.5 rounded-full border text-xs font-bold tracking-wide inline-flex items-center gap-1.5 transition-colors",
        active ? "bg-[var(--tm-navy)] text-white border-[var(--tm-navy)]"
               : "bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)]",
      ].join(" ")}>
      {icon}{label}
    </button>
  );
}
function NavRow({ testId, icon, title, sub, onClick }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors">
      <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center flex-shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)] truncate">{title}</span>
        {sub && <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug truncate">{sub}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)]" />
    </button>
  );
}

function ConversationRow({ c, contact, onOpen, onPin, onArchive }) {
  const last = c.messages[c.messages.length - 1];
  const u = unreadCount(c);
  return (
    <div data-testid={`msg-row-${c.id}`}
      className="flex items-center gap-3 px-3 py-3 rounded-md border-b border-[var(--tm-border)]/50 last:border-b-0 hover:bg-[var(--tm-surface)]">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <Avatar contact={contact} />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-[var(--tm-navy)] truncate">{contact?.name || "Unknown"}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-surface-2)] text-[var(--tm-navy)]/80 text-[9px] tracking-widest uppercase font-black">{roleLabel(contact?.role)}</span>
            {c.tripId && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-blue)]/10 text-[var(--tm-blue)] text-[9px] tracking-widest uppercase font-black">#{c.tripId}</span>}
            {c.priority && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-orange)] text-white text-[9px] tracking-widest uppercase font-black">Priority</span>}
            {c.pinned && <Pin className="h-3 w-3 text-[var(--tm-orange-deep)]" />}
            {c.archived && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-text-muted)] text-white text-[9px] tracking-widest uppercase font-black">Archived</span>}
          </span>
          <span className="block text-[12px] text-[var(--tm-navy)]/75 font-semibold mt-0.5 truncate">
            {(last?.from === "me" ? "You: " : "")}{last?.text || "No messages yet"}
          </span>
          <span className="block text-[10px] text-[var(--tm-text-muted)] font-bold uppercase tracking-wider mt-0.5">
            {contact?.company || ""}{contact?.online ? " · Online" : ""} · {formatRelative(c.updatedAt)}
          </span>
        </span>
      </button>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        {u > 0 && (
          <span data-testid={`msg-row-${c.id}-unread`} className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--tm-orange)] text-white text-[10px] font-black flex items-center justify-center">
            {u}
          </span>
        )}
        <div className="flex items-center gap-1">
          <IconBtn testId={`msg-row-${c.id}-pin`} title={c.pinned ? "Unpin" : "Pin"} onClick={onPin}>
            <Pin className={`h-3.5 w-3.5 ${c.pinned ? "text-[var(--tm-orange-deep)]" : ""}`} />
          </IconBtn>
          <IconBtn testId={`msg-row-${c.id}-archive`} title={c.archived ? "Restore" : "Archive"} onClick={onArchive}>
            {c.archived ? <RotateCcw className="h-3.5 w-3.5" /> : <ArchiveIcon className="h-3.5 w-3.5" />}
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function CompactRow({ c, contact, onClick }) {
  const last = c.messages[c.messages.length - 1];
  return (
    <button type="button" data-testid={`msg-compact-${c.id}`} onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors">
      <Avatar contact={contact} small />
      <span className="flex-1 min-w-0">
        <span className="text-sm font-bold text-[var(--tm-navy)] block truncate">{contact?.name || "—"}</span>
        <span className="text-[12px] text-[var(--tm-navy)]/70 font-semibold block truncate">{last?.text || "—"}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)]" />
    </button>
  );
}

function Avatar({ contact, small = false }) {
  const cls = small ? "h-8 w-8" : "h-10 w-10";
  const role = contact?.role;
  const bg = role === "dispatch" ? "bg-[var(--tm-blue)] text-white"
           : role === "support"  ? "bg-[var(--tm-navy)] text-white"
           : role === "fleet"    ? "bg-[var(--tm-orange)] text-white"
           : "bg-[var(--tm-surface-2)] text-[var(--tm-navy)]";
  const Icon = role === "dispatch" ? MessageSquare
            : role === "support"  ? ShieldAlert
            : role === "fleet"    ? Truck : User2;
  return (
    <span className={`${cls} rounded-full ${bg} flex items-center justify-center flex-shrink-0 relative`}>
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
      className="h-7 w-7 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] inline-flex items-center justify-center">
      {children}
    </button>
  );
}

function contactRole(contacts, c) {
  return contacts.find((cc) => cc.id === c.contactId)?.role || null;
}
function roleLabel(role) {
  return role === "dispatch" ? "Dispatch"
       : role === "support"  ? "Support"
       : role === "driver"   ? "Driver"
       : role === "fleet"    ? "Fleet"
       : "Contact";
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
