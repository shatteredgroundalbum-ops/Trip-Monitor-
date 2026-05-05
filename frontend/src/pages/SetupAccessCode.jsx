import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft, Copy, ShieldCheck, Lock, Eye, EyeOff, AlertTriangle,
  User as UserIcon, IdCard, KeyRound, MessageSquareQuote, Check,
} from "lucide-react";
import {
  setupAuth, isSetup, isValidPhrase, countPhraseWords,
  isValidDriverId, isValidDisplayUsername, formatMasterCode, AUTH_CONSTANTS,
} from "../lib/local-auth";
import { useAuth } from "../lib/auth";
import StorageWizard from "../components/app/StorageWizard";
import { WEBSITE_FEATURES_ENABLED } from "../lib/feature-flags";

/**
 * Onboarding wizard for first-run device setup.
 *
 * Step order (per spec):
 *   1. Identity         — displayUsername + driverId
 *   2. PIN              — 6 digits (twice)
 *   3. Recovery phrase  — >=4 words, entered twice, NEVER shown after save
 *   4. Emergency code   — app-generated 24-char master code, shown ONCE
 *   5. Storage location — pick where exports + backups land
 */
export default function SetupAccessCode() {
  const navigate = useNavigate();
  const { unlockDevice } = useAuth();
  const [step, setStep] = useState("identity");
  const [entered, setEntered] = useState(false);

  // Step 1
  const [displayUsername, setDisplayUsername] = useState("");
  const [driverId, setDriverId] = useState("");
  // Step 2
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  // Step 3
  const [phrase, setPhrase] = useState("");
  const [phraseConfirm, setPhraseConfirm] = useState("");
  // Step 4 — both codes returned from setupAuth
  const [masterCode, setMasterCode] = useState("");
  const [licenseId, setLicenseId] = useState("");
  const [showMaster, setShowMaster] = useState(true);
  const [copiedMaster, setCopiedMaster] = useState(false);
  const [copiedLicense, setCopiedLicense] = useState(false);
  const [masterAcked, setMasterAcked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 60);
    isSetup().then((done) => { if (done) navigate("/pin-login", { replace: true }); });
    return () => clearTimeout(t);
  }, [navigate]);

  const identityOk = isValidDisplayUsername(displayUsername) && isValidDriverId(driverId);
  const pinOk = /^\d{6}$/.test(pin) && pin === pinConfirm;
  const phraseOk = isValidPhrase(phrase) && normalize(phrase) === normalize(phraseConfirm);

  const onIdentityNext = () => {
    if (!isValidDisplayUsername(displayUsername)) { toast.error("Display name must be 2–40 characters"); return; }
    if (!isValidDriverId(driverId)) { toast.error("Driver ID must be 3–32 letters/numbers/-/_"); return; }
    setStep("pin");
  };
  const onPinNext = () => {
    if (!/^\d{6}$/.test(pin)) { toast.error("PIN must be 6 digits"); return; }
    setStep("pin-confirm");
  };
  const onPinConfirmNext = () => {
    if (pin !== pinConfirm) { toast.error("PINs don't match"); return; }
    setStep("phrase");
  };
  const onPhraseNext = () => {
    if (!isValidPhrase(phrase)) { toast.error(`Use at least ${AUTH_CONSTANTS.MIN_PHRASE_WORDS} words`); return; }
    setStep("phrase-confirm");
  };
  const onPhraseConfirmNext = async () => {
    if (normalize(phrase) !== normalize(phraseConfirm)) {
      toast.error("Phrase doesn't match — try again");
      return;
    }
    // Finalize setup BEFORE the master-code screen, so we can capture
    // the generated master code from the setupAuth return value.
    setBusy(true);
    try {
      const { masterCode: mc, licenseId: lic } = await setupAuth({
        displayUsername, driverId, pin, recoveryPhrase: phrase,
      });
      setMasterCode(mc);
      setLicenseId(lic);
      setStep("master");
    } catch (err) {
      toast.error(err?.message || "Setup failed");
    } finally {
      setBusy(false);
    }
  };
  const onFinish = async () => {
    if (!masterAcked) { toast.error("Tick the box to confirm you've saved the code"); return; }
    setStep("storage");
  };
  const onCompleteSetup = async () => {
    await unlockDevice();
    toast.success("Device setup complete");
    navigate("/dashboard", { replace: true });
  };
  const copyMaster = async () => {
    try { await navigator.clipboard.writeText(masterCode); setCopiedMaster(true); toast.success("Copied — store it somewhere safe"); }
    catch { toast.error("Copy failed — please write it down"); }
  };
  const copyLicense = async () => {
    try { await navigator.clipboard.writeText(licenseId); setCopiedLicense(true); toast.success("License ID copied"); }
    catch { toast.error("Copy failed — please write it down"); }
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
      <header className="px-6 pt-7 max-w-md w-full mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={() => handleBack({ step, setStep, navigate })}
          className="text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold"
          data-testid="setup-back"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <StepBar step={step} />
      </header>

      <main className="flex-1 flex flex-col p-7 md:p-12 max-w-md w-full mx-auto">
        {step === "identity" && (
          <Section testid="setup-step-identity" icon={<UserIcon className="h-5 w-5" />} overline="Step 1 of 5" title="Who are you?" blurb="This is how you'll show up on your trip sheets. Pick names you'll remember.">
            <Field label="Display name" testid="setup-username-input"
              value={displayUsername} onChange={setDisplayUsername}
              placeholder="e.g. Marcus R." maxLength={40} />
            <Field label="Driver ID / code" testid="setup-driverid-input"
              value={driverId} onChange={setDriverId}
              placeholder="e.g. MR-4429" maxLength={32}
              hint="Letters, numbers, - and _ only. You'll need this if you ever forget your PIN." />
            <Primary testid="setup-identity-continue" disabled={!identityOk} onClick={onIdentityNext}>Continue</Primary>
          </Section>
        )}

        {step === "pin" && (
          <Section testid="setup-step-pin" icon={<KeyRound className="h-5 w-5" />} overline="Step 2 of 5" title="Set your 6-digit PIN." blurb="You'll tap this every time you open the app.">
            <PinField value={pin} onChange={setPin} autoFocus testid="setup-pin" />
            <Primary testid="setup-pin-continue" disabled={pin.length !== 6} onClick={onPinNext}>Continue</Primary>
          </Section>
        )}
        {step === "pin-confirm" && (
          <Section testid="setup-step-pin-confirm" icon={<KeyRound className="h-5 w-5" />} overline="Step 2 of 5" title="Type your PIN again." blurb="Just to be sure.">
            <PinField value={pinConfirm} onChange={setPinConfirm} autoFocus testid="setup-pin-confirm" />
            <TwoButtons
              leftTestid="setup-pin-back" leftLabel="Back" onLeft={() => { setPinConfirm(""); setStep("pin"); }}
              rightTestid="setup-pin-confirm-next" rightLabel="Continue" rightDisabled={!pinOk}
              onRight={onPinConfirmNext}
            />
          </Section>
        )}

        {step === "phrase" && (
          <Section testid="setup-step-phrase" icon={<MessageSquareQuote className="h-5 w-5" />} overline="Step 3 of 5" title="Pick a secret recovery phrase." blurb={`At least ${AUTH_CONSTANTS.MIN_PHRASE_WORDS} words. You'll use it if you forget your PIN. We will NEVER show it back to you after you set it — write it somewhere safe.`}>
            <PhraseField value={phrase} onChange={setPhrase} testid="setup-phrase-input"
              placeholder="e.g. blue truck river coffee" />
            <PhraseMeter value={phrase} />
            <Primary testid="setup-phrase-continue" disabled={!isValidPhrase(phrase)} onClick={onPhraseNext}>Continue</Primary>
          </Section>
        )}
        {step === "phrase-confirm" && (
          <Section testid="setup-step-phrase-confirm" icon={<MessageSquareQuote className="h-5 w-5" />} overline="Step 3 of 5" title="Type your phrase again." blurb="Must match exactly (case and extra spaces don't count).">
            <PhraseField value={phraseConfirm} onChange={setPhraseConfirm} testid="setup-phrase-confirm-input"
              placeholder="Type the same phrase" />
            <TwoButtons
              leftTestid="setup-phrase-back" leftLabel="Back" onLeft={() => { setPhraseConfirm(""); setStep("phrase"); }}
              rightTestid="setup-phrase-confirm-next" rightLabel="Continue" rightDisabled={!phraseOk || busy}
              onRight={onPhraseConfirmNext}
            />
          </Section>
        )}

        {step === "master" && masterCode && (
          <section data-testid="setup-step-master" className="space-y-4">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] font-bold">
              <span className="h-px w-8 bg-[var(--tm-blue)]" aria-hidden />
              <span className="text-[var(--tm-orange)]">Step 4 of 5</span>
              <span className="text-[var(--tm-text-muted)]">·</span>
              <span className="text-[var(--tm-blue)]">{WEBSITE_FEATURES_ENABLED ? "Your codes" : "Emergency code"}</span>
            </div>
            <h1 className="font-black tracking-tight leading-[0.95]" style={{ fontSize: "clamp(1.75rem, 6vw, 2.5rem)" }}>
              {WEBSITE_FEATURES_ENABLED ? "Two codes, two jobs." : "Save this code."}
            </h1>

            {/* Public website license ID — safe to share */}
            {WEBSITE_FEATURES_ENABLED && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[var(--tm-blue)]">
                    Website License ID · public · safe to share
                  </span>
                </div>
                <div
                  data-testid="setup-license-id"
                  className="font-mono text-xl md:text-2xl tracking-[0.15em] bg-white border-2 border-[var(--tm-blue)] rounded-md p-4 text-center select-all text-[var(--tm-navy)]"
                >
                  {licenseId}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={copyLicense} className="flex-1 h-9 bg-white text-xs" data-testid="setup-license-copy">
                    {copiedLicense ? <Check className="h-3.5 w-3.5 mr-1 text-[var(--tm-blue)]" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copiedLicense ? "Copied" : "Copy license ID"}
                  </Button>
                </div>
                <p className="text-[11px] text-[var(--tm-text-soft)] leading-snug">
                  Use this to log into the Trip Monitor website for purchases, premium unlock, and customer support. Safe to dictate to support over the phone.
                </p>
              </div>
            )}

            {/* Private emergency backup master code — shown once */}
            <div className="pt-2 space-y-2">
              <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[var(--tm-orange)]">
                Emergency master code · private · shown only once
              </span>
              <div className="bg-[var(--tm-orange)] bg-opacity-10 border-2 border-[var(--tm-orange)] rounded-md p-3 text-xs text-[var(--tm-navy)] flex gap-2 items-start" data-testid="setup-master-warning">
                <AlertTriangle className="h-4 w-4 text-[var(--tm-orange)] shrink-0 mt-0.5" />
                <div>
                  Last-ditch recovery if you forget BOTH your PIN and your phrase. Write it down. <strong>{WEBSITE_FEATURES_ENABLED ? "Never enter this into the website or send it to support." : "Never share it with anyone — not even support."}</strong>
                </div>
              </div>
              <div
                data-testid="setup-master-code"
                className="font-mono text-lg md:text-xl tracking-[0.15em] bg-[var(--tm-surface)] border-2 border-dashed border-[var(--tm-blue)] rounded-md p-4 text-center break-all select-all"
              >
                {showMaster ? formatMasterCode(masterCode) : "•••• •••• •••• •••• •••• ••••"}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowMaster((s) => !s)} className="flex-1 h-9 bg-white text-xs" data-testid="setup-master-toggle">
                  {showMaster ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                  {showMaster ? "Hide" : "Show"}
                </Button>
                <Button variant="outline" onClick={copyMaster} className="flex-1 h-9 bg-white text-xs" data-testid="setup-master-copy">
                  {copiedMaster ? <Check className="h-3.5 w-3.5 mr-1 text-[var(--tm-blue)]" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  {copiedMaster ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-1">
              <input
                id="setup-master-ack-cb"
                type="checkbox"
                checked={masterAcked}
                onChange={(e) => setMasterAcked(e.target.checked)}
                data-testid="setup-master-ack-checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--tm-orange)] cursor-pointer"
              />
              <label htmlFor="setup-master-ack-cb" data-testid="setup-master-ack" className="text-xs text-[var(--tm-text-soft)] cursor-pointer">
                I've saved my master code somewhere only I can find. I understand that if I lose my PIN, my phrase, AND this code, my local data may not be recoverable.
              </label>
            </div>
            <Primary testid="setup-finalise" disabled={!masterAcked} onClick={onFinish}>
              Continue
            </Primary>
          </section>
        )}

        {step === "storage" && (
          <section data-testid="setup-step-storage" className="space-y-4">
            <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] font-bold">
              <span className="h-px w-8 bg-[var(--tm-blue)]" aria-hidden />
              <span className="text-[var(--tm-orange)]">Step 5 of 5</span>
              <span className="text-[var(--tm-text-muted)]">·</span>
              <span className="text-[var(--tm-blue)]">Storage</span>
            </div>
            <StorageWizard />
            <Primary testid="setup-storage-finish" disabled={false} onClick={onCompleteSetup}>
              <Lock className="h-4 w-4 mr-1" /> Finish setup
            </Primary>
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

function normalize(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function handleBack({ step, setStep, navigate }) {
  const prev = {
    identity: null, pin: "identity", "pin-confirm": "pin",
    phrase: "pin-confirm", "phrase-confirm": "phrase",
    master: null, // no back from master — setup already committed
    storage: "master",
  }[step];
  if (prev === null) navigate("/");
  else if (prev) setStep(prev);
}

function StepBar({ step }) {
  const order = ["identity", "pin", "phrase", "master", "storage"];
  const idx = order.findIndex((o) => step.startsWith(o));
  return (
    <div className="flex gap-1.5" data-testid="setup-step-bar" aria-label={`Step ${idx + 1} of 5`}>
      {order.map((o, i) => (
        <div key={o} className={`h-1.5 w-6 rounded-full transition ${i <= idx ? "bg-[var(--tm-blue)]" : "bg-[var(--tm-border)]"}`} />
      ))}
    </div>
  );
}

function Section({ testid, icon, overline, title, blurb, children }) {
  return (
    <section data-testid={testid} className="space-y-4">
      <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] font-bold">
        <span className="h-px w-8 bg-[var(--tm-blue)]" aria-hidden />
        <span className="text-[var(--tm-orange)]">Driver Edition</span>
        <span className="text-[var(--tm-text-muted)]">·</span>
        <span className="text-[var(--tm-blue)]">{overline}</span>
      </div>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-[var(--tm-navy)] text-white flex items-center justify-center shrink-0 mt-1">{icon}</div>
        <div className="flex-1">
          <h1 className="font-black tracking-tight leading-[1.05]" style={{ fontSize: "clamp(1.5rem, 5.5vw, 2.25rem)" }}>
            {title}
          </h1>
          {blurb && <p className="text-[var(--tm-text-soft)] text-sm mt-2">{blurb}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, testid, value, onChange, placeholder, maxLength, hint }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">{label}</label>
      <Input data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} maxLength={maxLength} />
      {hint && <p className="text-[10px] text-[var(--tm-text-muted)] leading-snug">{hint}</p>}
    </div>
  );
}

function PhraseField({ value, onChange, placeholder, testid }) {
  return (
    <Textarea
      data-testid={testid}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      className="font-mono text-base leading-relaxed bg-white"
    />
  );
}

function PhraseMeter({ value }) {
  const n = countPhraseWords(value);
  const ok = n >= AUTH_CONSTANTS.MIN_PHRASE_WORDS;
  return (
    <div data-testid="setup-phrase-meter" className="text-xs flex items-center gap-2">
      <div className={`h-1.5 flex-1 rounded-full ${ok ? "bg-[var(--tm-blue)]" : "bg-[var(--tm-border)]"}`} />
      <span className={`font-bold tracking-wider uppercase text-[10px] ${ok ? "text-[var(--tm-blue)]" : "text-[var(--tm-text-muted)]"}`}>
        {n} / {AUTH_CONSTANTS.MIN_PHRASE_WORDS}+ words
      </span>
    </div>
  );
}

function Primary({ testid, disabled, onClick, children }) {
  return (
    <Button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="w-full h-12 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold rounded-md mt-3"
    >
      {children}
    </Button>
  );
}

function TwoButtons({ leftTestid, leftLabel, onLeft, rightTestid, rightLabel, onRight, rightDisabled }) {
  return (
    <div className="flex gap-2 mt-3">
      <Button variant="outline" onClick={onLeft} data-testid={leftTestid}
        className="flex-1 h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] font-bold">
        {leftLabel}
      </Button>
      <Button onClick={onRight} disabled={rightDisabled} data-testid={rightTestid}
        className="flex-1 h-12 bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold">
        {rightLabel}
      </Button>
    </div>
  );
}

export function PinField({ value, onChange, autoFocus, testid }) {
  const inputRef = React.useRef(null);
  const handle = (e) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
    onChange(v);
  };
  return (
    <div className="flex justify-center">
      <div
        className="relative flex gap-2 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            data-testid={`${testid}-dot-${i}`}
            className={`h-12 w-10 rounded-md border-2 flex items-center justify-center font-black text-xl transition ${
              i < value.length
                ? "bg-[var(--tm-navy)] text-white border-[var(--tm-navy)]"
                : i === value.length
                ? "bg-white border-[var(--tm-blue)]"
                : "bg-white border-[var(--tm-border)]"
            }`}
          >
            {i < value.length ? "•" : ""}
          </div>
        ))}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          autoFocus={autoFocus}
          value={value}
          onChange={handle}
          data-testid={`${testid}-input`}
          className="absolute inset-0 opacity-0 cursor-text"
          style={{ caretColor: "transparent" }}
        />
      </div>
    </div>
  );
}
