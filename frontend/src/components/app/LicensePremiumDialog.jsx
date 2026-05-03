import React, { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner";
import { X, Copy, Check, ShieldCheck, Crown, Lock, IdCard, ExternalLink, AlertTriangle } from "lucide-react";
import { getLicenseId, verifyPremiumUnlockCode, getPremiumState } from "../../lib/local-auth";

/**
 * Account & Premium dialog.
 *
 * Shows the PUBLIC Website License ID (safe to copy, share, dictate
 * to support) and — separately — a "Redeem Premium Unlock Code" field
 * that verifies the signed code via `verifyPremiumUnlockCode`. The
 * master recovery code is NEVER exposed in this dialog.
 *
 * Security copy: we explicitly tell the driver the master code must
 * NEVER be entered on the website and support should NEVER ask for it.
 */
export default function LicensePremiumDialog({ open, onClose }) {
  const [licenseId, setLicenseId] = useState("");
  const [copied, setCopied] = useState(false);
  const [unlockCode, setUnlockCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [premium, setPremium] = useState({ active: false, tier: null, expires_at: null });

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLicenseId(await getLicenseId());
      setPremium(await getPremiumState());
    })();
  }, [open]);

  if (!open) return null;

  const copyLicense = async () => {
    if (!licenseId) return;
    try { await navigator.clipboard.writeText(licenseId); setCopied(true); toast.success("License ID copied"); }
    catch { toast.error("Copy failed"); }
  };

  const onRedeem = async () => {
    if (!unlockCode.trim()) return;
    setBusy(true);
    const res = await verifyPremiumUnlockCode(unlockCode.trim());
    setBusy(false);
    if (res.ok) {
      toast.success(`Premium unlocked (${res.tier})`);
      setPremium(await getPremiumState());
      setUnlockCode("");
    } else if (res.reason === "license_mismatch") {
      toast.error("Code is for a different license ID");
    } else if (res.reason === "expired") {
      toast.error("Code has expired");
    } else if (res.reason === "not_available") {
      toast.error("Premium isn't available yet — coming soon");
    } else if (res.reason === "malformed") {
      toast.error("That doesn't look like a valid unlock code");
    } else {
      toast.error("Invalid unlock code");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      data-testid="license-premium-dialog"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-md shadow-2xl max-w-md w-full border border-[var(--tm-border)]"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--tm-border)] sticky top-0 bg-white">
          <div className="inline-flex items-center gap-2">
            <IdCard className="h-4 w-4 text-[var(--tm-blue)]" />
            <span className="text-xs uppercase tracking-[0.3em] font-bold text-[var(--tm-navy)]">Account &amp; Premium</span>
          </div>
          <button onClick={onClose} data-testid="license-dialog-close" aria-label="Close"
            className="p-1 text-[var(--tm-text-soft)] hover:text-[var(--tm-navy)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Website License ID (public) */}
          <section className="space-y-2" data-testid="license-id-section">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-[var(--tm-blue)]">
              Website License ID
            </div>
            <div
              data-testid="dashboard-license-id"
              className="font-mono text-lg md:text-xl tracking-[0.15em] bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-3 text-center select-all"
            >
              {licenseId || "—"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline" onClick={copyLicense}
                data-testid="dashboard-license-copy"
                disabled={!licenseId}
                className="flex-1 h-9 bg-white text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5 mr-1 text-[var(--tm-blue)]" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-[11px] text-[var(--tm-text-soft)] leading-snug">
              Use this to log into the Trip Monitor website, buy premium, or contact support. Safe to share — it identifies your license, not your data.
            </p>
          </section>

          {/* Premium status + redeem */}
          <section className="space-y-2" data-testid="premium-section">
            <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-[var(--tm-orange)] flex items-center gap-1">
              <Crown className="h-3 w-3" /> Premium
            </div>
            {premium.active ? (
              <div data-testid="premium-active-banner" className="rounded-md border-2 border-[var(--tm-orange)] bg-[var(--tm-orange)]/10 p-3 text-sm flex items-start gap-2">
                <Crown className="h-4 w-4 text-[var(--tm-orange)] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-[var(--tm-navy)]">Premium active</div>
                  <div className="text-xs text-[var(--tm-text-soft)]">
                    Tier: <strong>{premium.tier || "premium"}</strong>{premium.expires_at ? ` · renews ${new Date(premium.expires_at).toLocaleDateString()}` : " · lifetime"}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-md border border-[var(--tm-border)] bg-white p-3 text-sm flex items-start gap-2">
                  <Lock className="h-4 w-4 text-[var(--tm-text-muted)] shrink-0 mt-0.5" />
                  <div className="text-xs text-[var(--tm-text-soft)]">
                    Premium unlocks offline after you buy it on the Trip Monitor website. Enter the unlock code we send you after purchase.
                  </div>
                </div>
                <Input
                  data-testid="premium-unlock-input"
                  value={unlockCode}
                  onChange={(e) => setUnlockCode(e.target.value)}
                  placeholder="Paste your Premium Unlock Code"
                  className="font-mono text-xs"
                />
                <Button
                  data-testid="premium-redeem"
                  onClick={onRedeem}
                  disabled={busy || !unlockCode.trim()}
                  className="w-full h-10 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold"
                >
                  <Crown className="h-3.5 w-3.5 mr-1" /> Redeem unlock code
                </Button>
              </>
            )}
            <a
              data-testid="open-website"
              href="https://tripmonitor.app"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[var(--tm-blue)] hover:underline font-bold"
            >
              Open Trip Monitor website <ExternalLink className="h-3 w-3" />
            </a>
          </section>

          {/* Security reminder */}
          <section className="rounded-md bg-[var(--tm-surface)] border border-[var(--tm-border)] p-3 text-xs text-[var(--tm-text-soft)] space-y-1" data-testid="security-reminder">
            <div className="inline-flex items-center gap-1 text-[var(--tm-orange)] font-bold uppercase tracking-wider text-[10px]">
              <AlertTriangle className="h-3 w-3" /> Never share these
            </div>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Your 24-char <strong>master recovery code</strong> — never on the website, never to support.</li>
              <li>Your <strong>PIN</strong> — never to anyone.</li>
              <li>Your <strong>recovery phrase</strong> — never to anyone.</li>
            </ul>
            <div className="inline-flex items-center gap-1 pt-2 text-[var(--tm-blue)] font-bold">
              <ShieldCheck className="h-3 w-3" /> Safe to share: License ID only.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
