import { useEffect, useSyncExternalStore } from "react";

/**
 * The cover drawn over a tab switch (Phase 122; timing rebuilt in 123).
 *
 *   tap      → "covering": the overlay appears at full opacity, no fade in.
 *   2 frames → the overlay has painted; only now does the URL change, so the
 *              new tab renders behind it, and the page goes back to the top.
 *   settled  → "idle" at once when nothing changed after the tab rendered,
 *              or "revealing" (opacity, 200ms) then "idle" when something
 *              did — see the Phase 124 notes below.
 *
 * Phase 122 lifted on a fixed 260ms; Phase 123 on a stable page height
 * (waitForStableLayout, still what the launch cover uses); Phase 124 on DOM
 * silence, which also sees text that changes in place.
 *
 * A module-level store rather than a context: the trigger lives in the tab
 * bar, the overlay in the layout, and neither needs a provider between them.
 * A second tap mid-transition starts over cleanly — each run carries a
 * generation number, and a step from an older run does nothing.
 */
export type TabTransitionPhase = "idle" | "covering" | "revealing";

/** Matches the overlay's duration-200. */
export const COVER_FADE_MS = 200;


/**
 * The launch cover's settle check (Phase 123). Tab switches use the
 * MutationObserver below instead.
 *
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

// --- Phase 124: lifting on DOM silence, not on height --------------------------
//
// Phase 123 watched the page's height, which cannot see a change that keeps
// it: an assignee badge going from "Staff" to "Ari" is the same size, and it
// happened after the cover had lifted. Now a MutationObserver watches the
// tab's content for any added, removed or rewritten node:
//
//   commit  → the tab has rendered (the page reports it, see
//             notifyTabCommitted); the swap's own mutations are discarded.
//   fast path → nothing changes for FAST_PATH_FRAMES frames: a tab drawn
//             entirely from data already held. The cover goes at once, no
//             fade — anything slower would only be a delay.
//   debounce  → something did change: wait for SILENCE_MS without a single
//             mutation, then fade.
//   either way, never while a skeleton is on screen or a component holds the
//             cover (useTransitionHold), and never past MAX_HOLD_MS.

/** Mutation-free frames after the commit that count as "nothing to wait for". */
const FAST_PATH_FRAMES = 2;
/** Quiet needed after the last mutation before the cover starts to fade. */
const SILENCE_MS = 100;
/** The cover is never held longer than this, whatever is still happening. */
const MAX_HOLD_MS = 1500;

/** Components with a load in flight that would change the tab when it lands. */
let holds = 0;

/**
 * Keeps a tab cover up while `active` — for a load whose result changes what
 * is on screen without a skeleton in the meantime (useStaffProfiles: names
 * resolving from a fallback). Releases on false or unmount.
 */
export function useTransitionHold(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    holds++;
    return () => {
      holds--;
    };
  }, [active]);
}

function busy(): boolean {
  return holds > 0 || !!document.querySelector('[data-slot="skeleton"]');
}

let onCommit: (() => void) | null = null;

/**
 * Called by a page from a layout effect keyed on its tab (?module=, ?view=).
 * Layout effects run inside React's commit, after the DOM is updated and
 * before the MutationObserver's records are delivered — which is what lets
 * the swap itself be told apart from whatever arrives after it.
 */
export function notifyTabCommitted(): void {
  onCommit?.();
}

export function startTabTransition(navigate: () => void): void {
  const run = ++generation;
  const isCurrent = () => run === generation;
  const startedAt = performance.now();
  setPhase("covering");

  // Two frames: the first is the one the overlay paints in, so the second
  // starts after it is on screen. Navigating any sooner would render the new
  // tab in the same frame as the cover, and the old view would hang on
  // screen, frozen, until that render finished.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!isCurrent()) return;

      // The tab's content: the layouts mark it. The header and the tab bar
      // sit outside, so their own instant highlight changes are not counted.
      const root = document.querySelector("[data-transition-root]") ?? document.body;
      let committed = false;
      let framesSinceCommit = 0;
      let lastMutationAt: number | null = null;
      const observer = new MutationObserver(() => {
        if (committed) lastMutationAt = performance.now();
      });
      observer.observe(root, { childList: true, characterData: true, subtree: true });

      onCommit = () => {
        if (!isCurrent()) return;
        // The swap from the old tab to the new one: expected, and discarded.
        observer.takeRecords();
        committed = true;
        onCommit = null;
      };

      const finish = (fade: boolean) => {
        observer.disconnect();
        if (!isCurrent()) return;
        onCommit = null;
        if (!fade) {
          setPhase("idle");
          return;
        }
        setPhase("revealing");
        setTimeout(() => {
          if (isCurrent()) setPhase("idle");
        }, COVER_FADE_MS);
      };

      navigate();
      // Under the cover, so nobody sees it: the last tab's scroll position
      // means nothing on this one.
      window.scrollTo({ top: 0, behavior: "instant" });

      const tick = () => {
        if (!isCurrent()) {
          observer.disconnect();
          return;
        }
        const now = performance.now();
        if (now - startedAt >= MAX_HOLD_MS) return finish(true);
        if (committed) {
          framesSinceCommit++;
          if (!busy()) {
            if (lastMutationAt === null && framesSinceCommit >= FAST_PATH_FRAMES) {
              return finish(false);
            }
            if (lastMutationAt !== null && now - lastMutationAt >= SILENCE_MS) {
              return finish(true);
            }
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
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
