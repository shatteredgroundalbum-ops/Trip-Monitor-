import React, { useEffect, useState } from "react";

/**
 * Pre-splash — CornerBoxx Technology brand stamp shown ONCE per session
 * before the main Trip Monitor splash. Acts as a load-cover so the
 * Welcome / Routes underneath never flashes through.
 *
 * Two phases:
 *   "hold"  — full opacity, full coverage. Mounts INSTANTLY at opacity 1
 *             (no fade-in) so the app boot is never visible.
 *   "out"   — fade out. The parent listens to `onFadeStart` here and
 *             mounts the main SplashScreen underneath BEFORE this
 *             component begins reducing its own opacity, so the fade
 *             dissolves into the next splash, never into the route
 *             page underneath.
 *
 * Total visible time = `holdMs` + `fadeMs`.
 */
export default function PreSplashScreen({
  onComplete,
  onFadeStart,
  holdMs = 1700,
  fadeMs = 700,
}) {
  const [phase, setPhase] = useState("hold");

  useEffect(() => {
    const outT = setTimeout(() => {
      setPhase("out");
      onFadeStart?.();
    }, holdMs);
    const doneT = setTimeout(() => onComplete?.(), holdMs + fadeMs);
    return () => {
      clearTimeout(outT);
      clearTimeout(doneT);
    };
  }, [holdMs, fadeMs, onComplete, onFadeStart]);

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
    </div>
  );
}
