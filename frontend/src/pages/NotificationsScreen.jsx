import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { Input } from "../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import {
  Bell, AlertTriangle, FileText, Save as SaveIcon, RefreshCw, HardDrive,
  Cloud, Sparkles, Award, Search, Check, Archive as ArchiveIcon, X,
  Truck, Settings as SettingsIcon, Volume2, ChevronRight, Trash2, Pin, Inbox,
  CheckCheck, FilterX,
} from "lucide-react";
import { getStorageUsage, isAboveQuotaWarning } from "../lib/storage-location";
import { toast } from "sonner";

/**
 * Notifications — system-generated operational alert center.
 *
 * NOT direct messaging (lives in /messages). This screen surfaces:
 * dispatch updates, reminders, autosave notices, backup/sync notices,
 * export-complete alerts, storage warnings, app-status updates,
 * milestone achievements.
 *
 * State is held in localStorage as lightweight metadata only — no
 * attachments, files or blobs. Each notification carries a `route`
 * field so the row tap doubles as an operational shortcut.
 */
const STORE_KEY = "tm_notifications_v1";

// ---- type catalog --------------------------------------------------------
const TYPES = {
  dispatch:    { label: "Dispatch",    icon: <Truck className="h-4 w-4" />,        color: "var(--tm-blue)" },
  message:     { label: "Message",     icon: <FileText className="h-4 w-4" />,     color: "var(--tm-blue)" },
  export:      { label: "Export",      icon: <FileText className="h-4 w-4" />,     color: "#16a34a" },
  backup:      { label: "Backup",      icon: <Cloud className="h-4 w-4" />,        color: "#16a34a" },
  storage:     { label: "Storage",     icon: <HardDrive className="h-4 w-4" />,    color: "var(--tm-orange)" },
  sync:        { label: "Sync",        icon: <RefreshCw className="h-4 w-4" />,    color: "var(--tm-orange)" },
  app:         { label: "App Update",  icon: <Sparkles className="h-4 w-4" />,     color: "#a855f7" },
  reminder:    { label: "Reminder",    icon: <Bell className="h-4 w-4" />,         color: "var(--tm-navy)" },
  milestone:   { label: "Milestone",   icon: <Award className="h-4 w-4" />,        color: "#FF5F15" },
};

const FILTER_OPTIONS = [
  { value: "all",    label: "All" },
  { value: "unread", label: "Unread" },
  ...Object.entries(TYPES).map(([k, v]) => ({ value: k, label: v.label })),
];

