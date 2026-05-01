import React, { useEffect, useState } from "react";

/**
 * Cinematic full-screen splash. The uploaded logo image fills the entire
 * viewport edge-to-edge. Image is NOT modified — only the wrapping container
 * fades in and out.
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
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{
        backgroundColor: "#FFFFFF",
        opacity: phase === "out" ? 0 : 1,
        transition: "opacity 700ms ease-in-out",
        pointerEvents: phase === "out" ? "none" : "auto",
      }}
      aria-hidden={phase === "out"}
    >
      <img
        src="/trip-monitor-logo.webp"
        alt="Trip Monitor — Driver Edition"
        data-testid="splash-logo"
        style={{
          width: "100vw",
          height: "100vh",
          objectFit: "contain",
          objectPosition: "center",
          display: "block",
        }}
      />
    </div>
  );
}
