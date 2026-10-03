import { useSyncExternalStore } from "react";

/**
 * The cover drawn over a tab switch (Phase 122).
 *
 * Phase 121 made switching instant — no server round trip — which exposed
 * what the round trip used to hide: the new tab assembling itself in view.
 * Lists mount, skeletons swap for rows, images arrive, the page scrolls.
 * This puts a branded screen over the content for the length of that, the
 * way native apps hold a splash over their own view changes:
 *
 *   tap      → "covering": the overlay appears at full opacity, no fade in.
 *   2 frames → the overlay has painted; only now does the URL change, so the
 *              new tab renders behind it, and the page goes back to the top.
 *   ≥260ms   → "revealing": the overlay fades out (opacity, 200ms).
 *   +200ms   → "idle": the overlay unmounts.
 *
 * A module-level store rather than a context: the trigger lives in the tab
 * bar, the overlay in the layout, and neither needs a provider between them.
 * A second tap mid-transition starts over cleanly — each run carries a
 * generation number, and a step from an older run does nothing.
 */
export type TabTransitionPhase = "idle" | "covering" | "revealing";

/** Long enough for a tab's first render and its skeleton → rows swap. */
const MIN_COVER_MS = 260;
/** Matches the overlay's duration-200. */
const FADE_MS = 200;

let phase: TabTransitionPhase = "idle";
let generation = 0;
const listeners = new Set<() => void>();

function setPhase(next: TabTransitionPhase) {
  phase = next;
  listeners.forEach((listener) => listener());
}

export function startTabTransition(navigate: () => void): void {
  const run = ++generation;
  const startedAt = performance.now();
  setPhase("covering");

  // Two frames: the first is the one the overlay paints in, so the second
  // starts after it is on screen. Navigating any sooner would render the new
  // tab in the same frame as the cover, and the old view would hang on
  // screen, frozen, until that render finished.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (run !== generation) return;
      navigate();
      // Under the cover, so nobody sees it: the last tab's scroll position
      // means nothing on this one.
      window.scrollTo({ top: 0, behavior: "instant" });

      const remaining = Math.max(0, MIN_COVER_MS - (performance.now() - startedAt));
      setTimeout(() => {
        // One more frame, so the new tab's commit has painted underneath
        // before the cover starts to lift.
        requestAnimationFrame(() => {
          if (run !== generation) return;
          setPhase("revealing");
          setTimeout(() => {
            if (run === generation) setPhase("idle");
          }, FADE_MS);
        });
      }, remaining);
    })
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTabTransitionPhase(): TabTransitionPhase {
  return useSyncExternalStore(
    subscribe,
    () => phase,
    () => "idle"
  );
}