const DATE_OPTIONS = [
  { value: "any",    label: "Any time" },
  { value: "today",  label: "Today" },
  { value: "week",   label: "This week" },
  { value: "month",  label: "This month" },
];

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => loadStore());
  const [filter, setFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("any");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Auto-seed with system-derived alerts on mount.
  useEffect(() => {
    (async () => {
      try {
        const usage = await getStorageUsage();
        const seeded = await seedFromSystem(items, usage);
        if (seeded !== items) { setItems(seeded); saveStore(seeded); }
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change.
  useEffect(() => { saveStore(items); }, [items]);

  // Critical (priority) come first, then unread, then by timestamp desc.
  const sorted = useMemo(() => {
    const arr = [...items].filter((n) => showArchived ? true : !n.archived);
    arr.sort((a, b) => {
      const pa = a.priority === "critical" ? 0 : 1;
      const pb = b.priority === "critical" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ua = a.read ? 1 : 0;
      const ub = b.read ? 1 : 0;
      if (ua !== ub) return ua - ub;
      return new Date(b.when || 0).getTime() - new Date(a.when || 0).getTime();
    });
    return arr;
  }, [items, showArchived]);

  // Apply filter / search / date.
  const filtered = useMemo(() => {
    return sorted.filter((n) => {
      if (filter === "unread" && n.read) return false;
      if (filter !== "all" && filter !== "unread" && n.type !== filter) return false;
      if (dateFilter !== "any" && !inDateRange(n.when, dateFilter)) return false;
      if (q && !`${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [sorted, filter, dateFilter, q]);

  // Overview stats (count uses unfiltered visible set).
  const visible = items.filter((n) => !n.archived);
  const overview = {
    total: visible.length,
    unread: visible.filter((n) => !n.read).length,
    critical: visible.filter((n) => n.priority === "critical" && !n.read).length,
    lastSync: visible.find((n) => n.type === "sync" || n.type === "backup")?.when || null,
    recent: visible.slice(0, 1)[0],
  };
  const archivedCount = items.filter((n) => n.archived).length;

  // ---- mutators ---------------------------------------------------------
  const markAllRead = () => {
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    toast.success("All notifications marked read");
  };
  const markRead = (id) => setItems((arr) => arr.map((n) => n.id === id ? { ...n, read: true } : n));
  const dismiss = (id) => setItems((arr) => arr.filter((n) => n.id !== id));
  const archive = (id) => setItems((arr) => arr.map((n) => n.id === id ? { ...n, archived: true, read: true } : n));
  const unarchive = (id) => setItems((arr) => arr.map((n) => n.id === id ? { ...n, archived: false } : n));
  const acknowledge = (id) => setItems((arr) => arr.map((n) => n.id === id ? { ...n, acknowledged: true, read: true } : n));
  const clearArchive = () => {
    setItems((arr) => arr.filter((n) => !n.archived));
    setConfirmClear(false);
    toast.success("Archive cleared");
  };

  const openRelated = (n) => {
    markRead(n.id);
    if (n.route) navigate(n.route);
  };

  return (
    <AppShell overline="Top Toolbar" pageTitle="Notifications" alertCount={overview.critical}>
      <div data-testid="notifications-screen" className="flex flex-col gap-4">

        {/* 1. OVERVIEW */}
        <Card>
          <CardHeader icon={<Bell className="h-4 w-4" />} title="Overview" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile testId="ov-unread"   label="Unread"            value={String(overview.unread)} icon={<Inbox className="h-4 w-4" />} />
            <Tile testId="ov-critical" label="High Priority"     value={String(overview.critical)} icon={<AlertTriangle className="h-4 w-4" />} tone={overview.critical ? "warn" : "default"} />
            <Tile testId="ov-sync"     label="Last Sync"         value={overview.lastSync ? formatRelative(overview.lastSync) : "—"} icon={<RefreshCw className="h-4 w-4" />} />
            <Tile testId="ov-recent"   label="Recent Activity"   value={overview.recent ? overview.recent.title : "—"} icon={<Sparkles className="h-4 w-4" />} truncate />
          </div>
        </Card>

        {/* 4. PRIORITY ALERTS — pinned cluster */}
        {visible.some((n) => n.priority === "critical") && (
          <Card warn>
            <CardHeader icon={<Pin className="h-4 w-4 text-[var(--tm-orange-deep)]" />} title="Priority Alerts" />
            <div className="flex flex-col gap-2">
              {visible.filter((n) => n.priority === "critical").map((n) => (
                <Row
                  key={n.id} n={n}
                  onOpen={() => openRelated(n)}
                  onMarkRead={() => markRead(n.id)}
                  onArchive={() => archive(n.id)}
                  onDismiss={() => dismiss(n.id)}
                  onAck={() => acknowledge(n.id)}
                  pinned
                />
              ))}
            </div>
          </Card>
        )}

        {/* 6. FILTERS & SEARCH */}
        <Card>
          <CardHeader icon={<Search className="h-4 w-4" />} title="Filter & Search" right={(
            <button type="button" onClick={() => { setFilter("all"); setDateFilter("any"); setQ(""); }}
                    className="text-xs font-bold text-[var(--tm-blue)] hover:underline inline-flex items-center gap-1"
                    data-testid="filters-reset">
              <FilterX className="h-3 w-3" /> Reset
            </button>
          )} />
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tm-navy)]/60" />
            <Input
              data-testid="notif-search"
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search notifications…"
              className="pl-8 h-10 text-sm"
            />
          </div>
          <Chips testId="notif-filter" value={filter} onChange={setFilter} options={FILTER_OPTIONS} />
          <Chips testId="notif-date" value={dateFilter} onChange={setDateFilter} options={DATE_OPTIONS} />
        </Card>

        {/* 5. QUICK ACTIONS */}
        <div className="flex items-center gap-2 flex-wrap">
          <ActionPill testId="act-mark-all" icon={<CheckCheck className="h-4 w-4" />} label="Mark all read" onClick={markAllRead} />
          <ActionPill testId="act-toggle-archive" icon={<ArchiveIcon className="h-4 w-4" />}
                     label={showArchived ? "Hide archived" : `Show archived${archivedCount ? ` (${archivedCount})` : ""}`}
                     onClick={() => setShowArchived((v) => !v)} active={showArchived} />
          {showArchived && archivedCount > 0 && (
            <ActionPill testId="act-clear-archive" icon={<Trash2 className="h-4 w-4" />} label="Clear archive" onClick={() => setConfirmClear(true)} danger />
          )}
        </div>

        {/* 2. NOTIFICATION LIST */}
        <Card>
          <CardHeader icon={<Bell className="h-4 w-4" />} title={showArchived ? "All Notifications" : "Recent"} right={(
            <span className="text-[11px] text-[var(--tm-navy)]/65 font-bold uppercase tracking-wider">
              {filtered.length} item{filtered.length === 1 ? "" : "s"}
            </span>
          )} />
          {filtered.length === 0 ? (
            <Empty>No notifications match your filter.</Empty>
          ) : (
            <div className="flex flex-col">
              {filtered.map((n) => (
                <Row
                  key={n.id} n={n}
                  onOpen={() => openRelated(n)}
                  onMarkRead={() => markRead(n.id)}
                  onArchive={() => n.archived ? unarchive(n.id) : archive(n.id)}
                  onDismiss={() => dismiss(n.id)}
                />
              ))}
            </div>
          )}
        </Card>

        {/* 8. NOTIFICATION SETTINGS SHORTCUT */}
        <Card>
          <CardHeader icon={<SettingsIcon className="h-4 w-4" />} title="Notification Settings" />
          <NavRow testId="notif-prefs" icon={<Bell className="h-4 w-4" />}
            title="Preferences"
            sub="Choose which notifications appear here"
            onClick={() => navigate("/settings")} />
          <NavRow testId="notif-sound" icon={<Volume2 className="h-4 w-4" />}
            title="Sound &amp; Vibration"
            sub="Audio and haptics for incoming notifications"
            onClick={() => navigate("/settings")} />
          <NavRow testId="notif-frequency" icon={<RefreshCw className="h-4 w-4" />}
            title="Alert Frequency &amp; Quiet Hours"
            sub="Throttle notifications · set quiet windows"
            onClick={() => navigate("/settings")} />
        </Card>

        {/* 7. RELATED NAVIGATION HINT */}
        <Notice>
          Tap any notification to open its related screen — exports go to Reports, messages go to Messages, storage warnings go to Settings, dispatch updates go to New Trip or Messages.
        </Notice>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onCancel={() => setConfirmClear(false)}
        onConfirm={clearArchive}
        testId="clear-archive-dialog"
        icon={<Trash2 className="h-4 w-4" />} danger
        title="Clear archived notifications?"
        body="Permanently remove all archived notifications from this device. This action cannot be undone."
        confirmLabel="Clear archive"
      />
    </AppShell>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

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
function Tile({ testId, label, value, icon, tone, truncate }) {
  return (
    <div data-testid={testId} className={[
      "border rounded-lg p-3 flex flex-col gap-1",
      tone === "warn" ? "bg-[var(--tm-orange)]/5 border-[var(--tm-orange)]/40" : "bg-white border-[var(--tm-border)]",
    ].join(" ")}>
      {icon && <span className={tone === "warn" ? "text-[var(--tm-orange-deep)]" : "text-[var(--tm-navy)]"}>{icon}</span>}
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--tm-navy)]/70 font-bold mt-1">{label}</div>
      <div className={`text-2xl font-black tracking-tight text-[var(--tm-navy)] ${truncate ? "truncate" : ""}`} title={String(value)}>{value}</div>
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
function NavRow({ testId, icon, title, sub, onClick }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors border-b border-[var(--tm-border)]/50 last:border-b-0">
      <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center flex-shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">{title}</span>
        {sub && <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug truncate" dangerouslySetInnerHTML={{ __html: sub }} />}
      </span>
      <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)]" />
    </button>
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
function Chips({ testId, value, onChange, options }) {
  return (
    <div data-testid={testId} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
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

/** A single notification list row. */
function Row({ n, onOpen, onMarkRead, onArchive, onDismiss, onAck, pinned = false }) {
  const meta = TYPES[n.type] || TYPES.reminder;
  const muted = n.read && n.priority !== "critical";
  const tone = n.priority === "critical" ? "warn" : (n.priority === "info" || n.read) ? "muted" : "normal";
  return (
    <div
      data-testid={`notif-${n.id}`}
      className={[
        "flex items-start gap-3 px-3 py-3 rounded-md border-b border-[var(--tm-border)]/50 last:border-b-0 transition-colors",
        n.archived ? "opacity-70" : "",
        tone === "warn"   ? "bg-[var(--tm-orange)]/5" :
        tone === "muted"  ? "bg-white" :
                            "bg-white",
      ].join(" ")}
    >
      {/* Type / priority chip */}
      <span
        className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white"
        style={{ background: tone === "warn" ? "var(--tm-orange)" : meta.color }}
        aria-hidden="true"
      >
        {tone === "warn" ? <AlertTriangle className="h-4 w-4" /> : meta.icon}
      </span>

      {/* Body */}
      <button type="button" onClick={onOpen} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {pinned && <Pin className="h-3 w-3 text-[var(--tm-orange-deep)]" />}
          <span className={[
            "text-sm font-bold truncate",
            muted ? "text-[var(--tm-navy)]/70" : "text-[var(--tm-navy)]",
          ].join(" ")}>{n.title}</span>
          {!n.read && <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-orange)] text-white text-[9px] tracking-widest uppercase font-black">New</span>}
          {n.priority === "critical" && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-orange-deep)] text-white text-[9px] tracking-widest uppercase font-black">Critical</span>
          )}
          <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-surface-2)] text-[var(--tm-navy)]/80 text-[9px] tracking-widest uppercase font-black">{meta.label}</span>
        </div>
        <div className={[
          "text-[12px] font-semibold leading-snug mt-0.5",
          muted ? "text-[var(--tm-navy)]/60" : "text-[var(--tm-navy)]/80",
        ].join(" ")}>{n.body}</div>
        <div className="text-[10px] text-[var(--tm-text-muted)] font-bold uppercase tracking-wider mt-1">
          {formatWhen(n.when)}{n.route ? <> · <span className="text-[var(--tm-blue)]">{routeLabel(n.route)}</span></> : null}
        </div>
      </button>

      {/* Per-row actions */}
      <div className="flex flex-col items-end gap-1">
        {n.priority === "critical" && !n.acknowledged && (
          <button type="button"
            data-testid={`notif-ack-${n.id}`}
            onClick={onAck}
            className="h-7 px-2 rounded-full bg-[var(--tm-orange)] text-white text-[11px] font-black uppercase tracking-wider hover:bg-[var(--tm-orange-deep)]">
            Acknowledge
          </button>
        )}
        <div className="flex items-center gap-1">
          {!n.read && (
            <IconBtn testId={`notif-read-${n.id}`} title="Mark read" onClick={onMarkRead}><Check className="h-3.5 w-3.5" /></IconBtn>
          )}
          <IconBtn testId={`notif-archive-${n.id}`} title={n.archived ? "Unarchive" : "Archive"} onClick={onArchive}><ArchiveIcon className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn testId={`notif-dismiss-${n.id}`} title="Dismiss" onClick={onDismiss}><X className="h-3.5 w-3.5" /></IconBtn>
        </div>
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

/* ───────────────────── seeding & helpers ───────────────────── */

async function seedFromSystem(existing, usage) {
  const out = [...existing];
  // Storage warning — pinned critical when threshold crossed.
  if (isAboveQuotaWarning(usage?.percent || 0)) {
    upsert(out, {
      id: "sys-storage-warn",
      type: "storage", priority: "critical",
      title: "Storage past warning threshold",
      body: `Storage at ${usage.percent}%. Pick a Trip Monitor folder so saved documents stay outside the app.`,
      route: "/settings",
      when: new Date().toISOString(),
    });
  }
  // Demo seeds — only added once, never overwritten if user dismissed.
  const demoIds = ["sys-dispatch-1", "sys-autosave-1", "sys-export-1", "sys-backup-1", "sys-app-1", "sys-milestone-1"];
  if (!demoIds.some((id) => out.find((n) => n.id === id))) {
    const now = Date.now();
    out.push({
      id: "sys-dispatch-1", type: "dispatch", priority: "info", read: false,
      title: "Dispatch update",
      body: "Pickup time updated for the next order.",
      route: "/messages",
      when: new Date(now - 30 * 60 * 1000).toISOString(),
    });
    out.push({
      id: "sys-autosave-1", type: "reminder", priority: "info", read: true,
      title: "Autosave OK",
      body: "Active trip auto-saved successfully.",
      route: "/dashboard",
      when: new Date(now - 60 * 60 * 1000).toISOString(),
    });
    out.push({
      id: "sys-export-1", type: "export", priority: "info", read: true,
      title: "Export complete",
      body: "Order #66754 exported as PDF to Trip Monitor / Exports.",
      route: "/reports",
      when: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    });
    out.push({
      id: "sys-backup-1", type: "backup", priority: "info", read: true,
      title: "Backup complete",
      body: "Daily backup written to Trip Monitor / Backups.",
      route: "/settings",
      when: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    });
    out.push({
      id: "sys-app-1", type: "app", priority: "info", read: false,
      title: "App update available",
      body: "v1.1 with the new Studio toolbar is ready to install.",
      route: "/settings",
      when: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    });
    out.push({
      id: "sys-milestone-1", type: "milestone", priority: "info", read: false,
      title: "Milestone unlocked",
      body: "100K Lifetime Miles — congratulations!",
      route: "/analytics",
      when: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return out;
}

function upsert(arr, n) {
  const idx = arr.findIndex((x) => x.id === n.id);
  if (idx === -1) arr.push({ read: false, archived: false, ...n });
  else arr[idx] = { ...arr[idx], ...n };
}

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
  catch { return []; }
}
function saveStore(arr) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); } catch { /* ignore */ }
}

function inDateRange(iso, range) {
  if (!iso) return range === "any";
  const t = new Date(iso).getTime();
  const now = Date.now();
  if (range === "today") return now - t < 24 * 60 * 60 * 1000;
  if (range === "week")  return now - t < 7 * 24 * 60 * 60 * 1000;
  if (range === "month") return now - t < 31 * 24 * 60 * 60 * 1000;
  return true;
}
function formatWhen(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
function formatRelative(iso) {
  try {
    const t = new Date(iso).getTime();
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return "—"; }
}
function routeLabel(route) {
  const map = {
    "/dashboard": "Dashboard",
    "/new-trip": "New Trip",
    "/messages": "Messages",
    "/documents": "Documents",
    "/reports":   "Reports",
    "/analytics": "Analytics",
    "/settings":  "Settings",
    "/account":   "Account",
    "/user-profile": "Profile",
  };
  return map[route] || route;
}
