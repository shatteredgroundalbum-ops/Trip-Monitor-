import React, { forwardRef } from "react";
import PaperSheet from "./PaperSheet";
import { PRESET_FIELDS_BY_ID } from "../../lib/template-types";

/**
 * Template-driven trip sheet for export.
 *
 * Two modes:
 *  - `source === 'default'`  → Delegates to the legacy PaperSheet (the
 *    built-in TripMonitor / RTI layout). Unchanged output.
 *  - `source === 'scanned'`  → PHOTOGRAPHIC MODE. Renders the driver's
 *    scan image as the background and overlays typed trip values on top
 *    at the coordinates the driver mapped in TemplateMappingWizard.
 *    html2canvas screenshots the whole wrapper — no special rendering
 *    changes needed in FinishExportDialog.
 *
 * Privacy: like PaperSheet, this component NEVER renders mileage
 * (total_trip_miles / segment_miles) — mileage is internal-only.
 */
const DynamicPaperSheet = forwardRef(({ session, profile, template }, ref) => {
  const source = template?.source || "default";
  if (source !== "scanned" || !template?.scan?.data_url) {
    return <PaperSheet ref={ref} session={session} profile={profile} />;
  }
  return <ScannedPaperSheet ref={ref} session={session} profile={profile} template={template} />;
});

DynamicPaperSheet.displayName = "DynamicPaperSheet";
export default DynamicPaperSheet;

/** Pull a presentable value for a preset field id from the session. */
function valueFor(fieldId, session, row0) {
  switch (fieldId) {
    case "date":            return row0?.departure_date || session.date || "";
    case "driver_id":       return session.driver_id || "";
    case "truck_number":    return session.truck_number || "";
    case "order_number":    return session.order_number || "";
    case "bol_number":      return session.bol_number || "";
    case "pickup_location": return session.rows?.[0]?.location_name || "";
    case "drop_location":   return session.rows?.[session.rows.length - 1]?.location_name || "";
    case "stop_city":       return row0?.stop_city || "";
    case "stop_state":      return row0?.stop_state || "";
    case "departure_time":  return row0?.departure_time || "";
    case "trailer_number":  return row0?.trailer_number || "";
    case "trailer_type":    return row0?.trailer_type || "";
    case "notes":           return session.notes || "";
    default:                return "";
  }
}

/**
 * Photographic-overlay renderer. Fixed 900 px wide so html2canvas output
 * is identical regardless of the user's screen. Scales the scan to fit
 * that width while preserving aspect ratio. Text overlays use normalized
 * coordinates from `template.fields[fieldId]`.
 */
const ScannedPaperSheet = forwardRef(({ session, template }, ref) => {
  const width = 900;
  const scan = template.scan;
  const aspect = scan.height / scan.width;
  const height = Math.round(width * aspect);
  const row0 = session.rows?.[0] || {};

  const mappings = Object.entries(template.fields || {});

  return (
    <div
      ref={ref}
      id="paper-sheet"
      data-testid="paper-sheet"
      style={{
        width,
        background: "#FFFFFF",
        color: "#000000",
        fontFamily: "Arial, Helvetica, sans-serif",
        position: "relative",
      }}
    >
      {/* Scan background (rendered at native resolution) */}
      <img
        src={scan.data_url}
        alt={template.name}
        style={{ display: "block", width, height, userSelect: "none" }}
        draggable={false}
      />

      {/* Typed value overlays. Rendered as dark-navy Arial at a readable
          size; absolute-positioned at the normalized (x,y) anchors the
          driver set during mapping. */}
      <div style={{ position: "absolute", inset: 0 }}>
        {mappings.map(([fieldId, m]) => {
          const preset = PRESET_FIELDS_BY_ID[fieldId];
          const value = valueFor(fieldId, session, row0);
          if (!value) return null;
          return (
            <div
              key={fieldId}
              data-testid={`paper-overlay-${fieldId}`}
              style={{
                position: "absolute",
                left: `${m.x * 100}%`,
                top: `${m.y * 100}%`,
                fontSize: 16,
                fontWeight: 700,
                color: "#0E1F47",
                fontFamily: "Arial, Helvetica, sans-serif",
                lineHeight: 1.2,
                whiteSpace: "pre-wrap",
                maxWidth: "60%",
              }}
              title={preset?.label || fieldId}
            >
              {value}
            </div>
          );
        })}
      </div>
    </div>
  );
});

ScannedPaperSheet.displayName = "ScannedPaperSheet";
