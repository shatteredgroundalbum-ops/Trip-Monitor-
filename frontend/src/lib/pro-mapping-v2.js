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
  { id: "select",   label: "Select",         blurb: "Tap an element to select · drag handles to resize · drag rotate handle · lock or delete." },
  { id: "pan",      label: "Pan",            blurb: "Drag to pan when zoomed in · both canvases scroll together." },
  { id: "boundary", label: "Reset Page",   blurb: "Reset the page boundary to the 1-inch default margin." },
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
  { id: "custom",    label: "Custom (Traced)",   family: "Arial, sans-serif" },
];

export const FONT_PRESETS_BY_ID = Object.fromEntries(FONT_PRESETS.map((f) => [f.id, f]));

export const STUDIO_FIELD_PRESETS = [
  "Driver ID", "Truck Number", "Trailer Number", "Trip Sheet",
  "Order Number", "BOL Number", "Date", "Version Code",
  "Pickup", "Drop Off", "City", "State", "Time", "Notes",
];

/**
 * Default boundary anchors at 1" margin on a standard 8.5×11 letter
 * page. Driver can drag the 4 corner handles or the 4 edge midpoints
 * to fit their actual sheet's printable area.
 *   horizontal margin = 1 / 8.5 ≈ 0.1176
 *   vertical margin   = 1 / 11  ≈ 0.0909
 */
export const DEFAULT_BOUNDARIES = {
  tl: { x: 1 / 8.5, y: 1 / 11 },
  tr: { x: 1 - 1 / 8.5, y: 1 / 11 },
  br: { x: 1 - 1 / 8.5, y: 1 - 1 / 11 },
  bl: { x: 1 / 8.5, y: 1 - 1 / 11 },
};

