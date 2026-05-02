import React, { useRef, useState } from "react";
import { Pen, X, Trash2, Save } from "lucide-react";
import { rdpSimplify, pointsToSmoothPath } from "../../lib/pro-mapping-v2";

const FONT_CHARS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  ".", ",", "-", "/", " ",
];

const PAD_SIZE = 220;

/**
 * Custom-font builder. The driver traces each character on a small
 * canvas; each traced stroke set is normalized to a unit-height
 * em-square so the resulting glyphs can be rendered at any size.
 *
 * Stored shape (on schema.fonts.customGlyphs):
 *   {
 *     "A": {
 *       paths: ["M ... L ...", ...],   // smoothed SVG-d strings
 *       width: 0.62,                   // relative to em-height (1.0)
 *     },
 *     ...
 *   }
 */
export default function CustomFontBuilder({ schema, onSave, onClose }) {
  const [active, setActive] = useState("A");
  const [glyphs, setGlyphs] = useState(() => ({ ...(schema?.fonts?.customGlyphs || {}) }));
  const [strokes, setStrokes] = useState([]); // current in-progress strokes for `active`
  const [draftPath, setDraftPath] = useState(null);
  const padRef = useRef(null);

  // Whenever active char changes, hydrate strokes from saved glyph
  // (so the user can refine/re-trace).
  React.useEffect(() => {
    setStrokes([]); // start fresh — saved glyph is rendered as ghost
    setDraftPath(null);
  }, [active]);

  const padPt = (e) => {
    const r = padRef.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const onDown = (e) => {
    e.preventDefault();
    const pt = padPt(e); if (!pt) return;
    setDraftPath([pt]);
  };
  const onMove = (e) => {
    if (!draftPath) return;
    const pt = padPt(e); if (!pt) return;
    setDraftPath((arr) => [...arr, pt]);
  };
  const onUp = () => {
    if (!draftPath || draftPath.length < 2) { setDraftPath(null); return; }
    const cleaned = rdpSimplify(draftPath, 0.005);
    const d = pointsToSmoothPath(cleaned);
    setStrokes((s) => [...s, { d, points: cleaned }]);
    setDraftPath(null);
  };

  const saveCurrentChar = () => {
    if (!strokes.length && !glyphs[active]) return;
    if (!strokes.length) return;
    // Compute bbox across all strokes and normalize so height = 1.
    const all = strokes.flatMap((s) => s.points);
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const h = Math.max(0.01, maxY - minY);
    const w = Math.max(0.01, maxX - minX);
    const norm = (p) => ({ x: (p.x - minX) / h, y: (p.y - minY) / h });
    const normalizedPaths = strokes.map((s) => pointsToSmoothPath(s.points.map(norm)));
    setGlyphs((g) => ({
      ...g,
      [active]: { paths: normalizedPaths, width: w / h },
    }));
    setStrokes([]);
  };

  const clearCurrent = () => { setStrokes([]); setDraftPath(null); };

  const deleteGlyph = () => {
    setGlyphs((g) => { const cp = { ...g }; delete cp[active]; return cp; });
    setStrokes([]);
  };

  const finish = () => {
    onSave(glyphs);
    onClose();
  };

  const savedGlyph = glyphs[active];

  return (
    <div data-testid="custom-font-builder"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white border-2 border-[var(--tm-orange)] rounded-md shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-[var(--tm-border)]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--tm-orange)]">
              Custom Font Builder
            </div>
            <div className="text-base font-bold text-[var(--tm-navy)]">
              Trace each character once · {Object.keys(glyphs).length} of {FONT_CHARS.length} traced
            </div>
          </div>
          <button type="button" onClick={onClose}
            data-testid="custom-font-close"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-[var(--tm-text-soft)] hover:bg-[var(--tm-surface)]">
            <X className="h-4 w-4" />
          </button>
        </header>
        {/* Body */}
        <div className="flex-1 overflow-auto p-4 grid md:grid-cols-[1fr,260px] gap-4">
          {/* Trace pad */}
          <div className="flex flex-col items-center">
            <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold mb-2">
              Trace the character: <span className="text-2xl text-[var(--tm-navy)] ml-2 font-black">{active === " " ? "␣" : active}</span>
            </div>
            <div ref={padRef}
              data-testid="custom-font-pad"
              className="relative bg-white border-2 border-[var(--tm-blue)] rounded-md touch-none select-none"
              style={{ width: PAD_SIZE, height: PAD_SIZE, cursor: "crosshair" }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
              {/* Baseline grid */}
              <svg viewBox="0 0 1 1" preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none">
                <line x1="0" y1="0.85" x2="1" y2="0.85" stroke="rgba(255,95,21,0.4)" strokeWidth="0.004" strokeDasharray="0.012 0.008" />
                <line x1="0" y1="0.15" x2="1" y2="0.15" stroke="rgba(12,74,183,0.25)" strokeWidth="0.003" strokeDasharray="0.008 0.008" />
              </svg>
              {/* Saved glyph (ghost) */}
              {savedGlyph && (
                <svg viewBox="0 0 1 1" preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.22 }}>
                  <g transform={`translate(${(1 - savedGlyph.width) / 2} 0.05) scale(0.9)`}>
                    {savedGlyph.paths.map((d, i) => (
                      <path key={i} d={d} fill="none" stroke="#0E1F47" strokeWidth="0.04" strokeLinecap="round" strokeLinejoin="round" />
                    ))}
                  </g>
                </svg>
              )}
              {/* Live strokes */}
              <svg viewBox="0 0 1 1" preserveAspectRatio="none"
                className="absolute inset-0 w-full h-full pointer-events-none">
                {strokes.map((s, i) => (
                  <path key={i} d={s.d} fill="none" stroke="#0C4AB7" strokeWidth="0.025" strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {draftPath && (
                  <path d={draftPath.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                    fill="none" stroke="rgba(12,74,183,0.5)" strokeWidth="0.022" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={clearCurrent} disabled={!strokes.length && !draftPath}
                data-testid="custom-font-clear"
                className="h-8 px-3 text-[10px] uppercase tracking-wider font-bold rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] disabled:opacity-40">
                Clear
              </button>
              <button type="button" onClick={saveCurrentChar} disabled={!strokes.length}
                data-testid="custom-font-save-char"
                className="h-8 px-3 text-[10px] uppercase tracking-wider font-bold rounded-md bg-[var(--tm-blue)] hover:bg-[var(--tm-navy)] text-white disabled:opacity-40">
                <Save className="inline-block h-3 w-3 mr-1" /> Save glyph
              </button>
              {savedGlyph && (
                <button type="button" onClick={deleteGlyph}
                  data-testid="custom-font-delete-char"
                  className="h-8 px-3 text-[10px] uppercase tracking-wider font-bold rounded-md bg-white border border-[#FF3B30] text-[#FF3B30]">
                  <Trash2 className="inline-block h-3 w-3 mr-1" /> Delete
                </button>
              )}
            </div>
          </div>
          {/* Char palette */}
          <div className="flex flex-col">
            <div className="text-[10px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold mb-2">
              Pick a character
            </div>
            <div className="grid grid-cols-7 gap-1" data-testid="custom-font-palette">
              {FONT_CHARS.map((c) => {
                const has = !!glyphs[c];
                const isActive = c === active;
                return (
                  <button key={c} type="button"
                    onClick={() => setActive(c)}
                    data-testid={`custom-font-char-${c === " " ? "space" : c}`}
                    className={`h-8 text-xs font-bold rounded-md border ${
                      isActive ? "bg-[var(--tm-orange)] text-white border-[var(--tm-orange)]"
                      : has ? "bg-[var(--tm-blue)] text-white border-[var(--tm-blue)]"
                      : "bg-white text-[var(--tm-navy)] border-[var(--tm-border)] hover:bg-[var(--tm-surface)]"}`}>
                    {c === " " ? "␣" : c}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-[var(--tm-border)]">
          <button type="button" onClick={onClose}
            data-testid="custom-font-cancel"
            className="flex-1 h-10 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] font-bold text-sm">
            Cancel
          </button>
          <button type="button" onClick={finish}
            data-testid="custom-font-finish"
            disabled={Object.keys(glyphs).length === 0}
            className="flex-1 h-10 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm disabled:opacity-40">
            <Pen className="inline-block h-4 w-4 mr-1" /> Use this font ({Object.keys(glyphs).length} glyph{Object.keys(glyphs).length === 1 ? "" : "s"})
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Render text in the custom font as inline SVG. If a character has no
 * glyph, falls back to a system-font tspan in the same color/size.
 *
 * Returns an absolutely-positioned <svg> element ready to drop into a
 * pixel-positioned div.
 */
export function CustomFontText({ value, fontSize = 12, color = "#0E1F47", glyphs }) {
  if (!glyphs || Object.keys(glyphs).length === 0) {
    return <span style={{ fontSize, color, fontFamily: "Arial, sans-serif", fontWeight: 600 }}>{value}</span>;
  }
  // Layout: each glyph normalized to em-height = 1, width = glyph.width.
  // Convert to pixels by multiplying by fontSize.
  const items = [];
  let x = 0;
  const fallbackW = fontSize * 0.55;
  for (const ch of value) {
    const g = glyphs[ch] || glyphs[ch.toUpperCase()];
    if (g) {
      items.push({ kind: "glyph", g, x, w: g.width * fontSize, ch });
      x += g.width * fontSize + fontSize * 0.08; // small letter-spacing
    } else if (ch === " ") {
      x += fontSize * 0.4;
    } else {
      items.push({ kind: "fallback", ch, x, w: fallbackW });
      x += fallbackW + fontSize * 0.05;
    }
  }
  const totalW = Math.max(x, fontSize);
  const stroke = Math.max(0.8, fontSize * 0.08);
  return (
    <svg width={totalW} height={fontSize * 1.2} style={{ display: "block", overflow: "visible" }}>
      {items.map((it, i) => it.kind === "glyph" ? (
        <g key={i} transform={`translate(${it.x} 0) scale(${fontSize})`}>
          {it.g.paths.map((d, j) => (
            <path key={j} d={d} fill="none" stroke={color} strokeWidth={stroke / fontSize} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </g>
      ) : (
        <text key={i} x={it.x} y={fontSize * 0.95} fill={color} fontSize={fontSize} fontFamily="Arial, sans-serif" fontWeight="600">
          {it.ch}
        </text>
      ))}
    </svg>
  );
}
