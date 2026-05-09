import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera, Upload, ScanLine, ArrowLeft, Loader2, FileText, Sparkles,
  Lock, Crown, RotateCcw, Check, X, RefreshCw, Grid3x3,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import AppShell from "../components/app/AppShell";
import TemplateMappingWizard from "../components/app/TemplateMappingWizard";
import ProMappingStudio from "../components/app/ProMappingStudio";
import TripSheetPreview from "../components/app/TripSheetPreview";
import { normalizeCapture, runOcr, formatBytes } from "../lib/scan-pipeline";
import {
  setActiveTemplateId, ensureDefaultTemplate, DEFAULT_TEMPLATE_ID,
  totalStorageBytes, saveDraft, getDraft, clearDraft,
} from "../lib/template-store";
import { emptyTemplate } from "../lib/template-types";
import {
  DEFAULT_BOUNDARIES, analyzeFontDefaults, analyzeGridDefaults, FONT_PRESETS_BY_ID,
} from "../lib/pro-mapping-v2";
import { hasFeatureTier, getFeatureTier, TIER_LABEL } from "../lib/local-auth";

/**
 * Trip Sheet Template setup — overhauled per spec iter 19g.
 * - Pick screen: 2 cards only (Default / Scan).
 * - Upload screen merges scan + boundary; 3 small evenly spaced
 *   buttons (Reset · Text Analyzer · Set).
 * - Quick Map / Pro Studio cards act as their own continue.
 * - Pro Studio tap shows a final boundary-lock confirm modal.
 * - Resume popup if a previous draft mapping session exists.
 * - No top step bubbles (they were inert decoration).
 * - Feature gating: FREE → Default only; QCK → +Quick Map; STU → +Studio.
 */
