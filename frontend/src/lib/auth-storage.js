// localStorage flags so we can distinguish a brand-new visitor from a returning one
const HAS_SIGNED_UP_KEY = "tm_has_signed_up_before";
const LAST_EMAIL_KEY = "tm_last_email";
const SELECTED_ROLE_KEY = "tm_selected_role";
// sessionStorage flag — cleared on browser close. Holds the current
// device-unlock state (after local PIN / fingerprint verification).
const UNLOCK_KEY = "tm_unlocked";

export const isUnlocked = () => {
  try { return sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch { return false; }
};

export const setAuthedUser = (info) => {
  try {
    if (info?.unlocked) sessionStorage.setItem(UNLOCK_KEY, "1");
    else sessionStorage.removeItem(UNLOCK_KEY);
  } catch { /* ignore */ }
};

export const clearUnlock = () => {
  try { sessionStorage.removeItem(UNLOCK_KEY); } catch { /* ignore */ }
};

export const hasSignedUpBefore = () => {
  try { return !!localStorage.getItem(HAS_SIGNED_UP_KEY); } catch { return false; }
};

export const markSignedUp = (email) => {
  try {
    localStorage.setItem(HAS_SIGNED_UP_KEY, "1");
    if (email) localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch { /* ignore */ }
};

export const getLastEmail = () => {
  try { return localStorage.getItem(LAST_EMAIL_KEY) || ""; } catch { return ""; }
};

export const setSelectedRole = (role) => {
  try { localStorage.setItem(SELECTED_ROLE_KEY, role); } catch { /* ignore */ }
};

export const getSelectedRole = () => {
  try { return localStorage.getItem(SELECTED_ROLE_KEY) || ""; } catch { return ""; }
};

export const clearSelectedRole = () => {
  try { localStorage.removeItem(SELECTED_ROLE_KEY); } catch { /* ignore */ }
};

export const clearAccountFlags = () => {
  try {
    localStorage.removeItem(HAS_SIGNED_UP_KEY);
    localStorage.removeItem(LAST_EMAIL_KEY);
    localStorage.removeItem(SELECTED_ROLE_KEY);
  } catch { /* ignore */ }
};
