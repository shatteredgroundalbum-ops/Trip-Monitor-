import React, { useMemo, useRef, useState, forwardRef } from "react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import {
  Crosshair, Minus, Square, Circle as CircleIcon, Triangle, Spline, Grid3x3,
  AlignLeft, Dot as DotIcon, Image as ImageIcon, QrCode as QrIcon, PenTool,
  Undo2, Trash2, Save, Lock, X, Type, Eye, SlidersHorizontal, Layers,
} from "lucide-react";
import {
  STUDIO_TOOLS, FONT_PRESETS, FONT_PRESETS_BY_ID, STUDIO_FIELD_PRESETS,
  emptyStudioSchema, uid, normRect, workingArea, cleanTrace, elementBBox,
} from "../../lib/pro-mapping-v2";
import { saveTemplate, setActiveTemplateId } from "../../lib/template-store";
import ProMappingEditor from "./ProMappingEditor";

const TOOL_ICON = {
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
  const [tool, setTool] = useState("boundary");
  const [draft, setDraft] = useState(null);
  const [fieldLabel, setFieldLabel] = useState("");
  const [fontSel, setFontSel] = useState("arial");
  const [tab, setTab] = useState("inspector"); // inspector | clean | assets
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef(null);
  const logoInputRef = useRef(null);
  const qrInputRef = useRef(null);

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
  const canvasPt = (e) => {
    const r = canvasRef.current?.getBoundingClientRect();
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
    e.preventDefault();
    const pt = canvasPt(e);
    if (!pt) return;
    switch (tool) {
      case "boundary": {
        const order = ["tl", "tr", "br", "bl"];
        const next = order.find((k) => !schema.boundaries[k]);
        if (!next) { toast.info("All 4 anchors placed — switch tool to start drawing"); return; }
        setBoundary(next, pt);
        toast.success(`Anchor ${next.toUpperCase()} placed`);
        break;
      }
      case "line":
      case "rect":
      case "circle":
      case "logo":
      case "qr":
      case "grid":
        setDraft({ tool, start: pt, end: pt });
        break;
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
    if (!draft) return;
    const pt = canvasPt(e);
    if (!pt) return;
    if (["line", "rect", "circle", "logo", "qr", "grid", "text"].includes(draft.tool)) {
      setDraft({ ...draft, end: pt });
    } else if (["curve", "trace"].includes(draft.tool)) {
      setDraft({ ...draft, points: [...draft.points, pt] });
    }
  };

  const onPointerUp = () => {
    if (!draft) return;
    const d = draft;
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
    } else if (d.tool === "logo" && d.start && d.end) {
      const r = normRect(d.start.x, d.start.y, d.end.x, d.end.y);
      if (r.w > 0.02 && r.h > 0.02) pushElement("logo", r);
      else setDraft(null);
    } else if (d.tool === "qr" && d.start && d.end) {
      const r = normRect(d.start.x, d.start.y, d.end.x, d.end.y);
      if (r.w > 0.02 && r.h > 0.02) pushElement("qr_box", r);
      else setDraft(null);
    } else if (d.tool === "grid" && d.start && d.end) {
      const r = normRect(d.start.x, d.start.y, d.end.x, d.end.y);
      if (r.w > 0.02 && r.h > 0.02) {
        const rows = parseInt(prompt("How many rows?", "8") || "0", 10);
        const cols = parseInt(prompt("How many columns?", "5") || "0", 10);
        if (rows > 0 && cols > 0) pushElement("grid", { ...r, rows, cols });
        else setDraft(null);
      } else setDraft(null);
    } else if (d.tool === "curve" && d.points?.length > 2) {
      const cleaned = cleanTrace(d.points, { tolerance: 0.004 });
      pushElement("curve", { points: cleaned.points, d: cleaned.d });
    } else if (d.tool === "trace" && d.points?.length > 2) {
      const cleaned = cleanTrace(d.points, { tolerance: 0.002 });
      const xs = cleaned.points.map((p) => p.x), ys = cleaned.points.map((p) => p.y);
      const bbox = {
        x: Math.min(...xs), y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
      pushElement("trace", { paths: [cleaned.d], points: cleaned.points, bbox, strokeWidth: 0.006 });
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
    } else {
      setDraft(null);
    }
  };

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
        </div>
        <div className="px-3 pb-2 flex items-center gap-1 overflow-x-auto" data-testid="studio-toolbar">
          {STUDIO_TOOLS.map((t) => {
            const Icon = TOOL_ICON[t.id] || Square;
            const active = tool === t.id;
            const disabled = t.id !== "boundary" && boundaryCount < 4;
            return (
              <button
                key={t.id} type="button"
                data-testid={`studio-tool-${t.id}`}
                onClick={() => { setTool(t.id); setDraft(null); }}
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

      {/* Split body */}
      <div className="flex flex-col xl:flex-row gap-3 p-3 flex-1">
        {/* Left: markup canvas over the scan */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--tm-text-muted)] mb-1">Mark on scan</div>
          <div
            ref={canvasRef}
            className="relative mx-auto select-none border-2 border-[var(--tm-border)] rounded-md overflow-hidden bg-white shadow-sm touch-none"
            style={{ maxWidth: 720, cursor: "crosshair" }}
            data-testid="studio-canvas"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          >
            <img src={scan.data_url} alt={template.name} draggable={false} className="block w-full h-auto" />
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
              {/* Boundary anchors */}
              {Object.entries(schema.boundaries).map(([corner, pt]) => pt && (
                <g key={corner}>
                  <circle cx={pt.x} cy={pt.y} r="0.012" fill="rgba(12,74,183,0.9)" stroke="white" strokeWidth="0.003" />
                </g>
              ))}
              {/* Bounding rectangle once all 4 anchors exist */}
              {work.complete && (
                <rect x={work.x} y={work.y} width={work.w} height={work.h}
                  fill="none" stroke="rgba(12,74,183,0.35)" strokeWidth="0.002" strokeDasharray="0.006 0.004" />
              )}
              {/* Committed elements */}
              {schema.elements.map((el) => <MarkupOverlay key={el.id} el={el} />)}
              {/* Draft */}
              {draft && <DraftOverlay draft={draft} />}
            </svg>
            <div className="absolute inset-0 pointer-events-none">
              {Object.entries(schema.boundaries).map(([corner, pt]) => pt && (
                <span key={corner} style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}
                  className="absolute -translate-x-1/2 -translate-y-[130%] text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-[var(--tm-blue)] text-white">
                  {corner.toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: clean reconstruction + tabs */}
        <aside className="w-full xl:w-[420px] shrink-0 bg-white border border-[var(--tm-border)] rounded-md flex flex-col">
          <div className="flex border-b border-[var(--tm-border)]" data-testid="studio-tabs">
            {[
              { id: "clean", label: "Clean Render", icon: Eye },
              { id: "inspector", label: "Inspector", icon: SlidersHorizontal },
              { id: "assets", label: "Assets", icon: ImageIcon },
            ].map((t) => {
              const active = tab === t.id;
              const TIcon = t.icon;
              return (
                <button key={t.id} type="button"
                  data-testid={`studio-tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 h-10 text-[11px] uppercase tracking-wider font-bold inline-flex items-center justify-center gap-1 ${
                    active ? "bg-[var(--tm-orange)] text-white" : "bg-white text-[var(--tm-text-soft)]"}`}
                >
                  <TIcon className="h-3 w-3" /> {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {tab === "clean" && (
              <CleanReconstructionPreview schema={schema} />
            )}
            {tab === "inspector" && (
              <InspectorPane schema={schema} onDelete={delElement} />
            )}
            {tab === "assets" && (
              <AssetsPane schema={schema} onLogoPick={() => logoInputRef.current?.click()} onQrPick={() => qrInputRef.current?.click()} />
            )}
          </div>
        </aside>
      </div>

      {/* Hidden file inputs */}
      <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
        data-testid="studio-logo-file" onChange={onLogoFile} />
      <input ref={qrInputRef} type="file" accept="image/*" className="hidden"
        data-testid="studio-qr-file" onChange={onQrFile} />

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
          {Array.from({ length: (g.rows || 1) - 1 }).map((_, i) => (
            <line key={`r${i}`} x1={g.x} x2={g.x + g.w}
              y1={g.y + g.h * (i + 1) / g.rows} y2={g.y + g.h * (i + 1) / g.rows}
              stroke={stroke} strokeWidth="0.0018" />
          ))}
          {Array.from({ length: (g.cols || 1) - 1 }).map((_, i) => (
            <line key={`c${i}`} y1={g.y} y2={g.y + g.h}
              x1={g.x + g.w * (i + 1) / g.cols} x2={g.x + g.w * (i + 1) / g.cols}
              stroke={stroke} strokeWidth="0.0018" />
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
      return <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="rgba(14,31,71,0.1)" stroke="rgba(14,31,71,0.8)" strokeWidth="0.003" strokeDasharray="0.006 0.003" />;
    case "qr_box":
      return <rect x={g.x} y={g.y} width={g.w} height={g.h} fill="rgba(0,0,0,0.05)" stroke="#000" strokeWidth="0.003" />;
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
  if (["logo", "qr", "grid"].includes(draft.tool) && draft.start && draft.end) {
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

function CleanReconstructionPreview({ schema }) {
  if (schema.elements.length === 0) {
    return <div className="text-xs text-[var(--tm-text-muted)] uppercase tracking-wider font-bold">
      Nothing to reconstruct yet — start drawing on the left.
    </div>;
  }
  return (
    <div data-testid="studio-clean-preview" className="relative border border-[var(--tm-border)] rounded-md overflow-hidden bg-white">
      <CleanReconstructionCanvas schema={schema} />
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
          {Array.from({ length: (g.rows || 1) - 1 }).map((_, i) => (
            <line key={`r${i}`} x1={p.x} x2={p.x + W}
              y1={p.y + H * (i + 1) / g.rows} y2={p.y + H * (i + 1) / g.rows}
              stroke="#000" strokeWidth={sw * 0.6} />
          ))}
          {Array.from({ length: (g.cols || 1) - 1 }).map((_, i) => (
            <line key={`c${i}`} y1={p.y} y2={p.y + H}
              x1={p.x + W * (i + 1) / g.cols} x2={p.x + W * (i + 1) / g.cols}
              stroke="#000" strokeWidth={sw * 0.6} />
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
    case "logo": {
      const p = px(ws({ x: g.x, y: g.y }));
      const W = wsDim(g.w, "w"); const H = wsDim(g.h, "h");
      if (assets?.logo?.data_url) {
        return <image href={assets.logo.data_url} x={p.x} y={p.y} width={W} height={H} preserveAspectRatio="xMidYMid meet" />;
      }
      return (
        <g>
          <rect x={p.x} y={p.y} width={W} height={H} fill="none" stroke="#000" strokeWidth={sw} strokeDasharray="8 4" />
          <text x={p.x + W / 2} y={p.y + H / 2} textAnchor="middle" dominantBaseline="middle"
            fill="#8A92AB" fontSize={11} fontWeight="700" fontFamily="Arial, sans-serif">LOGO</text>
        </g>
      );
    }
    case "qr_box": {
      const p = px(ws({ x: g.x, y: g.y }));
      const W = wsDim(g.w, "w"); const H = wsDim(g.h, "h");
      if (assets?.qr?.data_url) {
        return <image href={assets.qr.data_url} x={p.x} y={p.y} width={W} height={H} preserveAspectRatio="xMidYMid meet" />;
      }
      return (
        <g>
          <rect x={p.x} y={p.y} width={W} height={H} fill="none" stroke="#000" strokeWidth={sw} />
          <text x={p.x + W / 2} y={p.y + H / 2} textAnchor="middle" dominantBaseline="middle"
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