export default function TemplateSetup() {
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [view, setView] = useState("pick");          // pick | upload | map
  const [busy, setBusy] = useState(false);
  const [bytes, setBytes] = useState(0);

  const [scan, setScan] = useState(null);
  const [boundaries, setBoundaries] = useState({ ...DEFAULT_BOUNDARIES });
  const [boundaryDrag, setBoundaryDrag] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [gridAnalysis, setGridAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(null); // null | "text" | "grid"
  const [analyzeProgress, setAnalyzeProgress] = useState(0);

  const [draftTemplate, setDraftTemplate] = useState(null);
  const [mapMode, setMapMode] = useState("quick");

  const [resumeDraft, setResumeDraft] = useState(null);
  const [showStudioConfirm, setShowStudioConfirm] = useState(false);
  const [showDefaultPreview, setShowDefaultPreview] = useState(false);
  const [upgradePrompt, setUpgradePrompt] = useState(null);

  const [tier, setTier] = useState("FREE");

  useEffect(() => {
    (async () => {
      await ensureDefaultTemplate();
      setBytes(await totalStorageBytes());
      setTier(await getFeatureTier());
      const d = await getDraft();
      if (d?.template) setResumeDraft(d);
    })();
  }, []);

  // Default-sheet pick: open a preview modal first so the driver can see
  // what they're agreeing to before committing. Actual selection +
  // navigation only happens after they confirm.
  const handlePickDefault = () => setShowDefaultPreview(true);
  const handleConfirmDefault = async () => {
    await setActiveTemplateId(DEFAULT_TEMPLATE_ID);
    setShowDefaultPreview(false);
    toast.success("Using Trip Monitor default sheet");
    navigate("/dashboard");
  };
  const handlePickScan = async () => {
    if (!(await hasFeatureTier("QCK"))) { setUpgradePrompt({ required: "QCK" }); return; }
    setView("upload");
  };

  const handleFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const normalized = await normalizeCapture(file);
      setScan(normalized);
      setBoundaries({ ...DEFAULT_BOUNDARIES });
      setAnalysis(null);
      setGridAnalysis(null);
      toast.success(`Scan ready · ${normalized.width}×${normalized.height}`);
    } catch (e) {
      toast.error(`Capture failed: ${e?.message || e}`);
    } finally { setBusy(false); }
  };

  const onResetBoundary = () => {
    setBoundaries({ ...DEFAULT_BOUNDARIES });
    setAnalysis(null);
    setGridAnalysis(null);
    toast.success("Boundary reset to 1″ margin");
  };
  const onAnalyze = async (kind = "text") => {
    if (!scan) return;
    setAnalyzing(kind);
    setAnalyzeProgress(0);
    try {
      const words = await runOcr(scan, { onProgress: (p) => setAnalyzeProgress(Math.round(p * 100)) });
      if (kind === "text") {
        const a = analyzeFontDefaults(words, scan.width, scan.height);
        setAnalysis(a);
        toast.success(`Text · ${FONT_PRESETS_BY_ID[a.fontFamily]?.label || "font"} · ${a.fontSizePt}pt · ${a.weight}`);
      } else {
        const g = analyzeGridDefaults(words, scan.width, scan.height);
        setGridAnalysis(g);
        if (g.cols > 0 && g.rows > 0) {
          // Build a richer success toast — the user wants to see what the
          // analyzer actually found, not just dimensions.
          const filledHeaders = (g.headers || [])
            .map((h) => (h || "").trim()).filter(Boolean).slice(0, 4);
          const headerStr = filledHeaders.length
            ? ` · headers: ${filledHeaders.join(" | ")}`
            : "";
          toast.success(
            `Grid · ${g.cols}×${g.rows} · ${g.filled} filled / ${g.blank} blank${headerStr}`
          );
        } else {
          toast.info("No grid pattern detected");
        }
      }
    } catch (e) {
      toast.error(`Analyze failed: ${e?.message || e}`);
    } finally { setAnalyzing(null); }
  };
  const onAnalyzeGrid = () => onAnalyze("grid");

  const buildDraftWithBoundary = () => {
    const tpl = emptyTemplate({ source: "scanned", name: "New scan" });
    tpl.scan = scan;
    tpl.schema = {
      version: 2, boundaries, elements: [],
      assets: { logo: null, qr: null },
      fonts: { default: analysis?.fontFamily || "arial" },
      locked: false, boundaryLocked: true,
    };
    return tpl;
  };

  const onEnterQuickMap = async () => {
    if (!scan) { toast.error("Add a scan first"); return; }
    if (!(await hasFeatureTier("QCK"))) { setUpgradePrompt({ required: "QCK" }); return; }
    setDraftTemplate(buildDraftWithBoundary());
    setMapMode("quick");
    setView("map");
  };
  const onEnterProStudio = async () => {
    if (!scan) { toast.error("Add a scan first"); return; }
    if (!(await hasFeatureTier("STU"))) { setUpgradePrompt({ required: "STU" }); return; }
    setShowStudioConfirm(true);
  };
  const onStudioConfirmed = () => {
    setDraftTemplate(buildDraftWithBoundary());
    setMapMode("pro");
    setShowStudioConfirm(false);
    setView("map");
  };

  const handleMapDone = async () => {
    setScan(null);
    setDraftTemplate(null);
    setAnalysis(null);
    await clearDraft();
    setBytes(await totalStorageBytes());
    toast.success("Template activated");
    navigate("/dashboard");
  };
  const handleMapCancel = async () => {
    if (draftTemplate) {
      await saveDraft({ template: draftTemplate, mapMode, analysis, savedAt: new Date().toISOString() });
      toast.info("Saved as draft — resume from /templates");
    }
    setView("pick");
    setDraftTemplate(null);
  };

  const onResumeContinue = () => {
    setDraftTemplate(resumeDraft.template);
    setMapMode(resumeDraft.mapMode || "pro");
    setAnalysis(resumeDraft.analysis || null);
    setResumeDraft(null);
    setView("map");
  };
  const onResumeNew = async () => { await clearDraft(); setResumeDraft(null); };

  // The Pro Mapping Studio editing canvas is the single permitted
  // exception to the "AppShell on every screen" rule — it needs the
  // full viewport for fine-grained mapping work. All other Studio
  // entry/upload/guided-map views render INSIDE AppShell so the
  // global top header + bottom toolbar stay visible.
  const isProEditingCanvas = view === "map" && mapMode === "pro" && !!draftTemplate;

  if (isProEditingCanvas) {
    return (
      <div className="min-h-screen bg-white text-[var(--tm-navy)]" data-testid="template-setup-page">
        <header className="border-b border-[var(--tm-border)] px-4 py-3 flex items-center gap-3 sticky top-0 bg-white z-10">
          <button
            type="button"
            onClick={handleMapCancel}
            className="text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold"
            data-testid="template-setup-back"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Exit Studio
          </button>
          <div className="flex-1 text-center">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold">
              Pro Mapping Studio
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold">
            {formatBytes(bytes)}
          </span>
        </header>
        <main className="mx-auto p-4 space-y-5 max-w-[1600px]">
          <ProMappingStudio template={draftTemplate} analysis={analysis}
            onDone={handleMapDone} onCancel={handleMapCancel} />
        </main>
        {resumeDraft && <ResumeDialog draft={resumeDraft} onContinue={onResumeContinue} onNew={onResumeNew} />}
      </div>
    );
  }

  return (
    <AppShell active="studio" overline="Studio" pageTitle="Trip Sheet Templates">
      <div data-testid="template-setup-page" className="flex flex-col gap-4">
        {view !== "pick" && (
          <button
            type="button"
            onClick={() => setView("pick")}
            data-testid="template-setup-back"
            className="self-start inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--tm-blue)] hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-text-muted)] font-bold">
            Trip Sheet Templates
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold">
            {formatBytes(bytes)}
          </span>
        </div>

        {view === "pick" && (
          <PickView tier={tier} onDefault={handlePickDefault} onScan={handlePickScan} />
        )}
        {view === "upload" && (
          <UploadView
            scan={scan} busy={busy} fileRef={fileRef} onFile={handleFile}
            boundaries={boundaries} setBoundaries={setBoundaries}
            boundaryDrag={boundaryDrag} setBoundaryDrag={setBoundaryDrag}
            analysis={analysis} gridAnalysis={gridAnalysis}
            analyzing={analyzing} analyzeProgress={analyzeProgress}
            onReset={onResetBoundary}
            onAnalyze={() => onAnalyze("text")}
            onAnalyzeGrid={onAnalyzeGrid}
            tier={tier} onQuick={onEnterQuickMap} onPro={onEnterProStudio}
          />
        )}
        {view === "map" && draftTemplate && mapMode === "guided" && (
          <TemplateMappingWizard template={draftTemplate}
            onDone={handleMapDone} onCancel={handleMapCancel} />
        )}
      </div>

      {resumeDraft && <ResumeDialog draft={resumeDraft} onContinue={onResumeContinue} onNew={onResumeNew} />}
      {showStudioConfirm && (
        <StudioLockDialog
          onCancel={() => setShowStudioConfirm(false)}
          onReset={() => { setShowStudioConfirm(false); onResetBoundary(); }}
          onConfirm={onStudioConfirmed}
        />
      )}
      {upgradePrompt && (
        <UpgradePrompt required={upgradePrompt.required} onClose={() => setUpgradePrompt(null)} />
      )}
      {showDefaultPreview && (
        <DefaultPreviewDialog
          onCancel={() => setShowDefaultPreview(false)}
          onConfirm={handleConfirmDefault}
        />
      )}
    </AppShell>
  );
}

/**
 * Confirmation modal shown when the driver picks "Use TripMonitor
 * Default". Renders a static preview of the sheet so they can see
 * what they're agreeing to *before* it becomes active.
 */
function DefaultPreviewDialog({ onCancel, onConfirm }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="default-preview-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border-2 border-[var(--tm-orange)] rounded-md shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-[var(--tm-border)] sticky top-0 bg-white">
          <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--tm-orange)] mb-0.5 inline-flex items-center gap-1">
            <FileText className="h-3 w-3" /> Preview · Trip Monitor Default
          </div>
          <div className="text-base font-black text-[var(--tm-navy)]">
            Confirm you want to use this sheet
          </div>
          <p className="text-[11px] text-[var(--tm-text-soft)] mt-0.5">
            This is the built-in trip sheet shipped with the app. It can't be edited.
          </p>
        </div>
        <div className="p-4">
          <TripSheetPreview />
        </div>
        <div className="px-5 py-3 border-t border-[var(--tm-border)] sticky bottom-0 bg-white flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            data-testid="default-preview-cancel"
            className="h-8 px-3 text-xs"
          >
            <X className="h-3 w-3 mr-1" /> Not now
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            data-testid="default-preview-confirm"
            className="h-8 px-3 text-xs bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold"
          >
            <Check className="h-3 w-3 mr-1" /> Yes, use this sheet
          </Button>
        </div>
      </div>
    </div>
  );
}

