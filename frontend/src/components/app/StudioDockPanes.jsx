import React from "react";
import { Button } from "../ui/button";
import {
  Image as ImageIcon, QrCode as QrIcon, Trash2,
} from "lucide-react";
import { FONT_PRESETS_BY_ID } from "../../lib/pro-mapping-v2";

export function InspectorPane({ schema, onDelete }) {
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

export function AssetsPane({ schema, onLogoPick, onQrPick }) {
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