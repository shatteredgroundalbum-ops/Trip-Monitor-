/* StudioRibbon — secondary toolbar for ProMappingStudio.

   Renders the per-tab tool groups defined in the spec:
       HOME · GRID · TEXT · ASSETS · INSPECTOR · CUSTOM TRACE

   • One tab is active at a time (driven by `activeTab` prop).
   • Tools never duplicate across tabs.
   • Icons are uniform 16 px inside 36 px square buttons.
   • Tools that map to existing studio functionality are wired through
     `ctx.handlers`. Tools without backing logic yet are clearly stubbed
     with a "coming soon" toast — never silently no-op.
*/
import React from "react";
import { toast } from "sonner";
import {
  // Selection & cursor
  MousePointer2, Crosshair,
  // Move
  Move, Move3D,
  // Scale / resize
  Maximize2, StretchHorizontal, Square,
  // Rotate
  RotateCw, RotateCcw,
  // Align
  AlignLeft, AlignCenter, AlignRight,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  // Layer
  ChevronUp, ChevronDown,
  // Group / lock
  Group as GroupIcon, Ungroup, Lock, Unlock,
  // Actions / reset
  Copy, Trash2, RefreshCw, Eraser,
  // Grid
  Columns3, Rows3, ArrowLeftRight, ArrowUpDown, MoveDiagonal,
  Magnet, Plus, Minus, ListChecks,
  // Text
  Type, Bold, Italic, Underline, Pilcrow, Hash, Calendar as CalendarIcon,
  Asterisk, Wand2, Link2, ScanText, Maximize, MoveUpRight,
  // Assets
  Image as ImageIcon, FileText, FileBox, FolderOpen, Search, Plus as PlusIcon,
  Replace, Pencil,
  // Inspector
  ArrowRightLeft, AlignVerticalJustifyStart,
  Box as BoxIcon, Ruler, AlignHorizontalSpaceAround, SquareDashed, Eye, EyeOff,
  Database, GitBranch, Variable,
  // Trace
  PenLine, StopCircle, PlayCircle, Pen, Wand, Scan, MousePointerClick,
  Target, Shrink, Expand, Settings2, RefreshCcw,
} from "lucide-react";

// ---------------------------------------------------------------- helpers ---
const stub = (name) => () => toast.info(`${name} — coming soon`);

