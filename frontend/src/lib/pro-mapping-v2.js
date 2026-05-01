/**
 * Pro Mapping Studio — reconstruction-based template system.
 *
 * Core idea (locked by user spec):
 *   "Draw it on the left. Clean it on the right. Label what each area
 *    means. Lock it as the final print template."
 *
 * The mapping tool does NOT guess. It records what the driver marks,
 * cleans up the geometry, and rebuilds the sheet as a pure vector layout
 * on the right pane — which becomes the export surface. No scan survives
 * into the final output.
 *
 * Schema v2 format:
 *   {
 *     version: 2,
 *     boundaries: { tl, tr, bl, br }     // normalized 0..1 anchor points
 *     elements:   Element[]              // every mark the driver made
 *     assets:     { logo?, qr? }         // uploaded images (data urls)
 *     fonts:      { default: string }    // the 5 preset font families
 *     locked:     boolean
 *   }
 *
 * Element kinds:
 *   - line       { from, to }
 *   - rect       { x, y, w, h, filled }
 *   - circle     { cx, cy, r, filled }
 *   - triangle   { points: [p1, p2, p3] }
 *   - curve      { points: [...] }        // smoothed Catmull-Rom
 *   - corner_box { points: [...], bbox }  // dot-driven axis-aligned rect
 *   - grid       { bbox, rows, cols }
 *   - text_marker{ from, to, align, fontFamily, fontSize, fieldName, value }
 *   - bullet     { dot, textStart, text, fontFamily, fontSize }
 *   - logo       { x, y, w, h }           // fills with assets.logo
 *   - qr_box     { x, y, w, h }           // fills with assets.qr
 *   - trace      { paths: [svgPathD], bbox, strokeWidth }
 *   - text_region{ x, y, w, h, content, fontFamily, fontSize }
 *
 * All coordinates normalized 0..1 against the page's working area
 * (computed from the 4 boundary dots, or the scan dims as fallback).
 */

export const STUDIO_TOOLS = [
  { id: "boundary", label: "Page Anchors",  blurb: "Tap the 4 page corners to frame the sheet" },
  { id: "line",     label: "Line",          blurb: "Drag for a straight line" },
  { id: "rect",     label: "Rectangle",     blurb: "Drag to draw a box" },
  { id: "circle",   label: "Circle",        blurb: "Drag from center to edge" },
  { id: "triangle", label: "Triangle",      blurb: "Tap 3 corners" },
  { id: "curve",    label: "Curve",         blurb: "Drag a freehand curve" },
  { id: "corners",  label: "Corner Box",    blurb: "Tap 4 corners → clean rectangle" },
  { id: "grid",     label: "Grid",          blurb: "Drag bbox, then set rows × cols" },
  { id: "text",     label: "Text Marker",   blurb: "Dash where text prints, then name the field" },
  { id: "bullet",   label: "Bullet Point",  blurb: "Tap the dot, then the text start" },
  { id: "logo",     label: "Logo Anchor",   blurb: "Upload logo in Assets → tap center (Fast) or 4 corners (Precise). Asset renders in Preview only." },
  { id: "qr",       label: "QR Anchor",     blurb: "Upload QR in Assets → tap center (Fast) or 4 corners (Precise). Asset renders in Preview only." },
  { id: "trace",    label: "Custom Trace",  blurb: "Draw thick letters — we clean the strokes" },
];

export const FONT_PRESETS = [
  { id: "arial",     label: "Arial / Helvetica", family: "Arial, Helvetica, sans-serif" },
  { id: "times",     label: "Times Serif",       family: "'Times New Roman', Times, serif" },
  { id: "roboto",    label: "Roboto",            family: "Roboto, Arial, sans-serif" },
  { id: "courier",   label: "Courier Mono",      family: "'Courier New', Courier, monospace" },
  { id: "condensed", label: "Condensed",         family: "'Roboto Condensed', 'Arial Narrow', sans-serif" },
];

export const FONT_PRESETS_BY_ID = Object.fromEntries(FONT_PRESETS.map((f) => [f.id, f]));

export const STUDIO_FIELD_PRESETS = [
  "Driver ID", "Truck Number", "Trailer Number", "Trip Sheet",
  "Order Number", "BOL Number", "Date", "Version Code",
  "Pickup", "Drop Off", "City", "State", "Time", "Notes",
];

/** Build a fresh empty studio schema. */
export function emptyStudioSchema() {
  return {
    version: 2,
    boundaries: { tl: null, tr: null, bl: null, br: null },
    elements: [],
    assets: { logo: null, qr: null },
    fonts: { default: "arial" },
    locked: false,
  };
}

