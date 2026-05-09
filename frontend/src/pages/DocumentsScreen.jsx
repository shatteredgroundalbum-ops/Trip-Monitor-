import React from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/app/AppShell";
import { FolderOpen, FileText, Camera, Receipt, Scale, Truck, ChevronRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * Documents — operational paperwork hub. Shows the canonical Trip
 * Monitor folder layout. Files live OUTSIDE the app sandbox so an
 * uninstall doesn't delete them.
 */
const FOLDERS = [
  { key: "bols",            name: "BOLs",                  desc: "Bills of lading",                   path: "Documents/BOLs",            Icon: FileText },
  { key: "scale-tickets",   name: "Scale Tickets",         desc: "Weight & axle tickets",             path: "Documents/Scale Tickets",   Icon: Scale },
  { key: "lumper-receipts", name: "Lumper Receipts",       desc: "Lumper-fee receipts",               path: "Documents/Lumper Receipts", Icon: Receipt },
  { key: "receipts",        name: "Receipts",              desc: "Fuel, tolls, expenses",             path: "Documents/Receipts",        Icon: Receipt },
  { key: "trip-attachments",name: "Trip Attachments",      desc: "Per-trip notes & files",            path: "Documents/Trip Attachments",Icon: FileText },
  { key: "photos",          name: "Photos",                desc: "POD & damage photos",               path: "Documents/Photos",          Icon: Camera },
  { key: "completed-sheets",name: "Completed Trip Sheets", desc: "Finished sheets ready to share",    path: "Completed Trip Sheets",     Icon: Truck },
  { key: "exports",         name: "Exports",               desc: "PDF / JPEG export history",         path: "Exports",                   Icon: FolderOpen },
];

export default function DocumentsScreen() {
  const navigate = useNavigate();
  return (
    <AppShell active="documents" overline="Bottom Nav" pageTitle="Documents">
      <div data-testid="documents-screen" className="flex flex-col gap-4">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--tm-surface)] border border-[var(--tm-border)] shadow-[0_2px_8px_rgba(14,31,71,0.04)]">
          <ShieldCheck className="h-5 w-5 text-[var(--tm-blue)] shrink-0 mt-0.5" />
          <p className="text-[12px] text-[var(--tm-navy)] font-semibold leading-snug">
            Documents are stored outside the app in your Trip Monitor folder.
            Uninstalling Trip Monitor will <span className="font-black">not</span> delete these files.
            Manage the folder in <button onClick={() => navigate("/settings")} className="underline font-bold text-[var(--tm-blue)]">Settings → Storage</button>.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {FOLDERS.map(({ key, name, desc, path, Icon }) => (
            <button
              type="button"
              key={key}
              data-testid={`documents-folder-${key}`}
              onClick={() => toast.info(`${name} viewer coming soon`)}
              className="text-left bg-white border border-[var(--tm-border)] rounded-xl p-4 shadow-[0_2px_8px_rgba(14,31,71,0.04)] hover:bg-[var(--tm-surface)] transition-colors flex flex-col gap-1.5"
            >
              <span className="h-9 w-9 rounded-md bg-[var(--tm-surface-2)] text-[var(--tm-navy)] inline-flex items-center justify-center">
                <Icon className="h-4 w-4" strokeWidth={1.6} />
              </span>
              <span className="text-sm font-bold text-[var(--tm-navy)] mt-1.5">{name}</span>
              <span className="text-[12px] text-[var(--tm-navy)]/70 font-semibold leading-snug">{desc}</span>
              <span className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold mt-1 truncate">{path}</span>
              <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--tm-blue)] mt-1">
                Open <ChevronRight className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
