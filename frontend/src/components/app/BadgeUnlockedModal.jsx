import React, { useEffect, useState } from "react";
import { Trophy, X } from "lucide-react";

const STORAGE_KEY = "tm_seen_badges_v1";

function loadSeen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveSeen(set) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set))); } catch {}
}

/**
 * Watches the achievements payload for newly-earned badges that the
 * driver has NOT seen before. When detected, queues a celebration
 * modal — confetti + big trophy + badge label — one at a time.
 *
 * On first render the panel marks ALL existing earned badges as
 * "already seen" so we don't fire a flood of modals for legacy
 * milestones the driver earned before this feature shipped.
 */
export default function BadgeUnlockedModal({ data }) {
  const [queue, setQueue] = useState([]); // badges to celebrate, FIFO
  const [primed, setPrimed] = useState(false);

  useEffect(() => {
    const earned = (data?.badges || []).filter((b) => b.earned);
    const seen = loadSeen();
    if (!primed) {
      // First load — silently mark everything as seen so we don't
      // celebrate retroactively.
      earned.forEach((b) => seen.add(b.id));
      saveSeen(seen);
      setPrimed(true);
      return;
    }
    const unseen = earned.filter((b) => !seen.has(b.id));
    if (unseen.length) {
      setQueue((q) => [...q, ...unseen]);
      unseen.forEach((b) => seen.add(b.id));
      saveSeen(seen);
    }
  }, [data?.badges, primed]);

  if (queue.length === 0) return null;
  const current = queue[0];

  const dismiss = () => setQueue((q) => q.slice(1));

  return (
    <div
      data-testid="badge-unlocked-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.18s_ease-out]"
      onClick={dismiss}
    >
      <Confetti />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white border-2 border-[var(--tm-orange)] rounded-md shadow-2xl max-w-md w-full p-6 text-center animate-[popIn_0.32s_cubic-bezier(0.16,1,0.3,1)]"
      >
        <button type="button" onClick={dismiss}
          data-testid="badge-unlocked-close"
          className="absolute top-3 right-3 h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--tm-text-soft)] hover:bg-[var(--tm-surface)]">
          <X className="h-4 w-4" />
        </button>
        <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-[var(--tm-orange)] mb-2">
          Milestone Unlocked
        </div>
        <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-[var(--tm-orange)] to-[var(--tm-orange-deep)] text-white flex items-center justify-center mb-4 shadow-lg animate-[trophyPulse_1.6s_ease-in-out_infinite]">
          <Trophy className="h-10 w-10" />
        </div>
        <div data-testid="badge-unlocked-name"
          className="text-2xl font-black tracking-tight text-[var(--tm-navy)] mb-1">
          {current.label}
        </div>
        <div className="text-xs uppercase tracking-wider text-[var(--tm-text-muted)] font-bold mb-5">
          {current.category === "miles" ? "Mileage Badge" :
           current.category === "years" ? "Service Badge" :
           current.category === "trips" ? "Trips Badge" : "Achievement"}
        </div>
        <button type="button" onClick={dismiss}
          data-testid="badge-unlocked-cta"
          className="w-full h-11 bg-[var(--tm-orange)] hover:bg-[var(--tm-orange-deep)] text-white font-bold rounded-md uppercase tracking-wider text-sm">
          {queue.length > 1 ? `Next badge (${queue.length - 1} more) →` : "Awesome — keep rolling"}
        </button>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.04); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes trophyPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        @keyframes confettiFall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

const CONFETTI_COLORS = ["#FF5F15", "#0C4AB7", "#0E1F47", "#FFC93C", "#19C37D"];

/** 30 absolutely-positioned confetti pieces falling with stagger. */
function Confetti() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.6;
        const duration = 2.4 + Math.random() * 1.6;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const size = 6 + Math.random() * 6;
        return (
          <span key={i}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: 0,
              width: size,
              height: size * (Math.random() > 0.5 ? 0.4 : 1),
              backgroundColor: color,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
              animation: `confettiFall ${duration}s ${delay}s linear both`,
            }}
          />
        );
      })}
    </div>
  );
}