/** Single tool button (36×36 icon-only). */
function RibbonTool({ tool }) {
  const { Icon, label, onClick, active, disabled, testId } = tool;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      data-testid={testId || `ribbon-tool-${tool.id}`}
      className={`h-9 w-9 inline-flex items-center justify-center rounded-md border transition-colors shrink-0 ${
        active
          ? "bg-[var(--tm-orange)] text-white border-[var(--tm-orange)]"
          : disabled
          ? "bg-[var(--tm-surface)] text-[var(--tm-text-muted)] border-[var(--tm-border)] opacity-50 cursor-not-allowed"
          : "bg-white text-[var(--tm-navy)] border-[var(--tm-border)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-orange)] hover:border-[var(--tm-orange)]"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/** A group of tools with title underneath. Only one group is visually
 *  "expanded" (highlighted) at a time — the one whose tool was clicked
 *  most recently. */
function RibbonGroup({ title, tools, expanded, onExpand }) {
  if (!tools.length) return null;
  return (
    <div
      data-testid={`ribbon-group-${title.toLowerCase().replace(/\s+/g, "-")}`}
      onMouseDown={onExpand}
      className={`flex flex-col items-stretch px-2 py-1 border-r border-[var(--tm-border)] last:border-r-0 shrink-0 transition-colors ${
        expanded ? "bg-[var(--tm-surface)]" : "bg-white"
      }`}
    >
      <div className="flex items-stretch gap-1 flex-wrap max-w-[200px]">
        {tools.map((t) => <RibbonTool key={t.id} tool={t} />)}
      </div>
      <div className={`text-center text-[9px] uppercase tracking-wider font-bold pt-1.5 mt-1 border-t border-[var(--tm-border)] ${
        expanded ? "text-[var(--tm-orange)]" : "text-[var(--tm-text-muted)]"
      }`}>
        {title}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- builders ---
/** Build the per-tab group lists from the live studio context. */
function buildGroups(activeTab, ctx) {
  const { handlers, state } = ctx;
  const t = (id, label, Icon, onClick, opts = {}) => ({ id, label, Icon, onClick, ...opts });

  switch (activeTab) {
    case "HOME":
      return [
        { title: "Selection", tools: [
          t("select", "Select", MousePointer2, () => handlers.setTool("select"), { active: state.tool === "select" }),
          t("direct-select", "Direct Select", Crosshair, stub("Direct Select")),
        ]},
        { title: "Move", tools: [
          t("move-free", "Move (free drag)", Move, () => handlers.setTool("select"), { active: state.tool === "select" }),
          t("nudge", "Nudge (arrow keys)", Move3D, stub("Nudge")),
        ]},
        { title: "Scale / Resize", tools: [
          t("scale", "Scale (proportional)", Maximize2, stub("Scale")),
          t("stretch", "Stretch (non-proportional)", StretchHorizontal, stub("Stretch")),
          t("handles", "Handles toggle", Square, stub("Handles toggle")),
        ]},
        { title: "Rotate", tools: [
          t("rotate", "Rotate (free)", RotateCw, stub("Rotate")),
          t("snap-rotate", "Snap Rotate (90° increments)", RotateCcw, stub("Snap Rotate")),
        ]},
        { title: "Align", tools: [
          t("align-left", "Align Left", AlignStartVertical, stub("Align Left")),
          t("align-center", "Align Center (horizontal)", AlignCenterVertical, stub("Align Center")),
          t("align-right", "Align Right", AlignEndVertical, stub("Align Right")),
          t("align-top", "Align Top", AlignStartHorizontal, stub("Align Top")),
          t("align-middle", "Align Middle (vertical)", AlignCenterHorizontal, stub("Align Middle")),
          t("align-bottom", "Align Bottom", AlignEndHorizontal, stub("Align Bottom")),
        ]},
        { title: "Layer", tools: [
          t("bring-forward", "Bring Forward", ChevronUp, stub("Bring Forward")),
          t("send-backward", "Send Backward", ChevronDown, stub("Send Backward")),
        ]},
        { title: "Group", tools: [
          t("group", "Group", GroupIcon, stub("Group")),
          t("ungroup", "Ungroup", Ungroup, stub("Ungroup")),
        ]},
        { title: "Lock", tools: [
          t("lock", "Lock selection", Lock, handlers.lockSelected || stub("Lock")),
          t("unlock", "Unlock selection", Unlock, handlers.unlockSelected || stub("Unlock")),
        ]},
        { title: "Actions", tools: [
          t("duplicate", "Duplicate", Copy, handlers.duplicateSelected || stub("Duplicate")),
          t("delete", "Delete", Trash2, handlers.removeSelected, { disabled: !state.hasSelection }),
        ]},
        { title: "Reset", tools: [
          t("reset-transform", "Reset Transform", RefreshCw, stub("Reset Transform")),
        ]},
      ];

    case "GRID":
      return [
        { title: "Line Selection", tools: [
          t("col-selector", "Column Selector", Columns3, stub("Column Selector")),
          t("row-selector", "Row Selector", Rows3, stub("Row Selector")),
        ]},
        { title: "Movement", tools: [
          t("move-col", "Move Column (left/right)", ArrowLeftRight, stub("Move Column")),
          t("move-row", "Move Row (up/down)", ArrowUpDown, stub("Move Row")),
          t("free-move", "Free Move (4-direction)", MoveDiagonal, stub("Free Move")),
        ]},
        { title: "Constraints", tools: [
          t("snap-toggle", "Snap to grid", Magnet,
             () => { handlers.setSnapToGrid && handlers.setSnapToGrid((v) => !v); },
             { active: !!state.snapToGrid }),
          t("lock-axis", "Lock Axis (X/Y)", Lock, stub("Lock Axis")),
        ]},
        { title: "Line Management", tools: [
          t("add-line", "Add Line", Plus, handlers.gridAddLine || stub("Add Line")),
          t("remove-line", "Remove Line", Minus, handlers.gridRemoveLine || stub("Remove Line")),
          t("even-distribute", "Even Distribution", ListChecks, stub("Even Distribution")),
        ]},
        { title: "Reset", tools: [
          t("reset-grid", "Reset Grid", RefreshCw, stub("Reset Grid")),
        ]},
      ];

    case "TEXT":
      return [
        { title: "Draw / Placement", tools: [
          t("draw-text-box", "Draw Text Box", Type,
             () => handlers.setTool("text"), { active: state.tool === "text" }),
          t("auto-field-detect", "Auto Field Detection", Wand2, stub("Auto Field Detection")),
          t("snap-to-field", "Snap to Field", Magnet, stub("Snap to Field")),
        ]},
        { title: "Text Formatting", tools: [
          t("font-family", "Font Family", Pilcrow,
             () => handlers.openFontPicker?.() || stub("Font Family")()),
          t("font-size", "Font Size", Hash, stub("Font Size")),
          t("bold", "Bold", Bold,
             () => handlers.setFontWeight?.((w) => w === "bold" ? "normal" : "bold"),
             { active: state.fontWeight === "bold" }),
          t("italic", "Italic", Italic, stub("Italic")),
          t("underline", "Underline", Underline, stub("Underline")),
          t("align-left-text", "Align Left", AlignLeft, stub("Text Align Left")),
          t("align-center-text", "Align Center", AlignCenter, stub("Text Align Center")),
          t("align-right-text", "Align Right", AlignRight, stub("Text Align Right")),
        ]},
        { title: "Input Type", tools: [
          t("text-field", "Text Field", Type, stub("Text Field")),
          t("number-field", "Number Field", Hash, stub("Number Field")),
          t("date-field", "Date Field", CalendarIcon, stub("Date Field")),
          t("dropdown-field", "Dropdown Field", ChevronDown, stub("Dropdown Field")),
        ]},
        { title: "Behavior", tools: [
          t("required-toggle", "Required Toggle", Asterisk, stub("Required Toggle")),
          t("auto-format", "Auto Format", Wand2, stub("Auto Format")),
          t("field-linking", "Field Linking", Link2, stub("Field Linking")),
        ]},
        { title: "Structure", tools: [
          t("align-text-grid", "Align Text to Grid", ScanText, stub("Align Text to Grid")),
          t("resize-fit-field", "Resize to Fit Field", Maximize, stub("Resize to Fit Field")),
          t("auto-position", "Auto Position", MoveUpRight, stub("Auto Position")),
        ]},
      ];

    case "ASSETS":
      return [
        { title: "Import", tools: [
          t("upload-image", "Upload Image", ImageIcon,
             () => handlers.setTool("logo"), { active: state.tool === "logo" }),
          t("upload-document", "Upload Document", FileText, stub("Upload Document")),
          t("upload-template", "Upload Template", FileBox, stub("Upload Template")),
        ]},
        { title: "Library", tools: [
          t("view-library", "View Asset Library", FolderOpen, stub("View Asset Library")),
          t("search-assets", "Search Assets", Search, stub("Search Assets")),
        ]},
        { title: "Placement", tools: [
          t("place-asset", "Place Asset", PlusIcon, stub("Place Asset")),
          t("replace-asset", "Replace Asset", Replace, stub("Replace Asset")),
        ]},
        { title: "Management", tools: [
          t("rename-asset", "Rename Asset", Pencil, stub("Rename Asset")),
          t("delete-asset", "Delete Asset", Trash2, stub("Delete Asset")),
        ]},
      ];

    case "INSPECTOR":
      return [
        { title: "Element Properties", tools: [
          t("position", "Position (X / Y)", ArrowRightLeft, stub("Position editor")),
          t("size", "Size (Width / Height)", BoxIcon, stub("Size editor")),
          t("rotation", "Rotation (numeric)", RotateCw, stub("Rotation editor")),
        ]},
        { title: "Layout", tools: [
          t("padding", "Padding", Ruler, stub("Padding")),
          t("margin", "Margin", AlignHorizontalSpaceAround, stub("Margin")),
          t("anchors", "Alignment Anchors", AlignVerticalJustifyStart, stub("Alignment Anchors")),
        ]},
        { title: "Style", tools: [
          t("border", "Border (on/off, thickness)", SquareDashed, stub("Border")),
          t("opacity", "Opacity", Eye, stub("Opacity")),
          t("visibility", "Visibility toggle", EyeOff, stub("Visibility")),
        ]},
        { title: "Data Binding", tools: [
          t("field-mapping", "Field Mapping", Database, stub("Field Mapping")),
          t("value-source", "Value Source", GitBranch, stub("Value Source")),
          t("default-values", "Default Values", Variable, stub("Default Values")),
        ]},
      ];

    case "CUSTOM TRACE":
      return [
        { title: "Trace Tools", tools: [
          t("start-trace", "Start Trace", PlayCircle,
             () => handlers.setTool("trace"), { active: state.tool === "trace" }),
          t("stop-trace", "Stop Trace", StopCircle,
             () => handlers.setTool("select"), { active: state.tool !== "trace" && state.tool !== "freehand" }),
          t("manual-trace", "Manual Trace (freehand)", Pen,
             () => handlers.setTool("freehand"), { active: state.tool === "freehand" }),
        ]},
        { title: "Detection", tools: [
          t("auto-detect", "Auto Detect Fields", Wand, stub("Auto Detect Fields")),
          t("edge-detect", "Edge Detection", PenLine, stub("Edge Detection")),
          t("region-select", "Region Selection", Scan, stub("Region Selection")),
        ]},
        { title: "Mapping", tools: [
          t("assign-field", "Assign Field", MousePointerClick, stub("Assign Field")),
          t("link-data-field", "Link to Data Field", Link2, stub("Link to Data Field")),
          t("adjust-boundaries", "Adjust Boundaries", Target, stub("Adjust Boundaries")),
        ]},
        { title: "Refinement", tools: [
          t("expand-selection", "Expand Selection", Expand, stub("Expand Selection")),
          t("shrink-selection", "Shrink Selection", Shrink, stub("Shrink Selection")),
          t("fine-adjust", "Fine Adjust", Settings2, stub("Fine Adjust")),
        ]},
        { title: "Reset", tools: [
          t("clear-trace", "Clear Trace", Eraser, stub("Clear Trace")),
          t("reset-mapping", "Reset Mapping", RefreshCcw, stub("Reset Mapping")),
        ]},
      ];

    default:
      return [];
  }
}

// ----------------------------------------------------------------- root ----
export default function StudioRibbon({ activeTab, ctx }) {
  // Track which group was last interacted with — used for the "only one
  // group expanded at a time" visual emphasis. Resets per-tab.
  const [expandedGroup, setExpandedGroup] = React.useState(null);
  React.useEffect(() => { setExpandedGroup(null); }, [activeTab]);

  const groups = buildGroups(activeTab, ctx);

  return (
    <div
      data-testid="studio-secondary-toolbar"
      data-active-tab={activeTab}
      className="flex items-stretch gap-0 overflow-x-auto bg-white border-b border-[var(--tm-border)] min-h-[68px]"
    >
      {groups.map((g) => (
        <RibbonGroup
          key={g.title}
          title={g.title}
          tools={g.tools}
          expanded={expandedGroup === g.title}
          onExpand={() => setExpandedGroup(g.title)}
        />
      ))}
    </div>
  );
}
