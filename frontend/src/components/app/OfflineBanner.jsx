import React, { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/**
 * Slim sticky banner that appears when the device drops connection and
 * a brief "back online" pulse when it returns. Lets drivers know their
 * trip sheets are still being saved locally by the service worker.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      setJustReconnected(true);
      const t = setTimeout(() => setJustReconnected(false), 2500);
      return () => clearTimeout(t);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online && !justReconnected) return null;

  if (!online) {
    return (
      <div
        data-testid="offline-banner"
        className="fixed top-0 inset-x-0 z-50 bg-[var(--tm-orange)] text-white py-1.5 px-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider shadow-[0_8px_18px_-12px_rgba(255,95,21,0.8)]"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)" }}
        role="alert"
      >
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        Offline — your trip sheet is still being saved locally
      </div>
    );
  }

  return (
    <div
      data-testid="online-pulse"
      className="fixed top-0 inset-x-0 z-50 bg-[var(--tm-blue)] text-white py-1.5 px-4 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 6px)", animation: "tm-fade-in 200ms ease-out forwards" }}
      role="status"
    >
      <Wifi className="h-3.5 w-3.5" aria-hidden />
      Back online — syncing
    </div>
  );
}
