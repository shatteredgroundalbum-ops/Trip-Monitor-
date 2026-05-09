/**
 * Document organization preferences for the Documents screen.
 * Toggles the user's organize/dedupe behavior. Stored in localStorage.
 */
const KEY = "tm_doc_organization_v1";

const DEFAULTS = Object.freeze({
  autoOrganizeByTrip: true,
  autoOrganizeByDate: false,
  renameByPattern: false,            // {category}-{trip}-{seq}
  detectDuplicates: true,
  archiveCompletedFiles: false,
});

export function loadDocOrganization() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

export function saveDocOrganization(prefs) {
  const merged = { ...DEFAULTS, ...prefs };
  try { localStorage.setItem(KEY, JSON.stringify(merged)); } catch { /* ignore */ }
  return merged;
}

export function resetDocOrganization() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return { ...DEFAULTS };
}
