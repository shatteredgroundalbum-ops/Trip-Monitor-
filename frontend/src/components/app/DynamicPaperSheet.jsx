import React, { forwardRef } from "react";
import PaperSheet from "./PaperSheet";
import { CleanReconstructionCanvas } from "./CleanReconstructionCanvas";
import { PRESET_FIELDS_BY_ID } from "../../lib/template-types";

/**
 * Template-driven trip sheet for export.
 *
 * Three modes:
 *  - `source === 'default'`     → legacy PaperSheet (RTI layout).
 *  - schema.version === 2       → Pro Studio CLEAN RECONSTRUCTION (no scan).
 *  - `source === 'scanned'`     → photographic overlay fallback (legacy
 *    Quick Map + 6-primitive Pro editor both land here).
 *
 * Privacy: mileage (total_trip_miles / segment_miles) is NEVER rendered
 * on ANY of these modes.
 */
const DynamicPaperSheet = forwardRef(({ session, profile, template }, ref) => {
  const source = template?.source || "default";
  if (source !== "scanned" || !template?.scan?.data_url) {
    return <PaperSheet ref={ref} session={session} profile={profile} />;
  }
  // Pro Studio schema v2 → clean vector reconstruction (export surface).
  if (template?.schema?.version === 2) {
    return <CleanReconstructionCanvas ref={ref} schema={template.schema} session={session} width={900} />;
  }
  // Legacy scanned-overlay flow (Quick Map + old Pro editor).
  const effective = template.fields && Object.keys(template.fields).length
    ? template
    : { ...template, fields: elementsToFields(template.schema?.elements || []) };
  return <ScannedPaperSheet ref={ref} session={session} profile={profile} template={effective} />;
});

/** Map pro-mapping schema elements to a PaperSheet-style fields{} object
 *  by case-insensitive label matching. Keeps a single photographic
 *  renderer downstream — DynamicPaperSheet doesn't care which mapping
 *  flow the driver used. */
function elementsToFields(elements) {
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
