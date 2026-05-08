import React from "react";
import { normRect, elementBBox, bboxHandles } from "../../lib/pro-mapping-v2";

/**
 * Renders the dotted boundary rectangle + (optionally) 8 grab
 * handles. In the Studio the boundary is locked from the pre-Studio
 * Boundary phase, so we render just the dotted polygon.
 */
export function BoundaryHandles({ boundaries, zoom = 1, showHandles = true }) {
  const tl = boundaries?.tl, tr = boundaries?.tr, br = boundaries?.br, bl = boundaries?.bl;
  if (!tl || !tr || !br || !bl) return null;
  const stroke = "rgba(12,74,183,0.55)";
  const handleStroke = "rgba(12,74,183,0.95)";
  const hSize = 0.018 / zoom;
  const hHalf = hSize / 2;
  const sw = 0.0024 / Math.max(zoom, 1);
  // Edge midpoints
  const top  = { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 };
  const right = { x: (tr.x + br.x) / 2, y: (tr.y + br.y) / 2 };
  const bot  = { x: (bl.x + br.x) / 2, y: (bl.y + br.y) / 2 };
  const left = { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 };
  return (
    <g data-testid="studio-boundary-handles">
      {/* Dotted bounding poly */}
      <polygon
        points={`${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`}
        fill="none" stroke={stroke}
        strokeWidth={sw * 1.5} strokeDasharray="0.008 0.005" />
      {showHandles && [
        ["tl", tl], ["tr", tr], ["br", br], ["bl", bl],
      ].map(([key, p]) => (
        <rect key={key} data-testid={`studio-boundary-handle-${key}`}
          x={p.x - hHalf} y={p.y - hHalf} width={hSize} height={hSize}
          fill="white" stroke={handleStroke} strokeWidth={sw * 1.2} />
      ))}
      {showHandles && [
        ["top", top], ["right", right], ["bot", bot], ["left", left],
      ].map(([key, p]) => (
        <circle key={key} data-testid={`studio-boundary-edge-${key}`}
          cx={p.x} cy={p.y} r={hHalf}
          fill="white" stroke={handleStroke} strokeWidth={sw * 1.2} />
      ))}
    </g>
  );
}

