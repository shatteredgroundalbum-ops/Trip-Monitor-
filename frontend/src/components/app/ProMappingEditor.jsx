import React, { useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import {
  Dot,
  Square,
  Circle as CircleIcon,
  Crosshair,
  Link2,
  ListOrdered,
  Undo2,
  Trash2,
  Check,
  Save,
  Eye,
  FileText,
  Cpu,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ELEMENT_KINDS,
  ELEMENT_KINDS_BY_ID,
  snapToNearestWord,
  cryptoUuid,
} from "../../lib/template-types";
import { saveTemplate, setActiveTemplateId } from "../../lib/template-store";
import DynamicPaperSheet from "./DynamicPaperSheet";

const KIND_ICON = {
  point: Dot,
  circle: CircleIcon,
  box: Square,
  corners: Crosshair,
  line_label: Link2,
  sequential: ListOrdered,
};

/**
 * Pro-Mapping visual annotation editor.
 *
 * Six markup primitives — point / circle / box / corners / line+label /
 * sequential — all finger-AND-stylus friendly via Pointer Events. Taps
 * snap onto the nearest OCR-detected word edge when one is within 28 px
 * (honors the "Snap + Lock" rule).
 *
 * Right-side pane has three tabs the driver can toggle between:
 *   Schema  : live JSON-card list of every mapped element
 *   Form    : blank-form reconstruction drawn from the schema
 *   Preview : photographic export preview via DynamicPaperSheet
 *
 * On finish the template's `schema.elements[]` is persisted and the
 * template is set as the active runtime template.
 */
export default function ProMappingEditor({ template, onDone, onCancel }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState("point");
  const [elements, setElements] = useState(() => template?.schema?.elements || []);
  const [draft, setDraft] = useState(null); // in-progress geometry for tools that need multiple taps
  const [labelDraft, setLabelDraft] = useState("");
  const [tab, setTab] = useState("Schema");
  const [saving, setSaving] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);

  const scan = template?.scan;
  const sw = scan?.width || 1;
  const sh = scan?.height || 1;
  const ocrWords = template?.ocr_words || [];

  const commitElement = (kind, geometry, label) => {
    const el = {
      id: cryptoUuid(),
      kind,
      label: label || (labelDraft || kindSuggestedLabel(kind, elements)),
      geometry,
      created_at: new Date().toISOString(),
    };
    setElements((prev) => [...prev, el]);
    setDraft(null);
    setLabelDraft("");
    toast.success(`Added ${kind.replace("_", " + ")} · "${el.label}"`);
  };

  const handleUndo = () => {
    if (draft) {
      setDraft(null);
      return;
    }
    setElements((prev) => prev.slice(0, -1));
  };

  const handleDeleteElement = (id) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
  };

  const computeNormalizedPt = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const pt = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    if (pt.x < 0 || pt.x > 1 || pt.y < 0 || pt.y > 1) return null;
    if (!snapEnabled) return { ...pt, snapped: false, isPen: e.pointerType === "pen" };
    const snapped = snapToNearestWord(pt, ocrWords, sw, sh, e.pointerType === "pen" ? 18 : 28);
    return { ...snapped, isPen: e.pointerType === "pen" };
  };

  // --- Tool handlers ---
  const handlePointerDown = (e) => {
    e.preventDefault();
    const pt = computeNormalizedPt(e);
    if (!pt) return;

    switch (tool) {
      case "point": {
        commitElement("point", { x: pt.x, y: pt.y });
        break;
      }
      case "circle": {
        // first tap = center; start drag → final tap = radius
        setDraft({ kind: "circle", cx: pt.x, cy: pt.y, r: 0.02 });
        break;
      }
      case "box": {
        // drag-to-draw rectangle
        setDraft({ kind: "box", x: pt.x, y: pt.y, w: 0, h: 0, ax: pt.x, ay: pt.y });
        break;
      }
      case "corners": {
        const prev = draft?.kind === "corners" ? draft.points : [];
        const next = [...prev, pt];
        if (next.length >= 4) {
          const xs = next.map((p) => p.x);
          const ys = next.map((p) => p.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          commitElement("corners", {
            x: minX, y: minY, w: maxX - minX, h: maxY - minY, points: next,
          });
        } else {
          setDraft({ kind: "corners", points: next });
        }
        break;
      }
      case "line_label": {
        if (!draft || draft.kind !== "line_label") {
          setDraft({ kind: "line_label", from: pt, to: pt });
        } else {
          // 2nd tap completes the line
          if (!labelDraft.trim()) {
            toast.error("Enter a label first (text box, top of this panel)");
            setDraft(null);
            return;
          }
          commitElement("line_label", { from: draft.from, to: pt }, labelDraft.trim());
        }
        break;
      }
      case "sequential": {
        const prev = draft?.kind === "sequential" ? draft.positions : [];
        const next = [...prev, pt];
        setDraft({ kind: "sequential", positions: next });
        break;
      }
      default:
        break;
    }
  };

  const handlePointerMove = (e) => {
    if (!draft) return;
    const pt = computeNormalizedPt(e);
    if (!pt) return;
    if (draft.kind === "box") {
      const x = Math.min(draft.ax, pt.x);
      const y = Math.min(draft.ay, pt.y);
      const w = Math.abs(pt.x - draft.ax);
      const h = Math.abs(pt.y - draft.ay);
      setDraft({ ...draft, x, y, w, h });
    } else if (draft.kind === "circle") {
      const dx = pt.x - draft.cx;
      const dy = pt.y - draft.cy;
      setDraft({ ...draft, r: Math.sqrt(dx * dx + dy * dy) });
    } else if (draft.kind === "line_label") {
      setDraft({ ...draft, to: pt });
    }
  };

  const handlePointerUp = () => {
    if (!draft) return;
    if (draft.kind === "box" && draft.w > 0.01 && draft.h > 0.01) {
      commitElement("box", { x: draft.x, y: draft.y, w: draft.w, h: draft.h });
    } else if (draft.kind === "circle" && draft.r > 0.015) {
      commitElement("circle", { cx: draft.cx, cy: draft.cy, r: draft.r });
    }
    // line_label / corners / sequential commit via additional taps; no up-action.
  };

  const finishSequential = () => {
    if (draft?.kind === "sequential" && draft.positions.length) {
      commitElement("sequential", { positions: draft.positions },
        (labelDraft || "Sequential field"));
    }
  };
  const finishCorners = () => {
    if (draft?.kind === "corners" && draft.points.length >= 2) {
      const xs = draft.points.map((p) => p.x);
      const ys = draft.points.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      commitElement("corners", {
        x: minX, y: minY, w: maxX - minX, h: maxY - minY, points: draft.points,
      });
    }
  };

  const handleFinish = async () => {
    if (!elements.length) {
      toast.error("Map at least one element before saving");
      return;
    }
    setSaving(true);
    try {
      const updated = {
        ...template,
        schema: { elements, authored_with: "pro_mapping", version: 1 },
        updated_at: new Date().toISOString(),
      };
      await saveTemplate(updated);
      await setActiveTemplateId(updated.id);
      toast.success(`Template saved — ${elements.length} element${elements.length === 1 ? "" : "s"}`);
      onDone?.(updated);
    } catch (err) {
      toast.error(`Save failed: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const showToolInstruction = useMemo(() => toolInstruction(tool, draft), [tool, draft]);

  if (!scan?.data_url) {
    return (
      <div className="p-6 text-center text-[var(--tm-text-soft)] text-sm">
        No scan attached to this template. Capture one first.
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-96px)]" data-testid="pro-mapping-editor">
      {/* Top toolbar */}
      <div className="border-b border-[var(--tm-border)] bg-white sticky top-0 z-10">
        <div className="px-3 py-2 flex items-center gap-1 overflow-x-auto" data-testid="pro-mapping-toolbar">
          {ELEMENT_KINDS.map((k) => {
            const Icon = KIND_ICON[k.id] || Dot;
            const active = tool === k.id;
            return (
              <button
                key={k.id}
                type="button"
                data-testid={`tool-${k.id}`}
                onClick={() => { setTool(k.id); setDraft(null); }}
                title={k.label + " — " + k.blurb}
                className={`shrink-0 h-10 px-3 rounded-md text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 border ${
                  active
                    ? "bg-[var(--tm-orange)] text-white border-[var(--tm-orange)]"
                    : "bg-white text-[var(--tm-navy)] border-[var(--tm-border)] hover:bg-[var(--tm-surface)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {k.label}
              </button>
            );
          })}
        </div>
        <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
          <input
            data-testid="pro-mapping-label-input"
            placeholder={ labelPlaceholder(tool) }
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            className="h-8 flex-1 min-w-[140px] px-2 text-xs bg-white border border-[var(--tm-border)] rounded-md text-[var(--tm-navy)]"
          />
          <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--tm-text-soft)] font-bold cursor-pointer" data-testid="pro-mapping-snap-toggle">
            <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
            Snap
          </label>
          <Button variant="outline" size="sm" onClick={handleUndo}
            data-testid="pro-mapping-undo"
            disabled={!draft && elements.length === 0}
            className="h-8 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md">
            <Undo2 className="h-3.5 w-3.5 mr-1" /> Undo
          </Button>
          {(tool === "sequential" || tool === "corners") && draft && (
            <Button size="sm"
              data-testid="pro-mapping-commit-multi"
              onClick={tool === "sequential" ? finishSequential : finishCorners}
              className="h-8 bg-[var(--tm-blue)] hover:bg-[var(--tm-blue-deep)] text-white rounded-md text-xs font-bold">
              <Check className="h-3.5 w-3.5 mr-1" /> Commit
            </Button>
          )}
        </div>
        <div className="px-3 pb-2 text-[11px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold flex items-center gap-1.5">
          <Cpu className="h-3 w-3 text-[var(--tm-blue)]" />
          {showToolInstruction}
        </div>
      </div>

      {/* Split body: left markup canvas + right schema/form/preview pane */}
      <div className="flex flex-col lg:flex-row gap-3 p-3 flex-1">
        {/* Canvas */}
        <div className="flex-1 min-w-0">
          <div
            ref={canvasRef}
            className="relative mx-auto select-none border-2 border-[var(--tm-border)] rounded-md overflow-hidden bg-white shadow-sm touch-none"
            style={{ maxWidth: 920, cursor: "crosshair" }}
            data-testid="pro-mapping-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <img src={scan.data_url} alt={template.name} draggable={false} className="block w-full h-auto" />
            {/* SVG overlay for elements + draft */}
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
              {elements.map((el) => <ElementOverlay key={el.id} el={el} />)}
              {draft && <DraftOverlay draft={draft} />}
            </svg>
            {/* Labels (HTML so text stays readable regardless of svg scaling) */}
            <div className="absolute inset-0 pointer-events-none">
              {elements.map((el) => <ElementLabel key={el.id} el={el} />)}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <aside className="w-full lg:w-[340px] shrink-0 bg-white border border-[var(--tm-border)] rounded-md flex flex-col max-h-[60vh] lg:max-h-none">
          <div className="flex border-b border-[var(--tm-border)]" data-testid="pro-mapping-tabs">
            {["Schema", "Form", "Preview"].map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  data-testid={`pro-tab-${t.toLowerCase()}`}
                  onClick={() => setTab(t)}
                  className={`flex-1 h-10 text-[11px] uppercase tracking-wider font-bold ${
                    active
                      ? "bg-[var(--tm-orange)] text-white"
                      : "bg-white text-[var(--tm-text-soft)] hover:bg-[var(--tm-surface)]"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-3" data-testid={`pro-pane-${tab.toLowerCase()}`}>
            {tab === "Schema" && <SchemaPane elements={elements} onDelete={handleDeleteElement} />}
            {tab === "Form" && <FormPane elements={elements} />}
            {tab === "Preview" && <PreviewPane template={template} elements={elements} />}
          </div>
        </aside>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-[var(--tm-border)] p-3 flex items-center gap-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={saving}
          data-testid="pro-mapping-cancel"
          className="h-11 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
        >
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <div className="flex-1 text-[11px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold" data-testid="pro-mapping-count">
          {elements.length} element{elements.length === 1 ? "" : "s"} mapped
        </div>
        <Button
          onClick={handleFinish}
          disabled={saving || !elements.length}
          data-testid="pro-mapping-finish"
          className="h-11 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
        >
          {saving ? "Saving..." : <span className="inline-flex items-center"><Save className="h-4 w-4 mr-1" /> Finish & use</span>}
        </Button>
      </div>
    </div>
  );
}

/** Per-tool help copy shown under the toolbar. */
function toolInstruction(tool, draft) {
  switch (tool) {
    case "point":       return "Tap on the scan to drop a single anchor.";
    case "circle":      return "Drag to draw a loose region.";
    case "box":         return "Drag to draw a rectangle.";
    case "corners":     return draft?.kind === "corners"
      ? `Tap corner ${(draft.points.length) + 1} of 4 — or press Commit to use ${draft.points.length} corners.`
      : "Tap 4 corners to define a precise rectangle.";
    case "line_label":  return draft?.kind === "line_label"
      ? "Now tap the blank field this label points to."
      : "Enter the label text above, then tap where the label sits on the scan.";
    case "sequential":  return `Keep tapping to add indexed points${draft?.kind === "sequential" ? ` — ${draft.positions.length} so far, press Commit to finish.` : "."}`;
    default:            return "";
  }
}

/** A sensible auto-label when the driver leaves the label input blank. */
function kindSuggestedLabel(kind, existing) {
  const count = existing.filter((e) => e.kind === kind).length + 1;
  return ELEMENT_KINDS_BY_ID[kind]?.label + " " + count;
}

function labelPlaceholder(tool) {
  if (tool === "line_label") return "Label to bind (e.g. Driver ID)";
  if (tool === "sequential") return "Series name (e.g. Trailer #)";
  return "Optional label (e.g. RTI Logo, Driver Info Box)";
}

/* =========== Overlay renderers =========== */

function ElementOverlay({ el }) {
  const stroke = "rgba(255,95,21,0.85)";
  const fill = "rgba(255,95,21,0.15)";
  const g = el.geometry;
  if (el.kind === "point") {
    return <circle cx={g.x} cy={g.y} r="0.006" fill={stroke} />;
  }
  if (el.kind === "circle") {
    return <circle cx={g.cx} cy={g.cy} r={g.r} fill={fill} stroke={stroke} strokeWidth="0.0022" />;
  }
  if (el.kind === "box" || el.kind === "corners") {
    return <rect x={g.x} y={g.y} width={g.w} height={g.h} fill={fill} stroke={stroke} strokeWidth="0.0022" />;
  }
  if (el.kind === "line_label") {
    return (
      <>
        <line x1={g.from.x} y1={g.from.y} x2={g.to.x} y2={g.to.y} stroke={stroke} strokeWidth="0.0022" strokeDasharray="0.005 0.005" />
        <circle cx={g.from.x} cy={g.from.y} r="0.006" fill={stroke} />
        <rect x={g.to.x - 0.008} y={g.to.y - 0.008} width="0.016" height="0.016" fill="none" stroke={stroke} strokeWidth="0.0022" />
      </>
    );
  }
  if (el.kind === "sequential") {
    return (
      <>
        {g.positions.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="0.008" fill={stroke} opacity="0.9" />
        ))}
      </>
    );
  }
  return null;
}

function DraftOverlay({ draft }) {
  const stroke = "rgba(30,120,255,0.9)";
  const fill = "rgba(30,120,255,0.15)";
  if (draft.kind === "box" && draft.w >= 0) {
    return <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} fill={fill} stroke={stroke} strokeWidth="0.002" strokeDasharray="0.005 0.003" />;
  }
  if (draft.kind === "circle") {
    return <circle cx={draft.cx} cy={draft.cy} r={draft.r} fill={fill} stroke={stroke} strokeWidth="0.002" strokeDasharray="0.005 0.003" />;
  }
  if (draft.kind === "corners") {
    return (
      <>
        {draft.points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="0.008" fill={stroke} />
        ))}
      </>
    );
  }
  if (draft.kind === "line_label") {
    return (
      <>
        <line x1={draft.from.x} y1={draft.from.y} x2={draft.to.x} y2={draft.to.y} stroke={stroke} strokeWidth="0.002" />
        <circle cx={draft.from.x} cy={draft.from.y} r="0.006" fill={stroke} />
      </>
    );
  }
  if (draft.kind === "sequential") {
    return (
      <>
        {draft.positions.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="0.008" fill={stroke} />
        ))}
      </>
    );
  }
  return null;
}

function ElementLabel({ el }) {
  const pos = labelPosition(el);
  if (!pos) return null;
  const Icon = KIND_ICON[el.kind] || Dot;
  return (
    <div
      data-testid={`element-label-${el.id}`}
      className="absolute -translate-y-1/2 pointer-events-none"
      style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
    >
      <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-black/70 text-white inline-flex items-center gap-1 whitespace-nowrap">
        <Icon className="h-2.5 w-2.5" />
        {el.label}
      </span>
    </div>
  );
}

function labelPosition(el) {
  const g = el.geometry;
  if (el.kind === "point")       return { x: Math.min(g.x + 0.015, 0.95), y: g.y };
  if (el.kind === "circle")      return { x: Math.min(g.cx + g.r + 0.01, 0.95), y: g.cy };
  if (el.kind === "box")         return { x: Math.min(g.x + g.w + 0.005, 0.95), y: g.y + 0.012 };
  if (el.kind === "corners")     return { x: Math.min(g.x + g.w + 0.005, 0.95), y: g.y + 0.012 };
  if (el.kind === "line_label")  return { x: Math.min(g.from.x + 0.015, 0.95), y: g.from.y };
  if (el.kind === "sequential" && g.positions?.[0]) return { x: Math.min(g.positions[0].x + 0.015, 0.95), y: g.positions[0].y };
  return null;
}

/* =========== Right-pane renderers =========== */

function SchemaPane({ elements, onDelete }) {
  if (!elements.length) {
    return (
      <div className="text-xs text-[var(--tm-text-muted)] uppercase tracking-wider font-bold">
        Start marking on the scan — elements appear here.
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="schema-list">
      {elements.map((el, i) => {
        const Icon = KIND_ICON[el.kind] || Dot;
        return (
          <li key={el.id} data-testid={`schema-row-${i}`} className="border border-[var(--tm-border)] rounded-md p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-6 w-6 rounded-md bg-[var(--tm-orange)] text-white flex items-center justify-center shrink-0">
                  <Icon className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-wider font-bold text-[var(--tm-text-muted)]">{el.kind.replace("_", " + ")}</div>
                  <div className="text-xs font-bold text-[var(--tm-navy)] truncate">{el.label}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDelete(el.id)}
                data-testid={`schema-del-${i}`}
                aria-label="Delete element"
                className="text-[var(--tm-text-soft)] hover:text-[#FF3B30] p-1 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <pre className="text-[10px] bg-[var(--tm-surface)] rounded p-1.5 mt-1.5 overflow-x-auto">
              {geometrySummary(el)}
            </pre>
          </li>
        );
      })}
    </ul>
  );
}

function geometrySummary(el) {
  const g = el.geometry;
  const r = (n) => Number.isFinite(n) ? n.toFixed(3) : "—";
  if (el.kind === "point")       return `x=${r(g.x)} y=${r(g.y)}`;
  if (el.kind === "circle")      return `cx=${r(g.cx)} cy=${r(g.cy)} r=${r(g.r)}`;
  if (el.kind === "box")         return `x=${r(g.x)} y=${r(g.y)} w=${r(g.w)} h=${r(g.h)}`;
  if (el.kind === "corners")     return `rect x=${r(g.x)} y=${r(g.y)} w=${r(g.w)} h=${r(g.h)}  · ${(g.points || []).length} corners`;
  if (el.kind === "line_label")  return `from=(${r(g.from?.x)}, ${r(g.from?.y)}) → to=(${r(g.to?.x)}, ${r(g.to?.y)})`;
  if (el.kind === "sequential")  return `${(g.positions || []).length} points`;
  return "";
}

/** Blank-form reconstruction — every box/corners/line-label/point becomes
 *  a placeholder label+input positioned by normalized coordinates. No scan. */
function FormPane({ elements }) {
  if (!elements.length) {
    return <div className="text-xs text-[var(--tm-text-muted)] uppercase tracking-wider font-bold">Mark structural elements to reconstruct the form.</div>;
  }
  return (
    <div
      data-testid="form-pane"
      className="relative bg-white border border-[var(--tm-border)] rounded-md"
      style={{ width: "100%", aspectRatio: "8 / 10" }}
    >
      {elements.map((el) => {
        const g = el.geometry;
        if (el.kind === "box" || el.kind === "corners") {
          return (
            <div
              key={el.id}
              className="absolute border-2 border-dashed border-[var(--tm-blue)]/60 rounded-sm"
              style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: `${g.w * 100}%`, height: `${g.h * 100}%` }}
            >
              <div className="absolute -top-4 left-0 text-[9px] uppercase tracking-wider font-bold text-[var(--tm-blue)]">
                {el.label}
              </div>
            </div>
          );
        }
        if (el.kind === "line_label") {
          return (
            <div key={el.id}>
              <div
                className="absolute text-[10px] font-bold text-[var(--tm-navy)] -translate-y-1/2 whitespace-nowrap"
                style={{ left: `${g.from.x * 100}%`, top: `${g.from.y * 100}%` }}
              >
                {el.label}
              </div>
              <div
                className="absolute h-5 border-b-2 border-[var(--tm-orange)]"
                style={{ left: `${g.to.x * 100}%`, top: `${g.to.y * 100}%`, width: `${Math.max(6, 18 * (1 - g.to.x)) / 100 * 100}%` }}
              />
            </div>
          );
        }
        if (el.kind === "point") {
          return (
            <div
              key={el.id}
              className="absolute h-1.5 w-1.5 rounded-full bg-[var(--tm-orange)]"
              style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%` }}
            />
          );
        }
        if (el.kind === "circle") {
          return (
            <div
              key={el.id}
              className="absolute rounded-full border-2 border-dashed border-[var(--tm-text-soft)]/60"
              style={{
                left: `${(g.cx - g.r) * 100}%`, top: `${(g.cy - g.r) * 100}%`,
                width: `${2 * g.r * 100}%`, height: `${2 * g.r * 100}%`,
              }}
            />
          );
        }
        if (el.kind === "sequential") {
          return (
            <div key={el.id}>
              {(g.positions || []).map((p, i) => (
                <div
                  key={i}
                  className="absolute h-5 w-5 rounded-full bg-[var(--tm-navy)] text-white text-[9px] font-bold flex items-center justify-center -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

/** Photographic preview — shows the scan with typed sample values at
 *  line_label anchors so the driver sees where data will print. */
function PreviewPane({ template, elements }) {
  const fakeSession = useMemo(() => buildFakeSession(elements), [elements]);
  const overlayTemplate = useMemo(() => ({
    ...template,
    source: "scanned",
    // Synthesize fields{} from line_label + point elements so
    // DynamicPaperSheet can render in its existing photographic mode.
    fields: elementsToFieldMap(elements),
  }), [template, elements]);
  return (
    <div className="relative border border-[var(--tm-border)] rounded-md overflow-hidden" data-testid="preview-pane">
      {/* Scale down to fit the right pane */}
      <div style={{ transform: "scale(0.4)", transformOrigin: "top left", width: 900 }}>
        <DynamicPaperSheet session={fakeSession} profile={{}} template={overlayTemplate} />
      </div>
    </div>
  );
}

/** Produce a session-shaped object so DynamicPaperSheet has something to print. */
function buildFakeSession() {
  return {
    driver_id: "RTI-001",
    truck_number: "T-204",
    order_number: "ORD-12345",
    bol_number: "BOL-998877",
    date: new Date().toLocaleDateString(),
    rows: [{ departure_time: "08:12", location_name: "Sample Stop", stop_city: "Topeka", stop_state: "KS", trailer_number: "TR-22", trailer_type: "Dry" }],
    notes: "Preview",
  };
}

/** Map line_label + point elements onto PRESET_FIELDS_BY_ID by simple
 *  case-insensitive label matching so the photographic preview lights up. */
function elementsToFieldMap(elements) {
  const out = {};
  const byLabel = (lbl) => (lbl || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const presetMap = {
    date: "date", driverid: "driver_id", driver: "driver_id",
    truck: "truck_number", tractor: "truck_number", trucknumber: "truck_number",
    ordernumber: "order_number", order: "order_number",
    bolnumber: "bol_number", bol: "bol_number",
    pickup: "pickup_location", drop: "drop_location", dropoff: "drop_location",
    city: "stop_city", state: "stop_state",
    departuretime: "departure_time", time: "departure_time",
    trailernumber: "trailer_number", trailer: "trailer_number",
    trailertype: "trailer_type", type: "trailer_type",
    notes: "notes",
  };
  for (const el of elements) {
    if (el.kind !== "line_label" && el.kind !== "point") continue;
    const match = presetMap[byLabel(el.label)];
    if (!match) continue;
    const anchor = el.kind === "line_label" ? el.geometry.to : el.geometry;
    out[match] = { label: el.label, type: "text", x: anchor.x, y: anchor.y, anchor: "topleft" };
  }
  return out;
}
