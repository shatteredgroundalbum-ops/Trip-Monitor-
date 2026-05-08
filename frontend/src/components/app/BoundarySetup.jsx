import React, { useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { ArrowLeft, Lock, Sparkles, Loader2, RotateCcw, Check, Grid3x3 } from "lucide-react";
import { DEFAULT_BOUNDARIES, analyzeFontDefaults, analyzeGridDefaults, FONT_PRESETS_BY_ID } from "../../lib/pro-mapping-v2";
import { runOcr } from "../../lib/scan-pipeline";

/**
 * Pre-Studio Boundary Setup.
 *
 * Phase between Capture and Map: lets the driver fit the printable
 * boundary to their physical sheet (8 handles — 4 corners + 4 edge
 * midpoints) and optionally run "Analyze Text" to pre-detect font
 * defaults. Once "Set Boundary" is pressed, the boundary becomes
 * permanently locked inside the Studio.
 */
export default function BoundarySetup({ scan, ocrWords, onBack, onConfirm }) {
  const canvasRef = useRef(null);
  const [boundaries, setBoundaries] = useState({ ...DEFAULT_BOUNDARIES });
  const [drag, setDrag] = useState(null);
  const [analysis, setAnalysis] = useState(() =>
    ocrWords?.length
      ? analyzeFontDefaults(ocrWords, scan?.width, scan?.height)
      : null
  );
  const [gridAnalysis, setGridAnalysis] = useState(() =>
    ocrWords?.length
      ? analyzeGridDefaults(ocrWords, scan?.width, scan?.height)
      : null
  );
  const [analyzing, setAnalyzing] = useState(null); // null | "text" | "grid"
  const [progress, setProgress] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleSize = 0.022; // normalized

  const ptFromEvent = (e) => {
    const r = (e.currentTarget || canvasRef.current)?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  };

  const onPointerDown = (e) => {
    const pt = ptFromEvent(e);
    if (!pt) return;
    const k = hitHandle(pt, boundaries, handleSize);
    if (!k) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ handle: k, original: { ...boundaries } });
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const pt = ptFromEvent(e);
    if (!pt) return;
    setBoundaries(applyHandle(drag.original, drag.handle, pt));
  };
  const onPointerUp = () => setDrag(null);

  const onReset = () => {
    setBoundaries({ ...DEFAULT_BOUNDARIES });
    toast.success("Boundary reset to 1-inch margin");
  };

  const onAnalyze = async (kind) => {
    if (!scan) return;
    setAnalyzing(kind);
    setProgress(0);
    try {
      const words = await runOcr(scan, {
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      if (kind === "text") {
        const a = analyzeFontDefaults(words, scan.width, scan.height);
        setAnalysis(a);
        toast.success(`Text · ${a.fontSizePt}pt · ${a.wordsAnalyzed} words`);
      } else {
        const g = analyzeGridDefaults(words, scan.width, scan.height);
        setGridAnalysis(g);
        toast.success(g.cols && g.rows
          ? `Grid · ${g.cols} cols × ${g.rows} rows`
          : `No grid pattern detected`);
      }
    } catch (e) {
      toast.error(`Analyze failed: ${e?.message || e}`);
    } finally {
      setAnalyzing(null);
    }
  };

  const onSet = () => setConfirmOpen(true);
  const onConfirmLock = () => {
    setConfirmOpen(false);
    onConfirm({ boundaries, analysis, gridAnalysis });
  };

  return (
    <section data-testid="boundary-setup" className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          data-testid="boundary-setup-back"
          className="text-xs uppercase tracking-wider font-bold text-[var(--tm-text-soft)] hover:text-[var(--tm-blue)] inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Back
        </button>
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight">Set the printable boundary</h1>
        <p className="text-xs text-[var(--tm-text-soft)]">
          Drag the 8 handles so the dotted rectangle frames just the printable area of your sheet. Once you continue, the boundary will lock and every element you draw inside the Studio is anchored to this area.
        </p>
      </div>

      <div
        ref={canvasRef}
        data-testid="boundary-canvas"
        className="relative select-none border-2 border-[var(--tm-blue)] rounded-md overflow-hidden bg-white shadow-md mx-auto touch-none"
        style={{ width: "100%", maxWidth: 540, aspectRatio: "8.5 / 11", cursor: drag ? "grabbing" : "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={scan.data_url}
          alt="Scan"
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
        />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <Rectangle b={boundaries} />
          <Handles b={boundaries} />
        </svg>
      </div>

      {/* Compact 3-button toolbar — Reset · Analyze Text · Analyze Grid */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          variant="outline" size="sm"
          data-testid="boundary-reset"
          onClick={onReset}
          className="h-8 px-2.5 text-xs bg-white border-[var(--tm-border)] text-[var(--tm-navy)]"
        >
          <RotateCcw className="h-3 w-3 mr-1" /> Reset 1″
        </Button>
        <Button
          variant="outline" size="sm"
          data-testid="boundary-analyze"
          onClick={() => onAnalyze("text")}
          disabled={!!analyzing}
          className="h-8 px-2.5 text-xs bg-white border-[var(--tm-blue)] text-[var(--tm-navy)] disabled:opacity-60"
          title="Run OCR to detect font size, weight and line spacing"
        >
          {analyzing === "text" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {progress}%
            </span>
          ) : (
            <><Sparkles className="h-3 w-3 mr-1" />{analysis ? "Re-text" : "Text"}</>
          )}
        </Button>
        <Button
          variant="outline" size="sm"
          data-testid="boundary-analyze-grid"
          onClick={() => onAnalyze("grid")}
          disabled={!!analyzing}
          className="h-8 px-2.5 text-xs bg-white border-[var(--tm-blue)] text-[var(--tm-navy)] disabled:opacity-60"
          title="Detect grid lines (rows × columns) on the scan"
        >
          {analyzing === "grid" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> {progress}%
            </span>
          ) : (
            <><Grid3x3 className="h-3 w-3 mr-1" />{gridAnalysis?.cols ? "Re-grid" : "Grid"}</>
          )}
        </Button>
        {/* Continue button is INLINE with the analyzers — does not get
            pushed down by the report below. */}
        <Button
          data-testid="boundary-set"
          size="sm"
          onClick={onSet}
          className="h-8 px-3 text-xs bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold ml-auto"
        >
          <Lock className="h-3 w-3 mr-1" /> Set &amp; continue
        </Button>
      </div>

      {/* Single condensed report strip — chips replace the old 5-row dl. */}
      {(analysis || gridAnalysis?.cols || gridAnalysis?.rows) && (
        <div data-testid="boundary-analysis-card"
          className="flex items-center gap-1.5 flex-wrap text-[10px] bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md px-2 py-1.5">
          {analysis && (
            <>
              <Chip testid="analysis-font" k="Font" v={FONT_PRESETS_BY_ID[analysis.fontFamily]?.label || analysis.fontFamily} />
              <Chip testid="analysis-size" k="Size" v={`${analysis.fontSizePt}pt`} />
              <Chip testid="analysis-weight" k="Wt" v={analysis.weight} />
              <Chip testid="analysis-spacing" k="LH" v={`${(analysis.lineSpacingNorm * 100).toFixed(1)}%`} />
              <Chip testid="analysis-count" k="N" v={analysis.wordsAnalyzed} />
            </>
          )}
          {gridAnalysis?.cols > 0 && (
            <>
              <Chip testid="grid-cols" k="Cols" v={gridAnalysis.cols} accent />
              <Chip testid="grid-rows" k="Rows" v={gridAnalysis.rows} accent />
              <Chip testid="grid-cell" k="Cell"
                v={`${(gridAnalysis.avgCellW * 100).toFixed(1)}×${(gridAnalysis.avgCellH * 100).toFixed(1)}%`}
                accent />
            </>
          )}
        </div>
      )}

      {confirmOpen && (
        <div
          data-testid="boundary-confirm-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border-2 border-[var(--tm-orange)] rounded-md shadow-2xl max-w-sm w-full p-5"
          >
            <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--tm-orange)] mb-1 inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> Lock boundary
            </div>
            <div className="text-lg font-black text-[var(--tm-navy)] mb-2">
              Boundary will lock once you enter the Studio
            </div>
            <p className="text-xs text-[var(--tm-text-soft)] mb-4">
              Inside the Studio you can place elements, but the printable boundary stays fixed. If you need to change it, come back to this step from the start.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                data-testid="boundary-confirm-cancel"
                className="flex-1 h-10 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] font-bold text-sm"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={onConfirmLock}
                data-testid="boundary-confirm-ok"
                className="flex-1 h-10 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm inline-flex items-center justify-center gap-1"
              >
                <Check className="h-3.5 w-3.5" /> Lock &amp; continue
              </button>
            </div>
          </div>
        </div>
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

function Rectangle({ b }) {
  return (
    <polygon
      data-testid="boundary-rect"
      points={`${b.tl.x},${b.tl.y} ${b.tr.x},${b.tr.y} ${b.br.x},${b.br.y} ${b.bl.x},${b.bl.y}`}
      fill="rgba(12,74,183,0.05)"
      stroke="rgba(12,74,183,0.85)"
      strokeWidth="0.0035"
      strokeDasharray="0.01 0.006"
    />
  );
}

function Handles({ b }) {
  const corners = [
    ["tl", b.tl], ["tr", b.tr], ["br", b.br], ["bl", b.bl],
  ];
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
        <rect
          key={k}
          data-testid={`boundary-handle-${k}`}
          x={p.x - r}
          y={p.y - r}
          width={r * 2}
          height={r * 2}
          fill="white"
          stroke="rgba(12,74,183,0.95)"
          strokeWidth="0.003"
        />
      ))}
      {edges.map(([k, p]) => (
        <circle
          key={k}
          data-testid={`boundary-edge-${k}`}
          cx={p.x}
          cy={p.y}
          r={r * 0.85}
          fill="white"
          stroke="rgba(12,74,183,0.95)"
          strokeWidth="0.003"
        />
      ))}
    </>
  );
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

function hitHandle(pt, b, threshold) {
  const corners = { tl: b.tl, tr: b.tr, br: b.br, bl: b.bl };
  for (const [k, p] of Object.entries(corners)) {
    if (dist(pt, p) < threshold) return k;
  }
  const edges = {
    top: { x: (b.tl.x + b.tr.x) / 2, y: (b.tl.y + b.tr.y) / 2 },
    right: { x: (b.tr.x + b.br.x) / 2, y: (b.tr.y + b.br.y) / 2 },
    bot: { x: (b.bl.x + b.br.x) / 2, y: (b.bl.y + b.br.y) / 2 },
    left: { x: (b.tl.x + b.bl.x) / 2, y: (b.tl.y + b.bl.y) / 2 },
  };
  for (const [k, p] of Object.entries(edges)) {
    if (dist(pt, p) < threshold) return k;
  }
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
