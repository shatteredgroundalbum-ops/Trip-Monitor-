import React, { useMemo, useRef, useState, forwardRef } from "react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import {
  Crosshair, Minus, Square, Circle as CircleIcon, Triangle, Spline, Grid3x3,
  AlignLeft, Dot as DotIcon, Image as ImageIcon, QrCode as QrIcon, PenTool,
  Undo2, Trash2, Save, Lock, Unlock, X, Eye, SlidersHorizontal, Layers,
  ArrowLeftRight, Target, Maximize2, MousePointer2, RotateCw, Pen,
} from "lucide-react";
import {
  STUDIO_TOOLS, FONT_PRESETS, FONT_PRESETS_BY_ID, STUDIO_FIELD_PRESETS,
  emptyStudioSchema, uid, normRect, workingArea, cleanTrace, isNearStraight,
  hitTest, snapToBoundaries, translateGeometry, resizeGeometry,
  bboxHandles, resizedBBox, elementBBox,
} from "../../lib/pro-mapping-v2";
import { saveTemplate, setActiveTemplateId } from "../../lib/template-store";
import ProMappingEditor from "./ProMappingEditor";

const TOOL_ICON = {
  select: MousePointer2,
  boundary: Crosshair, line: Minus, rect: Square, circle: CircleIcon,
  triangle: Triangle, curve: Spline, corners: Crosshair, grid: Grid3x3,
  text: AlignLeft, bullet: DotIcon, logo: ImageIcon, qr: QrIcon, trace: PenTool,
};

/**
 * Pro Mapping Studio — "draw on the left, clean-reconstruct on the right."
 *
 * Single-file composition: left markup canvas, right clean reconstruction
 * (the export surface), top toolbar, right inspector pane, lock button.
 * A toggle at the top lets drivers fall back to the legacy 6-primitive
 * tag editor (ProMappingEditor) if they prefer.
 */
