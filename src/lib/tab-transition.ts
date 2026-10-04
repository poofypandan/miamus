import { useSyncExternalStore } from "react";

/**
 * The cover drawn over a tab switch (Phase 122; timing rebuilt in 123).
 *
 *   tap      → "covering": the overlay appears at full opacity, no fade in.
 *   2 frames → the overlay has painted; only now does the URL change, so the
 *              new tab renders behind it, and the page goes back to the top.
 *   stable   → "revealing": the overlay fades out (opacity, 200ms).
 *   +200ms   → "idle": the overlay unmounts.
 *
 * "Stable" replaced Phase 122's fixed 260ms, which lifted the cover while a
 * busy tab was still settling — rows replacing skeletons, sections arriving
 * a render later. See waitForStableLayout: the cover now stays until the
 * page has actually stopped moving.
 *
 * A module-level store rather than a context: the trigger lives in the tab
 * bar, the overlay in the layout, and neither needs a provider between them.
 * A second tap mid-transition starts over cleanly — each run carries a
 * generation number, and a step from an older run does nothing.
 */
export type TabTransitionPhase = "idle" | "covering" | "revealing";

/** Matches the overlay's duration-200. */
export const COVER_FADE_MS = 200;

/** Never lift a tab cover sooner than this, however quickly the tab settles. */
const TAB_MIN_HOLD_MS = 450;
/** Never hold one longer than this, whatever is still moving underneath. */
const TAB_MAX_HOLD_MS = 1500;

/**
 * Resolves once the page has stopped changing shape — or at `maxMs`, so a
 * page that never settles (a live clock, an endless animation) cannot hold a
 * cover up forever.
 *
 * Stable means, for STABLE_FRAMES frames in a row: the document's height has
 * not changed, and no skeleton placeholder is on screen. Height is what a
 * late-arriving section or a list replacing its skeleton changes; a skeleton
 * still present means the real content is yet to come, however still the
 * page looks. Reading scrollHeight once a frame is one layout the browser was
 * about to do anyway.
 *
 * `isCurrent` lets a superseded caller stop polling early.
 */
const STABLE_FRAMES = 4;

export function waitForStableLayout({
  minMs,
  maxMs,
  isCurrent = () => true,
}: {
  minMs: number;
  maxMs: number;
  isCurrent?: () => boolean;
}): Promise<void> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    let lastHeight = -1;
    let stableFrames = 0;
    const tick = () => {
      if (!isCurrent()) return resolve();
      const elapsed = performance.now() - startedAt;
      const height = document.documentElement.scrollHeight;
      const settled = height === lastHeight && !document.querySelector('[data-slot="skeleton"]');
      stableFrames = settled ? stableFrames + 1 : 0;
      lastHeight = height;
      if (elapsed >= maxMs || (elapsed >= minMs && stableFrames >= STABLE_FRAMES)) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

let phase: TabTransitionPhase = "idle";
let generation = 0;
const listeners = new Set<() => void>();

function setPhase(next: TabTransitionPhase) {
  phase = next;
  listeners.forEach((listener) => listener());
}

export function startTabTransition(navigate: () => void): void {
  const run = ++generation;
  const isCurrent = () => run === generation;
  setPhase("covering");

  // Two frames: the first is the one the overlay paints in, so the second
  // starts after it is on screen. Navigating any sooner would render the new
  // tab in the same frame as the cover, and the old view would hang on
  // screen, frozen, until that render finished.
  requestAnimationFrame(() =>
    requestAnimationFrame(async () => {
      if (!isCurrent()) return;
      navigate();
      // Under the cover, so nobody sees it: the last tab's scroll position
      // means nothing on this one.
      window.scrollTo({ top: 0, behavior: "instant" });

      await waitForStableLayout({ minMs: TAB_MIN_HOLD_MS, maxMs: TAB_MAX_HOLD_MS, isCurrent });
      if (!isCurrent()) return;
      setPhase("revealing");
      setTimeout(() => {
        if (isCurrent()) setPhase("idle");
      }, COVER_FADE_MS);
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
