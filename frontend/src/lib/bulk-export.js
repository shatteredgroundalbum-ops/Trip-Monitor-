/**
 * Bulk export utility — generates a ZIP archive containing CSV + JSON
 * backups for each selected finished trip session.
 *
 * Reuses the per-trip exporters from export-pipeline.js and bundles
 * them into a single downloadable ZIP via JSZip.
 */

import JSZip from 'jszip';
import { buildTripCsvBlob, buildTripBackupBlob, safeBaseName } from './export-pipeline';

/**
 * Build a ZIP blob containing CSV + JSON for each selected trip.
 *
 * @param {Object[]} trips   — array of finished session objects
 * @param {Object}   profile — the driver profile (for CSV/JSON metadata)
 * @param {Function} getTemplate — async () => active template (for JSON backup)
 * @param {Function} onProgress — (pct: number) => void  (0..100)
 * @returns {Promise<Blob>} — the ZIP file blob
 */
export async function buildBulkExportZip(trips, profile, getTemplate, onProgress) {
  const zip = new JSZip();
  const template = await getTemplate();
  const total = trips.length;
  let done = 0;

  for (const trip of trips) {
    const base = safeBaseName(trip, profile);
    const folder = zip.folder(base);

    // CSV
    const csvBlob = buildTripCsvBlob(trip, profile);
    folder.file(`${base}.csv`, csvBlob);

    // JSON backup
    const jsonBlob = buildTripBackupBlob({ session: trip, profile, template });
    folder.file(`${base}.json`, jsonBlob);

    done++;
    if (onProgress) onProgress(Math.round((done / total) * 100));
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return blob;
}

/**
 * Download a blob as a file using a temporary anchor element.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}