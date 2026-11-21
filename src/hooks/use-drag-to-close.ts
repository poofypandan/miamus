"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";

/** How far a pull goes before a press counts as a drag, so taps still reach Close. */
const SLOP = 6;
/** A pull past this many px closes the sheet on release. */
const DISTANCE = 120;
/** So does a quick flick down, in px per ms. */
const VELOCITY = 0.5;
/** A flick counts only if the finger was still moving when it let go (Codex, #188). */
const FLICK_MS = 100;

/**
 * Drag a bottom sheet down by its grabber and header to close it (Fable and
 * the manager, 21 Nov: a grabber that can't be dragged promises something it
 * doesn't do). The sheet follows the finger; let go past 120 px, or with a
 * flick, and it closes on its own exit, which carries on from where the
 * finger left it (the drag is the `translate` property, the exit animates
 * `transform`, and the two add up). Otherwise it springs back on ease-arrive.
 *
 * Only the handle drags, never the conversation, which scrolls on its own.
 * Tap outside and the close button still work. Under reduced motion the
 * sheet still follows the finger (that is the finger's own movement), but
 * the spring back is instant.
 */
export function useDragToClose<T extends HTMLElement>(onClose: () => void) {
  const sheet = useRef<T | null>(null);
  const drag = useRef<{ id: number; startY: number; dy: number; lastY: number; lastT: number; v: number; on: boolean } | null>(null);

  const place = (dy: number, settle: boolean) => {
    const el = sheet.current;
    if (!el) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.style.transition = settle && !reduce ? "translate 320ms var(--ease-arrive)" : "none";
    el.style.translate = dy > 0 ? `0 ${dy}px` : "";
  };

  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.on) return;
    // A fast pull that stopped and held before letting go is not a flick.
    const flick = d.v > VELOCITY && event.timeStamp - d.lastT < FLICK_MS;
    if (d.dy > DISTANCE || flick) {
      // Stay where the finger left it: the exit animation adds its travel to this.
      sheet.current?.style.setProperty("transition", "none");
      onClose();
    } else {
      place(0, true);
    }
  };

  const handle = {
    style: { touchAction: "none" as const },
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0) return;
      drag.current = { id: event.pointerId, startY: event.clientY, dy: 0, lastY: event.clientY, lastT: event.timeStamp, v: 0, on: false };
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== event.pointerId) return;
      const dy = event.clientY - d.startY;
      if (!d.on) {
        if (Math.abs(dy) < SLOP) return;
        // A real drag: from here the handle keeps the pointer (a tap never gets this far).
        d.on = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      const dt = Math.max(1, event.timeStamp - d.lastT);
      d.v = (event.clientY - d.lastY) / dt;
      d.lastY = event.clientY;
      d.lastT = event.timeStamp;
      // Down follows the finger; up resists, a little.
      d.dy = dy > 0 ? dy : dy / 6;
      place(Math.max(0, d.dy), false);
    },
    onPointerUp: end,
    onPointerCancel(event: ReactPointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== event.pointerId) return;
      drag.current = null;
      if (d.on) place(0, true);
    },
  };

  return { sheet, handle };
}
