// localStorage flags so we can distinguish a brand-new visitor from a returning one
const HAS_SIGNED_UP_KEY = "tm_has_signed_up_before";
const LAST_EMAIL_KEY = "tm_last_email";

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

export const clearAccountFlags = () => {
  try {
    localStorage.removeItem(HAS_SIGNED_UP_KEY);
    localStorage.removeItem(LAST_EMAIL_KEY);
  } catch { /* ignore */ }
};
