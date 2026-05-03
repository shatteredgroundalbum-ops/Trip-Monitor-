import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import StorageWizard from "./StorageWizard";

/**
 * Dashboard-side dialog so the driver can change storage destination
 * any time after setup. Wraps the same `<StorageWizard />` used during
 * onboarding so behaviour is identical.
 */
export default function StorageSettingsDialog({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent
        data-testid="storage-settings-dialog"
        className="max-w-md bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-md max-h-[90vh] overflow-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-[var(--tm-navy)]">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold block mb-2">
              Storage location
            </span>
            <span className="text-2xl font-black tracking-tight">Where your trip data is saved</span>
          </DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)]">
            Trip Monitor is offline-first — nothing leaves your device. Pick where exports and backups land.
          </DialogDescription>
        </DialogHeader>

        <StorageWizard showHeader={false} compact />

        <div className="pt-2">
          <Button
            data-testid="storage-settings-close"
            onClick={() => onClose?.()}
            className="w-full h-12 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold rounded-md"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
