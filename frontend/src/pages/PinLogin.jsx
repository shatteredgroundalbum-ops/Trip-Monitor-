import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Fingerprint, KeyRound, ShieldCheck, AlertTriangle, ArrowLeft, MessageSquareQuote, IdCard } from "lucide-react";
import {
  verifyPin, resetPinWithRecoveryPhrase, resetPinWithMasterCode, isSetup,
  isFingerprintEnrolled, verifyFingerprint, AUTH_CONSTANTS, getIdentity, countPhraseWords,
} from "../lib/local-auth";
import { useAuth } from "../lib/auth";
import { PinField } from "./SetupAccessCode";

/**
 * Daily unlock screen. Offline — no network calls in the hot path.
 *
 * Recovery modes (spec):
 *   - phrase: Driver ID + recovery phrase  (primary)
 *   - master: Driver ID + 24-char emergency master code (fallback)
 * Biometric is a daily convenience, not a recovery path.
 */
export default function PinLogin() {
  const navigate = useNavigate();
  const { unlockDevice } = useAuth();
  const [entered, setEntered] = useState(false);
  const [mode, setMode] = useState("pin"); // pin | recover
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [fpSupported, setFpSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");

  // recover state
  const [recoveryKind, setRecoveryKind] = useState("phrase"); // phrase | master
  const [recoverStep, setRecoverStep] = useState("verify"); // verify | set-pin
  const [driverIdInput, setDriverIdInput] = useState("");
  const [phraseInput, setPhraseInput] = useState("");
  const [masterInput, setMasterInput] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [recoverErr, setRecoverErr] = useState("");
  const [recoveryLockedUntil, setRecoveryLockedUntil] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    (async () => {
      const done = await isSetup();
      if (!done) { navigate("/setup-access-code", { replace: true }); return; }
      const ident = await getIdentity();
      setDisplayName(ident.display_username || "");
    })();
    isFingerprintEnrolled().then(setFpSupported);
    return () => clearTimeout(t);
  }, [navigate]);

  useEffect(() => {
    if (!lockedUntil && !recoveryLockedUntil) return;
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, [lockedUntil, recoveryLockedUntil]);

  useEffect(() => {
    if (pin.length === 6 && !busy && lockedUntil <= now) {
      (async () => { await onSubmit(pin); })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const resetRecoverState = () => {
    setRecoverStep("verify");
    setRecoveryKind("phrase");
    setDriverIdInput("");
    setPhraseInput("");
    setMasterInput("");
    setNewPin("");
    setNewPinConfirm("");
    setRecoverErr("");
  };

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
      setPin("");
      setErr(res.remainingAttempts > 0
        ? `Wrong PIN · ${res.remainingAttempts} attempt${res.remainingAttempts === 1 ? "" : "s"} left`
        : "Locked — use your recovery phrase to reset"
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
      toast.error(res.reason === "not_enrolled" ? "Fingerprint not enrolled" : "Fingerprint cancelled");
    }
  };

  const onVerifyRecovery = async () => {
    if (!driverIdInput.trim()) { setRecoverErr("Enter your driver ID"); return; }
    if (recoveryKind === "phrase") {
      if (countPhraseWords(phraseInput) < AUTH_CONSTANTS.MIN_PHRASE_WORDS) {
        setRecoverErr(`Phrase must be at least ${AUTH_CONSTANTS.MIN_PHRASE_WORDS} words`); return;
      }
    } else if (masterInput.replace(/\s/g, "").length !== AUTH_CONSTANTS.MASTER_CODE_LENGTH) {
      setRecoverErr(`Master code must be ${AUTH_CONSTANTS.MASTER_CODE_LENGTH} characters`); return;
    }
    setBusy(true);
    setRecoverErr("");
    // For the verify step we do a "dry run" by attempting to reset with
    // a placeholder PIN only to check credentials. But since we need a
    // new PIN to actually commit, we defer verification to the final
    // submit — on this step we just move to set-pin. This matches the
    // spec flow: Driver ID + phrase/master first, then "create new PIN".
    setBusy(false);
    setRecoverStep("set-pin");
  };

  const onRecoverSubmit = async () => {
    if (newPin !== newPinConfirm) { toast.error("PINs don't match"); return; }
    setBusy(true);
    const payload = recoveryKind === "phrase"
      ? { driverId: driverIdInput, recoveryPhrase: phraseInput, newPin }
      : { driverId: driverIdInput, masterCode: masterInput, newPin };
    const fn = recoveryKind === "phrase" ? resetPinWithRecoveryPhrase : resetPinWithMasterCode;
    const res = await fn(payload);
    setBusy(false);
    if (res.ok) {
      toast.success("PIN reset — sign in with your new PIN");
      setMode("pin"); resetRecoverState();
      setPin(""); setErr(""); setLockedUntil(0);
    } else if (res.reason === "locked") {
      setRecoveryLockedUntil(res.until || 0);
      setRecoverErr(`Too many failed attempts — try again in ${Math.ceil(((res.until || 0) - Date.now()) / 1000)}s`);
      setRecoverStep("verify");
    } else if (res.reason === "wrong_identity") {
      setRecoverErr(`Driver ID doesn't match this device · ${res.remainingAttempts} attempt${res.remainingAttempts === 1 ? "" : "s"} left`);
      setRecoverStep("verify");
    } else if (res.reason === "wrong_phrase") {
      setRecoverErr(`Wrong recovery phrase · ${res.remainingAttempts} attempt${res.remainingAttempts === 1 ? "" : "s"} left`);
      setRecoverStep("verify");
    } else if (res.reason === "wrong_master") {
      setRecoverErr(`Wrong master code · ${res.remainingAttempts} attempt${res.remainingAttempts === 1 ? "" : "s"} left`);
      setRecoverStep("verify");
    } else {
      setRecoverErr("Reset failed");
      setRecoverStep("verify");
    }
  };

  const pinLockedSecondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  const recoveryLockedSecondsLeft = Math.max(0, Math.ceil((recoveryLockedUntil - now) / 1000));
  const isPinLocked = lockedUntil > now;
  const isRecoveryLocked = recoveryLockedUntil > now;

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
                {displayName ? `Welcome back, ${displayName.split(" ")[0]}.` : "Welcome back."}
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
            {isPinLocked && (
              <div data-testid="pin-lockout" className="text-center text-sm text-[var(--tm-text-soft)]">
                Try again in {pinLockedSecondsLeft}s
              </div>
            )}

            {fpSupported && !isPinLocked && (
              <Button
                variant="outline" data-testid="pin-fingerprint" onClick={onFingerprint} disabled={busy}
                className="w-full h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] font-bold"
              >
                <Fingerprint className="h-4 w-4 mr-1.5" /> Use fingerprint
              </Button>
            )}

            <button
              type="button" data-testid="pin-forgot"
              onClick={() => { resetRecoverState(); setMode("recover"); }}
              className="block mx-auto text-xs uppercase tracking-wider font-bold text-[var(--tm-blue)] hover:underline"
            >
              Forgot PIN? Use recovery phrase
            </button>
          </section>
        )}

        {mode === "recover" && (
          <section data-testid="pin-recover-section" className="w-full space-y-4">
            <button
              type="button"
              onClick={() => { resetRecoverState(); setMode("pin"); }}
              data-testid="pin-recover-back"
              className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Back to PIN
            </button>
            <h1 className="font-black tracking-tight text-2xl">Reset PIN</h1>

            {isRecoveryLocked ? (
              <div data-testid="recover-lockout" className="p-4 rounded-md bg-[var(--tm-surface)] border-2 border-[var(--tm-orange)] text-sm space-y-1">
                <div className="font-bold text-[var(--tm-orange)] uppercase tracking-wider text-xs flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Locked
                </div>
                <div>Too many failed recovery attempts. Wait {Math.floor(recoveryLockedSecondsLeft / 60)}m {recoveryLockedSecondsLeft % 60}s before trying again.</div>
              </div>
            ) : recoverStep === "verify" ? (
              <>
                <div className="flex gap-1 bg-[var(--tm-surface)] p-1 rounded-md" data-testid="recover-kind-tabs">
                  <TabButton active={recoveryKind === "phrase"} onClick={() => { setRecoveryKind("phrase"); setRecoverErr(""); }} testid="recover-tab-phrase">
                    <MessageSquareQuote className="h-3.5 w-3.5 mr-1" /> Recovery phrase
                  </TabButton>
                  <TabButton active={recoveryKind === "master"} onClick={() => { setRecoveryKind("master"); setRecoverErr(""); }} testid="recover-tab-master">
                    <KeyRound className="h-3.5 w-3.5 mr-1" /> Emergency code
                  </TabButton>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-muted)] inline-flex items-center gap-1">
                    <IdCard className="h-3 w-3" /> Driver ID
                  </label>
                  <Input
                    data-testid="recover-driverid-input"
                    value={driverIdInput}
                    onChange={(e) => setDriverIdInput(e.target.value)}
                    placeholder="The Driver ID you set up"
                  />
                </div>

                {recoveryKind === "phrase" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">Recovery phrase</label>
                    <Textarea
                      data-testid="recover-phrase-input"
                      value={phraseInput}
                      onChange={(e) => setPhraseInput(e.target.value)}
                      placeholder="Type your full secret phrase"
                      rows={3}
                      spellCheck={false}
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="font-mono text-base bg-white"
                    />
                    <p className="text-[10px] text-[var(--tm-text-muted)]">Case doesn't matter. Spaces are ignored.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">24-char emergency code</label>
                    <Input
                      data-testid="recover-master-input"
                      value={masterInput}
                      onChange={(e) => setMasterInput(e.target.value)}
                      placeholder="From setup — 24 letters/numbers"
                      className="font-mono tracking-[0.1em]"
                    />
                  </div>
                )}

                {recoverErr && (
                  <div data-testid="recover-error" className="text-xs uppercase tracking-wider font-bold text-[var(--tm-orange)] inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {recoverErr}
                  </div>
                )}

                <Button
                  data-testid="recover-verify-continue"
                  onClick={onVerifyRecovery}
                  disabled={busy}
                  className="w-full h-12 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold"
                >
                  Continue
                </Button>
              </>
            ) : (
              <>
                <div className="text-sm text-[var(--tm-text-soft)]">Pick a new 6-digit PIN.</div>
                <label className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">New PIN</label>
                <PinField value={newPin} onChange={setNewPin} autoFocus testid="recover-pin-new" />
                <label className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-muted)] pt-2 block">Confirm</label>
                <PinField value={newPinConfirm} onChange={setNewPinConfirm} testid="recover-pin-confirm" />
                {recoverErr && (
                  <div data-testid="recover-error" className="text-xs uppercase tracking-wider font-bold text-[var(--tm-orange)] inline-flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {recoverErr}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setRecoverStep("verify")} className="flex-1 h-12 bg-white"
                    data-testid="recover-pin-back">
                    Back
                  </Button>
                  <Button
                    data-testid="recover-submit"
                    onClick={onRecoverSubmit}
                    disabled={newPin.length !== 6 || newPinConfirm.length !== 6 || busy}
                    className="flex-1 h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold"
                  >
                    <KeyRound className="h-4 w-4 mr-1" /> Set new PIN
                  </Button>
                </div>
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

function TabButton({ active, onClick, testid, children }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      className={`flex-1 h-10 rounded text-xs uppercase tracking-wider font-bold inline-flex items-center justify-center transition ${
        active
          ? "bg-[var(--tm-navy)] text-white shadow-sm"
          : "bg-transparent text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)]"
      }`}
    >
      {children}
    </button>
  );
}