/** Build a fresh empty studio schema. */
export function emptyStudioSchema() {
  return {
    version: 2,
    boundaries: { ...DEFAULT_BOUNDARIES },
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
 * Detect whether a stroke is "near straight" — used to auto-snap
 * traced lines to true line elements instead of curves.
 *
 * Computes the maximum perpendicular distance from any point on the
 * stroke to the chord connecting the first and last points. If the
 * max deviation is below `tolerance` (in normalized 0..1 units),
 * the stroke is considered straight.
 */
export function isNearStraight(points, tolerance = 0.012) {
  if (!points || points.length < 2) return false;
  const a = points[0];
  const b = points[points.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.02) return false; // degenerate
  // A simplified 2-point list IS a straight line by definition.
  if (points.length === 2) return true;
  let maxD = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
    const d = num / len;
    if (d > maxD) maxD = d;
  }
  return maxD < tolerance;
}

/* ========================== Hit-testing & transforms ========================== */

/**
 * Returns true if normalized point pt falls within the (possibly
 * rotated) element's bounding box. For rotated elements, transforms
 * pt into element-local space first.
 */
export function hitTest(pt, el) {
  const bbox = elementBBox(el);
  const rot = el.rotation || 0;
  let x = pt.x, y = pt.y;
  if (rot) {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const cos = Math.cos(-rot * Math.PI / 180);
    const sin = Math.sin(-rot * Math.PI / 180);
    const dx = pt.x - cx, dy = pt.y - cy;
    x = cx + dx * cos - dy * sin;
    y = cy + dx * sin + dy * cos;
  }
  // Pad for thin elements (lines, single points)
  const pad = (bbox.w < 0.02 || bbox.h < 0.02) ? 0.012 : 0;
  return x >= bbox.x - pad && x <= bbox.x + bbox.w + pad
      && y >= bbox.y - pad && y <= bbox.y + bbox.h + pad;
}

/**
 * Snap a point to the nearest boundary anchor or working-area edge
 * if within `threshold` (normalized). Returns the snapped point and
 * whether snapping occurred.
 */
export function snapToBoundaries(pt, boundaries, threshold = 0.02) {
  if (!boundaries) return { ...pt, snapped: false };
  const candidates = [];
  for (const k of ["tl", "tr", "bl", "br"]) {
    if (boundaries[k]) candidates.push(boundaries[k]);
  }
  let best = null, bestD = threshold;
  for (const c of candidates) {
    const d = Math.sqrt((pt.x - c.x) ** 2 + (pt.y - c.y) ** 2);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best) return { x: best.x, y: best.y, snapped: true };
  return { ...pt, snapped: false };
}

/**
 * Find the nearest OCR word edge to a given coordinate along one axis.
 * Used by the grid editor to snap newly-added column/row lines onto
 * detected printed lines (word baselines / left edges) so the
 * reconstructed grid sits exactly where the original grid is.
 *
 *   axis: 'x' → snap to left/right edges of OCR words at the given y
 *   axis: 'y' → snap to top/bottom edges of OCR words at the given x
 *
 * Returns { value, snapped }. `value` is the snapped (or original)
 * coordinate along the requested axis.
 */
export function snapToOcrLine(pt, axis, ocrWords, scanW, scanH, threshold = 0.014) {
  if (!ocrWords?.length || !scanW || !scanH) return { value: pt[axis], snapped: false };
  // ocrWords store bbox in scan-pixel space; normalize to 0..1 against scan dims.
  let best = null, bestD = threshold;
  for (const w of ocrWords) {
    const b = w.bbox;
    if (!b) continue;
    const left = b.x0 / scanW, right = b.x1 / scanW;
    const top = b.y0 / scanH, bottom = b.y1 / scanH;
    const candidates = axis === "x" ? [left, right] : [top, bottom];
    for (const c of candidates) {
      const d = Math.abs(c - pt[axis]);
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  if (best != null) return { value: best, snapped: true };
  return { value: pt[axis], snapped: false };
}

/**
 * Apply a translation delta to an element's geometry. Returns a new
 * geometry object — does NOT mutate the input.
 */
export function translateGeometry(kind, geometry, dx, dy) {
  const g = { ...geometry };
  const move = (p) => ({ x: p.x + dx, y: p.y + dy });
  switch (kind) {
    case "line":
    case "text_marker":
      g.from = move(g.from); g.to = move(g.to); break;
    case "rect":
    case "corner_box":
    case "grid":
    case "logo":
    case "qr_box":
    case "text_region":
      g.x += dx; g.y += dy; break;
    case "circle":
      g.cx += dx; g.cy += dy; break;
    case "triangle":
      g.points = g.points.map(move); break;
    case "curve":
    case "trace":
      g.points = (g.points || []).map(move);
      if (g.bbox) g.bbox = { ...g.bbox, x: g.bbox.x + dx, y: g.bbox.y + dy };
      // recompute SVG `d` from translated points
      if (g.d || (kind === "curve")) g.d = pointsToSmoothPath(g.points);
      if (kind === "trace") g.paths = [pointsToSmoothPath(g.points)];
      break;
    case "bullet":
      g.dot = move(g.dot); g.textStart = move(g.textStart); break;
    case "logo_anchor":
    case "qr_anchor":
      if (g.mode === "center") g.center = move(g.center);
      else {
        g.x += dx; g.y += dy;
        g.corners = (g.corners || []).map(move);
      }
      break;
    default: break;
  }
  return g;
}

/**
 * Resize an element by dragging one of its 8 handles. Returns a new
 * geometry object. Most non-rect elements collapse to bbox-resize.
 */
export function resizeGeometry(kind, geometry, handle, newBBox) {
  const g = { ...geometry };
  const oldBBox = elementBBox({ kind, geometry });
  const sx = oldBBox.w === 0 ? 1 : newBBox.w / oldBBox.w;
  const sy = oldBBox.h === 0 ? 1 : newBBox.h / oldBBox.h;
  const remap = (p) => ({
    x: newBBox.x + (p.x - oldBBox.x) * sx,
    y: newBBox.y + (p.y - oldBBox.y) * sy,
  });
  switch (kind) {
    case "line":
    case "text_marker":
      g.from = remap(g.from); g.to = remap(g.to); break;
    case "rect":
    case "corner_box":
    case "grid":
    case "logo":
    case "qr_box":
    case "text_region":
      g.x = newBBox.x; g.y = newBBox.y; g.w = newBBox.w; g.h = newBBox.h; break;
    case "circle":
      g.cx = newBBox.x + newBBox.w / 2;
      g.cy = newBBox.y + newBBox.h / 2;
      g.r = Math.min(newBBox.w, newBBox.h) / 2;
      break;
    case "triangle":
      g.points = g.points.map(remap); break;
    case "curve":
    case "trace":
      g.points = (g.points || []).map(remap);
      g.bbox = newBBox;
      if (kind === "curve") g.d = pointsToSmoothPath(g.points);
      else g.paths = [pointsToSmoothPath(g.points)];
      break;
    case "bullet":
      g.dot = remap(g.dot); g.textStart = remap(g.textStart); break;
    case "logo_anchor":
    case "qr_anchor":
      if (g.mode === "center") {
        g.center = { x: newBBox.x + newBBox.w / 2, y: newBBox.y + newBBox.h / 2 };
        g.scale = newBBox.w; // store scale as new width
      } else {
        g.x = newBBox.x; g.y = newBBox.y; g.w = newBBox.w; g.h = newBBox.h;
        g.corners = (g.corners || []).map(remap);
      }
      break;
    default: break;
  }
  return g;
}

/**
 * 8 handle positions for a bbox: NW, N, NE, E, SE, S, SW, W (clockwise from top-left).
 */
export function bboxHandles(bbox) {
  const { x, y, w, h } = bbox;
  return {
    nw: { x: x,         y: y         },
    n:  { x: x + w / 2, y: y         },
    ne: { x: x + w,     y: y         },
    e:  { x: x + w,     y: y + h / 2 },
    se: { x: x + w,     y: y + h     },
    s:  { x: x + w / 2, y: y + h     },
    sw: { x: x,         y: y + h     },
    w:  { x: x,         y: y + h / 2 },
  };
}

/**
 * Validate a schema before locking. Detects:
 *  - elements out-of-bounds (entirely outside the working area)
 *  - elements clipped by the working area (partially outside)
 *  - heavily overlapping pairs (>60% IoU on axis-aligned bboxes)
 *  - text_marker / bullet without a fieldName
 *
 * Returns an array of `{level:'error'|'warn', message, elementIds:[]}`.
 */
export function validateSchema(schema) {
  const issues = [];
  const work = workingArea(schema?.boundaries);
  const els = schema?.elements || [];

  const insideWork = (bb) => {
    if (!work.complete) return true;
    return bb.x >= work.x - 0.005 && bb.y >= work.y - 0.005
        && bb.x + bb.w <= work.x + work.w + 0.005
        && bb.y + bb.h <= work.y + work.h + 0.005;
  };
  const intersectsWork = (bb) => {
    if (!work.complete) return true;
    return !(bb.x + bb.w < work.x || bb.x > work.x + work.w
          || bb.y + bb.h < work.y || bb.y > work.y + work.h);
  };

  // Out-of-bounds and clipped checks
  for (const el of els) {
    const bb = elementBBox(el);
    if (!intersectsWork(bb)) {
      issues.push({ level: "error",
        message: `${el.kind.replace("_", " ")} is fully outside the page anchors`,
        elementIds: [el.id] });
    } else if (!insideWork(bb)) {
      issues.push({ level: "warn",
        message: `${el.kind.replace("_", " ")} extends past the page anchors and will be clipped on export`,
        elementIds: [el.id] });
    }
  }

  // Missing field name on text_marker / bullet
  for (const el of els) {
    if ((el.kind === "text_marker" || el.kind === "bullet")
      && !(el.geometry?.fieldName || el.geometry?.text)) {
      issues.push({ level: "error",
        message: `${el.kind.replace("_", " ")} is missing a field name`,
        elementIds: [el.id] });
    }
  }

  // Heavy overlap (>60% IoU) — only flag pairs of boxes/rects/grids
  // since lines and curves naturally cross things.
  const heavyKinds = new Set(["rect", "corner_box", "grid", "logo", "logo_anchor", "qr_box", "qr_anchor"]);
  const heavy = els.filter((e) => heavyKinds.has(e.kind));
  for (let i = 0; i < heavy.length; i++) {
    for (let j = i + 1; j < heavy.length; j++) {
      const a = elementBBox(heavy[i]);
      const b = elementBBox(heavy[j]);
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      const interArea = ix * iy;
      if (interArea === 0) continue;
      const unionArea = a.w * a.h + b.w * b.h - interArea;
      const iou = interArea / unionArea;
      if (iou > 0.6) {
        issues.push({ level: "warn",
          message: `${heavy[i].kind.replace("_", " ")} and ${heavy[j].kind.replace("_", " ")} overlap heavily (${Math.round(iou * 100)}%)`,
          elementIds: [heavy[i].id, heavy[j].id] });
      }
    }
  }

  return issues;
}/**
 * Given an active resize-drag handle and a new pointer position,
 * compute the resulting bbox. Maintains anchor at the opposite handle.
 */
export function resizedBBox(originalBBox, handle, pt) {
  const { x, y, w, h } = originalBBox;
  let nx = x, ny = y, nw = w, nh = h;
  // Determine anchor (opposite corner) and new dimensions
  if (handle.includes("w")) { nw = (x + w) - pt.x; nx = pt.x; }
  if (handle.includes("e")) { nw = pt.x - x; }
  if (handle.includes("n")) { nh = (y + h) - pt.y; ny = pt.y; }
  if (handle.includes("s")) { nh = pt.y - y; }
  // Clamp positive dimensions
  if (nw < 0.005) { nw = 0.005; }
  if (nh < 0.005) { nh = 0.005; }
  return { x: nx, y: ny, w: nw, h: nh };
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
