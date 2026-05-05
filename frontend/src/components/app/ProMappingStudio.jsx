import React, { useMemo, useRef, useState, forwardRef, useReducer } from "react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import {
  Crosshair, Minus, Square, Circle as CircleIcon, Triangle, Spline, Grid3x3,
  AlignLeft, Dot as DotIcon, Image as ImageIcon, QrCode as QrIcon, PenTool,
  Undo2, Trash2, Save, Lock, Unlock, X, Eye, SlidersHorizontal,
  Target, MousePointer2, RotateCw, Pen, Hand,
} from "lucide-react";
import {
  STUDIO_TOOLS, FONT_PRESETS, FONT_PRESETS_BY_ID, STUDIO_FIELD_PRESETS,
  emptyStudioSchema, uid, normRect, workingArea, cleanTrace, isNearStraight,
  hitTest, snapToBoundaries, snapToOcrLine, translateGeometry, resizeGeometry,
  bboxHandles, resizedBBox, elementBBox, validateSchema,
} from "../../lib/pro-mapping-v2";
import { saveTemplate, setActiveTemplateId } from "../../lib/template-store";
import ProMappingEditor from "./ProMappingEditor";
import CustomFontBuilder, { CustomFontText } from "./CustomFontBuilder";
import StudioRibbon from "./StudioRibbon";