function PickView({ tier, onDefault, onScan }) {
  const scanLocked = tier === "FREE";
  return (
    <section data-testid="template-setup-pick" className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight">Pick your trip sheet</h1>
        <p className="text-sm text-[var(--tm-text-soft)]">
          Two ways in. Stick with the built-in sheet, or scan your company's.
        </p>
      </div>

      <button
        type="button" data-testid="pick-default" onClick={onDefault}
        className="w-full text-left bg-white border-2 border-[var(--tm-border)] hover:border-[var(--tm-blue)] rounded-md p-4 flex items-center gap-3 transition-colors shadow-sm"
      >
        <div className="h-12 w-12 rounded-md bg-[var(--tm-navy)] text-white flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold">Recommended</div>
          <div className="text-base font-bold">Use the Trip Monitor Default</div>
          <div className="text-xs text-[var(--tm-text-soft)]">
            The built-in legacy sheet shipped with the app. Works out of the box.
          </div>
        </div>
      </button>

      <button
        type="button" data-testid="pick-scan" onClick={onScan}
        className="relative w-full text-left bg-white border-2 border-[var(--tm-border)] hover:border-[var(--tm-orange)] rounded-md p-4 flex items-center gap-3 transition-colors shadow-sm"
      >
        <div className="h-12 w-12 rounded-md bg-[var(--tm-orange)] text-white flex items-center justify-center shrink-0">
          <ScanLine className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-blue)] font-bold flex items-center gap-1.5">
            Custom
            {scanLocked && (
              <span data-testid="scan-locked-chip" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--tm-orange)] text-white text-[9px]">
                <Lock className="h-2.5 w-2.5" /> Quick or Studio
              </span>
            )}
          </div>
          <div className="text-base font-bold">Scan My Company Trip Sheet</div>
          <div className="text-xs text-[var(--tm-text-soft)]">
            Capture once, map the fields, reuse forever.
          </div>
        </div>
      </button>
    </section>
  );
}

