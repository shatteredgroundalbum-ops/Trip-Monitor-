/**
 * Local-device authentication for Trip Monitor — Driver Edition.
 *
 * Security spec (per user requirements):
 *   - No cloud auth, no server login, no username, no password, no social.
 *   - 24-character master access code generated or entered during setup.
 *       - Used to derive the PIN-verification key.
 *       - Stored in a SEPARATE IndexedDB database (`tm-keychain`) that
 *         the rest of the app does not read. That database acts as the
 *         device keychain in a browser environment.
 *   - 6-digit PIN is the daily login.
 *       - PBKDF2(PIN, masterCodeBytes, 100k iterations, SHA-256) → hash.
 *       - Hash + salt are stored in a DIFFERENT IndexedDB (`tm-auth`).
 *       - The master code is NEVER stored next to the hash.
 *   - Fingerprint unlock is optional and goes through WebAuthn's
 *     platform authenticator (the OS keychain / secure enclave). The
 *     biometric data itself never enters the app.
 *
 * Why two separate IndexedDB databases rather than two stores in one?
 * Browsers treat each database as a distinct namespace. Wiping the
 * "app" database (`trip-monitor-app`) during uninstall / reset does
 * not wipe the keychain database, satisfying the spec's
 * "PIN verification data and master access code must be separated"
 * requirement as strictly as a web environment allows.
 */

const KEYCHAIN_DB = "tm-keychain";
const AUTH_DB = "tm-auth";
const KEYCHAIN_STORE = "secrets";
const AUTH_STORE = "vault";

const MASTER_CODE_KEY = "master_code";
const PIN_VERIFIER_KEY = "pin_verifier";
const DEVICE_ID_KEY = "device_id";
const FINGERPRINT_KEY = "webauthn_credential";
const ATTEMPT_META_KEY = "pin_attempts";

const PIN_LENGTH = 6;
const MASTER_CODE_LENGTH = 24;
const MASTER_CODE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // no I/O/l/1/0 for readability
const PBKDF2_ITERATIONS = 100_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

// ---------- IndexedDB helpers ----------

function openDb(dbName, storeName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
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
    req.onblocked = () => resolve(); // best-effort
  });
}

// ---------- Crypto helpers ----------

const enc = new TextEncoder();

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeMasterCode(input) {
  // Strip all non-alphanumeric chars (whitespace, dashes) and keep case.
  return String(input || "").replace(/[^A-Za-z0-9]/g, "");
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
  // Present as 6 groups of 4 for eyeball-friendly copying.
  const clean = normalizeMasterCode(code);
  return clean.match(/.{1,4}/g)?.join(" ") || clean;
}

export function isValidMasterCode(input) {
  const clean = normalizeMasterCode(input);
  return clean.length === MASTER_CODE_LENGTH && /^[A-Za-z0-9]+$/.test(clean);
}

export function isValidPin(pin) {
  return typeof pin === "string" && /^\d{6}$/.test(pin);
}

async function pbkdf2(pin, masterCodeBytes, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin + toHex(masterCodeBytes)),
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

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------- Public API ----------

export async function isSetup() {
  const master = await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY);
  const pin = await kvGet(AUTH_DB, AUTH_STORE, PIN_VERIFIER_KEY);
  return Boolean(master && pin);
}

