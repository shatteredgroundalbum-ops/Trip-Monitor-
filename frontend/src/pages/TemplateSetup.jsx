import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  Upload,
  ScanLine,
  ArrowLeft,
  Loader2,
  FileText,
  Trash2,
  Check,
  CircleDot,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { BrandLockupCompact } from "../components/app/BrandLogo";
import TemplateMappingWizard from "../components/app/TemplateMappingWizard";
import { normalizeCapture, runOcr, formatBytes } from "../lib/scan-pipeline";
import {
  saveTemplate,
  listTemplates,
  deleteTemplate,
  totalStorageBytes,
  setActiveTemplateId,
  getActiveTemplateId,
  ensureDefaultTemplate,
  DEFAULT_TEMPLATE_ID,
} from "../lib/template-store";
import { emptyTemplate, PRESET_FIELDS } from "../lib/template-types";

const STEPS = ["Pick", "Capture", "Map"];

/**
 * User-facing Template Setup — surfaces the scan + OCR pipeline built in
 * Batch 1 and the tap-to-assign mapping wizard from Batch 2.
 *
 * Flow:
 *   1. Pick : "Use TripMonitor default" OR "Scan my company sheet"
 *   2. Capture : camera / photo-upload → normalize to <=1600px JPEG
 *   3. Map : tap-to-assign all 13 preset fields (skippable)
 *
 * Also lists already-stored templates with switch / delete actions.
 */
export default function TemplateSetup() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [step, setStep] = useState("Pick");
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrWords, setOcrWords] = useState([]);
  const [draftTemplate, setDraftTemplate] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [bytes, setBytes] = useState(0);

  const refresh = async () => {
    await ensureDefaultTemplate();
    const all = await listTemplates();
    setTemplates(all);
    setActiveId(await getActiveTemplateId());
    setBytes(await totalStorageBytes());
  };

  useEffect(() => { refresh(); }, []);

  const handlePickDefault = async () => {
    await ensureDefaultTemplate();
    await setActiveTemplateId(DEFAULT_TEMPLATE_ID);
    toast.success("Using TripMonitor default sheet");
    refresh();
    navigate("/dashboard");
  };

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const normalized = await normalizeCapture(file);
      setScan(normalized);
      toast.success(`Scan normalized to ${normalized.width}×${normalized.height}`);
    } catch (e) {
      toast.error(`Capture failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRunOcr = async () => {
    if (!scan) return;
    setBusy(true);
    setOcrWords([]);
    setOcrProgress(0);
    setOcrStatus("loading");
    try {
      const words = await runOcr(scan, {
        onProgress: (p, status) => {
          setOcrProgress(Math.round(p * 100));
          setOcrStatus(status || "");
        },
      });
      setOcrWords(words);
      toast.success(`OCR found ${words.length} words`);
    } catch (e) {
      toast.error(`OCR failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
      setOcrStatus("");
    }
  };

  const handleContinueToMap = async () => {
    if (!scan) { toast.error("Capture a scan first"); return; }
    if (templates.filter((t) => t.source === "scanned").length >= 1) {
      const ok = window.confirm(
        "Adding another trip-sheet template increases device storage usage. Continue?"
      );
      if (!ok) return;
    }
    const tpl = emptyTemplate({ source: "scanned", name: `Scan ${templates.length + 1}` });
    tpl.scan = scan;
    tpl.ocr_words = ocrWords;
    await saveTemplate(tpl);
    setDraftTemplate(tpl);
    setStep("Map");
  };

  const handleMapDone = async () => {
    await refresh();
    setScan(null);
    setOcrWords([]);
    setDraftTemplate(null);
    toast.success("Template activated");
    navigate("/dashboard");
  };

  const handleActivate = async (id) => {
    await setActiveTemplateId(id);
    await refresh();
    toast.success("Template switched");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    await deleteTemplate(id);
    await refresh();
    toast.success("Deleted");
  };

  return (
    <div className="min-h-screen bg-white text-[var(--tm-navy)]" data-testid="template-setup-page">
      <header className="border-b border-[var(--tm-border)] px-4 py-3 flex items-center gap-3 sticky top-0 bg-white z-10">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold"
          data-testid="template-setup-back"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </button>
        <div className="flex-1">
          <BrandLockupCompact />
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold">
          {formatBytes(bytes)}
        </span>
      </header>

      <div className="px-4 pt-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] font-bold">
          {STEPS.map((s) => {
            const active = s === step;
            return (
              <span
                key={s}
                className={`px-2 py-1 rounded-full ${
                  active
                    ? "bg-[var(--tm-orange)] text-white"
                    : "bg-[var(--tm-surface-2)] text-[var(--tm-text-muted)]"
                }`}
              >
                {s}
              </span>
            );
          })}
        </div>
      </div>

      <main className="max-w-2xl mx-auto p-4 space-y-5">
        {step === "Pick" && (
          <section data-testid="template-setup-pick" className="space-y-3">
            <div className="space-y-1">
              <h1 className="text-3xl font-black tracking-tight">Pick your trip sheet</h1>
              <p className="text-sm text-[var(--tm-text-soft)]">
                Scan once, reuse forever. You can always re-scan or switch templates later.
              </p>
            </div>

            <button
              type="button"
              data-testid="pick-default"
              onClick={handlePickDefault}
              className="w-full text-left bg-white border-2 border-[var(--tm-border)] hover:border-[var(--tm-blue)] rounded-md p-4 flex items-center gap-3 transition-colors shadow-sm"
            >
              <div className="h-12 w-12 rounded-md bg-[var(--tm-navy)] text-white flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold">Recommended</div>
                <div className="text-base font-bold">Use the TripMonitor default</div>
                <div className="text-xs text-[var(--tm-text-soft)]">
                  The built-in sheet shipped with the app. Works out of the box.
                </div>
              </div>
            </button>

            <button
              type="button"
              data-testid="pick-scan"
              onClick={() => setStep("Capture")}
              className="w-full text-left bg-white border-2 border-[var(--tm-border)] hover:border-[var(--tm-orange)] rounded-md p-4 flex items-center gap-3 transition-colors shadow-sm"
            >
              <div className="h-12 w-12 rounded-md bg-[var(--tm-orange)] text-white flex items-center justify-center shrink-0">
                <ScanLine className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-blue)] font-bold">Custom</div>
                <div className="text-base font-bold">Scan my company trip sheet</div>
                <div className="text-xs text-[var(--tm-text-soft)]">
                  Capture once, map the fields, reuse forever.
                </div>
              </div>
            </button>

            <StoredTemplates
              templates={templates}
              activeId={activeId}
              onActivate={handleActivate}
              onDelete={handleDelete}
            />
          </section>
        )}

        {step === "Capture" && (
          <section data-testid="template-setup-capture" className="space-y-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("Pick")}
                className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            </div>
            <h1 className="text-2xl font-black tracking-tight">Scan your sheet</h1>
            <p className="text-xs text-[var(--tm-text-soft)]">
              Flat surface, good lighting, full sheet visible. The scan is stored on this device only — nothing is uploaded.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              data-testid="template-setup-file-input"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                data-testid="template-setup-camera"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
              >
                <Camera className="h-4 w-4 mr-1" /> Camera / Photo
              </Button>
              <Button
                data-testid="template-setup-upload"
                disabled={busy}
                variant="outline"
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.removeAttribute("capture");
                    fileRef.current.click();
                    setTimeout(() => fileRef.current?.setAttribute("capture", "environment"), 0);
                  }
                }}
                className="h-12 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
              >
                <Upload className="h-4 w-4 mr-1" /> Upload file
              </Button>
            </div>

            {scan && (
              <div className="space-y-3">
                <div className="relative border border-[var(--tm-border)] rounded-md overflow-hidden">
                  <img
                    src={scan.data_url}
                    alt="Scan preview"
                    className="block w-full h-auto"
                    data-testid="template-setup-preview"
                  />
                  {ocrWords.length > 0 && (
                    <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                      {ocrWords.map((w, i) => (
                        <rect key={i} x={w.x} y={w.y} width={w.w} height={w.h} fill="none" stroke="rgba(255,95,21,0.55)" strokeWidth="0.0015" />
                      ))}
                    </svg>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    data-testid="template-setup-run-ocr"
                    disabled={busy}
                    onClick={handleRunOcr}
                    className="h-11 flex-1 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
                  >
                    {busy && ocrStatus ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {ocrProgress}% — {ocrStatus}
                      </span>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-1" /> Detect text (optional)
                      </>
                    )}
                  </Button>
                  <Button
                    data-testid="template-setup-continue-map"
                    disabled={busy}
                    onClick={handleContinueToMap}
                    className="h-11 flex-1 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
                  >
                    Continue to map <Check className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                {ocrWords.length > 0 && (
                  <div className="text-[11px] uppercase tracking-wider text-[var(--tm-text-soft)] font-bold flex items-center gap-1">
                    <CircleDot className="h-3 w-3 text-[var(--tm-blue)]" />
                    {ocrWords.length} words detected · {Math.round(ocrWords.reduce((a, w) => a + w.confidence, 0) / ocrWords.length)}% avg confidence
                  </div>
                )}
              </div>
            )}

            <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-[var(--tm-orange)]" />
              OCR is a helper only — mapping is still human-driven.
            </div>
          </section>
        )}

        {step === "Map" && draftTemplate && (
          <TemplateMappingWizard
            template={draftTemplate}
            onDone={handleMapDone}
            onCancel={() => setStep("Capture")}
          />
        )}
      </main>
    </div>
  );
}