function UploadView({
  scan, busy, fileRef, onFile,
  boundaries, setBoundaries, boundaryDrag, setBoundaryDrag,
  analysis, gridAnalysis, analyzing, analyzeProgress, onReset, onAnalyze, onAnalyzeGrid,
  tier, onQuick, onPro,
}) {
  const proLocked = tier !== "STU";
  const ptFromEvent = (e) => {
    const r = e.currentTarget?.getBoundingClientRect();
    if (!r) return null;
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  const onPointerDown = (e) => {
    const pt = ptFromEvent(e); if (!pt) return;
    const k = hitHandle(pt, boundaries, 0.022);
    if (!k) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setBoundaryDrag({ handle: k, original: { ...boundaries } });
  };
  const onPointerMove = (e) => {
    if (!boundaryDrag) return;
    const pt = ptFromEvent(e); if (!pt) return;
    setBoundaries(applyHandle(boundaryDrag.original, boundaryDrag.handle, pt));
  };
  const onPointerUp = () => setBoundaryDrag(null);

  return (
    <section data-testid="template-setup-upload" className="space-y-4">
      <h1 className="text-2xl font-black tracking-tight">Upload your sheet</h1>
      <p className="text-xs text-[var(--tm-text-soft)]">
        Flat surface, full sheet visible. Adjust the dotted boundary to match the printable area, then enter Quick Map or Studio. Stays on this device — nothing is uploaded.
      </p>

      <input
        ref={fileRef} type="file" accept="image/*" capture="environment"
        className="hidden" data-testid="template-setup-file-input"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {!scan && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            data-testid="template-setup-camera" disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="h-12 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
          >
            <Camera className="h-4 w-4 mr-1" /> Camera / Photo
          </Button>
          <Button
            data-testid="template-setup-upload-btn" disabled={busy} variant="outline"
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
      )}

      {scan && (
        <>
          <div
            data-testid="upload-canvas"
            className="relative select-none border-2 border-[var(--tm-blue)] rounded-md overflow-hidden bg-white shadow-md mx-auto touch-none"
            style={{ width: "100%", maxWidth: 540, aspectRatio: "8.5 / 11", cursor: boundaryDrag ? "grabbing" : "crosshair" }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          >
            <img src={scan.data_url} alt="Scan" draggable={false}
              style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }} />
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
              <BoundaryPolygon b={boundaries} />
              <BoundaryHandlesSvg b={boundaries} />
            </svg>
          </div>

          {/* Uniform 4-button toolbar — Reset · Grid Analyzer · Text Analyzer · Set.
              All buttons share equal width (flex-1) and consistent spacing. */}
          <div className="flex items-stretch gap-2 w-full" data-testid="upload-controls">
            <Button
              variant="outline" data-testid="upload-reset" onClick={onReset}
              className="flex-1 min-w-0 h-9 px-2 text-xs bg-white border-[var(--tm-border)] text-[var(--tm-navy)]"
            >
              <RotateCcw className="h-3 w-3 mr-1 shrink-0" />
              <span className="truncate">Reset</span>
            </Button>
            <Button
              variant="outline" data-testid="upload-analyze-grid"
              onClick={onAnalyzeGrid} disabled={!!analyzing}
              className="flex-1 min-w-0 h-9 px-2 text-xs bg-white border-[var(--tm-blue)] text-[var(--tm-navy)] disabled:opacity-60"
              title="Analyze the trip-sheet grid (rows, columns, headers, filled vs blank cells). Result is preset into the Studio."
            >
              {analyzing === "grid" ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  <span className="truncate">{analyzeProgress}%</span>
                </span>
              ) : (
                <>
                  <Grid3x3 className="h-3 w-3 mr-1 shrink-0" />
                  <span className="truncate">{gridAnalysis?.cols ? "Re-analyze Grid" : "Grid Analyzer"}</span>
                </>
              )}
            </Button>
            <Button
              variant="outline" data-testid="upload-analyze"
              onClick={onAnalyze} disabled={!!analyzing}
              className="flex-1 min-w-0 h-9 px-2 text-xs bg-white border-[var(--tm-blue)] text-[var(--tm-navy)] disabled:opacity-60"
              title="Run OCR to detect font size, weight and line spacing"
            >
              {analyzing === "text" ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  <span className="truncate">{analyzeProgress}%</span>
                </span>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-1 shrink-0" />
                  <span className="truncate">{analysis ? "Re-analyze Text" : "Text Analyzer"}</span>
                </>
              )}
            </Button>
            <Button
              data-testid="upload-set"
              onClick={() => toast.success("Boundary saved — pick a mapping mode below to lock & continue")}
              className="flex-1 min-w-0 h-9 px-2 text-xs bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold"
            >
              <Check className="h-3 w-3 mr-1 shrink-0" />
              <span className="truncate">Set</span>
            </Button>
          </div>

          {/* Single condensed chip strip for ALL analysis stats (text + grid).
              Replaces the old <dl>-based card. */}
          {(analysis || (gridAnalysis && (gridAnalysis.cols > 0 || gridAnalysis.rows > 0))) && (
            <div data-testid="upload-analysis-card"
              className="flex items-center gap-1.5 flex-wrap text-[10px] bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md px-2 py-1.5">
              {analysis && (
                <>
                  <Chip testid="analysis-font"    k="Font" v={FONT_PRESETS_BY_ID[analysis.fontFamily]?.label || analysis.fontFamily} />
                  <Chip testid="analysis-size"    k="Size" v={`${analysis.fontSizePt}pt`} />
                  <Chip testid="analysis-weight"  k="Wt"   v={analysis.weight} />
                  <Chip testid="analysis-spacing" k="LH"   v={`${(analysis.lineSpacingNorm * 100).toFixed(1)}%`} />
                  <Chip testid="analysis-count"   k="N"    v={analysis.wordsAnalyzed} />
                </>
              )}
              {gridAnalysis && gridAnalysis.cols > 0 && (
                <>
                  <Chip testid="grid-cols" k="Cols" v={gridAnalysis.cols} accent />
                  <Chip testid="grid-rows" k="Rows" v={gridAnalysis.rows} accent />
                  <Chip testid="grid-filled" k="Filled" v={gridAnalysis.filled} accent />
                  <Chip testid="grid-blank"  k="Blank"  v={gridAnalysis.blank}  accent />
                  <Chip testid="grid-cell" k="Cell"
                    v={`${(gridAnalysis.avgCellW * 100).toFixed(1)}×${(gridAnalysis.avgCellH * 100).toFixed(1)}%`}
                    accent />
                </>
              )}
            </div>
          )}

          {/* Mapping mode buttons — streamlined to just label + colour.
              Quick Map = blue, Pro Studio = orange. No description copy,
              no chips, no border-only "card" look — just two buttons. */}
          <div className="grid grid-cols-2 gap-2 pt-2" data-testid="map-mode-cards">
            <Button
              data-testid="enter-quick-map" onClick={onQuick}
              className="h-10 bg-[var(--tm-blue)] hover:bg-[var(--tm-blue-deep)] text-white font-black text-sm rounded-md"
            >
              Quick Map
            </Button>
            <Button
              data-testid="enter-pro-studio" onClick={onPro}
              className="relative h-10 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-black text-sm rounded-md"
            >
              Pro Studio
              {proLocked && (
                <span data-testid="pro-locked-chip"
                  className="absolute -top-1.5 -right-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--tm-navy)] text-white text-[8px] font-bold">
                  <Lock className="h-2 w-2" />
                </span>
              )}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function Chip({ k, v, testid, accent }) {
  // Compact key·value pill used in the analysis report strip.
  // `accent` colours grid stats blue so text vs grid info is glanceable.
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border font-bold ${
        accent
          ? "bg-[var(--tm-blue)]/8 border-[var(--tm-blue)]/30 text-[var(--tm-blue)]"
          : "bg-white border-[var(--tm-border)] text-[var(--tm-navy)]"
      }`}
    >
      <span className="text-[8px] uppercase tracking-wider opacity-70">{k}</span>
      {v}
    </span>
  );
}

function ResumeDialog({ draft, onContinue, onNew }) {
  return (
    <div data-testid="resume-dialog" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white border-2 border-[var(--tm-blue)] rounded-md shadow-2xl max-w-sm w-full p-5">
        <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--tm-blue)] mb-1">Mapping draft found</div>
        <div className="text-lg font-black text-[var(--tm-navy)] mb-2">Previous mapping session found.</div>
        <p className="text-xs text-[var(--tm-text-soft)] mb-4">
          Saved {draft.savedAt ? new Date(draft.savedAt).toLocaleString() : "earlier"}. Pick up where you left off, or start fresh.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onNew} data-testid="resume-new"
            className="flex-1 h-10 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] font-bold text-sm">
            New
          </button>
          <button type="button" onClick={onContinue} data-testid="resume-continue"
            className="flex-1 h-10 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function StudioLockDialog({ onCancel, onReset, onConfirm }) {
  return (
    <div data-testid="studio-lock-dialog" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onCancel}>
      <div className="bg-white border-2 border-[var(--tm-orange)] rounded-md shadow-2xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--tm-orange)] mb-1 inline-flex items-center gap-1">
          <Lock className="h-3 w-3" /> Final boundary check
        </div>
        <div className="text-lg font-black text-[var(--tm-navy)] mb-2">
          Once you enter Studio, the boundary will be locked.
        </div>
        <p className="text-xs text-[var(--tm-text-soft)] mb-4">
          Confirm that the dotted rectangle frames the printable area exactly. You can't change it from inside the Studio.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onReset} data-testid="studio-confirm-reset"
            className="flex-1 h-10 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] font-bold text-sm inline-flex items-center justify-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Reset boundary
          </button>
          <button type="button" onClick={onConfirm} data-testid="studio-confirm-enter"
            className="flex-1 h-10 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm inline-flex items-center justify-center gap-1">
            <Check className="h-3.5 w-3.5" /> Confirm &amp; enter Studio
          </button>
        </div>
      </div>
    </div>
  );
}

function UpgradePrompt({ required, onClose }) {
  return (
    <div data-testid="upgrade-prompt" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="bg-white rounded-md shadow-2xl max-w-sm w-full p-5 border border-[var(--tm-border)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--tm-orange)] inline-flex items-center gap-1">
            <Crown className="h-3 w-3" /> Premium
          </div>
          <button onClick={onClose} className="p-1 text-[var(--tm-text-soft)]"><X className="h-4 w-4" /></button>
        </div>
        <div className="text-lg font-black text-[var(--tm-navy)] mb-2">
          {TIER_LABEL[required]} unlocks this feature
        </div>
        <p className="text-xs text-[var(--tm-text-soft)] mb-4">
          {required === "STU"
            ? "Pro Mapping Studio is a Studio-tier feature. Buy it on the Trip Monitor website using your Website License ID, then redeem the unlock code in the app."
            : "Quick Mapping is a Quick-tier feature. Buy it on the Trip Monitor website using your Website License ID, then redeem the unlock code in the app."}
        </p>
        <button type="button" onClick={onClose} data-testid="upgrade-close"
          className="w-full h-10 rounded-md bg-[var(--tm-navy)] hover:bg-[var(--tm-navy-deep)] text-white font-bold text-sm">
          Got it
        </button>
      </div>
    </div>
  );
}

// ---------- Boundary helpers ----------

function BoundaryPolygon({ b }) {
  return (
    <polygon
      data-testid="boundary-rect"
      points={`${b.tl.x},${b.tl.y} ${b.tr.x},${b.tr.y} ${b.br.x},${b.br.y} ${b.bl.x},${b.bl.y}`}
      fill="rgba(12,74,183,0.05)" stroke="rgba(12,74,183,0.85)"
      strokeWidth="0.0035" strokeDasharray="0.01 0.006"
    />
  );
}
function BoundaryHandlesSvg({ b }) {
  const corners = [["tl", b.tl], ["tr", b.tr], ["br", b.br], ["bl", b.bl]];
  const edges = [
    ["top", { x: (b.tl.x + b.tr.x) / 2, y: (b.tl.y + b.tr.y) / 2 }],
    ["right", { x: (b.tr.x + b.br.x) / 2, y: (b.tr.y + b.br.y) / 2 }],
    ["bot", { x: (b.bl.x + b.br.x) / 2, y: (b.bl.y + b.br.y) / 2 }],
    ["left", { x: (b.tl.x + b.bl.x) / 2, y: (b.tl.y + b.bl.y) / 2 }],
  ];
  const r = 0.012;
  return (
    <>
      {corners.map(([k, p]) => (
        <rect key={k} data-testid={`boundary-handle-${k}`}
          x={p.x - r} y={p.y - r} width={r * 2} height={r * 2}
          fill="white" stroke="rgba(12,74,183,0.95)" strokeWidth="0.003" />
      ))}
      {edges.map(([k, p]) => (
        <circle key={k} data-testid={`boundary-edge-${k}`}
          cx={p.x} cy={p.y} r={r * 0.85}
          fill="white" stroke="rgba(12,74,183,0.95)" strokeWidth="0.003" />
      ))}
    </>
  );
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
function hitHandle(pt, b, threshold) {
  const corners = { tl: b.tl, tr: b.tr, br: b.br, bl: b.bl };
  for (const [k, p] of Object.entries(corners)) if (dist(pt, p) < threshold) return k;
  const edges = {
    top: { x: (b.tl.x + b.tr.x) / 2, y: (b.tl.y + b.tr.y) / 2 },
    right: { x: (b.tr.x + b.br.x) / 2, y: (b.tr.y + b.br.y) / 2 },
    bot: { x: (b.bl.x + b.br.x) / 2, y: (b.bl.y + b.br.y) / 2 },
    left: { x: (b.tl.x + b.bl.x) / 2, y: (b.tl.y + b.bl.y) / 2 },
  };
  for (const [k, p] of Object.entries(edges)) if (dist(pt, p) < threshold) return k;
  return null;
}
function applyHandle(orig, k, pt) {
  const next = { ...orig };
  if (["tl", "tr", "br", "bl"].includes(k)) {
    next[k] = { x: clamp01(pt.x), y: clamp01(pt.y) };
    return next;
  }
  if (k === "top") {
    const dy = pt.y - (orig.tl.y + orig.tr.y) / 2;
    next.tl = { ...orig.tl, y: clamp01(orig.tl.y + dy) };
    next.tr = { ...orig.tr, y: clamp01(orig.tr.y + dy) };
  } else if (k === "bot") {
    const dy = pt.y - (orig.bl.y + orig.br.y) / 2;
    next.bl = { ...orig.bl, y: clamp01(orig.bl.y + dy) };
    next.br = { ...orig.br, y: clamp01(orig.br.y + dy) };
  } else if (k === "left") {
    const dx = pt.x - (orig.tl.x + orig.bl.x) / 2;
    next.tl = { ...orig.tl, x: clamp01(orig.tl.x + dx) };
    next.bl = { ...orig.bl, x: clamp01(orig.bl.x + dx) };
  } else if (k === "right") {
    const dx = pt.x - (orig.tr.x + orig.br.x) / 2;
    next.tr = { ...orig.tr, x: clamp01(orig.tr.x + dx) };
    next.br = { ...orig.br, x: clamp01(orig.br.x + dx) };
  }
  return next;
}
