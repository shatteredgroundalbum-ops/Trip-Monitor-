/**
 * Re-import from JSON backup — the inverse of export-pipeline.js.
 *
 * Validates the backup structure, then restores the session and profile
 * into the local data store. Template restoration is handled separately
 * via template-store.js since templates live in a different IndexedDB.
 */

import * as db from './local-db';
import { saveTemplate } from './template-store';

/**
 * Validate that a parsed object looks like a Trip Monitor backup.
 * Returns { ok, errors[] }.
 */
export function validateBackup(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['Not a valid object'] };
  }
  if (data.kind !== 'trip-monitor-backup') {
    errors.push('Missing or wrong "kind" field — expected "trip-monitor-backup"');
  }
  if (!data.session || typeof data.session !== 'object') {
    errors.push('Missing or invalid "session" object');
  }
  if (!data.session.session_id) {
    errors.push('Session is missing a session_id');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Import a backup into the local data store.
 *
 * @param {Object} data — parsed JSON backup object
 * @param {Object} options — { overwrite: boolean } (default: false)
 * @returns {Object} — { session, profile, template, skipped: string[] }
 */
export async function importBackup(data, options = {}) {
  const { overwrite = false } = options;
  const result = { session: null, profile: null, template: null, skipped: [] };

  // ── Session ──
  if (data.session) {
    const existing = await db.getSession(data.session.session_id);
    if (existing && !overwrite) {
      result.skipped.push(`Session ${data.session.session_id} already exists (use overwrite to replace)`);
    } else {
      // Assign a new session_id to avoid collisions if not overwriting
      const session = { ...data.session };
      if (existing && !overwrite) {
        // Won't reach here, but just in case
        session.session_id = `ts_${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
      }
      // Store directly via the sessions IndexedDB
      const { default: localforage } = await import('localforage');
      const sessionsStore = localforage.createInstance({ name: 'tm-data', storeName: 'sessions' });
      await sessionsStore.setItem(session.session_id, session);
      result.session = session;
    }
  }

  // ── Profile ──
  if (data.profile) {
    const existing = await db.getProfile();
    if (existing && !overwrite) {
      result.skipped.push('Profile already exists (use overwrite to replace)');
    } else {
      result.profile = await db.saveProfile(data.profile);
    }
  }

  // ── Template ──
  if (data.template && data.template.template_id) {
    try {
      await saveTemplate(data.template);
      result.template = data.template;
    } catch (err) {
      result.skipped.push(`Template import failed: ${err.message}`);
    }
  }

  return result;
}

/**
 * Parse a JSON backup file (Blob or File).
 * Returns the parsed object or throws on invalid JSON.
 */
export function parseBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        resolve(data);
      } catch (err) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}