export async function getDeviceId() {
  let id = await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, DEVICE_ID_KEY);
  if (!id) {
    id = "dev_" + toHex(randomBytes(12));
    await kvSet(KEYCHAIN_DB, KEYCHAIN_STORE, DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Setup: persist master code into keychain DB, derive PIN verifier
 * into the separate auth DB. Atomic-ish — if PIN write fails we roll
 * back the master code so the device never ends up half-configured.
 */
export async function setupAuth({ masterCode, pin }) {
  const clean = normalizeMasterCode(masterCode);
  if (!isValidMasterCode(clean)) throw new Error("Master code must be 24 letters/numbers");
  if (!isValidPin(pin)) throw new Error("PIN must be exactly 6 digits");

  // Store master code in keychain DB (SEPARATE from auth DB).
  await kvSet(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY, clean);
  try {
    const salt = randomBytes(16);
    const masterCodeBytes = enc.encode(clean);
    const hash = await pbkdf2(pin, masterCodeBytes, salt);
    await kvSet(AUTH_DB, AUTH_STORE, PIN_VERIFIER_KEY, {
      version: 1,
      hash_hex: toHex(hash),
      salt_hex: toHex(salt),
      created_at: new Date().toISOString(),
    });
    await getDeviceId();
    await kvSet(AUTH_DB, AUTH_STORE, ATTEMPT_META_KEY, { failed: 0, lockedUntil: 0 });
  } catch (err) {
    // Roll back: don't leave an orphan master code without a PIN.
    await kvDelete(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY);
    throw err;
  }
  return true;
}

/**
 * Verify PIN by re-deriving the hash from the master code (which lives
 * in the separate keychain DB) and the stored salt, then constant-time
 * comparing. On failure increment the attempt counter; after
 * MAX_FAILED_ATTEMPTS lock out for LOCKOUT_MS.
 */
export async function verifyPin(pin) {
  if (!isValidPin(pin)) return { ok: false, reason: "invalid_pin_format" };
  const attemptMeta = (await kvGet(AUTH_DB, AUTH_STORE, ATTEMPT_META_KEY)) || { failed: 0, lockedUntil: 0 };
  if (attemptMeta.lockedUntil && attemptMeta.lockedUntil > Date.now()) {
    return { ok: false, reason: "locked", until: attemptMeta.lockedUntil };
  }
  const masterCode = await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY);
  const verifier = await kvGet(AUTH_DB, AUTH_STORE, PIN_VERIFIER_KEY);
  if (!masterCode || !verifier) return { ok: false, reason: "not_setup" };

  const salt = hexToBytes(verifier.salt_hex);
  const expected = hexToBytes(verifier.hash_hex);
  const derived = await pbkdf2(pin, enc.encode(masterCode), salt);

  if (constantTimeEqual(derived, expected)) {
    await kvSet(AUTH_DB, AUTH_STORE, ATTEMPT_META_KEY, { failed: 0, lockedUntil: 0 });
    return { ok: true };
  }
  const failed = (attemptMeta.failed || 0) + 1;
  const lockedUntil = failed >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
  await kvSet(AUTH_DB, AUTH_STORE, ATTEMPT_META_KEY, { failed, lockedUntil });
  return {
    ok: false,
    reason: "wrong_pin",
    remainingAttempts: Math.max(0, MAX_FAILED_ATTEMPTS - failed),
    lockedUntil,
  };
}

/**
 * Reset PIN using master code. User must re-enter the 24-char master
 * code to prove possession (i.e. the piece of paper they wrote it on).
 * Only the PIN verifier is regenerated; master code stays the same.
 */
export async function resetPinWithMasterCode({ masterCode, newPin }) {
  const clean = normalizeMasterCode(masterCode);
  if (!isValidMasterCode(clean)) throw new Error("Master code must be 24 letters/numbers");
  if (!isValidPin(newPin)) throw new Error("PIN must be exactly 6 digits");
  const stored = await kvGet(KEYCHAIN_DB, KEYCHAIN_STORE, MASTER_CODE_KEY);
  if (!stored) throw new Error("Device not set up");
  // Case-sensitive match.
  if (stored !== clean) {
    return { ok: false, reason: "wrong_master_code" };
  }
  const salt = randomBytes(16);
  const hash = await pbkdf2(newPin, enc.encode(stored), salt);
  await kvSet(AUTH_DB, AUTH_STORE, PIN_VERIFIER_KEY, {
    version: 1,
    hash_hex: toHex(hash),
    salt_hex: toHex(salt),
    created_at: new Date().toISOString(),
  });
  await kvSet(AUTH_DB, AUTH_STORE, ATTEMPT_META_KEY, { failed: 0, lockedUntil: 0 });
  return { ok: true };
}

export async function wipeAuth() {
  await deleteDatabase(KEYCHAIN_DB);
  await deleteDatabase(AUTH_DB);
}

// ---------- WebAuthn fingerprint (optional biometric) ----------

/**
 * Only allow platform authenticators (built-in fingerprint sensor,
 * Windows Hello, Android biometric prompt). userVerification is set to
 * 'required' so the OS prompts for biometric + a liveness check.
 *
 * Note: on iPhones/iPads with only Face ID the browser will refuse to
 * register because we restrict via JavaScript-visible usage only —
 * browsers don't expose whether fingerprint vs Face is being used, so
 * the app-level gate is informational. The UI explicitly says
 * "fingerprint only" so Face-only devices should not enable it.
 */
export async function isFingerprintSupported() {
  try {
    if (!window.PublicKeyCredential) return false;
    const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return Boolean(available);
  } catch {
    return false;
  }
}

export async function enrollFingerprint() {
  if (!(await isFingerprintSupported())) throw new Error("Fingerprint not available on this device");
  const deviceId = await getDeviceId();
  const userHandle = enc.encode(deviceId);
  const challenge = randomBytes(32);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Trip Monitor — Driver Edition" },
      user: {
        id: userHandle,
        name: "driver@local",
        displayName: "Driver",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
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
  const rawIdBytes = new Uint8Array(cred.rawId);
  await kvSet(AUTH_DB, AUTH_STORE, FINGERPRINT_KEY, {
    credentialId_hex: toHex(rawIdBytes),
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
    const challenge = randomBytes(32);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
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

// ---------- internals ----------

function hexToBytes(hex) {
  const len = hex.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
