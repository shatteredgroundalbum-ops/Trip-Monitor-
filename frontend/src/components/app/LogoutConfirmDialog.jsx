import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { LogOut } from "lucide-react";

/**
 * Logout confirmation popup. Allowed per spec:
 * "Logout may use confirmation dialog."
 */
export default function LogoutConfirmDialog({ open, onCancel, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent
        data-testid="logout-confirm-dialog"
        className="max-w-sm bg-white border-[var(--tm-border)] text-[var(--tm-navy)] rounded-2xl shadow-[0_24px_60px_rgba(14,31,71,0.18)]"
      >
        <DialogHeader>
          <DialogTitle className="text-[var(--tm-navy)] inline-flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Sign out of Trip Monitor?
          </DialogTitle>
          <DialogDescription className="text-[var(--tm-text-soft)] font-semibold leading-snug">
            You&apos;ll need to unlock the device with your PIN or fingerprint
            the next time you open the app. Your saved trips and documents
            stay on the device.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 flex-row">
          <Button
            data-testid="logout-cancel"
            variant="outline"
            onClick={onCancel}
            className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
          >
            Cancel
          </Button>
          <Button
            data-testid="logout-confirm"
            onClick={onConfirm}
            className="h-11 flex-1 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
          >
            <LogOut className="h-4 w-4 mr-1.5" /> Sign out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