const TOOL_ICON = {
  select: MousePointer2,
  pan: Hand,
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
/**
 * Editor state reducer. Owns BOTH the live schema AND the undo/redo
 * history in a single atomic store so transitions are pure and
 * race-free.
 *
 * Actions:
 *   SET_SCHEMA  — transient write; updater(state.schema) → schema. No
 *                 history push. Used during in-flight transform drags
 *                 where the pointerdown already snapshotted history.
 *   MUTATE      — undoable write; pushes the CURRENT schema to past,
 *                 drops future, applies updater. The single
 *                 entry-point for user-visible edits.
 *   SNAPSHOT    — pushes the current schema to past without changing
 *                 it. Called at pointer-down before a transform so
 *                 one Undo rewinds the whole drag.
 *   UNDO / REDO — pure history navigation. Past/future capped at 50.
 */
function editorReducer(state, action) {
  switch (action.type) {
    case "SET_SCHEMA": {
      const next = typeof action.updater === "function" ? action.updater(state.schema) : action.updater;
      return { ...state, schema: next };
    }
    case "MUTATE": {
      const next = typeof action.updater === "function" ? action.updater(state.schema) : action.updater;
      return {
        schema: next,
        past: [...state.past.slice(-49), state.schema],
        future: [],
      };
    }
    case "SNAPSHOT": {
      return { ...state, past: [...state.past.slice(-49), state.schema], future: [] };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        schema: prev,
        past: state.past.slice(0, -1),
        future: [state.schema, ...state.future].slice(0, 50),
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        schema: next,
        past: [...state.past, state.schema].slice(-50),
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}

export default function ProMappingStudio({ template, analysis, onDone, onCancel }) {
  const [legacy, setLegacy] = useState(false);
  const [editor, dispatchEditor] = useReducer(editorReducer, undefined, () => ({
    schema: template?.schema?.version === 2 ? template.schema : emptyStudioSchema(),
    past: [],
    future: [],
  }));
  const schema = editor.schema;
  const history = { past: editor.past, future: editor.future };
  // Public API mirrors the prior useState shape so call sites stay unchanged.
  const setSchema = (updater) => dispatchEditor({ type: "SET_SCHEMA", updater });
  const mutateSchema = (updater) => dispatchEditor({ type: "MUTATE", updater });
  const snapshotHistory = () => dispatchEditor({ type: "SNAPSHOT" });
  const historyUndo = () => dispatchEditor({ type: "UNDO" });
  const historyRedo = () => dispatchEditor({ type: "REDO" });
  const [tool, setTool] = useState("select");
  const [draft, setDraft] = useState(null);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fontSel, setFontSel] = useState(analysis?.fontFamily || "arial");
  // Per spec iter 19g: Studio top toolbar exposes Font / Size / Thickness
  // controls. Defaults come from the upload-screen Text Analyzer (via
  // the `analysis` prop); user can manually adjust at any time.
  const [fontSize, setFontSize] = useState(analysis?.fontSizePt || 12);
  const [fontWeight, setFontWeight] = useState(analysis?.weight || "normal");
  const [dockTab, setDockTab] = useState("inspector");
  const [dockOpen, setDockOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [handedness, setHandedness] = useState("right");
  const [placementMode, setPlacementMode] = useState("fast");
  const [hoverPt, setHoverPt] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [ghostOverlay, setGhostOverlay] = useState(false);
  // Sync cursor — during a transform drag, this points to the live
  // pointer position so the OTHER canvas can render a small marker
  // for visual cross-reference (1:1 coord parity reinforcement).
  const [syncCursor, setSyncCursor] = useState(null); // {pt:{x,y}, source:'mapping'|'preview'} | null
  // Selection + transform state for post-placement editing.
  // Multi-select: array so shift-tap can add/remove from the selection.
  const [selectedIds, setSelectedIds] = useState([]);
  const [transform, setTransform] = useState(null);
  // Stylus-only mode — when on, ignore non-pen pointer input on the canvas.
  const [stylusOnly, setStylusOnly] = useState(false);
  // Trace tool: freehand mode bypasses auto-straighten.
  const [freehandMode, setFreehandMode] = useState(false);
  // Grid editor 3-step state: bbox → tap-to-add cols/rows → Done.
  const [gridDraft, setGridDraft] = useState(null);
  // Validation report — shown when Lock detects issues.
  const [validationReport, setValidationReport] = useState(null);
  const [fontBuilderOpen, setFontBuilderOpen] = useState(false);
  // Ribbon tab system — one active tab at a time. Drives the secondary
  // toolbar (handled separately in a future iteration). No state-coupling
  // to the existing tool palette/field controls yet.
  const [activeRibbonTab, setActiveRibbonTab] = useState("HOME");
  // history (past + future) lives inside the editorReducer above.
  const canvasRef = useRef(null);
  const logoInputRef = useRef(null);
  const qrInputRef = useRef(null);
  const workspaceRef = useRef(null);
  const panRef = useRef(null);

  // Single-element convenience: `selectedEl` is the first (or only) one.
  // For edit operations that only make sense on one element (handle
  // drag, rotate, lock toggle), we default to the first selection.
  const selectedEls = useMemo(
    () => selectedIds.map((id) => schema.elements.find((e) => e.id === id)).filter(Boolean),
    [schema.elements, selectedIds]
  );
  const selectedEl = selectedEls[0] || null;
  const selectedId = selectedEl?.id || null;

  const setSelectedId = (id) => setSelectedIds(id ? [id] : []);

  // mutateSchema, historyUndo, historyRedo defined at the top of this
  // component as thin dispatch wrappers around editorReducer.

  // Ref wrappers so the document-level keyboard listener always calls
  // the latest closure — defends against stale state if future refactors
  // read state directly inside historyUndo/Redo rather than via the
  // functional-update pattern.
  const historyUndoRef = useRef(historyUndo);
  const historyRedoRef = useRef(historyRedo);
  historyUndoRef.current = historyUndo;
  historyRedoRef.current = historyRedo;

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z or
  // Cmd/Ctrl+Y = redo. Bound at the document level; bailouts if a
  // text input or contenteditable has focus.
  React.useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); historyUndoRef.current(); }
      else if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); historyRedoRef.current(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // selectedEl / selectedId are provided above via selectedEls[0].

  const scan = template?.scan;
  const work = useMemo(() => workingArea(schema.boundaries), [schema.boundaries]);
  const boundaryCount = ["tl", "tr", "bl", "br"].filter((k) => schema.boundaries[k]).length;
  // Boundary is locked if the template was set up via the pre-Studio
  // BoundarySetup phase. In the Studio, locked boundaries render as
  // a static dotted rectangle — no draggable handles, no boundary tool.
  const boundaryLocked = template?.schema?.boundaryLocked === true;

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
    mutateSchema((s) => ({ ...s, elements: [...s.elements, el] }));
    setDraft(null);
    return el;
  };

  const undo = () => {
    if (draft) { setDraft(null); return; }
    historyUndo();
  };
  const redo = () => historyRedo();

  const delElement = (id) => mutateSchema((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== id) }));

  /* ------------------- pointer handlers ------------------- */
  // Stylus-only filter — block finger touches but allow stylus pen AND
  // desktop mice (pointer:fine) so testers/admins on laptops still work.
  const blockNonStylus = (e) => {
    if (!stylusOnly) return false;
    if (e.pointerType === "pen") return false;
    // Allow precise pointer devices (mouse / trackpad) on desktop.
    if (e.pointerType === "mouse" && window.matchMedia?.("(pointer: fine)")?.matches) return false;
    return true;
  };
  const onPointerDown = (e) => {
    if (blockNonStylus(e)) return;
    e.preventDefault();
    const pt = canvasPt(e);
    if (!pt) return;

    /* PAN TOOL — drag to scroll the workspace container; both canvases
       move together because they share the same scrollable parent. */
    if (tool === "pan") {
      const ws = workspaceRef.current;
      if (!ws) return;
      panRef.current = {
        startClientX: e.clientX, startClientY: e.clientY,
        scrollLeft: ws.scrollLeft, scrollTop: ws.scrollTop,
      };
      ws.style.cursor = "grabbing";
      e.currentTarget?.setPointerCapture?.(e.pointerId);
      return;
    }

    /* SELECT TOOL — tap to select, drag handles to resize/rotate, drag body to move. */
    if (tool === "select") {
      // Boundary is locked once set in the pre-Studio Boundary phase.
      // Hit-test handle first if an element is selected.
      // Hit-area scales inversely with zoom so handles meet WCAG 24px
      // touch-target at any zoom (e.g. at 0.5× the area doubles).
      if (selectedEl && !selectedEl.locked) {
        const bbox = elementBBox(selectedEl);
        const handles = bboxHandles(bbox);
        const handleR = 0.018 / zoom;
        for (const [hKey, hPt] of Object.entries(handles)) {
          if (Math.abs(pt.x - hPt.x) < handleR && Math.abs(pt.y - hPt.y) < handleR) {
            // Snapshot schema at the start of the drag (single undo
            // rewinds the whole resize/move).
            snapshotHistory();
            if (hKey === "c") {
              // Center handle = explicit move.
              setTransform({ kind: "move", start: pt, originalGeometry: selectedEl.geometry });
            } else {
              setTransform({ kind: "resize", handle: hKey, originalBBox: bbox, originalGeometry: selectedEl.geometry });
            }
            return;
          }
        }
      }
      // Hit-test elements top-down (last drawn = on top).
      for (let i = schema.elements.length - 1; i >= 0; i--) {
        const el = schema.elements[i];
        if (hitTest(pt, el)) {
          if (e.shiftKey) {
            // Shift-tap: toggle this element in the selection.
            setSelectedIds((ids) => ids.includes(el.id)
              ? ids.filter((x) => x !== el.id)
              : [...ids, el.id]);
          } else if (selectedIds.includes(el.id) && selectedIds.length > 1) {
            // Tapping inside existing multi-selection → begin group move.
            if (!el.locked) {
              snapshotHistory();
              setTransform({
                kind: "move-group", start: pt,
                originals: selectedEls.map((s) => ({ id: s.id, kind: s.kind, geometry: s.geometry })),
              });
            }
          } else {
            setSelectedId(el.id);
            if (!el.locked) {
              snapshotHistory();
              setTransform({ kind: "move", start: pt, originalGeometry: el.geometry });
            }
          }
          return;
        }
      }
      // Tapped empty area: clear selection (unless shift-held).
      if (!e.shiftKey) setSelectedId(null);
      return;
    }

    /* GRID EDITOR — 3-step. Step 1: drag bbox; Step 2: tap inside to add col/row lines. */
    if (tool === "grid") {
      if (!gridDraft) {
        setDraft({ tool: "grid", start: pt, end: pt });
        return;
      }
      if (gridDraft.step === "edit") {
        // Tap inside bbox → add a column or row line at that position.
        const b = gridDraft.bbox;
        if (pt.x < b.x || pt.x > b.x + b.w || pt.y < b.y || pt.y > b.y + b.h) return;
        const distLeft = pt.x - b.x;
        const distRight = (b.x + b.w) - pt.x;
        const distTop = pt.y - b.y;
        const distBot = (b.y + b.h) - pt.y;
        const minH = Math.min(distLeft, distRight);
        const minV = Math.min(distTop, distBot);
        // Snap-to-printed-line: if scan dims + OCR words are available,
        // pull the tap onto the nearest detected word edge.
        const sw = template?.scan?.width || 1;
        const sh = template?.scan?.height || 1;
        if (minH < minV) {
          const snap = snapToOcrLine(pt, "x", template?.ocr_words, sw, sh, 0.014);
          const x = snap.value;
          if (snap.snapped) toast.success("Snapped to printed line");
          setGridDraft({ ...gridDraft, cols: [...gridDraft.cols, (x - b.x) / b.w].sort((a, c) => a - c) });
        } else {
          const snap = snapToOcrLine(pt, "y", template?.ocr_words, sw, sh, 0.014);
          const y = snap.value;
          if (snap.snapped) toast.success("Snapped to printed line");
          setGridDraft({ ...gridDraft, rows: [...gridDraft.rows, (y - b.y) / b.h].sort((a, c) => a - c) });
        }
        return;
      }
    }

    if (boundaryCount < 4) return; // safety belt — boundaries are auto-defaulted/locked, but if a driver explicitly nukes them this gate still applies.
    switch (tool) {
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
            fontFamily: fontSel, fontSize, fontWeight,
          });
          setFieldLabel("");
        }
        break;
      }
      default: break;
    }
  };

  const onPointerMove = (e) => {
    if (blockNonStylus(e)) return;
    // Pan drag — translate the workspace scroll position.
    if (tool === "pan" && panRef.current) {
      const ws = workspaceRef.current;
      if (!ws) return;
      const p = panRef.current;
      ws.scrollLeft = p.scrollLeft - (e.clientX - p.startClientX);
      ws.scrollTop = p.scrollTop - (e.clientY - p.startClientY);
      return;
    }
    const pt = canvasPt(e);
    if (!pt) return;
    // Active transform drag — move/resize the selected element live.
    if (transform && selectedEl) {
      // Update sync-cursor so the OTHER canvas can show a matching marker.
      const src = e.currentTarget?.dataset?.canvasSource || "mapping";
      setSyncCursor({ pt, source: src });
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
      } else if (transform.kind === "move-group") {
        // Translate every originally-selected element by the same delta.
        const dx = pt.x - transform.start.x;
        const dy = pt.y - transform.start.y;
        setSchema((s) => ({
          ...s,
          elements: s.elements.map((el) => {
            const orig = transform.originals.find((o) => o.id === el.id);
            if (!orig || el.locked) return el;
            return { ...el, geometry: translateGeometry(orig.kind, orig.geometry, dx, dy) };
          }),
        }));
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
    if (e && blockNonStylus(e)) return;
    // End pan drag.
    if (tool === "pan" && panRef.current) {
      panRef.current = null;
      if (workspaceRef.current) workspaceRef.current.style.cursor = "";
      return;
    }
    // Finish transform drag.
    if (transform) { setTransform(null); setSyncCursor(null); return; }
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
        // Open the count popover. Driver picks rows/cols then header
        // names; the grid is then auto-built with even-spaced lines.
        // The Manual button on the popover keeps the legacy tap-to-add
        // editor available as a fallback.
        setGridDraft({ bbox: r, cols: [], rows: [], headers: [], step: "count",
          colCount: 4, rowCount: 6 });
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
        align: "left", fontFamily: fontSel, fontSize, fontWeight,
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
    // In-drag update — raw setSchema, do NOT push history. The history
    // snapshot was taken at pointer-down so a single undo rewinds the
    // whole drag operation.
    setSchema((s) => ({
      ...s,
      elements: s.elements.map((el) => el.id === id ? { ...el, geometry: newGeometry } : el),
    }));
  };
  const toggleLockSelected = () => {
    if (selectedIds.length === 0) return;
    const anyUnlocked = selectedEls.some((el) => !el.locked);
    const nextLocked = anyUnlocked;
    mutateSchema((s) => ({
      ...s,
      elements: s.elements.map((el) =>
        selectedIds.includes(el.id) ? { ...el, locked: nextLocked } : el),
    }));
  };
  const deleteSelected = () => {
    if (selectedIds.length === 0) return;
    mutateSchema((s) => ({ ...s, elements: s.elements.filter((el) => !selectedIds.includes(el.id)) }));
    setSelectedIds([]);
  };

  /* ------------------- grid editor commit ------------------- */
  const commitGridEdit = () => {
    if (!gridDraft) return;
    const { bbox, cols, rows, headers } = gridDraft;
    pushElement("grid", { ...bbox, colLines: cols, rowLines: rows,
      cols: cols.length + 1, rows: rows.length + 1,
      headers: headers || [],
      fontFamily: fontSel, fontSize, fontWeight,
    });
    setGridDraft(null);
  };
  const cancelGridEdit = () => setGridDraft(null);

  // Auto-build a grid from row/col counts + header labels collected via
  // the count + headers popover. Lines are evenly spaced; headers are
  // saved on the grid element and rendered in the first row.
  const commitGridAuto = () => {
    if (!gridDraft) return;
    const { bbox, colCount, rowCount, headers } = gridDraft;
    const cols = Array.from({ length: Math.max(0, (colCount || 1) - 1) },
      (_, i) => (i + 1) / colCount);
    const rows = Array.from({ length: Math.max(0, (rowCount || 1) - 1) },
      (_, i) => (i + 1) / rowCount);
    pushElement("grid", {
      ...bbox, colLines: cols, rowLines: rows,
      cols: colCount, rows: rowCount,
      headers: (headers || []).slice(0, colCount),
      fontFamily: fontSel, fontSize, fontWeight,
    });
    setGridDraft(null);
  };

  // Toggle the popover into the legacy tap-to-add manual editor.
  const switchToManualGrid = () => {
    if (!gridDraft) return;
    setGridDraft({ ...gridDraft, step: "edit", cols: [], rows: [] });
  };

  /* ------------------- asset uploads ------------------- */
  const onLogoFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      mutateSchema((s) => ({ ...s, assets: { ...s.assets, logo: { data_url: reader.result, kind: "image" } } }));
      toast.success("Logo uploaded");
    };
    reader.readAsDataURL(f);
  };

  const onQrFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      mutateSchema((s) => ({ ...s, assets: { ...s.assets, qr: { data_url: reader.result } } }));
      toast.success("QR uploaded");
    };
    reader.readAsDataURL(f);
  };

  /* ------------------- save & lock ------------------- */
  const commitSave = async (lock) => {
    if (!schema.elements.length) { toast.error("Draw at least one element"); return; }
    if (lock) {
      const issues = validateSchema(schema);
      if (issues.length) {
        // Open the validation report instead of locking immediately.
        setValidationReport({ issues, action: "lock" });
        return;
      }
    }
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

  // Force-lock past warnings (errors still block).
  const forceLock = async () => {
    const errors = (validationReport?.issues || []).filter((i) => i.level === "error");
    if (errors.length) { toast.error("Resolve errors before locking"); return; }
    setValidationReport(null);
    setSaving(true);
    try {
      const updated = { ...template, schema: { ...schema, locked: true }, updated_at: new Date().toISOString() };
      await saveTemplate(updated);
      await setActiveTemplateId(updated.id);
      toast.success("Template locked");
      onDone?.(updated);
    } catch (err) { toast.error(`Save failed: ${err?.message || err}`);
    } finally { setSaving(false); }
  };

  /* ------------------- render ------------------- */
  return (
    <div className="flex flex-col min-h-[calc(100vh-96px)]" data-testid="pro-studio">
      {/* Toolbar */}
      <div className="border-b border-[var(--tm-border)] bg-white sticky top-0 z-10">
        {/* Top header — single row layout:
              [ STUDIO ] [ HOME | GRID | TEXT | ASSETS | INSPECTOR | CUSTOM TRACE ] [ Continue ]
            All previous controls (Legacy, Handedness, Zoom, Ghost Overlay,
            Stylus, Placement Mode, Freehand, Grid editor) have been
            removed from this row; they will live in the per-tab secondary
            toolbar (handled separately). */}
        <div className="px-3 py-2 flex items-center gap-3" data-testid="studio-top-header">
          {/* LEFT — Studio label */}
          <span className="shrink-0 text-[11px] uppercase tracking-[0.25em] font-bold text-[var(--tm-orange)]"
            data-testid="studio-top-label">
            Studio
          </span>

          {/* CENTER — Ribbon tabs (folder/ribbon-style: orange top bar +
              orange text + subtle orange halo on active; vertical separator
              lines between tabs; square edges). */}
          <div className="flex-1 min-w-0 flex items-stretch h-9 overflow-x-auto"
            role="tablist" aria-label="Studio ribbon tabs" data-testid="studio-ribbon-tabs">
            {["HOME", "GRID", "TEXT", "ASSETS", "INSPECTOR", "CUSTOM TRACE"].map((tab) => {
              const active = activeRibbonTab === tab;
              return (
                <button
                  key={tab} type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`studio-ribbon-${tab.toLowerCase().replace(/\s+/g, "-")}`}
                  onClick={() => setActiveRibbonTab(tab)}
                  className={`shrink-0 h-9 px-4 text-[11px] font-bold uppercase tracking-wider transition-colors border-l border-l-[var(--tm-border)] last:border-r last:border-r-[var(--tm-border)] ${
                    active
                      ? "relative z-10 bg-white text-[var(--tm-orange)] border-t-[3px] border-t-[var(--tm-orange)] shadow-[inset_0_0_0_1px_rgba(255,95,21,0.45),0_0_0_2px_rgba(255,95,21,0.18)]"
                      : "bg-white text-[var(--tm-navy)] border-t-[3px] border-t-transparent hover:bg-[var(--tm-surface)]"
                  }`}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* RIGHT — Continue button */}
          <Button onClick={() => commitSave(false)}
            disabled={saving || !schema.elements.length}
            data-testid="studio-continue"
            className="shrink-0 h-9 px-4 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold text-[11px] uppercase tracking-wider">
            Continue
          </Button>
        </div>
        {/* Secondary toolbar — per-tab tool groups (HOME / GRID / TEXT /
            ASSETS / INSPECTOR / CUSTOM TRACE). Replaces the legacy flat
            tool palette. Many advanced tools are scaffolded; wiring is
            incremental. */}
        <StudioRibbon
          activeTab={activeRibbonTab}
          ctx={{
            state: {
              tool,
              fontWeight,
              snapToGrid: false,
              hasSelection: !!selectedEl,
            },
            handlers: {
              setTool: (id) => { setTool(id); setDraft(null); setSelectedId(null); setGridDraft(null); },
              setFontWeight,
              removeSelected: deleteSelected,
            },
          }}
        />
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
            title="Font family (auto-set by Text Analyzer)"
          >
            {FONT_PRESETS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <div className="inline-flex items-center gap-1 h-8 px-1 bg-white border border-[var(--tm-border)] rounded-md" title="Font size (auto-set by Text Analyzer)">
            <button type="button" data-testid="studio-font-size-dec"
              onClick={() => setFontSize((v) => Math.max(6, v - 1))}
              className="w-6 text-xs font-bold text-[var(--tm-navy)] hover:text-[var(--tm-blue)]">−</button>
            <span data-testid="studio-font-size-value" className="px-1 text-xs font-bold text-[var(--tm-navy)] min-w-[2.5rem] text-center">{fontSize}pt</span>
            <button type="button" data-testid="studio-font-size-inc"
              onClick={() => setFontSize((v) => Math.min(72, v + 1))}
              className="w-6 text-xs font-bold text-[var(--tm-navy)] hover:text-[var(--tm-blue)]">+</button>
          </div>
          <select
            data-testid="studio-font-weight"
            value={fontWeight} onChange={(e) => setFontWeight(e.target.value)}
            title="Thickness (auto-set by Text Analyzer)"
            className="h-8 px-2 text-xs bg-white border border-[var(--tm-border)] rounded-md text-[var(--tm-navy)] font-bold"
          >
            <option value="normal">Regular</option>
            <option value="bold">Bold</option>
          </select>
          {fontSel === "custom" && (
            <Button variant="outline" size="sm"
              data-testid="studio-font-build"
              onClick={() => setFontBuilderOpen(true)}
              title="Trace each character once · stored on this template"
              className="h-8 text-[10px] bg-white border-[var(--tm-blue)] text-[var(--tm-navy)]">
              <Pen className="h-3 w-3 mr-1" /> Build · {Object.keys(schema.fonts?.customGlyphs || {}).length} glyph{Object.keys(schema.fonts?.customGlyphs || {}).length === 1 ? "" : "s"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={undo}
            data-testid="studio-undo"
            disabled={!draft && history.past.length === 0 && !schema.elements.length}
            title="Undo (Ctrl/Cmd+Z)"
            className="h-8 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
          </Button>
          <Button variant="outline" size="sm" onClick={redo}
            data-testid="studio-redo"
            disabled={history.future.length === 0}
            title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
            className="h-8 bg-white border-[var(--tm-border)] text-[var(--tm-navy)]">
            <RotateCw className="h-3.5 w-3.5 mr-1" /> Redo
          </Button>
        </div>
        <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold flex items-center gap-1.5 flex-wrap">
          <SlidersHorizontal className="h-3 w-3 text-[var(--tm-blue)]" />
          {boundaryLocked && (
            <span data-testid="studio-boundary-locked-chip" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--tm-orange)] text-white text-[9px] tracking-wider">
              <Lock className="h-2.5 w-2.5" /> Boundary locked
            </span>
          )}
          {STUDIO_TOOLS.find((t) => t.id === tool)?.blurb}
        </div>
      </div>

      {/* DUAL FULL-SIZE CANVASES — same dimensions (8.5×11), same coordinate
           space, side-by-side. The mapping canvas is interactive (input
           only); the preview canvas is read-only output. Both scale
           together via the zoom control above so coordinates stay 1:1. */}
      <div className="flex-1 overflow-auto p-3 bg-[var(--tm-surface)]" ref={workspaceRef}>
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
              data-canvas-source="mapping"
              className="relative select-none border-2 border-[var(--tm-blue)] rounded-md overflow-hidden bg-white shadow-md touch-none"
              style={{ width: 540, aspectRatio: "8.5 / 11", cursor: tool === "pan" ? "grab" : "crosshair" }}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              onPointerLeave={() => setHoverPt(null)}
            >
              {/* Scan fills the 8.5:11 frame (object-fit: fill) so a tap at
                  canvas (x,y) IS the same coordinate that the preview
                  canvas uses — exact 1:1 correspondence per spec. */}
              <img src={scan.data_url} alt={template.name} draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }} />
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                {/* Boundary — locked into a dotted polygon outline.
                     No editable handles; the boundary was set in the
                     pre-Studio Boundary phase and is read-only here. */}
                <BoundaryHandles boundaries={schema.boundaries} zoom={zoom}
                  showHandles={false} />
                {schema.elements.map((el) => (
                  <g key={el.id} transform={el.rotation
                    ? `rotate(${el.rotation} ${elementBBox(el).x + elementBBox(el).w / 2} ${elementBBox(el).y + elementBBox(el).h / 2})`
                    : undefined}>
                    <MarkupOverlay el={el} />
                  </g>
                ))}
                {/* Selection outline + 8 handles + rotate handle (handles only for primary/single selection) */}
                {selectedEls.length > 0 && tool === "select" && selectedEls.map((el, idx) => (
                  <SelectionFrame key={el.id} el={el} zoom={zoom}
                    handlesEnabled={selectedEls.length === 1 && idx === 0} />
                ))}
                {/* Sync cursor — when dragging on the preview canvas, show
                     a faint blue marker here at the matching coordinate. */}
                {syncCursor && syncCursor.source === "preview" && (
                  <g data-testid="studio-mapping-synccursor" pointerEvents="none">
                    <circle cx={syncCursor.pt.x} cy={syncCursor.pt.y} r="0.014"
                      fill="rgba(12,74,183,0.18)" stroke="rgba(12,74,183,0.85)" strokeWidth="0.0024" />
                    <circle cx={syncCursor.pt.x} cy={syncCursor.pt.y} r="0.0035" fill="rgba(12,74,183,0.95)" />
                  </g>
                )}
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
              data-canvas-source="preview"
              className="relative border-2 border-[var(--tm-orange)] rounded-md overflow-hidden bg-white shadow-md touch-none"
              style={{ width: 540, aspectRatio: "8.5 / 11", cursor: tool === "select" ? "crosshair" : tool === "pan" ? "grab" : "default" }}
              onPointerDown={(tool === "select" || tool === "pan") ? onPointerDown : undefined}
              onPointerMove={(tool === "select" || tool === "pan") ? onPointerMove : undefined}
              onPointerUp={(tool === "select" || tool === "pan") ? onPointerUp : undefined}
            >
              <CleanReconstructionCanvas schema={schema} session={null} width={540} />
              {/* Editable overlay — visible & interactive only when Select tool is active.
                   Uses the same 0..1 normalized coords as the mapping canvas, so the
                   shared SelectionFrame + transform math works identically here. */}
              {tool === "select" && (
                <>
                  <svg viewBox="0 0 1 1" preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none">
                    {selectedEls.length > 0 && selectedEls.map((el, idx) => (
                      <SelectionFrame key={el.id} el={el} zoom={zoom}
                        handlesEnabled={selectedEls.length === 1 && idx === 0} />
                    ))}
                    {syncCursor && syncCursor.source === "mapping" && (
                      <g data-testid="studio-preview-synccursor">
                        <circle cx={syncCursor.pt.x} cy={syncCursor.pt.y} r="0.014"
                          fill="rgba(255,95,21,0.18)" stroke="rgba(255,95,21,0.85)" strokeWidth="0.0024" />
                        <circle cx={syncCursor.pt.x} cy={syncCursor.pt.y} r="0.0035" fill="rgba(255,95,21,0.95)" />
                      </g>
                    )}
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
      {/* Validation report modal — opens when Lock finds issues. */}
      {validationReport && (
        <ValidationReportModal report={validationReport}
          onCancel={() => setValidationReport(null)}
          onForceLock={forceLock}
          onJumpTo={(ids) => { setSelectedId(ids[0] || null); setTool("select"); setValidationReport(null); }} />
      )}
      {/* Grid count + headers popover — drawn after the bbox is set. */}
      {gridDraft && (gridDraft.step === "count" || gridDraft.step === "headers") && (
        <GridSetupPopover
          gridDraft={gridDraft}
          onChangeCounts={(cc, rc) => setGridDraft((g) => ({ ...g, colCount: cc, rowCount: rc }))}
          onChangeHeader={(i, val) => setGridDraft((g) => {
            const next = (g.headers || []).slice();
            next[i] = val;
            return { ...g, headers: next };
          })}
          onNext={() => setGridDraft((g) => ({ ...g, step: "headers",
            headers: (g.headers && g.headers.length === g.colCount)
              ? g.headers
              : Array.from({ length: g.colCount }, (_, i) => g.headers?.[i] || ""),
          }))}
          onBack={() => setGridDraft((g) => ({ ...g, step: "count" }))}
          onDone={commitGridAuto}
          onManual={switchToManualGrid}
          onCancel={cancelGridEdit}
        />
      )}
      {/* Custom-font builder — opens when driver picks Custom font + Build. */}
      {fontBuilderOpen && (
        <CustomFontBuilder
          schema={schema}
          onClose={() => setFontBuilderOpen(false)}
          onSave={(glyphs) => {
            mutateSchema((s) => ({ ...s, fonts: { ...s.fonts, customGlyphs: glyphs } }));
            toast.success(`Custom font saved · ${Object.keys(glyphs).length} glyph${Object.keys(glyphs).length === 1 ? "" : "s"}`);
          }}
        />
      )}
    </div>
  );
}

function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }

/**
 * Renders the dotted boundary rectangle + (optionally) 8 grab
 * handles. In the Studio the boundary is locked from the pre-Studio
 * Boundary phase, so we render just the dotted polygon.
 */
function BoundaryHandles({ boundaries, zoom = 1, showHandles = true }) {
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

function GridSetupPopover({ gridDraft, onChangeCounts, onChangeHeader, onNext, onBack, onDone, onManual, onCancel }) {
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

function ValidationReportModal({ report, onCancel, onForceLock, onJumpTo }) {
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
function SelectionFrame({ el, zoom = 1, handlesEnabled = true }) {
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
      {schema.elements.map((el, i) => {
        const kindLabel = el.kind.replace("_", " ");
        const fieldLabel = el.geometry.fieldName || el.geometry.text || "";
        const ariaLabel = `${kindLabel}${fieldLabel ? ` — ${fieldLabel}` : ""}${el.locked ? " (locked)" : ""}`;
        return (
        <li key={el.id} data-testid={`studio-inspector-row-${i}`}
          aria-label={ariaLabel}
          className="border border-[var(--tm-border)] rounded-md p-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider font-bold text-[var(--tm-orange)]">{kindLabel}</div>
              <div className="text-xs font-bold text-[var(--tm-navy)] truncate">
                {fieldLabel || el.kind}
              </div>
              {el.geometry.fontFamily && (
                <div className="text-[9px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold">
                  {FONT_PRESETS_BY_ID[el.geometry.fontFamily]?.label || el.geometry.fontFamily}
                </div>
              )}
            </div>
            <button type="button" onClick={() => onDelete(el.id)}
              data-testid={`studio-inspector-del-${i}`}
              aria-label={`Delete ${kindLabel}${fieldLabel ? ` ${fieldLabel}` : ""}`}
              className="text-[var(--tm-text-soft)] hover:text-[#FF3B30] p-1 shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </li>
        );
      })}
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
