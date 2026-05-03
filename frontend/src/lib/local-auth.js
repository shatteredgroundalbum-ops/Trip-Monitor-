/**
 * Local-device authentication for Trip Monitor — Driver Edition.
 *
 * Security spec:
 *   - 24-char master recovery code is APP-GENERATED (user never types it).
 *     Shown exactly once during setup as an emergency backup. Stored in
 *     the separate keychain DB; the auth vault only holds a salted hash
 *     (so even an app-DB dump can't recover the master code without the
 *     keychain).
 *   - During setup the user provides: displayUsername, driverId, 6-digit
 *     PIN, and a recovery phrase (>=4 words, case-insensitive, spaces
 *     normalized). Recovery phrase is stored only as PBKDF2 salted hash
 *     and is NEVER shown back to the user after setup.
 *   - PIN reset requires: driverId + (recoveryPhrase OR master code).
 *     Biometric unlock is a daily-use convenience, not a reset path.
 *   - Lockouts: 5 wrong PINs → 30 s; 5 wrong recovery attempts → 5 min.
 *   - No cloud auth, no server login, no username/password against a
 *     remote service.
 *
 * Storage split:
 *   - tm-keychain DB  → master_code, device_id, driver_id, display_username
 *                       (device secure storage analogue)
 *   - tm-auth DB      → pin_verifier, recovery_verifier, master_verifier,
 *                       pin_attempts, recovery_attempts, webauthn_credential
 *                       (hash-only vault)
 */

import { WEBSITE_FEATURES_ENABLED } from "./feature-flags";

const KEYCHAIN_DB = "tm-keychain";
const AUTH_DB = "tm-auth";
const KEYCHAIN_STORE = "secrets";
const AUTH_STORE = "vault";

// keychain keys
const MASTER_CODE_KEY = "master_code";
const DEVICE_ID_KEY = "device_id";
const DRIVER_ID_KEY = "driver_id";
const DISPLAY_USERNAME_KEY = "display_username";
const LICENSE_ID_KEY = "website_license_id";

// auth vault keys
const PIN_VERIFIER_KEY = "pin_verifier";
const RECOVERY_VERIFIER_KEY = "recovery_verifier";
const MASTER_VERIFIER_KEY = "master_verifier";
const FINGERPRINT_KEY = "webauthn_credential";
const PIN_ATTEMPT_KEY = "pin_attempts";
const RECOVERY_ATTEMPT_KEY = "recovery_attempts";
const PREMIUM_STATE_KEY = "premium_state";

// constants
const MASTER_CODE_LENGTH = 24;
const MASTER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
// License ID is PUBLIC (shared with website + support). Format:
// "TM-" + 3 groups of 4 upper-case alphanumerics separated by "-".
// Alphabet excludes visually-ambiguous chars (I, O, 0, 1) so a driver
// can dictate their license ID over the phone without mistakes.
const LICENSE_ID_PREFIX = "TM";
const LICENSE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LICENSE_ID_GROUP_SIZE = 4;
const LICENSE_ID_GROUPS = 3;
const PBKDF2_ITERATIONS = 100_000;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 30_000;
const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_LOCKOUT_MS = 5 * 60_000;
const MIN_PHRASE_WORDS = 4;

// ---------- IndexedDB helpers ----------

