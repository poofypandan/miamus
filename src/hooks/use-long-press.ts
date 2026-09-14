"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";

const LONG_PRESS_MS = 500;
// Finger travel that turns a press into a scroll. Mirrors the tap guard from
// Phase 39: without it, dragging the page while a finger happens to rest on an
// avatar fires the long press mid-scroll.
const MOVE_TOLERANCE_PX = 10;

/**
 * Press-and-hold gesture for an element nested inside a clickable parent.
 *
 * Every handler stops propagation so the press never reaches the row beneath
 * it, and a click that follows a *fired* long press is swallowed too — without
 * that the pointerup would bubble and open the parent's drill-down on top of
 * whatever the long press just opened. A short tap still falls through to the
 * parent, which keeps the row's normal behaviour intact.
 */
export function useLongPress(onLongPress: () => void, ms: number = LONG_PRESS_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  function clear() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  // A pending timer must not outlive the component — it would fire against an
  // unmounted tree.
  useEffect(() => clear, []);

  function onPointerDown(e: ReactPointerEvent) {
    e.stopPropagation();
    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = setTimeout(() => {
      fired.current = true;
      callback.current();
    }, ms);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!origin.current) return;
    if (
      Math.abs(e.clientX - origin.current.x) > MOVE_TOLERANCE_PX ||
      Math.abs(e.clientY - origin.current.y) > MOVE_TOLERANCE_PX
    ) {
      clear();
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    e.stopPropagation();
    clear();
  }

  function onPointerLeave() {
    clear();
  }

  function onPointerCancel() {
    clear();
  }

  function onClick(e: ReactMouseEvent) {
    // Only swallow the click the long press produced; a plain tap still
    // reaches the parent row.
    if (fired.current) {
      e.preventDefault();
      e.stopPropagation();
      fired.current = false;
    }
  }

  // Stops iOS offering "Save Image" / the selection callout on hold.
  function onContextMenu(e: ReactMouseEvent) {
    e.preventDefault();
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onClick,
    onContextMenu,
  };
}