export function GridSetupPopover({ gridDraft, onChangeCounts, onChangeHeader, onNext, onBack, onDone, onManual, onCancel }) {
  const isCount = gridDraft.step === "count";
  const cc = gridDraft.colCount || 1;
  const rc = gridDraft.rowCount || 1;
  return (
    <div data-testid="studio-grid-setup-popover"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white border-2 border-[var(--tm-orange)] rounded-md shadow-2xl max-w-md w-full p-5">
        <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--tm-orange)] mb-1">
          {isCount ? "Build grid · step 1 of 2" : "Build grid · step 2 of 2"}
        </div>
        <div className="text-lg font-black text-[var(--tm-navy)] mb-4">
          {isCount ? "How big is the grid?" : `Name each of the ${cc} column${cc === 1 ? "" : "s"}`}
        </div>

        {isCount && (
          <div className="space-y-3" data-testid="studio-grid-count">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">Columns</span>
              <input type="number" min="1" max="20" value={cc}
                data-testid="studio-grid-cols-input"
                onChange={(e) => onChangeCounts(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)), rc)}
                className="mt-1 w-full h-10 px-3 text-base border border-[var(--tm-border)] rounded-md text-[var(--tm-navy)] font-bold" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">Rows</span>
              <input type="number" min="1" max="40" value={rc}
                data-testid="studio-grid-rows-input"
                onChange={(e) => onChangeCounts(cc, Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 1)))}
                className="mt-1 w-full h-10 px-3 text-base border border-[var(--tm-border)] rounded-md text-[var(--tm-navy)] font-bold" />
            </label>
            <p className="text-[11px] text-[var(--tm-text-soft)]">
              Lines will be evenly spaced. The first row holds the column headers you'll enter next.
            </p>
          </div>
        )}

        {!isCount && (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto" data-testid="studio-grid-headers">
            {Array.from({ length: cc }).map((_, i) => (
              <label key={i} className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-muted)] w-8 shrink-0 text-right">#{i + 1}</span>
                <input type="text"
                  data-testid={`studio-grid-header-${i}`}
                  value={gridDraft.headers?.[i] || ""}
                  onChange={(e) => onChangeHeader(i, e.target.value)}
                  placeholder={["Date", "Description", "Amount", "Qty", "Notes", "Time", "Location", "Driver"][i] || `Column ${i + 1}`}
                  className="flex-1 h-9 px-2 text-sm border border-[var(--tm-border)] rounded-md text-[var(--tm-navy)]" />
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button type="button" onClick={onCancel}
            data-testid="studio-grid-popover-cancel"
            className="h-10 px-3 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] font-bold text-sm">
            Cancel
          </button>
          <button type="button" onClick={onManual}
            data-testid="studio-grid-popover-manual"
            className="h-10 px-3 rounded-md bg-white border border-[var(--tm-blue)] text-[var(--tm-blue)] font-bold text-sm"
            title="Tap inside the bbox to add lines one at a time">
            Manual
          </button>
          <div className="flex-1" />
          {!isCount && (
            <button type="button" onClick={onBack}
              data-testid="studio-grid-popover-back"
              className="h-10 px-3 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] font-bold text-sm">
              Back
            </button>
          )}
          <button type="button" onClick={isCount ? onNext : onDone}
            data-testid={isCount ? "studio-grid-popover-next" : "studio-grid-popover-done"}
            className="h-10 px-4 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm">
            {isCount ? "Next →" : "Build grid"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ValidationReportModal({ report, onCancel, onForceLock, onJumpTo }) {
  const errors = report.issues.filter((i) => i.level === "error");
  const warns = report.issues.filter((i) => i.level === "warn");
  return (
    <div data-testid="studio-validation-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-white border-2 border-[var(--tm-orange)] rounded-md shadow-2xl max-w-md w-full p-5">
        <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--tm-orange)] mb-1">
          Lock blocked · review issues
        </div>
        <div className="text-lg font-black text-[var(--tm-navy)] mb-3">
          {errors.length} error{errors.length === 1 ? "" : "s"} · {warns.length} warning{warns.length === 1 ? "" : "s"}
        </div>
        <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto" data-testid="studio-validation-list">
          {report.issues.map((iss, i) => (
            <li key={i} data-testid={`studio-validation-item-${i}`}
              className={`text-xs p-2 rounded-md border ${
                iss.level === "error"
                  ? "bg-[#FFF0F0] border-[#FF3B30] text-[#B00020]"
                  : "bg-[#FFF7E6] border-[#FFB020] text-[#7A4A00]"}`}>
              <div className="flex items-start gap-2">
                <span className="font-bold uppercase tracking-wider text-[10px] shrink-0">
                  {iss.level === "error" ? "Error" : "Warn"}
                </span>
                <span className="flex-1">{iss.message}</span>
                <button type="button" onClick={() => onJumpTo(iss.elementIds)}
                  className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-blue)] hover:underline shrink-0">
                  Jump
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel}
            data-testid="studio-validation-cancel"
            className="flex-1 h-10 rounded-md bg-white border border-[var(--tm-border)] text-[var(--tm-navy)] font-bold text-sm">
            Keep editing
          </button>
          <button type="button" onClick={onForceLock} disabled={errors.length > 0}
            data-testid="studio-validation-force-lock"
            className="flex-1 h-10 rounded-md bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            {errors.length > 0 ? "Fix errors first" : "Lock anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the selection outline + 9 handles (4 corners + 4 side
 * midpoints + 1 center) for the currently selected element. Pure SVG,
 * pointer-events:none on the parent so handle hit-testing happens via
 * onPointerDown coordinate math (consistent with the rest of the canvas).
 *
 * Handle semantics:
 *   - corners (NW/NE/SE/SW): proportional resize (preserves aspect)
 *   - edges (N/E/S/W): single-axis stretch
 *   - center (C): drag to move
 */
export function SelectionFrame({ el, zoom = 1, handlesEnabled = true }) {
  const bb = elementBBox(el);
  const cx = bb.x + bb.w / 2;
  const cy = bb.y + bb.h / 2;
  const handles = bboxHandles(bb);
  const stroke = el.locked ? "rgba(255,95,21,0.9)" : "rgba(12,74,183,0.95)";
  const cornerStroke = el.locked ? "rgba(255,95,21,0.95)" : "rgba(255,95,21,0.95)";
  const hSize = 0.018 / zoom;
  const hHalf = hSize / 2;
  const stroke_w = 0.0028 / Math.max(zoom, 1);
  const showHandles = handlesEnabled && !el.locked;
  const cornerKeys = ["nw", "ne", "se", "sw"];
  const edgeKeys = ["n", "e", "s", "w"];
  return (
    <g
      data-testid="studio-selection-frame"
      transform={el.rotation ? `rotate(${el.rotation} ${cx} ${cy})` : undefined}
    >
      <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h}
        fill="none" stroke={stroke} strokeWidth={0.0024 / Math.max(zoom, 1)} strokeDasharray="0.007 0.004" />
      {/* Corner handles — square, orange (proportional resize) */}
      {showHandles && cornerKeys.map((key) => {
        const p = handles[key];
        return (
          <rect key={key} data-testid={`studio-handle-${key}`}
            x={p.x - hHalf} y={p.y - hHalf} width={hSize} height={hSize}
            fill="white" stroke={cornerStroke} strokeWidth={stroke_w} />
        );
      })}
      {/* Edge handles — circles, blue (stretch one axis) */}
      {showHandles && edgeKeys.map((key) => {
        const p = handles[key];
        return (
          <circle key={key} data-testid={`studio-handle-${key}`}
            cx={p.x} cy={p.y} r={hHalf}
            fill="white" stroke={stroke} strokeWidth={stroke_w} />
        );
      })}
      {/* Center handle — small + cross, blue (move) */}
      {showHandles && (() => {
        const p = handles.c;
        const arm = hHalf * 0.9;
        return (
          <g data-testid="studio-handle-c">
            <circle cx={p.x} cy={p.y} r={hHalf}
              fill="white" stroke={stroke} strokeWidth={stroke_w} />
            <line x1={p.x - arm} y1={p.y} x2={p.x + arm} y2={p.y}
              stroke={stroke} strokeWidth={stroke_w} />
            <line x1={p.x} y1={p.y - arm} x2={p.x} y2={p.y + arm}
              stroke={stroke} strokeWidth={stroke_w} />
          </g>
        );
      })()}
    </g>
  );
}

/** Renders the grid editor overlay during step='edit' — bbox + tapped lines. */
export function GridEditOverlay({ gridDraft }) {
  const { bbox, cols, rows } = gridDraft;
  const stroke = "rgba(255,95,21,0.85)";
  return (
    <g data-testid="studio-grid-edit-overlay">
      <rect x={bbox.x} y={bbox.y} width={bbox.w} height={bbox.h}
        fill="rgba(255,95,21,0.06)" stroke={stroke} strokeWidth="0.003" />
      {cols.map((c, i) => (
        <line key={`gc${i}`}
          x1={bbox.x + c * bbox.w} y1={bbox.y}
          x2={bbox.x + c * bbox.w} y2={bbox.y + bbox.h}
          stroke={stroke} strokeWidth="0.0022" />
      ))}
      {rows.map((r, i) => (
        <line key={`gr${i}`}
          y1={bbox.y + r * bbox.h} x1={bbox.x}
          y2={bbox.y + r * bbox.h} x2={bbox.x + bbox.w}
          stroke={stroke} strokeWidth="0.0022" />
      ))}
    </g>
  );
}

/* ========================== Left-canvas overlays ========================== */

export function MarkupOverlay({ el }) {
  const stroke = "rgba(255,95,21,0.9)";
  const fill = "rgba(255,95,21,0.12)";
  const g = el.geometry;
  switch (el.kind) {
    case "line":
      return <line x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y} stroke={stroke} strokeWidth="0.003" />;
    case "rect":
      return <rect x={g.x} y={g.y} width={g.w} height={g.h} fill={fill} stroke={stroke} strokeWidth="0.003" />;
    case "circle":
      return <circle cx={g.cx} cy={g.cy} r={g.r} fill={fill} stroke={stroke} strokeWidth="0.003" />;
    case "triangle":
      return <polygon points={g.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={fill} stroke={stroke} strokeWidth="0.003" />;
    case "corner_box":
      return <rect x={g.x} y={g.y} width={g.w} height={g.h} fill={fill} stroke={stroke} strokeWidth="0.003" />;
    case "grid":
      return (
        <>
          <rect x={g.x} y={g.y} width={g.w} height={g.h} fill={fill} stroke={stroke} strokeWidth="0.003" />
          {/* Prefer manually-positioned colLines/rowLines (Pro grid editor); fall back to evenly-spaced if legacy. */}
          {g.colLines
            ? g.colLines.map((cFrac, i) => (
              <line key={`c${i}`} y1={g.y} y2={g.y + g.h}
                x1={g.x + cFrac * g.w} x2={g.x + cFrac * g.w}
                stroke={stroke} strokeWidth="0.0022" />))
            : Array.from({ length: (g.cols || 1) - 1 }).map((_, i) => (
              <line key={`c${i}`} y1={g.y} y2={g.y + g.h}
                x1={g.x + g.w * (i + 1) / g.cols} x2={g.x + g.w * (i + 1) / g.cols}
                stroke={stroke} strokeWidth="0.0018" />))}
          {g.rowLines
            ? g.rowLines.map((rFrac, i) => (
              <line key={`r${i}`} x1={g.x} x2={g.x + g.w}
                y1={g.y + rFrac * g.h} y2={g.y + rFrac * g.h}
                stroke={stroke} strokeWidth="0.0022" />))
            : Array.from({ length: (g.rows || 1) - 1 }).map((_, i) => (
              <line key={`r${i}`} x1={g.x} x2={g.x + g.w}
                y1={g.y + g.h * (i + 1) / g.rows} y2={g.y + g.h * (i + 1) / g.rows}
                stroke={stroke} strokeWidth="0.0018" />))}
          {/* Column headers in the first row (markup canvas — small uppercase tags). */}
          {(g.headers || []).map((h, i) => h && (
            <text key={`h${i}`}
              x={g.x + ((i + 0.5) / (g.cols || 1)) * g.w}
              y={g.y + (((g.rowLines && g.rowLines[0]) || (1 / (g.rows || 1))) * g.h) / 2 + 0.005}
              textAnchor="middle" dominantBaseline="middle"
              fontSize="0.014" fontWeight="700" fill="rgba(12,74,183,0.9)">
              {h.toUpperCase()}
            </text>
          ))}
        </>
      );
    case "curve":
      return <path d={g.d || ""} fill="none" stroke={stroke} strokeWidth="0.003" />;
    case "trace":
      return (g.paths || []).map((d, i) => (
        <path key={i} d={d} fill="none" stroke={stroke} strokeWidth={g.strokeWidth || 0.005} strokeLinecap="round" strokeLinejoin="round" />
      ));
    case "text_marker":
      return (
        <>
          <line x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y}
            stroke="rgba(12,74,183,0.9)" strokeWidth="0.004" strokeLinecap="round" />
        </>
      );
    case "bullet":
      return (
        <>
          <circle cx={g.dot.x} cy={g.dot.y} r="0.007" fill="#0C4AB7" />
          <line x1={g.dot.x} y1={g.dot.y} x2={g.textStart.x} y2={g.textStart.y}
            stroke="rgba(12,74,183,0.5)" strokeWidth="0.0018" strokeDasharray="0.003 0.003" />
        </>
      );
    case "logo":
    case "logo_anchor": {
      // MAPPING canvas — marker only. Asset lives in preview.
      if (el.kind === "logo_anchor" && g.mode === "center") {
        return (
          <>
            <circle cx={g.center.x} cy={g.center.y} r="0.014" fill="none" stroke="#0E1F47" strokeWidth="0.004" />
            <circle cx={g.center.x} cy={g.center.y} r="0.003" fill="#0E1F47" />
          </>
        );
      }
      const geom = el.kind === "logo_anchor" ? g : g;
      return <rect x={geom.x} y={geom.y} width={geom.w} height={geom.h}
        fill="none" stroke="#0E1F47" strokeWidth="0.003" strokeDasharray="0.006 0.003" />;
    }
    case "qr_box":
    case "qr_anchor": {
      if (el.kind === "qr_anchor" && g.mode === "center") {
        return (
          <>
            <rect x={g.center.x - 0.012} y={g.center.y - 0.012} width="0.024" height="0.024"
              fill="none" stroke="#000" strokeWidth="0.004" />
            <circle cx={g.center.x} cy={g.center.y} r="0.003" fill="#000" />
          </>
        );
      }
      const geom = el.kind === "qr_anchor" ? g : g;
      return <rect x={geom.x} y={geom.y} width={geom.w} height={geom.h}
        fill="none" stroke="#000" strokeWidth="0.003" />;
    }
    default:
      return null;
  }
}

export function DraftOverlay({ draft }) {
  const stroke = "rgba(12,74,183,0.95)";
  const fill = "rgba(12,74,183,0.15)";
  if (draft.tool === "line" && draft.start && draft.end)
    return <line x1={draft.start.x} y1={draft.start.y} x2={draft.end.x} y2={draft.end.y}
      stroke={stroke} strokeWidth="0.003" strokeDasharray="0.006 0.003" />;
  if (draft.tool === "rect" && draft.start && draft.end) {
    const r = normRect(draft.start.x, draft.start.y, draft.end.x, draft.end.y);
    return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={fill} stroke={stroke} strokeWidth="0.003" strokeDasharray="0.006 0.003" />;
  }
  if (draft.tool === "circle" && draft.start && draft.end) {
    const r = Math.sqrt((draft.start.x - draft.end.x) ** 2 + (draft.start.y - draft.end.y) ** 2);
    return <circle cx={draft.start.x} cy={draft.start.y} r={r} fill={fill} stroke={stroke} strokeWidth="0.003" strokeDasharray="0.006 0.003" />;
  }
  if (draft.tool === "grid" && draft.start && draft.end) {
    const r = normRect(draft.start.x, draft.start.y, draft.end.x, draft.end.y);
    return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={fill} stroke={stroke} strokeWidth="0.003" strokeDasharray="0.006 0.003" />;
  }
  if (draft.tool === "text" && draft.start && draft.end) {
    return <line x1={draft.start.x} y1={draft.start.y} x2={draft.end.x} y2={draft.end.y}
      stroke={stroke} strokeWidth="0.004" />;
  }
  if ((draft.tool === "curve" || draft.tool === "trace") && draft.points) {
    const d = draft.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    return <path d={d} fill="none" stroke={stroke} strokeWidth="0.003" />;
  }
  if (draft.tool === "triangle" && draft.points) {
    return draft.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="0.008" fill={stroke} />);
  }
  if (["logo", "qr"].includes(draft.tool) && draft.points) {
    // Precise 4-corner mode for logo/QR — same visual language as corners/triangle.
    return draft.points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="0.008" fill={stroke} />);
  }
  if (draft.tool === "bullet" && draft.dot) {
    return <circle cx={draft.dot.x} cy={draft.dot.y} r="0.008" fill={stroke} />;
  }
  return null;
}