function openDb(dbName, storeName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet(dbName, storeName, key) {
  const db = await openDb(dbName, storeName);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

async function kvSet(dbName, storeName, key, value) {
  const db = await openDb(dbName, storeName);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function kvDelete(dbName, storeName, key) {
  const db = await openDb(dbName, storeName);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function deleteDatabase(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

// ---------- Crypto helpers ----------

const enc = new TextEncoder();
function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }
function toHex(bytes) { return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(hex) {
  const len = hex.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function deriveHash(secretString, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(secretString),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

function normalizeAlpha(s) { return String(s || "").replace(/[^A-Za-z0-9]/g, ""); }
export function normalizePhrase(input) {
  // case-insensitive, collapse whitespace to single spaces, trim
  return String(input || "").toLowerCase().replace(/\s+/g, " ").trim();
}
export function countPhraseWords(input) {
  const n = normalizePhrase(input);
  return n ? n.split(" ").length : 0;
}
export function isValidPhrase(input) {
  return countPhraseWords(input) >= MIN_PHRASE_WORDS;
}
export function isValidPin(pin) { return typeof pin === "string" && /^\d{6}$/.test(pin); }
export function isValidDriverId(id) {
  const s = String(id || "").trim();
  return s.length >= 3 && s.length <= 32 && /^[A-Za-z0-9\-_]+$/.test(s);
}
export function isValidDisplayUsername(name) {
  const s = String(name || "").trim();
  return s.length >= 2 && s.length <= 40;
}

export function generateMasterCode() {
  const bytes = randomBytes(MASTER_CODE_LENGTH);
  const out = new Array(MASTER_CODE_LENGTH);
  for (let i = 0; i < MASTER_CODE_LENGTH; i++) {
    out[i] = MASTER_CODE_ALPHABET[bytes[i] % MASTER_CODE_ALPHABET.length];
  }
  return out.join("");
}
export function formatMasterCode(code) {
  const clean = normalizeAlpha(code);
  return clean.match(/.{1,4}/g)?.join(" ") || clean;
}

/**
 * Generates a PUBLIC Website License ID that the driver can share
 * with customer support or type into the Trip Monitor website for
 * purchases. This is NOT a secret — it's the opposite of the master
 * code. Example output: "TM-8F4K-22P9-X7Q1".
 *
 * The master code must NEVER be sent to the website. The license ID
 * is the public-facing identifier for purchases / support / premium
 * unlock and is safe to share over phone, email, or a ticket.
 */
export function generateLicenseId() {
  const groups = [];
  for (let g = 0; g < LICENSE_ID_GROUPS; g++) {
    const bytes = randomBytes(LICENSE_ID_GROUP_SIZE);
    let s = "";
    for (let i = 0; i < LICENSE_ID_GROUP_SIZE; i++) {
      s += LICENSE_ID_ALPHABET[bytes[i] % LICENSE_ID_ALPHABET.length];
    }
    groups.push(s);
  }
  return `${LICENSE_ID_PREFIX}-${groups.join("-")}`;
}

export async function getLicenseId() {
  return (await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, LICENSE_ID_KEY)) || "";
}

// ---------- Public state helpers ----------

export async function isSetup() {
  const m = await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY);
  const p = await kvGet(AUTH_DB, AUTH_STORE, PIN_VERIFIER_KEY);
  const r = await kvGet(AUTH_DB, AUTH_STORE, RECOVERY_VERIFIER_KEY);
  return Boolean(m && p && r);
}

export async function getDeviceId() {
  let id = await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, DEVICE_ID_KEY);
  if (!id) {
    id = "dev_" + toHex(randomBytes(12));
    await kvSet(KEYCHAIN_DB, KEYCHAIN_STORE, DEVICE_ID_KEY, id);
  }
  return id;
}

export async function getIdentity() {
  const [driver_id, display_username] = await Promise.all([
    kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, DRIVER_ID_KEY),
    kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, DISPLAY_USERNAME_KEY),
  ]);
  return { driver_id: driver_id || "", display_username: display_username || "" };
}

// ---------- Setup ----------

export async function setupAuth({ displayUsername, driverId, pin, recoveryPhrase }) {
  if (!isValidDisplayUsername(displayUsername)) throw new Error("Display name must be 2–40 characters");
  if (!isValidDriverId(driverId)) throw new Error("Driver ID must be 3–32 letters/numbers/-/_");
  if (!isValidPin(pin)) throw new Error("PIN must be exactly 6 digits");
  if (!isValidPhrase(recoveryPhrase)) throw new Error(`Recovery phrase must be at least ${MIN_PHRASE_WORDS} words`);

  const username = String(displayUsername).trim();
  const driver = String(driverId).trim();
  const phrase = normalizePhrase(recoveryPhrase);
  const masterCode = generateMasterCode();
  const licenseId = generateLicenseId();

  // Derive all hashes first — if any fails we abort before touching keychain.
  const pinSalt = randomBytes(16);
  const recoverySalt = randomBytes(16);
  const masterSalt = randomBytes(16);
  // PIN verifier binds the PIN to the master code so a leaked verifier
  // alone (without the master code in the keychain) cannot be brute-forced.
  const pinHash = await deriveHash(pin + ":" + masterCode, pinSalt);
  // Recovery verifier binds phrase to driverId (lowercase) so attackers
  // need both. Does NOT bind to master code — the spec says master code
  // is only for emergency recovery when phrase is also lost.
  const recoveryHash = await deriveHash(phrase + ":" + driver.toLowerCase(), recoverySalt);
  // Master-code verifier also binds driverId — for the emergency path.
  const masterHash = await deriveHash(masterCode + ":" + driver.toLowerCase(), masterSalt);

  // Keychain writes
  await kvSet(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY, masterCode);
  await kvSet(KEYCHAIN_DB, KEYCHAIN_STORE, DRIVER_ID_KEY, driver);
  await kvSet(KEYCHAIN_DB, KEYCHAIN_STORE, DISPLAY_USERNAME_KEY, username);
  await kvSet(KEYCHAIN_DB, KEYCHAIN_STORE, LICENSE_ID_KEY, licenseId);
  await getDeviceId();

  // Vault writes
  const now = new Date().toISOString();
  try {
    await kvSet(AUTH_DB, AUTH_STORE, PIN_VERIFIER_KEY, {
      version: 2, hash_hex: toHex(pinHash), salt_hex: toHex(pinSalt), created_at: now,
    });
    await kvSet(AUTH_DB, AUTH_STORE, RECOVERY_VERIFIER_KEY, {
      version: 2, hash_hex: toHex(recoveryHash), salt_hex: toHex(recoverySalt), created_at: now,
    });
    await kvSet(AUTH_DB, AUTH_STORE, MASTER_VERIFIER_KEY, {
      version: 2, hash_hex: toHex(masterHash), salt_hex: toHex(masterSalt), created_at: now,
    });
    await kvSet(AUTH_DB, AUTH_STORE, PIN_ATTEMPT_KEY, { failed: 0, lockedUntil: 0 });
    await kvSet(AUTH_DB, AUTH_STORE, RECOVERY_ATTEMPT_KEY, { failed: 0, lockedUntil: 0 });
  } catch (err) {
    // Roll back keychain to avoid half-configured device.
    await kvDelete(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY);
    await kvDelete(KEYCHAIN_DB, KEYCHAIN_STORE, DRIVER_ID_KEY);
    await kvDelete(KEYCHAIN_DB, KEYCHAIN_STORE, DISPLAY_USERNAME_KEY);
    throw err;
  }

  // Return the master code + license ID. Master code is SECRET and
  // shown once by the setup UI. License ID is PUBLIC and can be shown
  // again any time via getLicenseId().
  return { masterCode, licenseId };
}

// ---------- PIN verification ----------

export async function verifyPin(pin) {
  if (!isValidPin(pin)) return { ok: false, reason: "invalid_pin_format" };
  const meta = (await kvGet(AUTH_DB, AUTH_STORE, PIN_ATTEMPT_KEY)) || { failed: 0, lockedUntil: 0 };
  if (meta.lockedUntil && meta.lockedUntil > Date.now()) {
    return { ok: false, reason: "locked", until: meta.lockedUntil };
  }
  const masterCode = await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY);
  const verifier = await kvGet(AUTH_DB, AUTH_STORE, PIN_VERIFIER_KEY);
  if (!masterCode || !verifier) return { ok: false, reason: "not_setup" };
  const derived = await deriveHash(pin + ":" + masterCode, hexToBytes(verifier.salt_hex));
  if (constantTimeEqual(derived, hexToBytes(verifier.hash_hex))) {
    await kvSet(AUTH_DB, AUTH_STORE, PIN_ATTEMPT_KEY, { failed: 0, lockedUntil: 0 });
    return { ok: true };
  }
  const failed = (meta.failed || 0) + 1;
  const lockedUntil = failed >= MAX_PIN_ATTEMPTS ? Date.now() + PIN_LOCKOUT_MS : 0;
  await kvSet(AUTH_DB, AUTH_STORE, PIN_ATTEMPT_KEY, { failed, lockedUntil });
  return { ok: false, reason: "wrong_pin", remainingAttempts: Math.max(0, MAX_PIN_ATTEMPTS - failed), lockedUntil };
}

// ---------- PIN reset paths ----------

async function _checkRecoveryLock() {
  const meta = (await kvGet(AUTH_DB, AUTH_STORE, RECOVERY_ATTEMPT_KEY)) || { failed: 0, lockedUntil: 0 };
  if (meta.lockedUntil && meta.lockedUntil > Date.now()) {
    return { locked: true, until: meta.lockedUntil };
  }
  return { locked: false, meta };
}

async function _onRecoveryFailure(meta) {
  const failed = (meta.failed || 0) + 1;
  const lockedUntil = failed >= MAX_RECOVERY_ATTEMPTS ? Date.now() + RECOVERY_LOCKOUT_MS : 0;
  await kvSet(AUTH_DB, AUTH_STORE, RECOVERY_ATTEMPT_KEY, { failed, lockedUntil });
  return { remainingAttempts: Math.max(0, MAX_RECOVERY_ATTEMPTS - failed), lockedUntil };
}

async function _onRecoverySuccess() {
  await kvSet(AUTH_DB, AUTH_STORE, RECOVERY_ATTEMPT_KEY, { failed: 0, lockedUntil: 0 });
}

async function _verifyDriverIdMatches(driverId) {
  const stored = await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, DRIVER_ID_KEY);
  if (!stored) return false;
  // Case-insensitive compare (spec: IDs are user-chosen and often typed).
  return String(stored).trim().toLowerCase() === String(driverId || "").trim().toLowerCase();
}

