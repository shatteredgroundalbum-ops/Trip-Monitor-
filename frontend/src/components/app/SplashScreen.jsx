import React, { useEffect, useState } from "react";

/**
 * Cinematic full-screen splash. Fades in, holds, fades out.
 * The logo image itself is NEVER recolored or filtered — it appears 1:1.
 */
export default function SplashScreen({ onComplete, durationMs = 2400 }) {
  const [phase, setPhase] = useState("in");

  useEffect(() => {
    const inT = setTimeout(() => setPhase("hold"), 600);
    const outT = setTimeout(() => setPhase("out"), durationMs - 600);
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-white"
      style={{
        opacity: phase === "out" ? 0 : 1,
        transition: "opacity 600ms ease-in-out",
        pointerEvents: phase === "out" ? "none" : "auto",
      }}
      aria-hidden={phase === "out"}
    >
      <div
        className="relative flex items-center justify-center"
        style={{
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "scale(0.94)" : "scale(1)",
          transition: "opacity 600ms ease-out, transform 600ms ease-out",
        }}
      >
        <img
          src="/trip-monitor-logo.webp"
          alt="Trip Monitor — Driver Edition"
          width={260}
          height={260}
          style={{ width: 260, height: 260, objectFit: "contain" }}
          data-testid="splash-logo"
        />
      </div>
    </div>
  );
}
