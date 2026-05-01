import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Trophy, Undo2, CircleDot } from "lucide-react";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { PRESET_FIELDS } from "../../lib/template-types";
import { saveTemplate, setActiveTemplateId } from "../../lib/template-store";

/**
 * Tap-to-assign mapping wizard.
 *
 * The driver sees their scanned sheet and walks through the 13 preset fields
 * (PRESET_FIELDS) one at a time. For each field they tap once on the image
 * to anchor the field at that normalized (x, y) coordinate, or click
 * "Not on my sheet" to skip.
 *
 * Persistence: on finish the updated template is saved back to IndexedDB
 * and marked as the active template (the runtime will use it from now on).
 *
 * KEY UX DECISIONS (per user spec):
 *  - No drag-and-drop. Single tap only.
 *  - Optional-by-default: every field can be skipped.
 *  - Required fields (see PRESET_FIELDS[i].required) are flagged but NOT
 *    hard-blocked so drivers with unusual layouts can proceed.
 *  - Each field's mapping is visible as a numbered dot on the image so
 *    the driver sees their progress accumulate.
 */
export default function TemplateMappingWizard({ template, onDone, onCancel }) {
  const imgRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const [fields, setFields] = useState(() => ({ ...(template?.fields || {}) }));
  const [saving, setSaving] = useState(false);

  const fieldList = PRESET_FIELDS;
  const current = fieldList[idx];
  const progress = ((idx + (fields[current?.id] ? 1 : 0)) / fieldList.length) * 100;

  const mappedEntries = useMemo(
    () => fieldList.map((f, i) => ({ ...f, i, mapping: fields[f.id] })),
    [fields, fieldList]
  );

  const handleImageTap = (e) => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    // Support both click and touch.
    const pt = "touches" in e && e.touches[0]
      ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
      : { clientX: e.clientX, clientY: e.clientY };
    const x = (pt.clientX - rect.left) / rect.width;
    const y = (pt.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setFields((prev) => ({
      ...prev,
      [current.id]: {
        label: current.label,
        type: current.type,
        x,
        y,
        anchor: "topleft",
      },
    }));
  };

  const next = () => {
    if (idx < fieldList.length - 1) setIdx(idx + 1);
  };
  const back = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  const skip = () => {
    setFields((prev) => {
      const copy = { ...prev };
      delete copy[current.id];
      return copy;
    });
    next();
  };

  const undo = () => {
    setFields((prev) => {
      const copy = { ...prev };
      delete copy[current.id];
      return copy;
    });
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const updated = {
        ...template,
        fields,
        updated_at: new Date().toISOString(),
      };
      await saveTemplate(updated);
      await setActiveTemplateId(updated.id);
      const mapped = Object.keys(fields).length;
      toast.success(`Template saved — ${mapped} / ${fieldList.length} fields mapped`);
      onDone?.(updated);
    } catch (e) {
      toast.error(`Save failed: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  if (!template?.scan?.data_url) {
    return (
      <div className="p-6 text-center text-[var(--tm-text-soft)] text-sm">
        No scan attached to this template. Capture a scan first.
      </div>
    );
  }

  const hasCurrentMapping = !!fields[current.id];

  return (
    <div className="flex flex-col min-h-[calc(100vh-96px)]" data-testid="mapping-wizard">
      {/* Progress */}
      <div className="px-4 pt-3 pb-2 border-b border-[var(--tm-border)] bg-white">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] font-bold">
          <span className="text-[var(--tm-orange)]" data-testid="mapping-step-label">
            Step {idx + 1} / {fieldList.length}
          </span>
          <span className="text-[var(--tm-text-muted)]">
            {Object.keys(fields).length} mapped
          </span>
        </div>
        <div className="h-1 w-full bg-[var(--tm-surface-2)] rounded-full mt-1.5 overflow-hidden">
          <div
            className="h-full bg-[var(--tm-blue)] transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Prompt */}
      <div className="px-4 py-3 bg-[var(--tm-surface)] border-b border-[var(--tm-border)]">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-blue)] font-bold">
          Tap to assign
        </div>
        <div className="text-lg font-black tracking-tight text-[var(--tm-navy)]" data-testid="mapping-current-label">
          Tap where <span className="text-[var(--tm-orange)]">{current.label}</span> is
          {current.required && (
            <span className="ml-2 text-[10px] uppercase tracking-wider bg-[var(--tm-orange)] text-white font-bold px-1.5 py-0.5 rounded-full align-middle">
              Required
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--tm-text-soft)] mt-0.5">
          {hasCurrentMapping ? "Got it. Tap somewhere else to re-anchor, or hit Next." : "One tap per field. You can skip fields your sheet doesn't have."}
        </div>
      </div>

      {/* Scan + overlay */}
      <div className="flex-1 p-3 bg-[var(--tm-surface-2)] overflow-y-auto">
        <div
          className="relative mx-auto select-none border-2 border-[var(--tm-border)] rounded-md overflow-hidden bg-white shadow-sm"
          style={{ maxWidth: 720 }}
          data-testid="mapping-scan-container"
          onClick={handleImageTap}
        >
          <img
            ref={imgRef}
            src={template.scan.data_url}
            alt={template.name}
            draggable={false}
            className="block w-full h-auto"
            data-testid="mapping-scan-img"
          />
          {/* Mapped pins */}
          {mappedEntries.filter((e) => e.mapping).map((e) => {
            const isCurrent = e.id === current.id;
            return (
              <div
                key={e.id}
                data-testid={`mapping-pin-${e.id}`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none ${
                  isCurrent ? "z-20" : "z-10 opacity-80"
                }`}
                style={{ left: `${e.mapping.x * 100}%`, top: `${e.mapping.y * 100}%` }}
              >
                <span
                  className={`h-6 min-w-6 px-1.5 rounded-full text-[10px] font-black text-white shadow ${
                    isCurrent ? "bg-[var(--tm-orange)] ring-2 ring-[var(--tm-orange)]/40" : "bg-[var(--tm-blue)]"
                  } flex items-center justify-center`}
                >
                  {e.i + 1}
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-black/70 text-white whitespace-nowrap">
                  {e.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Tip card */}
        <div className="max-w-[720px] mx-auto mt-3 text-[11px] uppercase tracking-wider text-[var(--tm-text-muted)] font-bold flex items-center gap-1.5">
          <CircleDot className="h-3 w-3 text-[var(--tm-blue)]" />
          Drop a pin anywhere on the scan. Pinned fields show a numbered dot.
        </div>
      </div>

      {/* Controls */}
      <div
        className="sticky bottom-0 left-0 right-0 bg-white border-t border-[var(--tm-border)] p-3 flex flex-wrap items-center gap-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        <Button
          variant="outline"
          onClick={idx === 0 ? onCancel : back}
          disabled={saving}
          data-testid="mapping-back-btn"
          className="h-11 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> {idx === 0 ? "Cancel" : "Back"}
        </Button>
        {hasCurrentMapping ? (
          <Button
            variant="outline"
            onClick={undo}
            data-testid="mapping-undo-btn"
            className="h-11 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
          >
            <Undo2 className="h-4 w-4 mr-1" /> Clear
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={skip}
            disabled={saving}
            data-testid="mapping-skip-btn"
            className="h-11 bg-white border-[var(--tm-border)] text-[var(--tm-navy)] hover:bg-[var(--tm-surface)] rounded-md"
          >
            Skip ({current.required ? "required" : "optional"})
          </Button>
        )}
        {idx < fieldList.length - 1 ? (
          <Button
            onClick={next}
            disabled={saving}
            data-testid="mapping-next-btn"
            className="h-11 flex-1 min-w-[140px] bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
          >
            Next field <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            onClick={handleFinish}
            disabled={saving}
            data-testid="mapping-finish-btn"
            className="h-11 flex-1 min-w-[140px] bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md"
          >
            {saving ? (
              "Saving..."
            ) : (
              <span className="inline-flex items-center">
                <Trophy className="h-4 w-4 mr-1" /> Finish & use
              </span>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