async function _writeNewPin(newPin) {
  const masterCode = await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY);
  const salt = randomBytes(16);
  const hash = await deriveHash(newPin + ":" + masterCode, salt);
  await kvSet(AUTH_DB, AUTH_STORE, PIN_VERIFIER_KEY, {
    version: 2, hash_hex: toHex(hash), salt_hex: toHex(salt),
    created_at: new Date().toISOString(),
  });
  await kvSet(AUTH_DB, AUTH_STORE, PIN_ATTEMPT_KEY, { failed: 0, lockedUntil: 0 });
}

/** Primary PIN reset path: driver ID + recovery phrase. */
export async function resetPinWithRecoveryPhrase({ driverId, recoveryPhrase, newPin }) {
  if (!isValidPin(newPin)) throw new Error("PIN must be exactly 6 digits");
  const lock = await _checkRecoveryLock();
  if (lock.locked) return { ok: false, reason: "locked", until: lock.until };
  if (!(await _verifyDriverIdMatches(driverId))) {
    const r = await _onRecoveryFailure(lock.meta);
    return { ok: false, reason: "wrong_identity", ...r };
  }
  if (!isValidPhrase(recoveryPhrase)) {
    const r = await _onRecoveryFailure(lock.meta);
    return { ok: false, reason: "wrong_phrase", ...r };
  }
  const verifier = await kvGet(AUTH_DB, AUTH_STORE, RECOVERY_VERIFIER_KEY);
  if (!verifier) return { ok: false, reason: "not_setup" };
  const derived = await deriveHash(
    normalizePhrase(recoveryPhrase) + ":" + String(driverId).trim().toLowerCase(),
    hexToBytes(verifier.salt_hex),
  );
  if (!constantTimeEqual(derived, hexToBytes(verifier.hash_hex))) {
    const r = await _onRecoveryFailure(lock.meta);
    return { ok: false, reason: "wrong_phrase", ...r };
  }
  await _onRecoverySuccess();
  await _writeNewPin(newPin);
  return { ok: true };
}

