"use client";

import { useEffect, useRef } from "react";

interface OverlayEntry {
  id: string;
  close: () => void;
}

// Overlays currently claiming a history entry, outermost first.
const overlayStack: OverlayEntry[] = [];

// How many pops we caused ourselves while unwinding a closed overlay's entry.
// Closing an overlay any other way (X, backdrop, Escape) has to remove the
// entry it pushed, and the only way to do that is history.back() — which is
// asynchronous and indistinguishable from a real Back press by the time it
// lands. Without this counter that pop was read as "the user pressed Back",
// and since the closing overlay had already left the stack, the layer beneath
// it closed too: dismissing a photo lightbox took the Pet Profile Sheet with
// it. Verified live before this guard existed.
let selfUnwinds = 0;

// One listener for the whole stack rather than one per overlay. popstate is a
// window-level event, so per-instance listeners all fired for the same press
// and every open layer closed at once; routing through the stack means only
// the top-most overlay reacts, and the guard above has a single place to live.
function handlePop() {
  if (selfUnwinds > 0) {
    selfUnwinds -= 1;
    return;
  }
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return;
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
        selfUnwinds += 1;
        window.history.back();
      }
    };
  }, [open]);
}
