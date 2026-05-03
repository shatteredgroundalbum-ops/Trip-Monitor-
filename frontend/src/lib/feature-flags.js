/**
 * Build-time feature flags for Trip Monitor — Driver Edition.
 *
 * IMPORTANT: do not delete the gated code paths. These flags exist so
 * we can ship without the website-side surfaces (License ID display,
 * Premium unlock redemption, Trip Monitor website link) until the
 * external website + ECDSA P-256 signing infra is live, then flip
 * the flag back on without re-implementing any of it.
 */

/**
 * When false, every UI surface that references the public Website
 * License ID, Premium unlock codes, or the external Trip Monitor
 * website is hidden. The underlying logic (ID generation, code
 * verification stub, premium state in IndexedDB) all keeps running
 * untouched so flipping this back to `true` re-enables everything.
 */
export const WEBSITE_FEATURES_ENABLED = false;