/** Emergency path: driver ID + 24-char master code. */
export async function resetPinWithMasterCode({ driverId, masterCode, newPin }) {
  if (!isValidPin(newPin)) throw new Error("PIN must be exactly 6 digits");
  const lock = await _checkRecoveryLock();
  if (lock.locked) return { ok: false, reason: "locked", until: lock.until };
  if (!(await _verifyDriverIdMatches(driverId))) {
    const r = await _onRecoveryFailure(lock.meta);
    return { ok: false, reason: "wrong_identity", ...r };
  }
  const cleanCode = normalizeAlpha(masterCode);
  if (cleanCode.length !== MASTER_CODE_LENGTH) {
    const r = await _onRecoveryFailure(lock.meta);
    return { ok: false, reason: "wrong_master", ...r };
  }
  const verifier = await kvGet(AUTH_DB, AUTH_STORE, MASTER_VERIFIER_KEY);
  if (!verifier) return { ok: false, reason: "not_setup" };
  const derived = await deriveHash(
    cleanCode + ":" + String(driverId).trim().toLowerCase(),
    hexToBytes(verifier.salt_hex),
  );
  if (!constantTimeEqual(derived, hexToBytes(verifier.hash_hex))) {
    const r = await _onRecoveryFailure(lock.meta);
    return { ok: false, reason: "wrong_master", ...r };
  }
  await _onRecoverySuccess();
  await _writeNewPin(newPin);
  return { ok: true };
}

