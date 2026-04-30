import React, { useEffect, useState } from "react";

/**
 * Cinematic splash screen — dark background, logo fades in, holds, fades out.
 * The logo image itself is NEVER recolored or filtered.
 * No buttons, no text, no navigation — purely cinematic.
 * Shown ONCE at app launch per session.
 */
export default function SplashScreen({ onComplete, durationMs = 2600 }) {
  const [phase, setPhase] = useState("in");

  useEffect(() => {
    const inT = setTimeout(() => setPhase("hold"), 700);
    const outT = setTimeout(() => setPhase("out"), durationMs - 700);
    const doneT = setTimeout(() => onComplete?.(), durationMs);
    return () => {
      clearTimeout(inT);
      clearTimeout(outT);
      clearTimeout(doneT);
    };
  }, [durationMs, onComplete]);

  return (
    <div
      data-testid="splash-screen"
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        backgroundColor: "#06122E",
        opacity: phase === "out" ? 0 : 1,
        transition: "opacity 700ms ease-in-out",
        pointerEvents: phase === "out" ? "none" : "auto",
      }}
      aria-hidden={phase === "out"}
    >
      <div
        className="relative flex items-center justify-center"
        style={{
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "scale(0.94)" : "scale(1)",
          transition: "opacity 700ms ease-out, transform 700ms ease-out",
        }}
      >
        <img
          src="/trip-monitor-logo.webp"
          alt="Trip Monitor — Driver Edition"
          width={280}
          height={280}
          style={{ width: 280, height: 280, objectFit: "contain" }}
          data-testid="splash-logo"
        />
      </div>
    </div>
  );
}