export default function ProMappingStudio({ template, onDone, onCancel }) {
  const [legacy, setLegacy] = useState(false);
  const [schema, setSchema] = useState(() => template?.schema?.version === 2
    ? template.schema
    : emptyStudioSchema());
  const [tool, setTool] = useState("select");
  const [draft, setDraft] = useState(null);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fontSel, setFontSel] = useState("arial");
  const [dockTab, setDockTab] = useState("inspector");
  const [dockOpen, setDockOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [handedness, setHandedness] = useState("right");
  const [placementMode, setPlacementMode] = useState("fast");
  const [hoverPt, setHoverPt] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [ghostOverlay, setGhostOverlay] = useState(false);
  // Selection + transform state for post-placement editing.
  const [selectedId, setSelectedId] = useState(null);
  const [transform, setTransform] = useState(null); // {kind:'move'|'resize'|'rotate', start, originalGeometry, handle?}
  // Stylus-only mode — when on, ignore non-pen pointer input on the canvas.
  const [stylusOnly, setStylusOnly] = useState(false);
  // Trace tool: freehand mode bypasses auto-straighten.
  const [freehandMode, setFreehandMode] = useState(false);
  // Grid editor 3-step state: bbox → tap-to-add cols/rows → Done.
  const [gridDraft, setGridDraft] = useState(null); // {bbox, cols:number[], rows:number[], step:'bbox'|'edit'}
  const canvasRef = useRef(null);
  const logoInputRef = useRef(null);
  const qrInputRef = useRef(null);

  const selectedEl = useMemo(
    () => schema.elements.find((e) => e.id === selectedId) || null,
    [schema.elements, selectedId]
  );

  const scan = template?.scan;
  const work = useMemo(() => workingArea(schema.boundaries), [schema.boundaries]);
  const boundaryCount = ["tl", "tr", "bl", "br"].filter((k) => schema.boundaries[k]).length;

  if (legacy) {
    return (
      <div data-testid="pro-studio-legacy" className="p-2">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="outline" size="sm" onClick={() => setLegacy(false)}
            data-testid="studio-exit-legacy"
            className="h-8 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
            <X className="h-3.5 w-3.5 mr-1" /> Back to Studio
          </Button>
          <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">
            Legacy 6-tool editor
          </span>
        </div>
        <ProMappingEditor template={template} onDone={onDone} onCancel={onCancel} />
      </div>
    );
  }

  if (!scan?.data_url) {
    return <div className="p-6 text-center text-sm">Capture a scan first.</div>;
  }

  /* ------------------- pointer → normalized coord ------------------- */
  // Resolves coords against the listener's currentTarget so the same
  // handlers can be attached to either the mapping canvas OR the
  // preview canvas — both use the 0..1 normalized coordinate space.
  const canvasPt = (e) => {
    const r = (e.currentTarget || canvasRef.current)?.getBoundingClientRect();
    if (!r) return null;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  /* ------------------- element mutation ------------------- */
  const pushElement = (kind, geometry, extra = {}) => {
    const el = { id: uid(), kind, geometry, created_at: Date.now(), ...extra };
    setSchema((s) => ({ ...s, elements: [...s.elements, el] }));
    setDraft(null);
    return el;
  };

  const undo = () => {
    if (draft) { setDraft(null); return; }
    setSchema((s) => ({ ...s, elements: s.elements.slice(0, -1) }));
  };

  const delElement = (id) => setSchema((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) }));

  const setBoundary = (corner, pt) => {
    setSchema((s) => ({ ...s, boundaries: { ...s.boundaries, [corner]: pt } }));
  };

  /* ------------------- pointer handlers ------------------- */
  const onPointerDown = (e) => {
    // Stylus-only mode — block non-pen input on the canvas.
    if (stylusOnly && e.pointerType !== "pen") return;
    e.preventDefault();
    const pt = canvasPt(e);
    if (!pt) return;

    /* SELECT TOOL — tap to select, drag handles to resize/rotate, drag body to move. */
    if (tool === "select") {
      // Hit-test handle first if an element is selected.
      // Hit-area scales inversely with zoom so handles meet WCAG 24px
      // touch-target at any zoom (e.g. at 0.5× the area doubles).
      if (selectedEl && !selectedEl.locked) {
        const bbox = elementBBox(selectedEl);
        const handles = bboxHandles(bbox);
        const handleR = 0.018 / zoom;
        for (const [hKey, hPt] of Object.entries(handles)) {
          if (Math.abs(pt.x - hPt.x) < handleR && Math.abs(pt.y - hPt.y) < handleR) {
            setTransform({ kind: "resize", handle: hKey, originalBBox: bbox, originalGeometry: selectedEl.geometry });
            return;
          }
        }
        // Rotate handle (above top-center)
        const rotPt = { x: bbox.x + bbox.w / 2, y: bbox.y - 0.04 };
        if (Math.abs(pt.x - rotPt.x) < handleR && Math.abs(pt.y - rotPt.y) < handleR * 1.5) {
          setTransform({ kind: "rotate", center: { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 },
            startAngle: Math.atan2(pt.y - (bbox.y + bbox.h / 2), pt.x - (bbox.x + bbox.w / 2)) * 180 / Math.PI,
            originalRotation: selectedEl.rotation || 0 });
          return;
        }
      }
      // Hit-test elements top-down (last drawn = on top).
      for (let i = schema.elements.length - 1; i >= 0; i--) {
        const el = schema.elements[i];
        if (hitTest(pt, el)) {
          setSelectedId(el.id);
          if (!el.locked) {
            setTransform({ kind: "move", start: pt, originalGeometry: el.geometry });
          }
          return;
        }
      }
      // Tapped empty area → deselect.
      setSelectedId(null);
      return;
    }

    /* GRID EDITOR — 3-step. Step 1: drag bbox; Step 2: tap inside to add col/row lines. */
    if (tool === "grid") {
      if (!gridDraft) {
        setDraft({ tool: "grid", start: pt, end: pt });
        return;
      }
      if (gridDraft.step === "edit") {
        // Tap inside bbox → add a column line at that x; outside → ignored.
        const b = gridDraft.bbox;
        if (pt.x < b.x || pt.x > b.x + b.w || pt.y < b.y || pt.y > b.y + b.h) return;
        // Determine col vs row by which edge the tap is closer to.
        const distLeft = pt.x - b.x;
        const distRight = (b.x + b.w) - pt.x;
        const distTop = pt.y - b.y;
        const distBot = (b.y + b.h) - pt.y;
        const minH = Math.min(distLeft, distRight);
        const minV = Math.min(distTop, distBot);
        // Tap nearer to L/R edges → add column at pt.x. Nearer to T/B → add row.
        if (minH < minV) {
          setGridDraft({ ...gridDraft, cols: [...gridDraft.cols, (pt.x - b.x) / b.w].sort((a, c) => a - c) });
        } else {
          setGridDraft({ ...gridDraft, rows: [...gridDraft.rows, (pt.y - b.y) / b.h].sort((a, c) => a - c) });
        }
        return;
      }
    }

    if (boundaryCount < 4 && tool !== "boundary") return; // gate non-boundary tools
    switch (tool) {
      case "boundary": {
        const order = ["tl", "tr", "br", "bl"];
        const next = order.find((k) => !schema.boundaries[k]);
        if (!next) return;
        setBoundary(next, pt);
        break;
      }
      case "line":
      case "rect":
      case "circle":
        setDraft({ tool, start: pt, end: pt });
        break;
      case "logo":
      case "qr": {
        const assetKind = tool === "logo" ? "logo" : "qr";
        const assetUrl = schema.assets[assetKind]?.data_url;
        if (!assetUrl) {
          toast.error(`Upload a ${tool.toUpperCase()} in the Assets tab first`);
          return;
        }
        if (placementMode === "fast") {
          pushElement(assetKind === "logo" ? "logo_anchor" : "qr_anchor", {
            mode: "center", center: pt, scale: 0.18,
          });
        } else {
          const prev = draft?.points || [];
          const next = [...prev, pt];
          if (next.length === 4) {
            const xs = next.map((p) => p.x), ys = next.map((p) => p.y);
            pushElement(assetKind === "logo" ? "logo_anchor" : "qr_anchor", {
              mode: "corners",
              corners: next,
              x: Math.min(...xs), y: Math.min(...ys),
              w: Math.max(...xs) - Math.min(...xs),
              h: Math.max(...ys) - Math.min(...ys),
            });
          } else {
            setDraft({ tool, points: next });
          }
        }
        break;
      }
      case "curve":
      case "trace":
        setDraft({ tool, points: [pt] });
        break;
      case "triangle": {
        const prev = draft?.points || [];
        const next = [...prev, pt];
        if (next.length === 3) pushElement("triangle", { points: next });
        else setDraft({ tool, points: next });
        break;
      }
      case "corners": {
        const prev = draft?.points || [];
        const next = [...prev, pt];
        if (next.length === 4) {
          const xs = next.map((p) => p.x), ys = next.map((p) => p.y);
          pushElement("corner_box", {
            x: Math.min(...xs), y: Math.min(...ys),
            w: Math.max(...xs) - Math.min(...xs),
            h: Math.max(...ys) - Math.min(...ys),
            points: next,
          });
        } else {
          setDraft({ tool, points: next });
        }
        break;
      }
      case "text": {
        if (!draft || draft.tool !== "text") {
          setDraft({ tool, start: pt, end: pt });
        }
        break;
      }
      case "bullet": {
        if (!draft || draft.tool !== "bullet") {
          setDraft({ tool, dot: pt });
        } else {
          const text = fieldLabel.trim() || "Bullet text";
          pushElement("bullet", {
            dot: draft.dot, textStart: pt, text,
            fontFamily: fontSel, fontSize: 13,
          });
          setFieldLabel("");
        }
        break;
      }
      default: break;
    }
  };

  const onPointerMove = (e) => {
    if (stylusOnly && e.pointerType !== "pen") return;
    const pt = canvasPt(e);
    if (!pt) return;
    // Active transform drag — move/resize/rotate the selected element live.
    if (transform && selectedEl) {
      if (transform.kind === "move") {
        // Snap delta to boundaries when within threshold.
        const snapped = snapToBoundaries(pt, schema.boundaries, 0.025);
        const target = snapped.snapped ? snapped : pt;
        const dx = target.x - transform.start.x;
        const dy = target.y - transform.start.y;
        updateElementGeometry(selectedEl.id,
          translateGeometry(selectedEl.kind, transform.originalGeometry, dx, dy));
      } else if (transform.kind === "resize") {
        const newBBox = resizedBBox(transform.originalBBox, transform.handle, pt);
        updateElementGeometry(selectedEl.id,
          resizeGeometry(selectedEl.kind, transform.originalGeometry, transform.handle, newBBox));
      } else if (transform.kind === "rotate") {
        const angle = Math.atan2(pt.y - transform.center.y, pt.x - transform.center.x) * 180 / Math.PI;
        const delta = angle - transform.startAngle;
        updateElementRotation(selectedEl.id, transform.originalRotation + delta);
      }
      return;
    }
    // Track hover for ghost-asset preview (logo/qr fast mode only).
    if ((tool === "logo" || tool === "qr") && placementMode === "fast") {
      setHoverPt(pt);
    } else if (hoverPt) {
      setHoverPt(null);
    }
    if (!draft) return;
    if (["line", "rect", "circle", "grid", "text"].includes(draft.tool)) {
      setDraft({ ...draft, end: pt });
    } else if (["curve", "trace"].includes(draft.tool)) {
      setDraft({ ...draft, points: [...draft.points, pt] });
    }
  };

  const onPointerUp = (e) => {
    if (stylusOnly && e?.pointerType && e.pointerType !== "pen") return;
    // Finish transform drag.
    if (transform) { setTransform(null); return; }
    if (!draft) return;
    const d = draft;
    if (["triangle", "corners", "bullet", "logo", "qr"].includes(d.tool)) return;
    if (d.tool === "line" && d.start && d.end) {
      if (dist(d.start, d.end) > 0.01) pushElement("line", { from: d.start, to: d.end });
      else setDraft(null);
    } else if (d.tool === "rect" && d.start && d.end) {
      const r = normRect(d.start.x, d.start.y, d.end.x, d.end.y);
      if (r.w > 0.01 && r.h > 0.01) pushElement("rect", r);
      else setDraft(null);
    } else if (d.tool === "circle" && d.start && d.end) {
      const r = dist(d.start, d.end);
      if (r > 0.012) pushElement("circle", { cx: d.start.x, cy: d.start.y, r });
      else setDraft(null);
    } else if (d.tool === "grid" && d.start && d.end) {
      const r = normRect(d.start.x, d.start.y, d.end.x, d.end.y);
      if (r.w > 0.02 && r.h > 0.02) {
        // Enter grid edit mode — driver taps inside to add col/row lines.
        setGridDraft({ bbox: r, cols: [], rows: [], step: "edit" });
        setDraft(null);
      } else { setDraft(null); }
    } else if (d.tool === "curve" && d.points?.length > 2) {
      const cleaned = cleanTrace(d.points, { tolerance: 0.004 });
      pushElement("curve", { points: cleaned.points, d: cleaned.d });
    } else if (d.tool === "trace" && d.points?.length > 2) {
      const cleaned = cleanTrace(d.points, { tolerance: 0.002 });
      // Auto-straighten: if the cleaned stroke is near a straight line
      // AND freehand mode is OFF, commit as a true line element instead
      // of a free-form trace path.
      if (!freehandMode && isNearStraight(cleaned.points, 0.012)) {
        pushElement("line", { from: cleaned.points[0], to: cleaned.points[cleaned.points.length - 1] });
      } else {
        const xs = cleaned.points.map((p) => p.x), ys = cleaned.points.map((p) => p.y);
        const bbox = {
          x: Math.min(...xs), y: Math.min(...ys),
          w: Math.max(...xs) - Math.min(...xs),
          h: Math.max(...ys) - Math.min(...ys),
        };
        pushElement("trace", { paths: [cleaned.d], points: cleaned.points, bbox, strokeWidth: 0.006 });
      }
    } else if (d.tool === "text" && d.start && d.end) {
      const fieldName = fieldLabel.trim();
      if (!fieldName) {
        toast.error("Enter the field name first (e.g. 'Driver ID')");
        setDraft(null);
        return;
      }
      pushElement("text_marker", {
        from: d.start, to: d.end,
        align: "left", fontFamily: fontSel, fontSize: 12,
        fieldName, value: fieldName,
      });
      setFieldLabel("");
    } else if (["triangle", "corners", "bullet", "logo", "qr"].includes(d.tool)) {
      // Unreachable — guarded above. Documentation anchor.
    } else {
      setDraft(null);
    }
  };

  /* ------------------- selection helpers ------------------- */
  const updateElementGeometry = (id, newGeometry) => {
    setSchema((s) => ({
      ...s,
      elements: s.elements.map((el) => el.id === id ? { ...el, geometry: newGeometry } : el),
    }));
  };
  const updateElementRotation = (id, rotation) => {
    setSchema((s) => ({
      ...s,
      elements: s.elements.map((el) => el.id === id ? { ...el, rotation } : el),
    }));
  };
  const toggleLockSelected = () => {
    if (!selectedEl) return;
    setSchema((s) => ({
      ...s,
      elements: s.elements.map((el) => el.id === selectedId ? { ...el, locked: !el.locked } : el),
    }));
  };
  const deleteSelected = () => {
    if (!selectedEl) return;
    delElement(selectedId);
    setSelectedId(null);
  };

  /* ------------------- grid editor commit ------------------- */
  const commitGridEdit = () => {
    if (!gridDraft) return;
    const { bbox, cols, rows } = gridDraft;
    pushElement("grid", { ...bbox, colLines: cols, rowLines: rows,
      cols: cols.length + 1, rows: rows.length + 1 });
    setGridDraft(null);
  };
  const cancelGridEdit = () => setGridDraft(null);

  /* ------------------- asset uploads ------------------- */
  const onLogoFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSchema((s) => ({ ...s, assets: { ...s.assets, logo: { data_url: reader.result, kind: "image" } } }));
      toast.success("Logo uploaded");
    };
    reader.readAsDataURL(f);
  };

  const onQrFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSchema((s) => ({ ...s, assets: { ...s.assets, qr: { data_url: reader.result } } }));
      toast.success("QR uploaded");
    };
    reader.readAsDataURL(f);
  };

  /* ------------------- save & lock ------------------- */
  const commitSave = async (lock) => {
    if (!schema.elements.length) { toast.error("Draw at least one element"); return; }
    setSaving(true);
    try {
      const updated = {
        ...template,
        schema: { ...schema, locked: !!lock },
        updated_at: new Date().toISOString(),
      };
      await saveTemplate(updated);
      await setActiveTemplateId(updated.id);
      toast.success(lock ? "Template locked" : "Template saved");
      onDone?.(updated);
    } catch (err) {
      toast.error(`Save failed: ${err?.message || err}`);
    } finally { setSaving(false); }
  };

  /* ------------------- render ------------------- */
  return (
    <div className="flex flex-col min-h-[calc(100vh-96px)]" data-testid="pro-studio">
      {/* Toolbar */}
      <div className="border-b border-[var(--tm-border)] bg-white sticky top-0 z-10">
        <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--tm-orange)] mr-1">Studio</span>
          <Button variant="outline" size="sm" onClick={() => setLegacy(true)}
            data-testid="studio-toggle-legacy"
            className="h-7 text-[10px] bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
            <Layers className="h-3 w-3 mr-1" /> Use Legacy Editor
          </Button>
          <Button variant="outline" size="sm"
            data-testid="studio-handedness"
            onClick={() => setHandedness((h) => h === "right" ? "left" : "right")}
            title={handedness === "right" ? "Switch to left-handed (mapping on left)" : "Switch to right-handed (mapping on right)"}
            className="h-7 text-[10px] bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
            <ArrowLeftRight className="h-3 w-3 mr-1" />
            {handedness === "right" ? "Right-handed" : "Left-handed"}
          </Button>
          <div className="inline-flex rounded-md border border-[var(--tm-border)] overflow-hidden" data-testid="studio-zoom">
            <button type="button" data-testid="studio-zoom-out"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              className="h-7 px-2 text-[11px] font-bold bg-white text-[var(--tm-navy)] hover:bg-[var(--tm-surface)]"
              aria-label="Zoom out">−</button>
            <span className="h-7 px-2 text-[10px] font-bold bg-[var(--tm-surface)] text-[var(--tm-navy)] flex items-center min-w-[42px] justify-center"
              data-testid="studio-zoom-level">{Math.round(zoom * 100)}%</span>
            <button type="button" data-testid="studio-zoom-in"
              onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.25).toFixed(2)))}
              className="h-7 px-2 text-[11px] font-bold bg-white text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] border-l border-[var(--tm-border)]"
              aria-label="Zoom in">+</button>
          </div>
          <Button variant="outline" size="sm"
            data-testid="studio-ghost-overlay"
            onClick={() => setGhostOverlay((g) => !g)}
            title="Overlay preview faintly on top of mapping canvas to verify alignment"
            className={`h-7 text-[10px] border-[var(--tm-border)] ${
              ghostOverlay ? "bg-[var(--tm-blue)] text-white" : "bg-white text-[var(--tm-navy)]"}`}>
            <Eye className="h-3 w-3 mr-1" /> Ghost Overlay
          </Button>
          {(tool === "logo" || tool === "qr") && (
            <div className="inline-flex rounded-md border border-[var(--tm-border)] overflow-hidden" data-testid="studio-placement-mode">
              <button type="button"
                data-testid="studio-placement-fast"
                onClick={() => { setPlacementMode("fast"); setDraft(null); }}
                className={`h-7 px-2 text-[10px] uppercase tracking-wider font-bold inline-flex items-center gap-1 ${
                  placementMode === "fast" ? "bg-[var(--tm-blue)] text-white" : "bg-white text-[var(--tm-navy)]"}`}>
                <Target className="h-3 w-3" /> Fast · 1 tap
              </button>
              <button type="button"
                data-testid="studio-placement-precise"
                onClick={() => { setPlacementMode("precise"); setDraft(null); }}
                className={`h-7 px-2 text-[10px] uppercase tracking-wider font-bold inline-flex items-center gap-1 border-l border-[var(--tm-border)] ${
                  placementMode === "precise" ? "bg-[var(--tm-blue)] text-white" : "bg-white text-[var(--tm-navy)]"}`}>
                <Maximize2 className="h-3 w-3" /> Precise · 4 corners
              </button>
            </div>
          )}
          {tool === "trace" && (
            <Button variant="outline" size="sm"
              data-testid="studio-freehand-toggle"
              onClick={() => setFreehandMode((f) => !f)}
              title="Freehand mode preserves your raw stroke (skip auto-straighten)"
              className={`h-7 text-[10px] border-[var(--tm-border)] ${
                freehandMode ? "bg-[var(--tm-blue)] text-white" : "bg-white text-[var(--tm-navy)]"}`}>
              <Pen className="h-3 w-3 mr-1" /> {freehandMode ? "Freehand" : "Auto-straighten"}
            </Button>
          )}
          <Button variant="outline" size="sm"
            data-testid="studio-stylus-only"
            onClick={() => setStylusOnly((s) => !s)}
            title="Block finger touches — only stylus nib draws"
            className={`h-7 text-[10px] border-[var(--tm-border)] ${
              stylusOnly ? "bg-[var(--tm-blue)] text-white" : "bg-white text-[var(--tm-navy)]"}`}>
            <Pen className="h-3 w-3 mr-1" /> Stylus only
          </Button>
          {gridDraft?.step === "edit" && (
            <div className="inline-flex items-center gap-1" data-testid="studio-grid-editor">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-blue)]">
                Grid: {gridDraft.cols.length} cols · {gridDraft.rows.length} rows
              </span>
              <Button size="sm"
                data-testid="studio-grid-done"
                onClick={commitGridEdit}
                className="h-7 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white text-[10px] font-bold">
                Done
              </Button>
              <Button variant="outline" size="sm"
                data-testid="studio-grid-cancel"
                onClick={cancelGridEdit}
                className="h-7 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] text-[10px]">
                Cancel
              </Button>
            </div>
          )}
        </div>
        <div className="px-3 pb-2 flex items-center gap-1 overflow-x-auto" data-testid="studio-toolbar">
          {STUDIO_TOOLS.map((t) => {
            const Icon = TOOL_ICON[t.id] || Square;
            const active = tool === t.id;
            // 'select' is always enabled. All other tools require the
            // 4 boundary anchors first; 'boundary' itself is the entry.
            const disabled = !["select", "boundary"].includes(t.id) && boundaryCount < 4;
            return (
              <button
                key={t.id} type="button"
                data-testid={`studio-tool-${t.id}`}
                onClick={() => { setTool(t.id); setDraft(null); setSelectedId(null); setGridDraft(null); }}
                disabled={disabled}
                title={t.blurb + (disabled ? " · place all 4 anchors first" : "")}
                className={`shrink-0 h-9 px-2.5 rounded-md text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1 border ${
                  active ? "bg-[var(--tm-orange)] text-white border-[var(--tm-orange)]"
                  : disabled ? "bg-[var(--tm-surface)] text-[var(--tm-text-muted)] border-[var(--tm-border)] opacity-40"
                  : "bg-white text-[var(--tm-navy)] border-[var(--tm-border)] hover:bg-[var(--tm-surface)]"}`}
              >
                <Icon className="h-3 w-3" /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
          <input
            data-testid="studio-field-input"
            placeholder={(tool === "text" || tool === "bullet") ? "Field name (e.g. Driver ID)" : "Optional label"}
            value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)}
            list="studio-field-presets"
            className="h-8 flex-1 min-w-[140px] px-2 text-xs bg-white border border-[var(--tm-border)] rounded-md text-[var(--tm-navy)]"
          />
          <datalist id="studio-field-presets">
            {STUDIO_FIELD_PRESETS.map((p) => <option key={p} value={p} />)}
          </datalist>
          <select
            data-testid="studio-font-select"
            value={fontSel} onChange={(e) => setFontSel(e.target.value)}
            className="h-8 px-2 text-xs bg-white border border-[var(--tm-border)] rounded-md text-[var(--tm-navy)] font-bold"
          >
            {FONT_PRESETS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={undo}
            data-testid="studio-undo"
            disabled={!draft && !schema.elements.length}
            className="h-8 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
          </Button>
        </div>
        <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold flex items-center gap-1.5 flex-wrap">
          <SlidersHorizontal className="h-3 w-3 text-[var(--tm-blue)]" />
          {tool === "boundary"
            ? `Place page anchors (${boundaryCount}/4) · order: TL → TR → BR → BL`
            : STUDIO_TOOLS.find((t) => t.id === tool)?.blurb}
          {boundaryCount < 4 && tool !== "boundary" && (
            <span className="text-[var(--tm-orange)]">· Place all 4 anchors first</span>
          )}
        </div>
      </div>

      {/* DUAL FULL-SIZE CANVASES — same dimensions (8.5×11), same coordinate
           space, side-by-side. The mapping canvas is interactive (input
           only); the preview canvas is read-only output. Both scale
           together via the zoom control above so coordinates stay 1:1. */}
      <div className="flex-1 overflow-auto p-3 bg-[var(--tm-surface)]">
        <div
          data-testid="studio-split"
          className={`mx-auto flex flex-col gap-4 ${handedness === "right" ? "lg:flex-row" : "lg:flex-row-reverse"}`}
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top center",
            width: "fit-content",
          }}
        >
          {/* Mapping canvas — full 8.5×11 with the scan stretched to fill */}
          <section data-testid="studio-mapping-pane" className="flex flex-col items-center">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--tm-blue)] mb-1.5 flex items-center gap-1.5 self-start">
              <Target className="h-3 w-3" /> Mapping · tap to mark
            </div>
            <div
              ref={canvasRef}
              data-testid="studio-canvas"
              className="relative select-none border-2 border-[var(--tm-blue)] rounded-md overflow-hidden bg-white shadow-md touch-none"
              style={{ width: 540, aspectRatio: "8.5 / 11", cursor: "crosshair" }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              onPointerLeave={() => setHoverPt(null)}
            >
              {/* Scan fills the 8.5:11 frame (object-fit: fill) so a tap at
                  canvas (x,y) IS the same coordinate that the preview
                  canvas uses — exact 1:1 correspondence per spec. */}
              <img src={scan.data_url} alt={template.name} draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }} />
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                {Object.entries(schema.boundaries).map(([corner, pt]) => pt && (
                  <circle key={corner} cx={pt.x} cy={pt.y} r="0.012" fill="rgba(12,74,183,0.9)" stroke="white" strokeWidth="0.003" />
                ))}
                {work.complete && (
                  <rect x={work.x} y={work.y} width={work.w} height={work.h}
                    fill="none" stroke="rgba(12,74,183,0.35)" strokeWidth="0.002" strokeDasharray="0.006 0.004" />
                )}
                {schema.elements.map((el) => (
                  <g key={el.id} transform={el.rotation
                    ? `rotate(${el.rotation} ${elementBBox(el).x + elementBBox(el).w / 2} ${elementBBox(el).y + elementBBox(el).h / 2})`
                    : undefined}>
                    <MarkupOverlay el={el} />
                  </g>
                ))}
                {/* Selection outline + 8 handles + rotate handle */}
                {selectedEl && tool === "select" && <SelectionFrame el={selectedEl} zoom={zoom} />}
                {/* Grid edit overlay — show bbox + tapped lines */}
                {gridDraft?.step === "edit" && <GridEditOverlay gridDraft={gridDraft} />}
                {draft && <DraftOverlay draft={draft} />}
              </svg>
              {/* Hover ghost (logo/QR fast mode) */}
              {hoverPt && (tool === "logo" || tool === "qr") && placementMode === "fast" && schema.assets[tool === "logo" ? "logo" : "qr"]?.data_url && (
                <div data-testid={`studio-ghost-${tool}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${hoverPt.x * 100}%`, top: `${hoverPt.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                    width: "18%", aspectRatio: "1 / 1",
                    opacity: 0.35,
                  }}>
                  <img src={schema.assets[tool === "logo" ? "logo" : "qr"].data_url}
                    alt="ghost" className="w-full h-full object-contain" draggable={false} />
                </div>
              )}
              {/* Boundary anchor labels */}
              <div className="absolute inset-0 pointer-events-none">
                {Object.entries(schema.boundaries).map(([corner, pt]) => pt && (
                  <span key={corner} style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                    className="absolute -translate-x-1/2 -translate-y-[130%] text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-[var(--tm-blue)] text-white">
                    {corner.toUpperCase()}
                  </span>
                ))}
              </div>
              {/* Selection action bar — Lock / Unlock / Delete */}
              {selectedEl && tool === "select" && (() => {
                const bb = elementBBox(selectedEl);
                return (
                  <div data-testid="studio-selection-actions"
                    className="absolute flex gap-1 bg-white border border-[var(--tm-border)] rounded-md p-1 shadow-md"
                    style={{
                      left: `${(bb.x + bb.w) * 100}%`,
                      top: `${bb.y * 100}%`,
                      transform: "translate(8px, -100%)",
                      pointerEvents: "auto",
                    }}>
                    <button type="button" onClick={toggleLockSelected}
                      data-testid="studio-selection-lock"
                      title={selectedEl.locked ? "Unlock" : "Lock"}
                      className="h-6 w-6 inline-flex items-center justify-center text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded">
                      {selectedEl.locked ? <Lock className="h-3 w-3 text-[var(--tm-orange)]" /> : <Unlock className="h-3 w-3" />}
                    </button>
                    <button type="button" onClick={deleteSelected}
                      data-testid="studio-selection-delete"
                      title="Delete"
                      className="h-6 w-6 inline-flex items-center justify-center text-[#FF3B30] hover:bg-[#FFF0F0] rounded">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })()}
              {/* Optional ghost overlay — preview faintly on top of mapping */}
              {ghostOverlay && (
                <div data-testid="studio-ghost-overlay-render"
                  className="absolute inset-0 pointer-events-none"
                  style={{ opacity: 0.32 }}>
                  <CleanReconstructionCanvas schema={schema} session={null} width={540} />
                </div>
              )}
            </div>
          </section>

          {/* Preview canvas — same dimensions, read-only output */}
          <section data-testid="studio-preview-pane" className="flex flex-col items-center">
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--tm-orange)] mb-1.5 flex items-center gap-1.5 self-start">
              <Eye className="h-3 w-3" /> Preview · live output {tool === "select" && <span className="text-[var(--tm-blue)]">· editable</span>}
            </div>
            <div
              data-testid="studio-preview-canvas"
              className="relative border-2 border-[var(--tm-orange)] rounded-md overflow-hidden bg-white shadow-md touch-none"
              style={{ width: 540, aspectRatio: "8.5 / 11", cursor: tool === "select" ? "crosshair" : "default" }}
              onPointerDown={tool === "select" ? onPointerDown : undefined}
              onPointerMove={tool === "select" ? onPointerMove : undefined}
              onPointerUp={tool === "select" ? onPointerUp : undefined}
            >
              <CleanReconstructionCanvas schema={schema} session={null} width={540} />
              {/* Editable overlay — visible & interactive only when Select tool is active.
                   Uses the same 0..1 normalized coords as the mapping canvas, so the
                   shared SelectionFrame + transform math works identically here. */}
              {tool === "select" && (
                <>
                  <svg viewBox="0 0 1 1" preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none">
                    {selectedEl && <SelectionFrame el={selectedEl} zoom={zoom} />}
                  </svg>
                  {selectedEl && (() => {
                    const bb = elementBBox(selectedEl);
                    return (
                      <div data-testid="studio-preview-selection-actions"
                        className="absolute flex gap-1 bg-white border border-[var(--tm-border)] rounded-md p-1 shadow-md"
                        style={{
                          left: `${(bb.x + bb.w) * 100}%`,
                          top: `${bb.y * 100}%`,
                          transform: "translate(8px, -100%)",
                        }}>
                        <button type="button" onClick={toggleLockSelected}
                          data-testid="studio-preview-selection-lock"
                          title={selectedEl.locked ? "Unlock" : "Lock"}
                          className="h-6 w-6 inline-flex items-center justify-center text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded">
                          {selectedEl.locked ? <Lock className="h-3 w-3 text-[var(--tm-orange)]" /> : <Unlock className="h-3 w-3" />}
                        </button>
                        <button type="button" onClick={deleteSelected}
                          data-testid="studio-preview-selection-delete"
                          title="Delete"
                          className="h-6 w-6 inline-flex items-center justify-center text-[#FF3B30] hover:bg-[#FFF0F0] rounded">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
        data-testid="studio-logo-file" onChange={onLogoFile} />
      <input ref={qrInputRef} type="file" accept="image/*" className="hidden"
        data-testid="studio-qr-file" onChange={onQrFile} />

      {/* Bottom dock — Inspector + Assets, collapsible */}
      <div className="border-t border-[var(--tm-border)] bg-white" data-testid="studio-dock">
        <div className="flex items-center px-3 py-1.5 gap-2 border-b border-[var(--tm-border)]">
          <button type="button"
            data-testid={`studio-dock-tab-inspector`}
            onClick={() => { setDockTab("inspector"); setDockOpen(true); }}
            className={`h-7 px-2.5 text-[10px] uppercase tracking-wider font-bold rounded-md inline-flex items-center gap-1 ${
              dockOpen && dockTab === "inspector" ? "bg-[var(--tm-orange)] text-white" : "bg-[var(--tm-surface)] text-[var(--tm-navy)]"}`}>
            <SlidersHorizontal className="h-3 w-3" /> Inspector ({schema.elements.length})
          </button>
          <button type="button"
            data-testid={`studio-dock-tab-assets`}
            onClick={() => { setDockTab("assets"); setDockOpen(true); }}
            className={`h-7 px-2.5 text-[10px] uppercase tracking-wider font-bold rounded-md inline-flex items-center gap-1 ${
              dockOpen && dockTab === "assets" ? "bg-[var(--tm-orange)] text-white" : "bg-[var(--tm-surface)] text-[var(--tm-navy)]"}`}>
            <ImageIcon className="h-3 w-3" /> Assets
            {schema.assets.logo?.data_url && <span className="text-[8px] ml-1">·LOGO</span>}
            {schema.assets.qr?.data_url && <span className="text-[8px] ml-1">·QR</span>}
          </button>
          <div className="flex-1" />
          <button type="button"
            data-testid="studio-dock-toggle"
            onClick={() => setDockOpen((o) => !o)}
            className="h-7 px-2 text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-soft)] hover:text-[var(--tm-navy)]">
            {dockOpen ? "Hide" : "Show"}
          </button>
        </div>
        {dockOpen && (
          <div className="max-h-[200px] overflow-y-auto p-3" data-testid={`studio-dock-pane-${dockTab}`}>
            {dockTab === "inspector"
              ? <InspectorPane schema={schema} onDelete={delElement} />
              : <AssetsPane schema={schema} onLogoPick={() => logoInputRef.current?.click()} onQrPick={() => qrInputRef.current?.click()} />}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-[var(--tm-border)] p-3 flex items-center gap-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <Button variant="outline" onClick={onCancel} disabled={saving}
          data-testid="studio-cancel"
          className="h-11 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <div className="flex-1 text-[11px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold" data-testid="studio-count">
          {schema.elements.length} element{schema.elements.length === 1 ? "" : "s"} · anchors {boundaryCount}/4
        </div>
        <Button onClick={() => commitSave(false)} disabled={saving || !schema.elements.length}
          data-testid="studio-save"
          variant="outline"
          className="h-11 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
          <Save className="h-4 w-4 mr-1" /> Save
        </Button>
        <Button onClick={() => commitSave(true)} disabled={saving || !schema.elements.length || boundaryCount < 4}
          data-testid="studio-lock"
          className="h-11 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold">
          <Lock className="h-4 w-4 mr-1" /> Lock Template
        </Button>
      </div>
    </div>
  );
}

function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

/**
 * Renders the selection outline + 8 resize handles + rotate handle
 * for the currently selected element. Pure SVG, pointer-events:none
 * on the parent so handle hit-testing happens via onPointerDown
 * coordinate math (consistent with the rest of the canvas).
 */
function SelectionFrame({ el, zoom = 1 }) {
  const bb = elementBBox(el);
  const cx = bb.x + bb.w / 2;
  const cy = bb.y + bb.h / 2;
  const handles = bboxHandles(bb);
  const rotPt = { x: cx, y: bb.y - 0.04 };
  const stroke = el.locked ? "rgba(255,95,21,0.9)" : "rgba(12,74,183,0.95)";
  // Handle visual size scales inversely with zoom so the rendered
  // square stays a constant ~24px across all zoom levels (matching
  // the hit-area which scales the same way in onPointerDown).
  const hSize = 0.018 / zoom;
  const hHalf = hSize / 2;
  const rotR = 0.012 / zoom;
  const stroke_w = 0.0028 / Math.max(zoom, 1); // keep outline crisp at zoom-out
  return (
    <g
      data-testid="studio-selection-frame"
      transform={el.rotation ? `rotate(${el.rotation} ${cx} ${cy})` : undefined}
    >
      <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h}
        fill="none" stroke={stroke} strokeWidth={0.0024 / Math.max(zoom, 1)} strokeDasharray="0.007 0.004" />
      {!el.locked && Object.entries(handles).map(([key, p]) => (
        <rect key={key} data-testid={`studio-handle-${key}`}
          x={p.x - hHalf} y={p.y - hHalf} width={hSize} height={hSize}
          fill="white" stroke={stroke} strokeWidth={stroke_w} />
      ))}
      {!el.locked && (
        <>
          <line x1={cx} y1={bb.y} x2={cx} y2={rotPt.y + rotR} stroke={stroke} strokeWidth={0.002 / Math.max(zoom, 1)} />
          <circle data-testid="studio-handle-rotate"
            cx={rotPt.x} cy={rotPt.y} r={rotR}
            fill="white" stroke={stroke} strokeWidth={stroke_w} />
        </>
      )}
    </g>
  );
}

/** Renders the grid editor overlay during step='edit' — bbox + tapped lines. */
function GridEditOverlay({ gridDraft }) {
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

function MarkupOverlay({ el }) {
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

function DraftOverlay({ draft }) {
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

/* ========================== Right-pane renderers ========================== */

function InspectorPane({ schema, onDelete }) {
  if (!schema.elements.length) {
    return <div className="text-xs text-[var(--tm-text-muted)] uppercase tracking-wider font-bold">
      Place the 4 page anchors, then start drawing — elements will list here.
    </div>;
  }
  return (
    <ul className="space-y-2" data-testid="studio-inspector-list">
      {schema.elements.map((el, i) => (
        <li key={el.id} data-testid={`studio-inspector-row-${i}`}
          className="border border-[var(--tm-border)] rounded-md p-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider font-bold text-[var(--tm-orange)]">{el.kind.replace("_", " ")}</div>
              <div className="text-xs font-bold text-[var(--tm-navy)] truncate">
                {el.geometry.fieldName || el.geometry.text || el.kind}
              </div>
              {el.geometry.fontFamily && (
                <div className="text-[9px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold">
                  {FONT_PRESETS_BY_ID[el.geometry.fontFamily]?.label || el.geometry.fontFamily}
                </div>
              )}
            </div>
            <button type="button" onClick={() => onDelete(el.id)}
              data-testid={`studio-inspector-del-${i}`}
              className="text-[var(--tm-text-soft)] hover:text-[#FF3B30] p-1 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AssetsPane({ schema, onLogoPick, onQrPick }) {
  return (
    <div className="space-y-3" data-testid="studio-assets">
      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-muted)] mb-1">Logo image (optional)</div>
        {schema.assets.logo?.data_url ? (
          <div className="border border-[var(--tm-border)] rounded-md p-2 flex items-center gap-2">
            <img src={schema.assets.logo.data_url} alt="logo" className="h-12 w-12 object-contain" />
            <Button size="sm" variant="outline" onClick={onLogoPick}
              data-testid="studio-logo-change"
              className="h-8 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
              Replace
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={onLogoPick}
            data-testid="studio-logo-upload"
            className="h-10 w-full bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
            <ImageIcon className="h-3.5 w-3.5 mr-1" /> Upload logo
          </Button>
        )}
        <div className="text-[9px] uppercase tracking-wider text-[var(--tm-text-muted)] mt-1">
          Or use the Custom Trace tool to hand-draw the logo on the scan.
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--tm-text-muted)] mb-1">QR code image</div>
        {schema.assets.qr?.data_url ? (
          <div className="border border-[var(--tm-border)] rounded-md p-2 flex items-center gap-2">
            <img src={schema.assets.qr.data_url} alt="qr" className="h-12 w-12 object-contain" />
            <Button size="sm" variant="outline" onClick={onQrPick}
              data-testid="studio-qr-change"
              className="h-8 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
              Replace
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={onQrPick}
            data-testid="studio-qr-upload"
            className="h-10 w-full bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
            <QrIcon className="h-3.5 w-3.5 mr-1" /> Upload QR
          </Button>
        )}
      </div>
    </div>
  );
}

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
        {els.map((el) => <CleanTextLayer key={el.id} el={el} ws={ws} px={px} session={session} fontFamilyOf={fontFamilyOf} />)}
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
function CleanTextLayer({ el, ws, px, session, fontFamilyOf }) {
  const g = el.geometry;
  const style = (extra = {}) => ({
    position: "absolute",
    color: "#0E1F47",
    fontFamily: fontFamilyOf(g.fontFamily),
    fontWeight: 600,
    whiteSpace: "nowrap",
    ...extra,
  });
  if (el.kind === "text_marker") {
    const start = px(ws(g.from));
    const value = valueForField(g.fieldName, session) || g.fieldName || "";
    return (
      <div data-testid={`clean-field-${g.fieldName || el.id}`}
        style={style({ left: start.x, top: start.y - (g.fontSize || 12),
          fontSize: (g.fontSize || 12) * 1.05 })}>
        {value}
      </div>
    );
  }
  if (el.kind === "bullet") {
    const t = px(ws(g.textStart));
    return (
      <div style={style({ left: t.x + 6, top: t.y - (g.fontSize || 13),
        fontSize: (g.fontSize || 13) * 1.02, whiteSpace: "normal", maxWidth: 520 })}>
        {g.text}
      </div>
    );
  }
  if (el.kind === "text_region" && g.content) {
    const p = px(ws({ x: g.x, y: g.y }));
    return (
      <div style={style({ left: p.x, top: p.y, fontSize: g.fontSize || 12, whiteSpace: "pre-wrap", maxWidth: 520 })}>
        {g.content}
      </div>
    );
  }
  return null;
}

/** Pull a value from the session for a given field name. */
function valueForField(name, session) {
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
