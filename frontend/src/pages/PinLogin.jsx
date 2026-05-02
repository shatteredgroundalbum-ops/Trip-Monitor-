import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { Fingerprint, KeyRound, ShieldCheck, AlertTriangle, ArrowLeft } from "lucide-react";
import {
  verifyPin, resetPinWithMasterCode, isSetup,
  isFingerprintEnrolled, verifyFingerprint,
} from "../lib/local-auth";
import { useAuth } from "../lib/auth";
import { PinField } from "./SetupAccessCode";

/**
 * PIN unlock screen. Works entirely offline against the locally-stored
 * PIN verifier (hash + salt in the auth DB) + master code (kept in the
 * separate keychain DB). No network calls.
 *
 * Fingerprint unlock is offered if WebAuthn credential was previously
 * enrolled from the profile.
 */
export default function PinLogin() {
  const navigate = useNavigate();
  const { unlockDevice } = useAuth();
  const [entered, setEntered] = useState(false);
  const [mode, setMode] = useState("pin"); // pin | recover
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [remaining, setRemaining] = useState(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [fpSupported, setFpSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  // recover state
  const [masterCode, setMasterCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [recoverStep, setRecoverStep] = useState("master"); // master | pin

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    isSetup().then((done) => {
      if (!done) navigate("/setup-access-code", { replace: true });
    });
    isFingerprintEnrolled().then(setFpSupported);
    return () => clearTimeout(t);
  }, [navigate]);

  useEffect(() => {
    if (!lockedUntil) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [lockedUntil]);

  // auto-submit on 6th digit
  useEffect(() => {
    if (pin.length === 6 && !busy && lockedUntil <= now) {
      (async () => { await onSubmit(pin); })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const onSubmit = async (value) => {
    setBusy(true);
    setErr("");
    const res = await verifyPin(value);
    setBusy(false);
    if (res.ok) {
      await unlockDevice();
      navigate("/dashboard", { replace: true });
      return;
    }
    if (res.reason === "locked") {
      setLockedUntil(res.until || 0);
      setErr(`Too many wrong attempts — try again in ${Math.ceil(((res.until || 0) - Date.now()) / 1000)}s`);
    } else if (res.reason === "wrong_pin") {
      setLockedUntil(res.lockedUntil || 0);
      setRemaining(res.remainingAttempts);
      setPin("");
      setErr(res.remainingAttempts > 0
        ? `Wrong PIN · ${res.remainingAttempts} attempt${res.remainingAttempts === 1 ? "" : "s"} left`
        : "Locked — use your master code to reset"
      );
    } else {
      setErr("Verification failed");
    }
  };

  const onFingerprint = async () => {
    setBusy(true);
    const res = await verifyFingerprint();
    setBusy(false);
    if (res.ok) {
      await unlockDevice();
      navigate("/dashboard", { replace: true });
    } else {
      toast.error(res.reason === "not_enrolled" ? "Fingerprint not enrolled on this device" : "Fingerprint cancelled");
    }
  };

  const onRecoverSubmit = async () => {
    if (newPin !== newPinConfirm) { toast.error("PINs don't match"); return; }
    const res = await resetPinWithMasterCode({ masterCode: masterCode.trim(), newPin });
    if (res.ok) {
      toast.success("PIN reset — sign in with your new PIN");
      setMode("pin"); setRecoverStep("master");
      setMasterCode(""); setNewPin(""); setNewPinConfirm("");
      setPin(""); setErr(""); setRemaining(null); setLockedUntil(0);
    } else if (res.reason === "wrong_master_code") {
      toast.error("Master code doesn't match this device");
    } else {
      toast.error("Reset failed");
    }
  };

  const lockedSecondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const isLocked = lockedUntil > now;

  return (
    <div
      className="min-h-screen bg-white text-[var(--tm-navy)] flex flex-col"
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(6%)",
        transition: "opacity 600ms ease-out, transform 700ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      data-testid="pin-login-page"
    >
      <main className="flex-1 flex flex-col items-center justify-center p-7 md:p-12 max-w-md w-full mx-auto">
        {mode === "pin" && (
          <section data-testid="pin-login-section" className="w-full space-y-5">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] font-bold">
                <span className="h-px w-8 bg-[var(--tm-blue)]" aria-hidden />
                <span className="text-[var(--tm-orange)]">Driver Edition</span>
                <span className="text-[var(--tm-text-muted)]">·</span>
                <span className="text-[var(--tm-blue)]">Unlock</span>
              </div>
              <h1 className="font-black tracking-tight leading-[0.95] text-[var(--tm-navy)]" style={{ fontFamily: "Chivo, sans-serif", fontSize: "clamp(2rem, 7vw, 3rem)" }}>
                Welcome back.
              </h1>
              <p className="text-[var(--tm-text-soft)] text-sm">Enter your 6-digit PIN.</p>
            </div>

            <div data-testid="pin-field">
              <PinField value={pin} onChange={setPin} autoFocus testid="pin-login" />
            </div>

            {err && (
              <div data-testid="pin-error" className="text-center text-xs uppercase tracking-wider font-bold text-[var(--tm-orange)] inline-flex items-center gap-1 justify-center w-full">
                <AlertTriangle className="h-3 w-3" /> {err}
              </div>
            )}
            {isLocked && (
              <div data-testid="pin-lockout" className="text-center text-sm text-[var(--tm-text-soft)]">
                Try again in {lockedSecondsLeft}s
              </div>
            )}

            {fpSupported && !isLocked && (
              <Button
                variant="outline"
                data-testid="pin-fingerprint"
                onClick={onFingerprint}
                disabled={busy}
                className="w-full h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] font-bold"
              >
                <Fingerprint className="h-4 w-4 mr-1.5" /> Use fingerprint
              </Button>
            )}

            <button
              type="button"
              data-testid="pin-forgot"
              onClick={() => { setMode("recover"); setRecoverStep("master"); setMasterCode(""); setNewPin(""); setNewPinConfirm(""); }}
              className="block mx-auto text-xs uppercase tracking-wider font-bold text-[var(--tm-blue)] hover:underline"
            >
              Forgot PIN? Use master code
            </button>
          </section>
        )}

        {mode === "recover" && (
          <section data-testid="pin-recover-section" className="w-full space-y-4">
            <button
              type="button"
              onClick={() => { setMode("pin"); setRecoverStep("master"); setMasterCode(""); setNewPin(""); setNewPinConfirm(""); }}
              data-testid="pin-recover-back"
              className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back to PIN
            </button>
            <h1 className="font-black tracking-tight text-2xl">Reset PIN</h1>
            <p className="text-[var(--tm-text-soft)] text-sm">
              Enter the 24-character master code you wrote down during setup, then pick a new 6-digit PIN.
            </p>
            {recoverStep === "master" && (
              <>
                <Input
                  data-testid="recover-master-input"
                  value={masterCode}
                  onChange={(e) => setMasterCode(e.target.value)}
                  placeholder="24 letters or numbers"
                  className="font-mono tracking-[0.1em]"
                />
                <Button
                  data-testid="recover-master-continue"
                  onClick={() => setRecoverStep("pin")}
                  disabled={masterCode.replace(/\s/g, "").length < 24}
                  className="w-full h-12 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold"
                >
                  Continue
                </Button>
              </>
            )}
            {recoverStep === "pin" && (
              <>
                <label className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">New PIN</label>
                <PinField value={newPin} onChange={setNewPin} autoFocus testid="recover-pin-new" />
                <label className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-muted)] pt-2 block">Confirm</label>
                <PinField value={newPinConfirm} onChange={setNewPinConfirm} testid="recover-pin-confirm" />
                <Button
                  data-testid="recover-submit"
                  onClick={onRecoverSubmit}
                  disabled={newPin.length !== 6 || newPinConfirm.length !== 6}
                  className="w-full h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold"
                >
                  <KeyRound className="h-4 w-4 mr-1" /> Set new PIN
                </Button>
              </>
            )}
          </section>
        )}

        <div className="mt-12 text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold flex items-center gap-2">
          <ShieldCheck className="h-3 w-3 text-[var(--tm-blue)]" />
          100% on-device · no cloud, no login
        </div>
      </main>
    </div>
  );
}
