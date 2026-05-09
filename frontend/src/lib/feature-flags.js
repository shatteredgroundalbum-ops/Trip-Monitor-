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

/**
 * Development mode.
 *
 * When TRUE (current state):
 *   • All premium features are visible AND accessible.
 *   • Premium locks are bypassed (`isPremiumUnlocked()` returns true).
 *   • Useful so the developer / testing agent can exercise every
 *     screen and tool without paying a tier gate during build-time.
 *
 * When FALSE (production / live):
 *   • `PREMIUM_LOCKS_ENABLED` is honoured.
 *   • Tier-based access and role-based feature gates take effect.
 *
 * Toggle by editing this constant only — never sniff the environment
 * at runtime; build-time constants stay tree-shakable.
 */
export const DEVELOPMENT_MODE = true;

/**
 * When TRUE, premium features are gated according to the user's tier.
 * When FALSE, no gating logic runs (everything is free).
 *
 * Effective behavior is `DEVELOPMENT_MODE ? false : PREMIUM_LOCKS_ENABLED`.
 * That's why `isPremiumUnlocked()` short-circuits on `DEVELOPMENT_MODE`.
 */
export const PREMIUM_LOCKS_ENABLED = false;

/**
 * Single source of truth for "should this premium feature be available
 * right now?". Use it everywhere you'd otherwise hardcode a tier check.
 *
 *   if (isPremiumUnlocked("studio.advanced")) { ... }
 *
 * The optional `featureKey` is reserved for the future tiered roll-out
 * (e.g. "analytics.expanded", "exports.pro", "templates.gallery"). For
 * now the function simply returns true while DEVELOPMENT_MODE is on,
 * so callers can wire the gate today and have it work after launch.
 */
export function isPremiumUnlocked(/* featureKey */) {
  if (DEVELOPMENT_MODE) return true;
  if (!PREMIUM_LOCKS_ENABLED) return true;
  // Production tier resolution will arrive with the licensing service.
  // Until then, default-deny so we never accidentally ship "free"
  // features that should have been gated.
  return false;
}

/**
 * Roles known to the app. Mirrored from data/constants.js for the
 * places that import flags-only and don't want to pull constants.
 */
export const ROLE_KEYS = Object.freeze({
  COMPANY_DRIVER: "company_driver",
  LPO:            "lto",            // Lease-Purchase Operator
  OWNER_OPERATOR: "owner_operator",
});
