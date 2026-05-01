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

/** Wipe the templates collection (test / dev only). */
export async function _DEV_clearAll() {
  await tplStore.clear();
  await metaStore.removeItem(META_ACTIVE_KEY);
}
