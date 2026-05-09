import React, { useEffect, useState } from "react";
import AppShell from "../components/app/AppShell";
import {
  AlertTriangle, FileText, Save, RefreshCw, HardDrive, RocketIcon, Bell,
} from "lucide-react";
import { getStorageUsage, isAboveQuotaWarning } from "../lib/storage-location";

/**
 * Notifications — system alerts (NOT messages). Dispatch updates,
 * autosave warnings, export-complete alerts, storage warnings,
 * sync/backup notices, app updates. Renders as a full screen.
 */
export default function NotificationsScreen() {
  const [usage, setUsage] = useState({ percent: 0 });
  useEffect(() => {
    (async () => { try { setUsage(await getStorageUsage()); } catch { /* ignore */ } })();
  }, []);

  const alerts = buildAlerts(usage);
  const alertCount = alerts.filter((a) => a.tone === "warn" && a.unread).length;

  return (
    <AppShell overline="System Alerts" pageTitle="Notifications" alertCount={alertCount}>
      <div data-testid="notifications-screen" className="flex flex-col gap-2">
        {alerts.length === 0 ? (
          <Empty />
        ) : (
          alerts.map((a) => (
            <Row key={a.id} a={a} />
          ))
        )}
      </div>
    </AppShell>
  );
}

function buildAlerts(usage) {
  const out = [];
  if (isAboveQuotaWarning(usage.percent)) {
    out.push({
      id: "storage-warn",
      tone: "warn", unread: true,
      icon: <HardDrive className="h-4 w-4" />,
      title: "Storage past warning threshold",
      body: `Storage at ${usage.percent}%. Pick a Trip Monitor folder so saved documents stay outside the app.`,
      when: "Now",
    });
  }
  out.push(
    { id: "dispatch-1", tone: "info", unread: true, icon: <FileText className="h-4 w-4" />,
      title: "Dispatch update",
      body: "Pickup time updated for the next order.",
      when: "Today, 8:30 AM" },
    { id: "autosave-1", tone: "info", unread: false, icon: <Save className="h-4 w-4" />,
      title: "Autosave OK",
      body: "Active trip auto-saved successfully.",
      when: "Today, 8:12 AM" },
    { id: "export-1", tone: "info", unread: false, icon: <RocketIcon className="h-4 w-4" />,
      title: "Export complete",
      body: "Order #66754 exported as PDF to Trip Monitor / Exports.",
      when: "Yesterday" },
    { id: "sync-1", tone: "info", unread: false, icon: <RefreshCw className="h-4 w-4" />,
      title: "Backup complete",
      body: "Daily backup written to Trip Monitor / Backups.",
      when: "Yesterday" },
    { id: "app-1", tone: "info", unread: false, icon: <Bell className="h-4 w-4" />,
      title: "App update available",
      body: "v1.1 with the new Studio toolbar is ready to install.",
      when: "2 days ago" },
  );
  return out;
}

function Row({ a }) {
  const tone = a.tone === "warn"
    ? "bg-[var(--tm-orange)] text-white"
    : "bg-[var(--tm-blue)] text-white";
  return (
    <div
      data-testid={`notif-${a.id}`}
      className={[
        "flex items-start gap-3 p-3.5 rounded-xl border bg-white shadow-[0_2px_8px_rgba(14,31,71,0.04)]",
        a.tone === "warn" ? "border-[var(--tm-orange)]/40" : "border-[var(--tm-border)]",
      ].join(" ")}
    >
      <span className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${tone}`}>
        {a.tone === "warn" ? <AlertTriangle className="h-4 w-4" /> : a.icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[var(--tm-navy)]">{a.title}</span>
          {a.unread && (
            <span className="px-1.5 py-0.5 rounded-full bg-[var(--tm-orange)] text-white text-[9px] tracking-widest uppercase font-black">New</span>
          )}
        </div>
        <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{a.body}</div>
        <div className="text-[10px] text-[var(--tm-text-muted)] font-bold uppercase tracking-wider mt-1">{a.when}</div>
      </div>
    </div>
  );
}
function Empty() {
  return (
    <div className="text-sm text-[var(--tm-text-soft)] font-semibold p-3">All systems clear — no alerts.</div>
  );
}
