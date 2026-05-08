import React, { useEffect, useState, useRef } from "react";

/**
 * Cinematic full-screen splash. Plays a video if it loads, otherwise
 * falls back to the static logo image. Image is NOT modified — only
 * the wrapping container fades and slides.
 *
 * Slides UP and out at the end (the parent screen slides UP and in over
 * the same window for a continuous cinematic transition).
 *
 * Source order matters: the FIRST `<source>` whose codec the browser
 * can decode is what plays. The original full-quality MP4 is listed
 * first so every modern browser picks it. The smaller WebM and
 * lite-MP4 are kept as raw fallbacks for any browser that can't decode
 * the original.
 *
 * `onPlaying` lets the parent know when actual frames are being drawn,
 * not just when the element mounts. The pre-splash flow uses this to
 * stay on screen until the splash is genuinely animating, so the user
 * never sees a frozen first frame during the hand-off.
 */
export default function SplashScreen({ onComplete, onPlaying, durationMs = 7400 }) {
  const [phase, setPhase] = useState("in");      // "in" → "hold" → "out"
  const [hasVideo, setHasVideo] = useState(true); // optimistic; flips false on error
  const videoRef = useRef(null);

  useEffect(() => {
    // Slower, more cinematic envelope: 900 ms fade-in, full hold, 1100 ms fade-out
    const inT = setTimeout(() => setPhase("hold"), 900);
    const outT = setTimeout(() => setPhase("out"), durationMs - 1100);
    const doneT = setTimeout(() => onComplete?.(), durationMs);
    return () => {
      clearTimeout(inT);
      clearTimeout(outT);
      clearTimeout(doneT);
    };
  }, [durationMs, onComplete]);

  // Try to autoplay video as soon as it's mounted (mobile autoplay needs muted+playsInline).
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => { /* iOS quirks — fallback to image */ });
    }
  }, [hasVideo]);

  return (
    <div
      data-testid="splash-screen"
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{
        backgroundColor: "#FFFFFF",
        opacity: phase === "out" ? 0 : 1,
        transform: phase === "out" ? "translateY(-4%)" : "translateY(0)",
        transition:
          "opacity 1100ms cubic-bezier(0.4, 0, 0.2, 1), transform 1100ms cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: phase === "out" ? "none" : "auto",
      }}
      aria-hidden={phase === "out"}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          preload="auto"
          onError={() => setHasVideo(false)}
          onPlaying={() => onPlaying?.()}
          data-testid="splash-video"
          style={{
            width: "100vw",
            height: "100vh",
            objectFit: "contain",
            objectPosition: "center",
            display: "block",
            background: "#FFFFFF",
          }}
        >
          {/* Original full-quality MP4 first — what every modern
              browser picks. The lite WebM / MP4 are only consulted by
              browsers that can't decode the original. */}
          <source src="/trip-monitor-splash.mp4"      type="video/mp4" />
          <source src="/trip-monitor-splash.webm"     type="video/webm" />
          <source src="/trip-monitor-splash.lite.mp4" type="video/mp4" />
        </video>
      ) : (
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
      )}
    </div>
  );
}