// ---------- Fingerprint (WebAuthn) ----------

export async function isFingerprintSupported() {
  try {
    if (!window.PublicKeyCredential) return false;
    return Boolean(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

export async function enrollFingerprint() {
  if (!(await isFingerprintSupported())) throw new Error("Fingerprint not available on this device");
  const deviceId = await getDeviceId();
  const challenge = randomBytes(32);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Trip Monitor — Driver Edition" },
      user: { id: enc.encode(deviceId), name: "driver@local", displayName: "Driver" },
      pubKeyCredParams: [ { type: "public-key", alg: -7 }, { type: "public-key", alg: -257 } ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  });
  if (!cred) throw new Error("Fingerprint enrollment cancelled");
  await kvSet(AUTH_DB, AUTH_STORE, FINGERPRINT_KEY, {
    credentialId_hex: toHex(new Uint8Array(cred.rawId)),
    created_at: new Date().toISOString(),
  });
  return true;
}

export async function isFingerprintEnrolled() {
  const v = await kvGet(AUTH_DB, AUTH_STORE, FINGERPRINT_KEY);
  return Boolean(v?.credentialId_hex);
}

export async function disableFingerprint() {
  await kvDelete(AUTH_DB, AUTH_STORE, FINGERPRINT_KEY);
}

export async function verifyFingerprint() {
  const enrolled = await kvGet(AUTH_DB, AUTH_STORE, FINGERPRINT_KEY);
  if (!enrolled) return { ok: false, reason: "not_enrolled" };
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{
          type: "public-key",
          id: hexToBytes(enrolled.credentialId_hex),
          transports: ["internal"],
        }],
        userVerification: "required",
        timeout: 60_000,
      },
    });
    return assertion ? { ok: true } : { ok: false, reason: "no_assertion" };
  } catch (err) {
    return { ok: false, reason: err?.name || "error" };
  }
}

export async function wipeAuth() {
  await deleteDatabase(KEYCHAIN_DB);
  await deleteDatabase(AUTH_DB);
}

// ---------- Premium license (offline unlock) ----------

/**
 * Premium unlock scaffolding. The website (future) issues Premium
 * Unlock Codes signed with a private ECDSA P-256 key; this app
 * verifies them against the bundled public key below. Until the
 * website + signing server exist, the verification logic is ready
 * but no valid codes can be generated — so Premium effectively
 * cannot be unlocked yet, which is the correct behaviour (gated
 * behind a purchase).
 *
 * Code format: base64url(payload) + "." + base64url(sig)
 *   payload = JSON {license_id, tier, duration, iat, exp, nonce}
 *     - tier:     "FREE" | "QCK" | "STU" (Free / Quick / Studio)
 *     - duration: "3M" | "6M" | "1Y" | "5Y" | "LT" (lifetime)
 *     - exp:      unix-seconds when the unlock expires (omit for LT)
 *   sig     = ECDSA P-256 signature over the payload bytes
 *
 * Security rule (per spec): the MASTER recovery code must never be
 * sent to the website. Premium codes are bound to the PUBLIC
 * license_id only.
 */
const PREMIUM_PUBLIC_KEY_SPKI_B64 = ""; // TBD — filled in when website infra lands

// Feature tier hierarchy. Higher tiers include everything from lower
// tiers. Used by hasFeatureTier() to gate features in the UI.
export const TIER_RANK = Object.freeze({ FREE: 0, QCK: 1, STU: 2 });
export const TIER_LABEL = Object.freeze({
  FREE: "Free",
  QCK: "Quick",
  STU: "Studio",
});
export const DURATION_LABEL = Object.freeze({
  "3M": "3 months", "6M": "6 months", "1Y": "1 year", "5Y": "5 years", LT: "Lifetime",
});

