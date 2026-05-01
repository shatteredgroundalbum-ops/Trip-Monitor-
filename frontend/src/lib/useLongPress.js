import { useRef, useCallback } from "react";

/**
 * Returns event handlers that fire `onLongPress` after `delayMs` of a continuous
 * mouse-down or touch-start without movement. Falls back to `onClick` if user
 * just taps quickly. Cancels on movement, leave, or release before threshold.
 */
export default function useLongPress(onLongPress, { delayMs = 500, moveThreshold = 8, onClick } = {}) {
  const timerRef = useRef(null);
  const triggeredRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  const start = useCallback((e) => {
    triggeredRef.current = false;
    const point = e.touches ? e.touches[0] : e;
    startRef.current = { x: point.clientX, y: point.clientY };
    timerRef.current = setTimeout(() => {
      triggeredRef.current = true;
      onLongPress?.(e);
    }, delayMs);
  }, [onLongPress, delayMs]);

  const move = useCallback((e) => {
    if (!timerRef.current) return;
    const point = e.touches ? e.touches[0] : e;
    const dx = Math.abs(point.clientX - startRef.current.x);
    const dy = Math.abs(point.clientY - startRef.current.y);
    if (dx > moveThreshold || dy > moveThreshold) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [moveThreshold]);

  const end = useCallback((e) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!triggeredRef.current) onClick?.(e);
  }, [onClick]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onMouseDown: start,
    onMouseMove: move,
    onMouseUp: end,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onTouchCancel: cancel,
  };
}
