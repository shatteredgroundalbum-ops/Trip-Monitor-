import React from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import {
  BookOpen, MessageCircle, AlertCircle, PlayCircle, ChevronRight, LifeBuoy, Mail,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Support — help & assistance. Help articles, FAQ, contact, replay
 * onboarding, report a problem.
 */
export default function SupportScreen() {
  const navigate = useNavigate();
  return (
    <AppShell overline="Hamburger Menu" pageTitle="Support">
      <div data-testid="support-screen" className="flex flex-col gap-3">
        <Card icon={<BookOpen className="h-4 w-4" />} title="Help Articles">
          <Row testId="sup-getting-started" title="Getting started"     sub="Set up your driver profile and first trip"
               onClick={() => toast.info("Article coming soon")} />
          <Row testId="sup-templates"        title="Building templates" sub="Use Studio to map a custom trip sheet"
               onClick={() => toast.info("Article coming soon")} />
          <Row testId="sup-storage"          title="Storage & backups"  sub="How Trip Monitor saves files outside the app"
               onClick={() => navigate("/settings")} />
        </Card>

        <Card icon={<PlayCircle className="h-4 w-4" />} title="App Tutorial">
          <Row testId="sup-tutorial-replay"  title="Replay onboarding"
               sub="Walk through the splash, role selection, PIN setup and first dashboard"
               onClick={() => toast.info("Replay coming soon")} />
        </Card>

        <Card icon={<MessageCircle className="h-4 w-4" />} title="FAQ">
          <Row testId="sup-faq-export"  title="Where do my exports go?"
               sub="Trip Monitor / Exports inside your chosen folder."
               onClick={() => toast.info("FAQ entry coming soon")} />
          <Row testId="sup-faq-uninstall" title="What happens if I uninstall?"
               sub="Documents stay on your device — only the app is removed."
               onClick={() => toast.info("FAQ entry coming soon")} />
          <Row testId="sup-faq-pin"     title="I forgot my PIN. What now?"
               sub="Use the recovery phrase set up during enrollment."
               onClick={() => navigate("/account")} />
        </Card>

        <Card icon={<LifeBuoy className="h-4 w-4" />} title="Contact &amp; Report">
          <Row testId="sup-contact" icon={<Mail className="h-4 w-4" />}
               title="Contact Support" sub="support@tripmonitor.app"
               onClick={() => toast.info("Email composer coming soon")} />
          <Row testId="sup-report-problem" icon={<AlertCircle className="h-4 w-4" />}
               title="Report a Problem" sub="Send logs and a description"
               onClick={() => toast.info("Problem reporter coming soon")} />
        </Card>
      </div>
    </AppShell>
  );
}

function Card({ icon, title, children }) {
  return (
    <div className="bg-white border border-[var(--tm-border)] rounded-xl shadow-[0_2px_8px_rgba(14,31,71,0.04)]">
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-[var(--tm-border)]"
        // eslint-disable-next-line react/no-children-prop
      >
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--tm-navy)]" dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}
function Row({ testId, icon, title, sub, onClick }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-[var(--tm-surface)] transition-colors"
    >
      {icon && (
        <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center flex-shrink-0">
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-[var(--tm-navy)]">{title}</span>
        <span className="block text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{sub}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-[var(--tm-text-muted)]" />
    </button>
  );
}
