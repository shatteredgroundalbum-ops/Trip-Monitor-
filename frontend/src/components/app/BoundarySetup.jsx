import React, { useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { ArrowLeft, Lock, Sparkles, Loader2, RotateCcw, Check, AlertTriangle } from "lucide-react";
import { DEFAULT_BOUNDARIES, analyzeFontDefaults, FONT_PRESETS_BY_ID } from "../../lib/pro-mapping-v2";
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
  const [analyzing, setAnalyzing] = useState(false);
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

  const onAnalyze = async () => {
    if (!scan) return;
    setAnalyzing(true);
    setProgress(0);
    try {
      const words = await runOcr(scan, {
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      const a = analyzeFontDefaults(words, scan.width, scan.height);
      setAnalysis(a);
      toast.success(`Analyzed ${a.wordsAnalyzed} words`);
    } catch (e) {
      toast.error(`Analyze failed: ${e?.message || e}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const onSet = () => setConfirmOpen(true);
  const onConfirmLock = () => {
    setConfirmOpen(false);
    onConfirm({ boundaries, analysis });
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

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          data-testid="boundary-reset"
          onClick={onReset}
          className="h-10 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to 1" margin
        </Button>
        <Button
          variant="outline"
          data-testid="boundary-analyze"
          onClick={onAnalyze}
          disabled={analyzing}
          className="h-10 bg-white border-[var(--tm-blue)] text-[var(--tm-navy)]"
          title="Run OCR to detect font size, weight and line spacing — used as Studio defaults"
        >
          {analyzing ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress}%
            </span>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5 mr-1" /> {analysis ? "Re-analyze text" : "Analyze text"}
            </>
          )}
        </Button>
      </div>

      {analysis && (
        <div data-testid="boundary-analysis-card" className="bg-[var(--tm-surface)] border border-[var(--tm-border)] rounded-md p-3">
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold text-[var(--tm-orange)] mb-2">
            Detected text defaults
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <Stat k="Font" v={FONT_PRESETS_BY_ID[analysis.fontFamily]?.label || analysis.fontFamily} testid="analysis-font" />
            <Stat k="Size" v={`${analysis.fontSizePt}pt`} testid="analysis-size" />
            <Stat k="Weight" v={analysis.weight} testid="analysis-weight" />
            <Stat k="Line spacing" v={`${(analysis.lineSpacingNorm * 100).toFixed(1)}% page`} testid="analysis-spacing" />
            <Stat k="Words sampled" v={analysis.wordsAnalyzed} testid="analysis-count" />
          </dl>
          <p className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-[var(--tm-blue)]" />
            Used as Studio defaults — sheet is NOT auto-built.
          </p>
        </div>
      )}

      <Button
        data-testid="boundary-set"
        onClick={onSet}
        className="h-12 w-full bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
      >
        <Lock className="h-4 w-4 mr-1" /> Set boundary &amp; continue
      </Button>

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

function Stat({ k, v, testid }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">{k}</dt>
      <dd data-testid={testid} className="text-xs font-bold text-[var(--tm-navy)]">{v}</dd>
    </>
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
