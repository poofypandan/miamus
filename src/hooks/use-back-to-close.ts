"use client";

import { useEffect, useRef } from "react";

interface OverlayEntry {
  id: string;
  close: () => void;
  /** Whether this overlay's history entry has been pushed yet. */
  pushed: boolean;
}

// Overlays currently open, outermost first.
const overlayStack: OverlayEntry[] = [];

// history.back() calls this hook made whose popstate hasn't arrived yet.
let pendingBacks = 0;
let settleTimer: number | undefined;
let listening = false;

// How long a self-caused pop may take before it's given up on. Chrome lands
// one within a frame or two; this only matters if one never comes.
const SETTLE_MS = 1000;

// One listener for the whole stack rather than one per overlay. popstate is a
// window-level event, so per-instance listeners all fired for the same press
// and every open layer closed at once; routing through the stack means only
// the top-most overlay reacts.
//
// Closing an overlay by X, backdrop or Escape removes its entry with
// history.back(), which arrives asynchronously and looks like any other pop.
// Two things keep those pops from closing the wrong overlay:
//
// 1. Overlays opened while a pop is in flight wait for it (2026-11-07). Close
//    one sheet and open another a moment later, and the new sheet's
//    pushState used to land first: back() then stepped off the *new* entry,
//    and the pop closed the sheet that had just opened, leaving history on
//    the dead sheet's entry. So while pendingBacks > 0 a new overlay joins
//    the stack but holds its pushState, and the pop, when it lands, is
//    counted off and never closes anything; then the waiting entries are
//    pushed, in order. History ends exactly as if the two had been opened
//    seconds apart, and no caller has to stagger its opens by hand.
//
// 2. Otherwise, whether a pop was a real Back press is read from where
//    history landed. If history is still sitting on the top overlay's own
//    entry, the entry that went away belonged to something already closed —
//    so nothing should close now. That's what stops dismissing a photo
//    lightbox from taking the Pet Profile Sheet beneath it (Phase 59).
//
// The count in (1) can't go stale the way an earlier counter did. That one
// lived in a listener released in the same cleanup that queued the pop, so
// the pop landed with nobody listening and was never counted off; the next
// genuine Back was swallowed — dismissing the PIN pad once left a later
// correct PIN showing "Owner mode unlocked" with the pad stuck open. This
// listener, once added, is never removed, and if a pop somehow never comes
// the count is cleared after SETTLE_MS anyway.
function handlePop() {
  if (pendingBacks > 0) {
    pendingBacks -= 1;
    if (pendingBacks === 0) settle();
    return;
  }
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return;
  if (window.history.state?.overlay === top.id) return;
  overlayStack.pop();
  top.close();
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("popstate", handlePop);
}

// No self-caused pop left in flight: push the entries of anything that
// opened while one was.
function settle() {
  pendingBacks = 0;
  window.clearTimeout(settleTimer);
  settleTimer = undefined;
  for (const entry of overlayStack) {
    if (entry.pushed) continue;
    entry.pushed = true;
    window.history.pushState({ overlay: entry.id }, "");
  }
}

function backOut() {
  pendingBacks += 1;
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(settle, SETTLE_MS);
  window.history.back();
}

/**
 * Makes the browser/hardware Back button close an overlay instead of
 * navigating away from the page underneath it.
 *
 * Opening pushes a throwaway history entry; Back pops it and the top-most
 * overlay closes, leaving the user exactly where they were. Closing by any
 * other route removes that entry again, so a later Back press isn't silently
 * swallowed doing nothing. Closing one overlay and opening the next straight
 * away is safe: see (1) above.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  // Held in a ref so a caller passing an inline arrow doesn't re-run the
  // effect on every render — which would push a fresh history entry each time.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    listen();

    // Tagged per instance: overlays stack, and a shared flag would let one
    // instance's cleanup pop an entry another had just pushed.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const entry: OverlayEntry = { id, close: () => close.current(), pushed: pendingBacks === 0 };
    overlayStack.push(entry);
    if (entry.pushed) window.history.pushState({ overlay: id }, "");

    return () => {
      const at = overlayStack.indexOf(entry);
      if (at !== -1) overlayStack.splice(at, 1);
      // Only unwind when *our* entry is still the current one. If Back is what
      // closed the overlay the entry is already gone, and calling back() here
      // would navigate the user off the page — the precise thing this hook
      // exists to prevent. An overlay closed before its turn to push has no
      // entry to remove.
      if (entry.pushed && window.history.state?.overlay === id) backOut();
    };
  }, [open]);
}
