import localforage from "localforage";
import { emptyTemplate } from "./template-types";

/**
 * Local-first template persistence layer (IndexedDB via localforage).
 *
 * KEY DECISIONS (locked in by user spec):
 *  - Storage is local-only. Templates never leave the device unless the
 *    driver explicitly opts into a cloud backup (Phase 3+).
 *  - We keep a single "active template id" pointer separately so the
 *    runtime can ask "which template is the driver currently using?"
 *    without scanning the full collection.
 *  - When a driver adds a new scanned template we DO NOT delete prior
 *    ones — Batch 2 will surface a "Multiple templates take more
 *    storage" warning per the user's memory rule.
 */

// Two stores: templates collection + a tiny meta KV.
const tplStore = localforage.createInstance({
  name: "tripmonitor",
  storeName: "trip_templates",
  description: "Per-driver scanned/built-in trip-sheet templates",
});
const metaStore = localforage.createInstance({
  name: "tripmonitor",
  storeName: "tripmonitor_meta",
});

const META_ACTIVE_KEY = "active_template_id";
const META_DRAFT_KEY = "studio_draft";

/**
 * Draft persistence — stores an in-progress mapping session so the
 * driver can resume after closing the app or navigating away. Only
 * one draft at a time; saving overwrites. Cleared on map "Done".
 */
export async function saveDraft(draft) {
  if (!draft) return;
  await metaStore.setItem(META_DRAFT_KEY, {
    ...draft, updated_at: new Date().toISOString(),
  });
}
export async function getDraft() {
  return (await metaStore.getItem(META_DRAFT_KEY)) || null;
}
export async function clearDraft() {
  await metaStore.removeItem(META_DRAFT_KEY);
}

/** Persist a template (insert or update). */
export async function saveTemplate(template) {
  if (!template || !template.id) throw new Error("template.id is required");
  const next = { ...template, updated_at: new Date().toISOString() };
  await tplStore.setItem(template.id, next);
  return next;
}

/** Fetch one by id, or null. */
export async function getTemplate(id) {
  if (!id) return null;
  return (await tplStore.getItem(id)) || null;
}

/** Return all templates as an array, newest first. */
export async function listTemplates() {
  const items = [];
  await tplStore.iterate((value) => {
    items.push(value);
  });
  items.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
  return items;
}

/** Approximate total storage footprint in bytes (sum of base64 lengths). */
export async function totalStorageBytes() {
  let total = 0;
  await tplStore.iterate((value) => {
    if (value?.scan?.data_url) total += value.scan.data_url.length;
    total += JSON.stringify({ ...value, scan: null }).length;
  });
  return total;
}

/** Delete a template by id. Clears active pointer if it matched. */
export async function deleteTemplate(id) {
  await tplStore.removeItem(id);
  const active = await metaStore.getItem(META_ACTIVE_KEY);
  if (active === id) await metaStore.removeItem(META_ACTIVE_KEY);
}

/** Set the active template id (the one the driver is currently using). */
export async function setActiveTemplateId(id) {
  if (!id) {
    await metaStore.removeItem(META_ACTIVE_KEY);
    return;
  }
  await metaStore.setItem(META_ACTIVE_KEY, id);
}

/** Get the active template id, or null. */
export async function getActiveTemplateId() {
  return (await metaStore.getItem(META_ACTIVE_KEY)) || null;
}

/** Convenience: get the active template object (or null). */
export async function getActiveTemplate() {
  const id = await getActiveTemplateId();
  if (!id) return null;
  return await getTemplate(id);
}

/** Convenience: create + save a fresh template skeleton. */
export async function createTemplate(opts) {
  const tpl = emptyTemplate(opts || {});
  await saveTemplate(tpl);
  return tpl;
}

/**
 * ID used for the built-in TripMonitor default template. Stable so we
 * can idempotently seed it across app launches.
 */
export const DEFAULT_TEMPLATE_ID = "builtin-tripmonitor-default";

/**
 * Ensure the built-in default template record exists. Pre-mapped so the
 * app can render a trip sheet out-of-the-box, before the driver scans
 * anything of their own. The actual rendering for source='default' is
 * handled by DynamicPaperSheet, which delegates to the legacy PaperSheet
 * component — so we don't need real coordinates here.
 */
export async function ensureDefaultTemplate() {
  const existing = await tplStore.getItem(DEFAULT_TEMPLATE_ID);
  if (existing) return existing;
  const now = new Date().toISOString();
  const defaultTpl = {
    id: DEFAULT_TEMPLATE_ID,
    name: "Trip Monitor Default",
    source: "default",
    is_default: true,
    created_at: now,
    updated_at: now,
    scan: null,
    ocr_words: [],
    fields: {},
  };
  await tplStore.setItem(DEFAULT_TEMPLATE_ID, defaultTpl);
  // Auto-activate on first run so the runtime always has an active template.
  const active = await metaStore.getItem(META_ACTIVE_KEY);
  if (!active) await metaStore.setItem(META_ACTIVE_KEY, DEFAULT_TEMPLATE_ID);
  return defaultTpl;
}

/** Wipe the templates collection (test / dev only). */
export async function _DEV_clearAll() {
  await tplStore.clear();
  await metaStore.removeItem(META_ACTIVE_KEY);
}
