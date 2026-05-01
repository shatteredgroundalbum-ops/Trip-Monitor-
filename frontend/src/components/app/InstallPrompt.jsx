import React, { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "../ui/button";

const DISMISS_KEY = "tm_install_dismissed_at";
const DISMISS_DAYS = 7;

const isStandalone = () =>
  (typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone === true));

const isiOS = () =>
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream;

const wasRecentlyDismissed = () => {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (!ts) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
};

const markDismissed = () => {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
};

/**
 * Bottom-anchored "Add to Home Screen" prompt. On Android/desktop Chrome we
 * capture the native `beforeinstallprompt` event and trigger it on click.
 * On iOS Safari (no programmatic prompt) we show instructions instead.
 *
 * Hides itself if the app is already installed (display-mode: standalone)
 * or if the user dismissed it within the last 7 days.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIos, setShowIos] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasRecentlyDismissed()) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isiOS()) {
      const t = setTimeout(() => setShowIos(true), 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch { /* ignore */ }
    setDeferredPrompt(null);
    markDismissed();
  };

  const dismiss = () => {
    markDismissed();
    setDeferredPrompt(null);
    setShowIos(false);
    setShowInstructions(false);
  };

  if (!deferredPrompt && !showIos) return null;

  return (
    <div
      data-testid="install-prompt"
      className="fixed left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-32px)]"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      role="dialog"
      aria-label="Install Trip Monitor"
    >
      <div className="bg-[var(--tm-navy)] text-white rounded-md shadow-[0_18px_48px_-16px_rgba(14,31,71,0.6)] p-4 flex items-start gap-3 border border-[var(--tm-blue)]/40">
        <div className="h-10 w-10 rounded-md bg-[var(--tm-orange)] text-white flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--tm-orange)] font-bold mb-0.5">
            Install
          </div>
          <div className="text-sm font-bold leading-tight">
            Add Trip Monitor to your home screen
          </div>
          <div className="text-xs text-white/70 mt-0.5">
            Faster launch, full-screen cab use, works without signal.
          </div>

          {showIos && !deferredPrompt && showInstructions && (
            <div data-testid="install-prompt-ios-help" className="mt-3 text-xs text-white/85 bg-white/10 rounded-md p-3 leading-relaxed">
              <div className="font-bold text-[var(--tm-orange)] mb-1">iOS Safari</div>
              <ol className="list-decimal list-inside space-y-1">
                <li>Tap the <strong>Share</strong> icon in Safari's toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong>. Trip Monitor will appear on your home screen.</li>
              </ol>
            </div>
          )}

          <div className="flex gap-2 mt-3">
            {deferredPrompt ? (
              <Button
                data-testid="install-prompt-install-btn"
                onClick={handleInstall}
                className="h-9 px-4 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white text-xs font-bold rounded-md"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Install
              </Button>
            ) : (
              <Button
                data-testid="install-prompt-show-help"
                onClick={() => setShowInstructions((s) => !s)}
                className="h-9 px-4 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white text-xs font-bold rounded-md"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                {showInstructions ? "Hide steps" : "Show steps"}
              </Button>
            )}
            <Button
              data-testid="install-prompt-dismiss"
              variant="outline"
              onClick={dismiss}
              className="h-9 px-3 bg-transparent border-white/30 text-white hover:bg-white/10 text-xs font-bold rounded-md"
            >
              Not now
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="text-white/60 hover:text-white shrink-0"
          data-testid="install-prompt-close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