/** UUID-v4 with crypto fallback. */
export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ========================== Geometry helpers ========================== */

/**
 * Normalize a rect drag so w/h are always positive.
 */
export function normRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

/**
 * Given the 4 boundary anchors, compute the working-area bbox
 * (axis-aligned). Defaults to full canvas if boundaries are missing.
 */
export function workingArea(boundaries) {
  const pts = [boundaries?.tl, boundaries?.tr, boundaries?.bl, boundaries?.br].filter(Boolean);
  if (pts.length !== 4) return { x: 0, y: 0, w: 1, h: 1, complete: false };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const w = Math.max(...xs) - x;
  const h = Math.max(...ys) - y;
  return { x, y, w, h, complete: true };
}

/**
 * Re-project a point from raw-scan normalized coords to working-area
 * normalized coords. If the working area is the full canvas, this is
 * a no-op; otherwise it scales & translates so the 4 anchors become
 * (0,0)..(1,1). That way the clean reconstruction can be drawn on any
 * page ratio and still line up.
 */
export function toWorkArea(pt, work) {
  if (!work || !work.complete || work.w === 0 || work.h === 0) return { x: pt.x, y: pt.y };
  return {
    x: (pt.x - work.x) / work.w,
    y: (pt.y - work.y) / work.h,
  };
}

/* ========================== Stroke cleanup ========================== */

/**
 * Ramer–Douglas–Peucker line simplification. Reduces noisy finger/pen
 * strokes to the minimum set of points needed to preserve the shape.
 */
export function rdpSimplify(points, tolerance = 0.004) {
  if (!points || points.length < 3) return points || [];
  const sqTol = tolerance * tolerance;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(points[i], points[first], points[last]);
      if (d > maxDist) { idx = i; maxDist = d; }
    }
    if (maxDist > sqTol && idx !== -1) {
      keep[idx] = true;
      stack.push([first, idx], [idx, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function sqSegDist(p, a, b) {
  let x = a.x, y = a.y;
  let dx = b.x - x, dy = b.y - y;
  if (dx || dy) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b.x; y = b.y; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p.x - x; dy = p.y - y;
  return dx * dx + dy * dy;
}

/**
 * Build an SVG path `d` attribute from a simplified point list using
 * Catmull-Rom → Bezier conversion so the resulting curve is smooth
 * (key for the custom-trace feature — raw polylines look like chicken
 * scratch, smoothed Bezier looks like a clean stroke).
 */
export function pointsToSmoothPath(points) {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  const out = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    out.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
  }
  return out.join(" ");
}

/**
 * Full "trace clean-up" pass: simplify, smooth, and return both the
 * cleaned point list AND a ready-to-render SVG path `d` string.
 */
export function cleanTrace(points, { tolerance = 0.003 } = {}) {
  const simplified = rdpSimplify(points, tolerance);
  return {
    points: simplified,
    d: pointsToSmoothPath(simplified),
  };
}

/**
 * Compute an axis-aligned bbox for any element so we can position the
 * clean reconstruction correctly (and for hit-testing later).
 */
export function elementBBox(el) {
  const g = el.geometry || {};
  switch (el.kind) {
    case "line":
    case "text_marker":
      return { x: Math.min(g.from.x, g.to.x), y: Math.min(g.from.y, g.to.y),
               w: Math.abs(g.to.x - g.from.x), h: Math.abs(g.to.y - g.from.y) };
    case "rect":
    case "corner_box":
    case "grid":
    case "logo":
    case "qr_box":
    case "text_region":
      return { x: g.x, y: g.y, w: g.w, h: g.h };
    case "circle":
      return { x: g.cx - g.r, y: g.cy - g.r, w: 2 * g.r, h: 2 * g.r };
    case "triangle": {
      const xs = g.points.map((p) => p.x);
      const ys = g.points.map((p) => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys),
               w: Math.max(...xs) - Math.min(...xs),
               h: Math.max(...ys) - Math.min(...ys) };
    }
    case "curve": {
      const xs = g.points.map((p) => p.x);
      const ys = g.points.map((p) => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys),
               w: Math.max(...xs) - Math.min(...xs),
               h: Math.max(...ys) - Math.min(...ys) };
    }
    case "bullet":
      return { x: Math.min(g.dot.x, g.textStart.x), y: Math.min(g.dot.y, g.textStart.y),
               w: Math.abs(g.textStart.x - g.dot.x), h: Math.abs(g.textStart.y - g.dot.y) };
    case "trace":
      return g.bbox || { x: 0, y: 0, w: 1, h: 1 };
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}
