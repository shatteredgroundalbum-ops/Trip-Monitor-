/**
 * Print settings persistence for the Reports screen. Affects only
 * printable exports (PDF/print preview). Stored in localStorage so
 * the driver's preferred page setup persists across sessions.
 */

const KEY = "tm_print_settings_v1";

export const PAGE_SIZES = Object.freeze([
  { value: "letter", label: 'Letter (8.5" × 11")' },
  { value: "legal",  label: 'Legal (8.5" × 14")' },
  { value: "a4",     label: "A4 (210 × 297 mm)" },
]);

export const ORIENTATIONS = Object.freeze([
  { value: "portrait",  label: "Portrait" },
  { value: "landscape", label: "Landscape" },
]);

export const MARGINS = Object.freeze([
  { value: "narrow",   label: "Narrow (0.25\")" },
  { value: "normal",   label: "Normal (0.5\")" },
  { value: "wide",     label: "Wide (1.0\")" },
]);

const DEFAULTS = Object.freeze({
  pageSize: "letter",
  orientation: "portrait",
  margins: "normal",
  showHeaderFooter: true,
  showCompanyBranding: true,
});

export function loadPrintSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch { return { ...DEFAULTS }; }
}

export function savePrintSettings(settings) {
  const merged = { ...DEFAULTS, ...settings };
  try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* ignore */ }
  return merged;
}

export function resetPrintSettings() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return { ...DEFAULTS };
}