function StoredTemplates({ templates, activeId, onActivate, onDelete }) {
  if (!templates.length) return null;
  return (
    <section className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-3 mt-4" data-testid="stored-templates">
      <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold mb-2">
        Your templates ({templates.length})
      </div>
      <ul className="space-y-2">
        {templates.map((t) => {
          const isActive = t.id === activeId;
          const mapped = Object.keys(t.fields || {}).length;
          return (
            <li
              key={t.id}
              data-testid={`stored-template-${t.id}`}
              className={`flex items-center gap-3 border rounded-md p-2 bg-white ${
                isActive ? "border-[var(--tm-orange)]" : "border-[var(--tm-border)]"
              }`}
            >
              {t.scan?.data_url ? (
                <img src={t.scan.data_url} alt={t.name} className="h-12 w-12 rounded-md object-cover border border-[var(--tm-border)]" />
              ) : (
                <div className="h-12 w-12 rounded-md bg-[var(--tm-navy)] text-white flex items-center justify-center">
                  <FileText className="h-4 w-4" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">{t.name}</div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold">
                  {t.source} · {mapped}/{PRESET_FIELDS.length} fields
                </div>
              </div>
              {isActive ? (
                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-[var(--tm-orange)] text-white">
                  Active
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onActivate(t.id)}
                  data-testid={`activate-${t.id}`}
                  className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full bg-[var(--tm-blue)] text-white hover:bg-[var(--tm-blue-deep)]"
                >
                  Activate
                </button>
              )}
              {t.id !== DEFAULT_TEMPLATE_ID && (
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  aria-label={`Delete ${t.name}`}
                  className="text-[var(--tm-text-soft)] hover:text-[#FF3B30] shrink-0 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
