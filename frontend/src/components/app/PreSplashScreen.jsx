import React, { useEffect, useState } from "react";

/**
 * Pre-splash — CornerBoxx Technology brand stamp shown ONCE per session
 * before the main Trip Monitor splash. Sequential intro (no overlap):
 * mounts INSTANTLY at full opacity (covers app boot), holds, then
 * fades OUT into the white shield managed by the parent SplashOnce.
 *
 * Total visible time = `holdMs` + `fadeMs`.
 */
export default function PreSplashScreen({
  onComplete,
  holdMs = 1700,
  fadeMs = 700,
}) {
  const [phase, setPhase] = useState("hold");

  useEffect(() => {
    const outT = setTimeout(() => setPhase("out"), holdMs);
    const doneT = setTimeout(() => onComplete?.(), holdMs + fadeMs);
    return () => {
      clearTimeout(outT);
      clearTimeout(doneT);
    };
  }, [holdMs, fadeMs, onComplete]);

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
