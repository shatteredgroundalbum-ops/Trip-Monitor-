import React, { forwardRef } from "react";
import {
  FONT_PRESETS_BY_ID, workingArea,
} from "../../lib/pro-mapping-v2";
import { CustomFontText } from "./CustomFontBuilder";

/**
 * Pure-vector reconstruction surface. This is ALSO what DynamicPaperSheet
 * renders for schema v2 templates during export — single source of truth.
 * Rendered at a fixed width (900 when exported, scales down in preview)
 * with an 8.5:11 aspect ratio so the output matches a standard sheet.
 */
export const CleanReconstructionCanvas = forwardRef(function CleanReconstructionCanvas(
  { schema, session, width = 900 }, ref
) {
  const work = workingArea(schema?.boundaries);
  const aspect = 11 / 8.5; // Letter
  const height = Math.round(width * aspect);
  const els = schema?.elements || [];
  const pad = 32;

  // Map a scan-space point to working-area-space (0..1)
  const ws = (pt) => {
    if (!work.complete) return pt;
    return { x: (pt.x - work.x) / work.w, y: (pt.y - work.y) / work.h };
  };
  // Working-area-space → pixel
  const px = (pt) => ({ x: pad + pt.x * (width - 2 * pad), y: pad + pt.y * (height - 2 * pad) });
  const wsDim = (d, axis) => {
    if (!work.complete) return axis === "w" ? d * (width - 2 * pad) : d * (height - 2 * pad);
    const base = axis === "w" ? work.w : work.h;
    return (d / base) * (axis === "w" ? (width - 2 * pad) : (height - 2 * pad));
  };

  const fontFamilyOf = (id) => FONT_PRESETS_BY_ID[id]?.family || FONT_PRESETS_BY_ID.arial.family;

  return (
    <div ref={ref} id="paper-sheet" data-testid="paper-sheet"
      style={{ width, background: "#FFFFFF", color: "#000", position: "relative", fontFamily: fontFamilyOf(schema?.fonts?.default) }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", background: "#FFFFFF" }}>
        {els.map((el) => <CleanElement key={el.id} el={el} ws={ws} px={px} wsDim={wsDim}
          assets={schema.assets} session={session} fontFamilyOf={fontFamilyOf} />)}
      </svg>
      {/* HTML text layer (SVG text rendering is less consistent across html2canvas) */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {els.map((el) => <CleanTextLayer key={el.id} el={el} ws={ws} px={px} session={session} fontFamilyOf={fontFamilyOf} customGlyphs={schema?.fonts?.customGlyphs} />)}
      </div>
    </div>
  );
});

function CleanElement({ el, ws, px, wsDim, assets, fontFamilyOf: _ff, session: _sess }) {
  const g = el.geometry;
  const sw = 1.8;
  switch (el.kind) {
    case "line": {
      const a = px(ws(g.from)); const b = px(ws(g.to));
      return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#000" strokeWidth={sw} />;
    }
    case "rect":
    case "corner_box": {
      const p = px(ws({ x: g.x, y: g.y }));
      return <rect x={p.x} y={p.y} width={wsDim(g.w, "w")} height={wsDim(g.h, "h")} fill="none" stroke="#000" strokeWidth={sw} />;
    }
    case "circle": {
      const c = px(ws({ x: g.cx, y: g.cy }));
      const rx = wsDim(g.r, "w");
      const ry = wsDim(g.r, "h");
      return <ellipse cx={c.x} cy={c.y} rx={rx} ry={ry} fill="none" stroke="#000" strokeWidth={sw} />;
    }
    case "triangle": {
      const pts = g.points.map((p) => px(ws(p)));
      return <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#000" strokeWidth={sw} />;
    }
    case "grid": {
      const p = px(ws({ x: g.x, y: g.y }));
      const W = wsDim(g.w, "w"); const H = wsDim(g.h, "h");
      // First-row height for header text positioning. Use the first
      // rowLine fraction if available, else even spacing.
      const headerRowEnd = g.rowLines && g.rowLines.length > 0 ? g.rowLines[0] : (1 / (g.rows || 1));
      const headerY = p.y + H * headerRowEnd / 2;
      const headerFontSize = Math.max(9, Math.min(13, H * headerRowEnd * 0.55));
      return (
        <g>
          <rect x={p.x} y={p.y} width={W} height={H} fill="none" stroke="#000" strokeWidth={sw} />
          {g.rowLines
            ? g.rowLines.map((rFrac, i) => (
              <line key={`r${i}`} x1={p.x} x2={p.x + W}
                y1={p.y + H * rFrac} y2={p.y + H * rFrac}
                stroke="#000" strokeWidth={sw * 0.7} />))
            : Array.from({ length: (g.rows || 1) - 1 }).map((_, i) => (
              <line key={`r${i}`} x1={p.x} x2={p.x + W}
                y1={p.y + H * (i + 1) / g.rows} y2={p.y + H * (i + 1) / g.rows}
                stroke="#000" strokeWidth={sw * 0.6} />))}
          {g.colLines
            ? g.colLines.map((cFrac, i) => (
              <line key={`c${i}`} y1={p.y} y2={p.y + H}
                x1={p.x + W * cFrac} x2={p.x + W * cFrac}
                stroke="#000" strokeWidth={sw * 0.7} />))
            : Array.from({ length: (g.cols || 1) - 1 }).map((_, i) => (
              <line key={`c${i}`} y1={p.y} y2={p.y + H}
                x1={p.x + W * (i + 1) / g.cols} x2={p.x + W * (i + 1) / g.cols}
                stroke="#000" strokeWidth={sw * 0.6} />))}
          {/* Header text in the first row, centered per column. */}
          {(g.headers || []).map((h, i) => h && (
            <text key={`h${i}`}
              x={p.x + W * ((i + 0.5) / (g.cols || 1))}
              y={headerY}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={headerFontSize} fontWeight="700" fill="#0E1F47"
              fontFamily={FONT_PRESETS_BY_ID[g.fontFamily]?.family || "Arial, sans-serif"}>
              {h}
            </text>
          ))}
        </g>
      );
    }
    case "curve": {
      // Re-project each point from scan-space to working-area, then to pixels.
      const projected = (g.points || []).map((p) => px(ws(p)));
      const d = projected.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      return <path d={d} fill="none" stroke="#000" strokeWidth={sw} />;
    }
    case "trace": {
      const projected = (g.points || []).map((p) => px(ws(p)));
      const d = projected.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      const pxStroke = Math.max(2, (g.strokeWidth || 0.006) * 600);
      return <path d={d} fill="none" stroke="#0E1F47" strokeWidth={pxStroke} strokeLinecap="round" strokeLinejoin="round" />;
    }
    case "logo":
    case "logo_anchor": {
      let boxX, boxY, boxW, boxH;
      if (el.kind === "logo_anchor" && g.mode === "center") {
        const c = px(ws(g.center));
        const scale = g.scale || 0.18;
        boxW = wsDim(scale, "w");
        boxH = boxW; // square default; image preserveAspectRatio handles fitting
        boxX = c.x - boxW / 2;
        boxY = c.y - boxH / 2;
      } else {
        const p = px(ws({ x: g.x, y: g.y }));
        boxX = p.x; boxY = p.y;
        boxW = wsDim(g.w, "w"); boxH = wsDim(g.h, "h");
      }
      if (assets?.logo?.data_url) {
        return <image href={assets.logo.data_url} x={boxX} y={boxY} width={boxW} height={boxH} preserveAspectRatio="xMidYMid meet" />;
      }
      return (
        <g>
          <rect x={boxX} y={boxY} width={boxW} height={boxH} fill="none" stroke="#000" strokeWidth={sw} strokeDasharray="8 4" />
          <text x={boxX + boxW / 2} y={boxY + boxH / 2} textAnchor="middle" dominantBaseline="middle"
            fill="#8A92AB" fontSize={11} fontWeight="700" fontFamily="Arial, sans-serif">LOGO</text>
        </g>
      );
    }
    case "qr_box":
    case "qr_anchor": {
      let boxX, boxY, boxW, boxH;
      if (el.kind === "qr_anchor" && g.mode === "center") {
        const c = px(ws(g.center));
        const scale = g.scale || 0.15;
        boxW = wsDim(scale, "w");
        boxH = boxW;
        boxX = c.x - boxW / 2;
        boxY = c.y - boxH / 2;
      } else {
        const p = px(ws({ x: g.x, y: g.y }));
        boxX = p.x; boxY = p.y;
        boxW = wsDim(g.w, "w"); boxH = wsDim(g.h, "h");
      }
      if (assets?.qr?.data_url) {
        return <image href={assets.qr.data_url} x={boxX} y={boxY} width={boxW} height={boxH} preserveAspectRatio="xMidYMid meet" />;
      }
      return (
        <g>
          <rect x={boxX} y={boxY} width={boxW} height={boxH} fill="none" stroke="#000" strokeWidth={sw} />
          <text x={boxX + boxW / 2} y={boxY + boxH / 2} textAnchor="middle" dominantBaseline="middle"
            fill="#8A92AB" fontSize={10} fontWeight="700" fontFamily="Arial, sans-serif">QR</text>
        </g>
      );
    }
    case "bullet": {
      const d = px(ws(g.dot));
      return <circle cx={d.x} cy={d.y} r={3} fill="#000" />;
    }
    default: return null;
  }
}

/** Text is rendered as HTML (not SVG) — renders more consistently via html2canvas. */
function CleanTextLayer({ el, ws, px, session, fontFamilyOf, customGlyphs }) {
  const g = el.geometry;
  const useCustom = g.fontFamily === "custom" && customGlyphs && Object.keys(customGlyphs).length > 0;
  const style = (extra = {}) => ({
    position: "absolute",
    color: "#0E1F47",
    fontFamily: fontFamilyOf(g.fontFamily),
    fontWeight: 600,
    whiteSpace: "nowrap",
    ...extra,
  });
  const renderText = (value, fontSize) => useCustom
    ? <CustomFontText value={value} fontSize={fontSize} color="#0E1F47" glyphs={customGlyphs} />
    : value;
  if (el.kind === "text_marker") {
    const start = px(ws(g.from));
    const value = valueForField(g.fieldName, session) || g.fieldName || "";
    const fs = (g.fontSize || 12) * 1.05;
    return (
      <div data-testid={`clean-field-${g.fieldName || el.id}`}
        style={style({ left: start.x, top: start.y - (g.fontSize || 12), fontSize: fs })}>
        {renderText(value, fs)}
      </div>
    );
  }
  if (el.kind === "bullet") {
    const t = px(ws(g.textStart));
    const fs = (g.fontSize || 13) * 1.02;
    return (
      <div style={style({ left: t.x + 6, top: t.y - (g.fontSize || 13),
        fontSize: fs, whiteSpace: "normal", maxWidth: 520 })}>
        {renderText(g.text, fs)}
      </div>
    );
  }
  if (el.kind === "text_region" && g.content) {
    const p = px(ws({ x: g.x, y: g.y }));
    const fs = g.fontSize || 12;
    return (
      <div style={style({ left: p.x, top: p.y, fontSize: fs, whiteSpace: "pre-wrap", maxWidth: 520 })}>
        {renderText(g.content, fs)}
      </div>
    );
  }
  return null;
}

/** Pull a value from the session for a given field name. */
export function valueForField(name, session) {
  if (!name || !session) return "";
  const k = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = {
    driverid: session.driver_id,
    driver: session.driver_id,
    trucknumber: session.truck_number,
    truck: session.truck_number,
    trailernumber: session.rows?.[0]?.trailer_number,
    trailer: session.rows?.[0]?.trailer_number,
    ordernumber: session.order_number,
    order: session.order_number,
    bolnumber: session.bol_number,
    bol: session.bol_number,
    date: session.date || session.rows?.[0]?.departure_date,
    pickup: session.rows?.[0]?.location_name,
    dropoff: session.rows?.[session.rows?.length - 1]?.location_name,
    drop: session.rows?.[session.rows?.length - 1]?.location_name,
    city: session.rows?.[0]?.stop_city,
    state: session.rows?.[0]?.stop_state,
    time: session.rows?.[0]?.departure_time,
    notes: session.notes,
    tripsheet: "TRIP SHEET",
    versioncode: "v2.0",
  };
  return map[k] || "";
}