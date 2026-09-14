"use client";

import { useRef } from "react";
import type { SyntheticEvent, TouchEvent as ReactTouchEvent } from "react";

// How far a finger may travel before the gesture stops counting as a tap.
// Matches DRAG_ENGAGE_PX in the dashboard carousel on purpose: the same
// movement that starts a swipe there must not also register as a tap here.
const SLOP_PX = 10;

/**
 * Distinguishes a tap from a scroll/swipe that merely started on top of a
 * tappable element. Without this, dragging to scroll a photo grid ends in a
 * touchend over a thumbnail and opens it — the user scrolled, the app opened
 * a lightbox.
 *
 * Touch only by design: a mouse cannot scroll the page by dragging, so a
 * mousedown/mouseup pair on an element is always a genuine click.
 */
export function useTapGuard(slopPx: number = SLOP_PX) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  function reset() {
    moved.current = false;
    origin.current = null;
  }

  function onTouchStart(e: ReactTouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    origin.current = { x: touch.clientX, y: touch.clientY };
    moved.current = false;
  }

  function onTouchMove(e: ReactTouchEvent) {
    const touch = e.touches[0];
    if (!touch || !origin.current || moved.current) return;
    if (
      Math.abs(touch.clientX - origin.current.x) > slopPx ||
      Math.abs(touch.clientY - origin.current.y) > slopPx
    ) {
      moved.current = true;
    }
  }

  // Fired when the browser takes the gesture over to scroll. touchend never
  // arrives in that case, so treat it as movement outright.
  function onTouchCancel() {
    moved.current = true;
  }

  /**
   * True when the caller should abandon whatever the tap would have done.
   * Pass the event to also stop the click reaching any parent handler.
   */
  function cancelled(e?: SyntheticEvent) {
    if (!moved.current) return false;
    e?.preventDefault();
    e?.stopPropagation();
    return true;
  }

  return {
    moved,
    reset,
    cancelled,
    // Spreadable onto an element with no touch handlers of its own.
    touchProps: { onTouchStart, onTouchMove, onTouchCancel },
  };
}
