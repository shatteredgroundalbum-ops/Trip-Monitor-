import React, { useEffect, useState } from "react";

/**
 * Pre-splash — CornerBoxx Technology brand stamp shown ONCE per session
 * before the main Trip Monitor splash. Its job is single-purpose: cover
 * the time it takes the next splash to load, while staying on screen at
 * least long enough for a human to read the brand.
 *
 * Visibility timing is driven by the parent (data-driven, not a fixed
 * timer). The parent measures when the splash video is buffered enough
 * to play smoothly and toggles `fadeOut` to `true`. This component then
 * runs its own 700 ms opacity fade and signals `onComplete`.
 */
export default function PreSplashScreen({ onComplete, fadeOut, fadeMs = 700 }) {
  const [phase, setPhase] = useState("hold");

  // Parent flips `fadeOut` once the splash is ready AND the minimum
  // legibility hold has elapsed. We move into "out" and schedule
  // onComplete after the fade transition has finished.
  useEffect(() => {
    if (!fadeOut) return undefined;
    setPhase("out");
    const t = setTimeout(() => onComplete?.(), fadeMs);
    return () => clearTimeout(t);
  }, [fadeOut, fadeMs, onComplete]);

  return (
    <div
      data-testid="pre-splash-screen"
      className="fixed inset-0 z-[120] overflow-hidden flex items-center justify-center"
      style={{
        backgroundColor: "#FFFFFF",
        opacity: phase === "out" ? 0 : 1,
        transition: `opacity ${fadeMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        pointerEvents: phase === "out" ? "none" : "auto",
      }}
      aria-hidden={phase === "out"}
    >
      <picture>
        <source srcSet="/cornerboxx-logo.webp" type="image/webp" />
        <img
          src="/cornerboxx-logo.png"
          alt="CornerBoxx Technology"
          data-testid="pre-splash-logo"
          draggable={false}
          style={{
            maxWidth: "min(72vw, 460px)",
            maxHeight: "70vh",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            display: "block",
            userSelect: "none",
          }}
        />
      </picture>
    </div>
  );
}
