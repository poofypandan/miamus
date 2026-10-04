"use client";

import { useEffect, useLayoutEffect, useOptimistic, useRef, useTransition } from "react";
import { pushInPlace } from "@/lib/in-place-navigation";
import { beginNavigation, endNavigation, type CoverVariant } from "@/lib/launch-state";
import { waitForStableLayout } from "@/lib/stable-layout";

/**
 * Lateral navigation between the views of one page (Phase 125): the owner's
 * bottom tabs, the staff Tugas / Stok pills.
 *
 * Three React primitives, each doing one job:
 *
 *   history.pushState  The URL changes with no server round trip (Phase 121).
 *                      Next applies it to useSearchParams inside its own
 *                      startTransition, synchronously — so it joins ours.
 *   useTransition      The new view renders in the background while the one
 *                      on screen stays put and interactive. If it suspends on
 *                      data it does not have yet (lib/resource), React keeps
 *                      the old view up until the new one is complete, then
 *                      swaps them in a single commit. `isPending` is true for
 *                      exactly that window — the progress bar's cue.
 *   useOptimistic      The tapped tab is lit in the same frame as the tap,
 *                      and falls back to the URL by itself when the
 *                      transition ends; there is no second copy of the
 *                      truth to drift (Phase 121's hand-rolled version did).
 *
 * Scrolling back to the top is the page's job, from a layout effect keyed on
 * its view (useScrollTopOnChange): at the commit, not at the tap, so the
 * view being left never jumps while it is still on screen.
 *
 * This replaced the branded full-screen covers of Phases 122–124, which hid
 * the old view on every tap and then guessed when the new one had settled.
 * Phase 134 brings the cover back for the slow case only: each tap is a
 * navigation (lib/launch-state) that ends once the new view is committed and
 * its layout has settled, and NavigationCover shows `variant`'s screen only
 * if that takes longer than a beat. A tab from cached data ends in a few
 * frames and is never covered.
 */
export function useTabNavigation<T extends string>(
  current: T,
  hrefFor: (value: T) => string,
  variant: CoverVariant
) {
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useOptimistic(current);
  // The navigation in flight and the view it is heading for.
  const inFlight = useRef<{ id: number; target: T } | null>(null);

  // Ends it once the target is on screen and has stopped moving: committed
  // (the transition is over) is not yet settled — a tab can still be filling
  // in a skeleton from its own data.
  useEffect(() => {
    const nav = inFlight.current;
    if (!nav || isPending || current !== nav.target) return;
    inFlight.current = null;
    let live = true;
    void waitForStableLayout(1500, () => live).then(() => endNavigation(nav.id));
    // Unmounted or superseded first: end now (a no-op if a newer tap owns
    // the cover) rather than leave it to the give-up timer.
    return () => {
      live = false;
    };
  }, [current, isPending]);

  function navigate(next: T) {
    if (next === active) return;
    inFlight.current = { id: beginNavigation("tab", variant), target: next };
    startTransition(() => {
      setActive(next);
      pushInPlace(hrefFor(next));
    });
  }

  return { active, navigate, isPending };
}

/**
 * Scrolls to the top when `view` changes — in a layout effect, so it lands
 * in the same commit as the new view and is never seen happening. Not on
 * first mount: a fresh page is already at the top, or wants to be where the
 * browser restored it.
 */
export function useScrollTopOnChange(view: string) {
  const previous = useRef(view);
  useLayoutEffect(() => {
    if (previous.current === view) return;
    previous.current = view;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view]);
}
