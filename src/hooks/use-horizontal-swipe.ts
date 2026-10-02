"use client";

import { useRef, type TouchEvent } from "react";

// Far enough that a tap or a wobble never counts, and clearly sideways: a
// vertical scroll that drifts must not turn the week.
const MIN_DISTANCE_PX = 60;
const MIN_RATIO = 1.5;

/**
 * A sideways flick, as touch handlers to spread on an element (Phase 115).
 *
 * Plain touch events rather than a gesture library: one start point, one end
 * point, nothing tracked in between and nothing moved during the drag, so it
 * costs nothing per frame.
 *
 * `allow` is asked at touch start, so a caller can decline a direction while
 * there is still somewhere to scroll — the week grid only turns the page once
 * its own sideways scroll has run out.
 */
export function useHorizontalSwipe({
  onPrev,
  onNext,
  allow,
}: {
  /** A swipe to the right: the earlier page. */
  onPrev: () => void;
  /** A swipe to the left: the later page. */
  onNext: () => void;
  allow?: () => { prev: boolean; next: boolean };
}) {
  const start = useRef<{ x: number; y: number; prev: boolean; next: boolean } | null>(null);

  return {
    onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) {
        start.current = null;
        return;
      }
      const touch = e.touches[0];
      const allowed = allow?.() ?? { prev: true, next: true };
      start.current = { x: touch.clientX, y: touch.clientY, ...allowed };
    },
    onTouchEnd(e: TouchEvent) {
      const from = start.current;
      start.current = null;
      const touch = e.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < MIN_DISTANCE_PX || Math.abs(dx) < Math.abs(dy) * MIN_RATIO) return;
      if (dx > 0 && from.prev) onPrev();
      if (dx < 0 && from.next) onNext();
    },
    onTouchCancel() {
      start.current = null;
    },
  };
}