function b64urlToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(normalized);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function _loadPremiumPubKey() {
  if (!PREMIUM_PUBLIC_KEY_SPKI_B64) return null;
  try {
    return await crypto.subtle.importKey(
      "spki", b64urlToBytes(PREMIUM_PUBLIC_KEY_SPKI_B64),
      { name: "ECDSA", namedCurve: "P-256" },
      false, ["verify"],
    );
  } catch { return null; }
}

export async function verifyPremiumUnlockCode(code) {
  const trimmed = String(code || "").trim();
  if (!trimmed || !trimmed.includes(".")) {
    return { ok: false, reason: "malformed" };
  }
  const [payloadB64, sigB64] = trimmed.split(".");
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const licenseId = await getLicenseId();
  if (!licenseId || payload.license_id !== licenseId) {
    return { ok: false, reason: "license_mismatch" };
  }
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  const pub = await _loadPremiumPubKey();
  if (!pub) {
    // Premium signing infra not deployed yet — refuse all codes even
    // if shaped correctly. This keeps the premium gate closed.
    return { ok: false, reason: "not_available" };
  }
  const sigBytes = b64urlToBytes(sigB64);
  const payloadBytes = b64urlToBytes(payloadB64);
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" }, pub, sigBytes, payloadBytes,
  );
  if (!ok) return { ok: false, reason: "bad_signature" };
  await kvSet(AUTH_DB, AUTH_STORE, PREMIUM_STATE_KEY, {
    tier: payload.tier || "STU",
    duration: payload.duration || (payload.exp ? "1Y" : "LT"),
    license_id: licenseId,
    activated_at: new Date().toISOString(),
    expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
  });
  return { ok: true, tier: payload.tier || "STU", duration: payload.duration || "LT" };
}

export async function getPremiumState() {
  const s = await kvGet(AUTH_DB, AUTH_STORE, PREMIUM_STATE_KEY);
  if (!s) return { active: false, tier: "FREE", duration: null, expires_at: null };
  if (s.expires_at && new Date(s.expires_at) < new Date()) {
    return { active: false, tier: "FREE", expired_tier: s.tier, duration: s.duration, expires_at: s.expires_at };
  }
  return { active: true, tier: s.tier || "STU", duration: s.duration || "LT", expires_at: s.expires_at };
}

/**
 * Returns the user's current FEATURE tier ("FREE" | "QCK" | "STU"),
 * collapsing expired premium back to FREE. Use this — not the raw
 * premium state — for UI gating.
 *
 * Pre-release override: while the public website + premium signing
 * infra is disabled (`WEBSITE_FEATURES_ENABLED = false`), there is no
 * way for a driver to legitimately purchase premium, so we promote
 * everyone to "STU" (full unlock) to avoid leaving Quick Map and Pro
 * Mapping Studio locked behind a paywall that doesn't exist yet.
 * Flipping the flag to true reverts to honest tier accounting.
 */
export async function getFeatureTier() {
  if (!WEBSITE_FEATURES_ENABLED) return "STU";
  const s = await getPremiumState();
  return s.active ? (s.tier || "STU") : "FREE";
}

/**
 * Returns true if the current feature tier meets-or-exceeds the
 * required tier. Use this for feature gating: e.g. Pro Mapping
 * Studio requires "STU"; Quick Map requires "QCK".
 */
export async function hasFeatureTier(requiredTier) {
  const current = await getFeatureTier();
  return TIER_RANK[current] >= TIER_RANK[requiredTier];
}

export async function revokePremium() {
  await kvDelete(AUTH_DB, AUTH_STORE, PREMIUM_STATE_KEY);
}

export const AUTH_CONSTANTS = Object.freeze({
  MIN_PHRASE_WORDS, MAX_PIN_ATTEMPTS, PIN_LOCKOUT_MS,
  MAX_RECOVERY_ATTEMPTS, RECOVERY_LOCKOUT_MS, MASTER_CODE_LENGTH,
});
