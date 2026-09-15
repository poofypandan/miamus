"use client";

import { useEffect, useRef } from "react";

interface OverlayEntry {
  id: string;
  close: () => void;
}

// Overlays currently claiming a history entry, outermost first.
const overlayStack: OverlayEntry[] = [];

// One listener for the whole stack rather than one per overlay. popstate is a
// window-level event, so per-instance listeners all fired for the same press
// and every open layer closed at once; routing through the stack means only
// the top-most overlay reacts.
//
// Whether a pop was a real Back press is read from where history landed, not
// counted. Closing an overlay by X, backdrop or Escape removes its entry with
// history.back(), which arrives asynchronously and looks like any other pop.
// If history is still sitting on the top overlay's own entry afterwards, the
// entry that went away belonged to something already closed — so nothing
// should close now. That's what stops dismissing a photo lightbox from taking
// the Pet Profile Sheet beneath it (Phase 59).
//
// This replaced a counter of self-caused pops, which went stale: the listener
// was released in the same cleanup that queued the pop, so the pop landed with
// nobody listening and was never counted off. The next genuine Back was then
// swallowed — dismissing the PIN pad once left a later correct PIN showing
// "Owner mode unlocked" with the pad stuck open and no redirect.
function handlePop() {
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return;
  if (window.history.state?.overlay === top.id) return;
  overlayStack.pop();
  top.close();
}

function retainListener() {
  if (overlayStack.length === 1) window.addEventListener("popstate", handlePop);
}

function releaseListener() {
  if (overlayStack.length === 0) window.removeEventListener("popstate", handlePop);
}

/**
 * Makes the browser/hardware Back button close an overlay instead of
 * navigating away from the page underneath it.
 *
 * Opening pushes a throwaway history entry; Back pops it and the top-most
 * overlay closes, leaving the user exactly where they were. Closing by any
 * other route removes that entry again, so a later Back press isn't silently
 * swallowed doing nothing.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  // Held in a ref so a caller passing an inline arrow doesn't re-run the
  // effect on every render — which would push a fresh history entry each time.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Tagged per instance: overlays stack, and a shared flag would let one
    // instance's cleanup pop an entry another had just pushed.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    overlayStack.push({ id, close: () => close.current() });
    retainListener();
    window.history.pushState({ overlay: id }, "");

    return () => {
      const at = overlayStack.findIndex((entry) => entry.id === id);
      if (at !== -1) overlayStack.splice(at, 1);
      releaseListener();
      // Only unwind when *our* entry is still the current one. If Back is what
      // closed the overlay the entry is already gone, and calling back() here
      // would navigate the user off the page — the precise thing this hook
      // exists to prevent.
      if (window.history.state?.overlay === id) {
        window.history.back();
      }
    };
  }, [open]);
}
