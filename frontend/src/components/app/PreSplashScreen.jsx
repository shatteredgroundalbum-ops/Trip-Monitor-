import React, { useEffect, useState } from "react";

/**
 * Pre-splash — CornerBoxx Technology brand stamp.
 *
 * Shown ONCE per session before the Trip Monitor splash. Three phases
 * mirror SplashScreen.jsx so the visual transition into the next screen
 * stays continuous: fade/scale-in (700 ms) → hold → fade/slide-up out
 * (900 ms). The logo is rendered against a clean white field so it
 * matches the artwork shipped by the user (no background colour cast).
 */
export default function PreSplashScreen({ onComplete, durationMs = 2600 }) {
  const [phase, setPhase] = useState("in"); // "in" → "hold" → "out"

  useEffect(() => {
    const inT = setTimeout(() => setPhase("hold"), 700);
    const outT = setTimeout(() => setPhase("out"), Math.max(0, durationMs - 900));
    const doneT = setTimeout(() => onComplete?.(), durationMs);
    return () => {
      clearTimeout(inT);
      clearTimeout(outT);
      clearTimeout(doneT);
    };
  }, [durationMs, onComplete]);

  return (
    <div
      data-testid="pre-splash-screen"
      className="fixed inset-0 z-[110] overflow-hidden flex items-center justify-center"
      style={{
        backgroundColor: "#FFFFFF",
        opacity: phase === "in" ? 0 : phase === "out" ? 0 : 1,
        transform:
          phase === "in"
            ? "translateY(0) scale(0.96)"
            : phase === "out"
            ? "translateY(-3%) scale(1.0)"
            : "translateY(0) scale(1.0)",
        transition:
          "opacity 700ms cubic-bezier(0.4, 0, 0.2, 1), transform 900ms cubic-bezier(0.4, 0, 0.2, 1)",
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
      {/* Tiny "presents" tagline — gives the brand stamp a confident
          "before the curtain rises" beat, mirrors classic studio cards. */}
      <div
        aria-hidden
        className="absolute"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
          left: 0,
          right: 0,
          textAlign: "center",
          letterSpacing: "0.55em",
          fontSize: "10px",
          fontWeight: 700,
          color: "rgba(14, 31, 71, 0.55)",
          textTransform: "uppercase",
        }}
      >
        presents
      </div>
    </div>
  );
}
