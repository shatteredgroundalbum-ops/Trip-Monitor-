import React, { useState } from "react";
import AppShell from "../components/app/AppShell";
import { Input } from "../components/ui/input";
import {
  MessageSquare, Send, Search, ChevronRight, Paperclip, User2, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Messages — direct communication. Conversations list + thread view.
 * Different from Notifications (system alerts).
 */
const DEMO_THREADS = [
  { id: "t1", who: "Dispatch · Mike R.",   last: "Pickup time updated for #66758.",  when: "Today, 8:30 AM", unread: 1, role: "dispatch" },
  { id: "t2", who: "Support · Trip Monitor", last: "Got your screenshot — looking now.", when: "Yesterday",      unread: 0, role: "support" },
  { id: "t3", who: "Driver · Carla T.",     last: "I'll grab the lumper run, no worries.", when: "Mon",          unread: 0, role: "driver" },
];

export default function MessagesScreen() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(DEMO_THREADS[0]);
  const [draft, setDraft] = useState("");
  const filtered = DEMO_THREADS.filter((t) =>
    !q || t.who.toLowerCase().includes(q.toLowerCase()) || t.last.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AppShell active="messages" overline="Bottom Nav" pageTitle="Messages">
      <div data-testid="messages-screen" className="grid md:grid-cols-[320px_1fr] gap-3">
        {/* Conversation list */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl shadow-[0_2px_8px_rgba(14,31,71,0.04)] overflow-hidden">
          <div className="p-3 border-b border-[var(--tm-border)]">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--tm-navy)]/60" />
              <Input
                data-testid="messages-search"
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search conversations…"
                className="pl-8 h-10 text-sm"
              />
            </div>
          </div>
          <ul className="max-h-[60vh] overflow-auto" data-testid="messages-thread-list">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  data-testid={`messages-thread-${t.id}`}
                  onClick={() => setActive(t)}
                  className={[
                    "w-full text-left flex items-center gap-3 px-3 py-3 border-b border-[var(--tm-border)] transition-colors",
                    active?.id === t.id ? "bg-[var(--tm-surface)]" : "hover:bg-[var(--tm-surface)]",
                  ].join(" ")}
                >
                  <RoleIcon role={t.role} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[var(--tm-navy)] truncate">{t.who}</span>
                      <span className="text-[10px] text-[var(--tm-navy)]/60 font-bold uppercase tracking-wider whitespace-nowrap">{t.when}</span>
                    </div>
                    <div className="text-[12px] text-[var(--tm-navy)]/70 font-semibold truncate">{t.last}</div>
                  </div>
                  {t.unread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--tm-orange)] text-white text-[10px] font-black flex items-center justify-center">
                      {t.unread}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="p-4 text-sm text-[var(--tm-text-soft)] font-semibold">No matches.</li>
            )}
          </ul>
          <div className="p-2 border-t border-[var(--tm-border)]">
            <button
              type="button"
              data-testid="messages-compose"
              onClick={() => toast.info("Compose flow coming soon")}
              className="w-full h-10 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm inline-flex items-center justify-center gap-2"
            >
              <MessageSquare className="h-4 w-4" /> Compose
            </button>
          </div>
        </div>

        {/* Thread */}
        <div className="bg-white border border-[var(--tm-border)] rounded-xl shadow-[0_2px_8px_rgba(14,31,71,0.04)] flex flex-col min-h-[60vh]">
          <div className="px-4 py-3 border-b border-[var(--tm-border)] flex items-center gap-3">
            <RoleIcon role={active?.role} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[var(--tm-navy)] truncate">{active?.who || "Select a conversation"}</div>
              <div className="text-[11px] text-[var(--tm-navy)]/70 font-semibold">{active?.role || ""}</div>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-auto flex flex-col gap-2" data-testid="messages-thread">
            {active ? (
              <DemoBubbles role={active.role} />
            ) : (
              <div className="text-sm text-[var(--tm-text-soft)] font-semibold">Pick a conversation on the left.</div>
            )}
          </div>
          <div className="p-3 border-t border-[var(--tm-border)] flex items-center gap-2">
            <button
              type="button"
              onClick={() => toast.info("Attachments coming soon")}
              className="h-10 w-10 rounded-md border border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] inline-flex items-center justify-center"
              data-testid="messages-attach"
              aria-label="Attach"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <Input
              data-testid="messages-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              className="h-10 text-sm flex-1"
            />
            <button
              type="button"
              data-testid="messages-send"
              onClick={() => { if (!draft.trim()) return; toast.success("Message sent (demo)"); setDraft(""); }}
              className="h-10 px-4 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm inline-flex items-center gap-1.5"
            >
              <Send className="h-4 w-4" /> Send
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function RoleIcon({ role }) {
  const cls = "h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0";
  if (role === "dispatch") return <span className={`${cls} bg-[var(--tm-blue)] text-white`}><MessageSquare className="h-4 w-4" /></span>;
  if (role === "support")  return <span className={`${cls} bg-[var(--tm-navy)] text-white`}><ShieldAlert className="h-4 w-4" /></span>;
  return <span className={`${cls} bg-[var(--tm-surface-2)] text-[var(--tm-navy)]`}><User2 className="h-4 w-4" /></span>;
}
function DemoBubbles({ role }) {
  const them = role === "dispatch"
    ? ["Pickup time for order #66758 has been updated to 08:30."]
    : role === "support"
      ? ["Got your screenshot — looking at it now. Will follow up shortly."]
      : ["I'll grab the lumper run, no worries."];
  return (
    <>
      {them.map((m, i) => (
        <div key={i} className="self-start max-w-[80%] bg-[var(--tm-surface)] text-[var(--tm-navy)] text-sm font-semibold px-3 py-2 rounded-lg">
          {m}
        </div>
      ))}
      <div className="self-end max-w-[80%] bg-[var(--tm-blue)] text-white text-sm font-semibold px-3 py-2 rounded-lg">
        Got it — thanks!
      </div>
    </>
  );
}
