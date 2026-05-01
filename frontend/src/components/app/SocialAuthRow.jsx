import React from "react";
import { toast } from "sonner";

/**
 * Brand-color social icon buttons (G, f, IG, in). Wires Google to the existing
 * Emergent OAuth flow until proper Identity-Services credentials are pasted in;
 * Facebook / Instagram / LinkedIn are placeholders that prompt the user.
 */
export default function SocialAuthRow({ onProvider }) {
  const handle = (provider) => {
    if (provider === "google") {
      onProvider?.("google");
      return;
    }
    toast.message(`${labelOf(provider)} sign-in coming soon`, {
      description: "Pending the developer-app credentials. Tap Google for now.",
    });
  };

  return (
    <div className="flex items-center gap-3 justify-center" data-testid="social-auth-row">
      <SocialButton testId="social-google" label="Google" onClick={() => handle("google")}>
        <GoogleG />
      </SocialButton>
      <SocialButton testId="social-facebook" label="Facebook" onClick={() => handle("facebook")}>
        <FacebookF />
      </SocialButton>
      <SocialButton testId="social-instagram" label="Instagram" onClick={() => handle("instagram")}>
        <InstagramIcon />
      </SocialButton>
      <SocialButton testId="social-linkedin" label="LinkedIn" onClick={() => handle("linkedin")}>
        <LinkedInIcon />
      </SocialButton>
    </div>
  );
}

function SocialButton({ children, label, onClick, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Continue with ${label}`}
      data-testid={testId}
      className="h-12 w-12 rounded-full bg-white border border-[var(--tm-border)] flex items-center justify-center hover:border-[var(--tm-blue)] hover:shadow-sm transition-all"
    >
      {children}
    </button>
  );
}

function labelOf(p) {
  return ({ google: "Google", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn" })[p] || p;
}

/* Brand-accurate SVGs — colors and shapes pulled from each provider's official mark. */
function GoogleG() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.3l-6.3-5.2C29.2 35.7 26.7 36.6 24 36.6c-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.2c-.4.4 6.7-4.9 6.7-14.7 0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
function FacebookF() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fill="#1877F2" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.019 4.388 11.01 10.125 11.927v-8.437H7.078v-3.49h3.047V9.413c0-3.017 1.792-4.687 4.533-4.687 1.312 0 2.686.235 2.686.235v2.97h-1.514c-1.491 0-1.956.93-1.956 1.886v2.262h3.328l-.532 3.49h-2.796V24C19.612 23.083 24 18.092 24 12.073"/>
    </svg>
  );
}
function InstagramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FED576"/>
          <stop offset="26%" stopColor="#F47133"/>
          <stop offset="61%" stopColor="#BC3081"/>
          <stop offset="100%" stopColor="#4C63D2"/>
        </linearGradient>
      </defs>
      <path fill="url(#ig-grad)" d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16M12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.34 4.14.63c-.79.31-1.46.72-2.13 1.39C1.34 2.69.93 3.36.62 4.15.34 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.27 2.15.56 2.91.31.79.72 1.46 1.39 2.13.67.67 1.34 1.08 2.13 1.39.76.29 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.27 2.91-.56.79-.31 1.46-.72 2.13-1.39.67-.67 1.08-1.34 1.39-2.13.29-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.27-2.15-.56-2.91-.31-.79-.72-1.46-1.39-2.13-.67-.67-1.34-1.08-2.13-1.39C19.1.34 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zm0 10.16A4 4 0 1 1 16 12a4 4 0 0 1-4 4zm6.41-11.85a1.44 1.44 0 1 1-1.44 1.44 1.44 1.44 0 0 1 1.44-1.44z"/>
    </svg>
  );
}
function LinkedInIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path fill="#0A66C2" d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/>
    </svg>
  );
}
