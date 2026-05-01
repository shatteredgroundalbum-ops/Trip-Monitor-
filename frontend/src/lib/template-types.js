/**
 * Trip-sheet template data model.
 *
 * Storage strategy (locked in by user spec):
 *   - Local-first via IndexedDB (localforage). No cloud round-trip.
 *   - Optional cloud backup is a Phase-3+ concern — NOT implemented here.
 *
 * Two template "sources":
 *   - 'default'  — built-in TripMonitor / RTI sheet shipped with the app.
 *                  Has pre-mapped field coordinates, no scan image.
 *   - 'scanned'  — user captured their own company sheet. Has a base64
 *                  scan image + OCR hints + per-driver field mappings.
 *
 * Coordinates are stored in NORMALIZED 0..1 units against the scan
 * dimensions so the same template renders correctly at any export size
 * (paper, JPEG @ 1080px, PDF @ A4, etc).
 *
 * @typedef {Object} OcrWord
 * @property {string} text       Raw OCR text for the word.
 * @property {number} x          Normalized 0..1 (top-left).
 * @property {number} y          Normalized 0..1 (top-left).
 * @property {number} w          Normalized width.
 * @property {number} h          Normalized height.
 * @property {number} confidence Tesseract confidence 0..100.
 *
 * @typedef {Object} FieldMapping
 * @property {string} label    Human label, e.g. "Order #".
 * @property {string} type     'text' | 'date' | 'time' | 'number'.
 * @property {number} x        Normalized 0..1 anchor X.
 * @property {number} y        Normalized 0..1 anchor Y.
 * @property {number} [w]      Optional normalized width of the input box.
 * @property {number} [h]      Optional normalized height.
 * @property {('topleft'|'center')} [anchor='topleft']
 *
 * @typedef {Object} TripTemplate
 * @property {string}  id                 UUID-v4.
 * @property {string}  name               Human-readable, e.g. "RTI Default".
 * @property {'default'|'scanned'} source
 * @property {boolean} is_default         True if shipped with the app.
 * @property {string}  created_at         ISO-8601.
 * @property {string}  updated_at         ISO-8601.
 * @property {{
 *   data_url: string,
 *   width: number,
 *   height: number,
 *   captured_at: string
 * } | null} scan                          Original scan as base64 JPEG.
 * @property {OcrWord[]} ocr_words         Tesseract output (used as mapping hints).
 * @property {Object<string, FieldMapping>} fields  Field-id → mapping.
 */

/**
 * The canonical set of fields a trip sheet should support. Drivers will
 * tap to anchor each one onto their scan during the (future) mapping UI.
 * Order matters — this is the order the mapping wizard will walk through.
 */
export const PRESET_FIELDS = [
  { id: "date",            label: "Date",              type: "date",   required: true  },
  { id: "driver_id",       label: "Driver ID",         type: "text",   required: true  },
  { id: "truck_number",    label: "Truck / Tractor #", type: "text",   required: true  },
  { id: "order_number",    label: "Order #",           type: "text",   required: true  },
  { id: "bol_number",      label: "BOL #",             type: "text",   required: false },
  { id: "pickup_location", label: "Pickup Location",   type: "text",   required: true  },
  { id: "drop_location",   label: "Drop-off Location", type: "text",   required: true  },
  { id: "stop_city",       label: "Stop City",         type: "text",   required: false },
  { id: "stop_state",      label: "Stop State",        type: "text",   required: false },
  { id: "departure_time",  label: "Departure Time",    type: "time",   required: false },
  { id: "trailer_number",  label: "Trailer #",         type: "text",   required: false },
  { id: "trailer_type",    label: "Trailer Type",      type: "text",   required: false },
  { id: "notes",           label: "Notes",             type: "text",   required: false },
];

/** Field-id → preset field metadata. */
export const PRESET_FIELDS_BY_ID = Object.fromEntries(
  PRESET_FIELDS.map((f) => [f.id, f])
);

/** Build a fresh empty template skeleton. */
export function emptyTemplate({ name, source }) {
  const now = new Date().toISOString();
  return {
    id: cryptoUuid(),
    name: name || (source === "default" ? "TripMonitor Default" : "Untitled scan"),
    source: source === "default" ? "default" : "scanned",
    is_default: source === "default",
    created_at: now,
    updated_at: now,
    scan: null,
    ocr_words: [],
    fields: {},
  };
}

/** UUID-v4 with a crypto.randomUUID fallback. */
export function cryptoUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback v4 generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
