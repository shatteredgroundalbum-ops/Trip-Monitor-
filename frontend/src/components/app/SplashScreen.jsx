import React, { useEffect, useState, useRef } from "react";

/**
 * Cinematic full-screen splash. Plays a video if /trip-monitor-splash.mp4 exists,
 * otherwise falls back to the static logo image. Image is NOT modified — only
 * the wrapping container fades and slides.
 *
 * Slides UP and out at the end (the login screen slides UP and in over the same
 * window for a continuous cinematic transition).
 */
export default function SplashScreen({ onComplete, durationMs = 7400 }) {
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
          {/* Smallest first — browser picks the first <source> it can
              decode. WebM (VP9) is ~307 KB, lite MP4 (H.264 Baseline)
              ~396 KB. Both have no audio (splash is muted anyway). */}
          <source src="/trip-monitor-splash.webm" type="video/webm" />
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
