import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, Copy, RefreshCw, ShieldCheck, Lock, Eye, EyeOff, AlertTriangle } from "lucide-react";
import {
  generateMasterCode, formatMasterCode, isValidMasterCode,
  setupAuth, isSetup,
} from "../lib/local-auth";
import { useAuth } from "../lib/auth";

/**
 * First-run device setup: generate (or type) a 24-character master
 * access code, write it down somewhere safe, then set a 6-digit PIN.
 * Runs entirely offline. No server, no OAuth, no email.
 */
export default function SetupAccessCode() {
  const navigate = useNavigate();
  const { unlockDevice } = useAuth();
  const [step, setStep] = useState("master"); // master | confirm-wrote-down | pin | pin-confirm
  const [entered, setEntered] = useState(false);
  const [masterCode, setMasterCode] = useState(() => generateMasterCode());
  const [userTyped, setUserTyped] = useState("");
  const [showCode, setShowCode] = useState(true);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    isSetup().then((done) => {
      if (done) navigate("/pin-login", { replace: true });
    });
    return () => clearTimeout(t);
  }, [navigate]);

  const regenerate = () => {
    setMasterCode(generateMasterCode());
    setUserTyped("");
    toast.success("New code generated");
  };
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(masterCode);
      toast.success("Code copied — paste it somewhere safe");
    } catch {
      toast.error("Copy failed — please write it down instead");
    }
  };

  const onMasterContinue = () => {
    const source = userTyped ? userTyped : masterCode;
    if (!isValidMasterCode(source)) {
      toast.error("Code must be exactly 24 letters or numbers");
      return;
    }
    setMasterCode(source.replace(/[^A-Za-z0-9]/g, ""));
    setStep("confirm-wrote-down");
  };

  const onPinContinue = () => {
    if (!/^\d{6}$/.test(pin)) { toast.error("PIN must be 6 digits"); return; }
    setStep("pin-confirm");
  };

  const onFinalise = async () => {
    if (pin !== pinConfirm) { toast.error("PINs don't match"); return; }
    setBusy(true);
    try {
      await setupAuth({ masterCode, pin });
      await unlockDevice();
      toast.success("Device setup complete");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      toast.error(err?.message || "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-white text-[var(--tm-navy)] flex flex-col"
      style={{
        opacity: entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(6%)",
        transition: "opacity 600ms ease-out, transform 700ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      data-testid="setup-access-code-page"
    >
      <header className="px-6 pt-7 max-w-md w-full mx-auto">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold"
          data-testid="setup-back"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
      </header>

      <main className="flex-1 flex flex-col p-7 md:p-12 max-w-md w-full mx-auto">
        {step === "master" && (
          <section data-testid="setup-step-master" className="space-y-4">
            <Overline>Step 1 of 2 · Master access code</Overline>
            <h1 className="font-black tracking-tight leading-[0.95]" style={{ fontSize: "clamp(1.75rem, 6vw, 2.5rem)" }}>
              Write this down.
            </h1>
            <p className="text-[var(--tm-text-soft)] text-sm">
              Your 24-character master code is the only way to reset your PIN or unlock this app on a new device. We do NOT store it in any cloud. Keep it somewhere only you can find.
            </p>

            <div
              data-testid="setup-master-code"
              className="font-mono text-lg md:text-xl tracking-[0.15em] bg-[var(--tm-surface)] border-2 border-dashed border-[var(--tm-blue)] rounded-md p-4 text-center break-all select-all"
            >
              {showCode ? formatMasterCode(masterCode) : "•••• •••• •••• •••• •••• ••••"}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCode((s) => !s)} className="flex-1 h-10 bg-white" data-testid="setup-toggle-visibility">
                {showCode ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {showCode ? "Hide" : "Show"}
              </Button>
              <Button variant="outline" onClick={regenerate} className="flex-1 h-10 bg-white" data-testid="setup-regenerate">
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> New code
              </Button>
              <Button variant="outline" onClick={copyCode} className="flex-1 h-10 bg-white" data-testid="setup-copy">
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
              </Button>
            </div>

            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] text-xs uppercase tracking-wider font-bold">
                I already have a code — enter it instead
              </summary>
              <Input
                data-testid="setup-master-input"
                value={userTyped}
                onChange={(e) => setUserTyped(e.target.value)}
                placeholder="24 letters or numbers"
                className="mt-2 font-mono tracking-[0.1em]"
                maxLength={32}
              />
            </details>

            <Button
              data-testid="setup-master-continue"
              onClick={onMasterContinue}
              className="w-full h-12 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold rounded-md mt-3"
            >
              I've written it down — continue
            </Button>
          </section>
        )}

        {step === "confirm-wrote-down" && (
          <section data-testid="setup-step-confirm" className="space-y-4">
            <div className="h-16 w-16 rounded-full bg-[var(--tm-orange)] text-white mx-auto flex items-center justify-center">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h1 className="text-center font-black tracking-tight text-2xl">Are you sure?</h1>
            <p className="text-center text-[var(--tm-text-soft)] text-sm">
              Without this code you <strong>cannot</strong> reset your PIN if you forget it. We cannot recover it for you. No cloud, no server.
            </p>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                data-testid="setup-confirm-back"
                onClick={() => setStep("master")}
                className="flex-1 h-12 bg-white border-[var(--tm-border)]"
              >
                Show me the code again
              </Button>
              <Button
                data-testid="setup-confirm-next"
                onClick={() => setStep("pin")}
                className="flex-1 h-12 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold"
              >
                Yes, it's safe
              </Button>
            </div>
          </section>
        )}

        {step === "pin" && (
          <section data-testid="setup-step-pin" className="space-y-4">
            <Overline>Step 2 of 2 · Create PIN</Overline>
            <h1 className="font-black tracking-tight leading-[0.95]" style={{ fontSize: "clamp(1.75rem, 6vw, 2.5rem)" }}>
              Set a 6-digit PIN.
            </h1>
            <p className="text-[var(--tm-text-soft)] text-sm">
              This is what you'll tap every time you open the app. Pick something only you'd know.
            </p>
            <PinField value={pin} onChange={setPin} autoFocus testid="setup-pin" />
            <Button
              data-testid="setup-pin-continue"
              onClick={onPinContinue}
              disabled={pin.length !== 6}
              className="w-full h-12 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold rounded-md mt-3"
            >
              Continue
            </Button>
          </section>
        )}

        {step === "pin-confirm" && (
          <section data-testid="setup-step-pin-confirm" className="space-y-4">
            <Overline>Confirm PIN</Overline>
            <h1 className="font-black tracking-tight leading-[0.95]" style={{ fontSize: "clamp(1.75rem, 6vw, 2.5rem)" }}>
              Type it again.
            </h1>
            <PinField value={pinConfirm} onChange={setPinConfirm} autoFocus testid="setup-pin-confirm" />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setPinConfirm(""); setStep("pin"); }}
                className="flex-1 h-12 bg-white"
                data-testid="setup-pin-back"
              >
                Back
              </Button>
              <Button
                data-testid="setup-finalise"
                onClick={onFinalise}
                disabled={pinConfirm.length !== 6 || busy}
                className="flex-1 h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold"
              >
                <Lock className="h-4 w-4 mr-1" /> Finish setup
              </Button>
            </div>
          </section>
        )}

        <div className="mt-auto pt-8 text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold flex items-center gap-2 justify-center">
          <ShieldCheck className="h-3 w-3 text-[var(--tm-blue)]" />
          100% on-device · no cloud, no login
        </div>
      </main>
    </div>
  );
}

function Overline({ children }) {
  return (
    <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] font-bold">
      <span className="h-px w-8 bg-[var(--tm-blue)]" aria-hidden />
      <span className="text-[var(--tm-orange)]">Driver Edition</span>
      <span className="text-[var(--tm-text-muted)]">·</span>
      <span className="text-[var(--tm-blue)]">{children}</span>
    </div>
  );
}

export function PinField({ value, onChange, autoFocus, testid }) {
  const handle = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(v);
  };
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            data-testid={`${testid}-dot-${i}`}
            className={`h-12 w-10 rounded-md border-2 flex items-center justify-center font-black text-xl transition ${
              i < value.length
                ? "bg-[var(--tm-navy)] text-white border-[var(--tm-navy)]"
                : "bg-white text-[var(--tm-text-muted)] border-[var(--tm-border)]"
            }`}
          >
            {i < value.length ? "•" : ""}
          </div>
        ))}
      </div>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={handle}
        data-testid={`${testid}-input`}
        className="sr-only-input text-center text-2xl font-mono tracking-[0.35em] bg-white border-2 border-[var(--tm-border)] rounded-md h-12 w-64 focus:border-[var(--tm-blue)] outline-none"
        placeholder="••••••"
      />
    </div>
  );
}
