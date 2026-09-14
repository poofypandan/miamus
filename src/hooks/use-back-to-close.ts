"use client";

import { useEffect, useRef } from "react";

// Ids of every overlay currently claiming a history entry, outermost first.
// popstate is a window-level event, so without this every open overlay would
// hear the same Back press and they would all close at once — closing a photo
// lightbox would take the Pet Profile Sheet underneath it down too.
const overlayStack: string[] = [];

/**
 * Makes the browser/hardware Back button close an overlay instead of
 * navigating away from the page underneath it.
 *
 * Opening pushes a throwaway history entry; Back pops it and the top-most
 * overlay closes, leaving the user exactly where they were. Closing by any
 * other route (X, backdrop, Escape) removes that entry again, so a later Back
 * press isn't silently swallowed doing nothing.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  // Held in a ref so a caller passing an inline arrow doesn't re-run the
  // effect on every render — which would push a fresh history entry each time.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Tagged per instance rather than a bare boolean: overlays stack, and a
    // shared flag would let one instance's cleanup pop an entry another had
    // just pushed, closing it instantly.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    overlayStack.push(id);
    window.history.pushState({ overlay: id }, "");

    function handlePop() {
      // Only the top-most layer reacts to a given Back press.
      if (overlayStack[overlayStack.length - 1] !== id) return;
      overlayStack.pop();
      close.current();
    }
    window.addEventListener("popstate", handlePop);

    return () => {
      window.removeEventListener("popstate", handlePop);
      const at = overlayStack.lastIndexOf(id);
      if (at !== -1) overlayStack.splice(at, 1);
      // Only unwind when *our* entry is still the current one. If Back is what
      // closed the overlay the entry is already gone, and calling back() here
      // would navigate the user off the page — the precise thing this hook
      // exists to prevent.
      if (window.history.state?.overlay === id) window.history.back();
    };
  }, [open]);
}
