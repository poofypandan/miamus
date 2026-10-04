import { useSyncExternalStore } from "react";

/**
 * Whether the launch cover has lifted in this page session (Phase 125).
 *
 * Module state, so it resets exactly when the app is launched afresh. Its
 * own module so the cover (brand-cover) and the loaders that defer to it
 * (loading-screens) need not import each other.
 */
let launched = false;

export function hasLaunched(): boolean {
  return launched;
}

export function markLaunched(): void {
  launched = true;
}

// --- Navigations that may need covering (Phases 132, 134) -----------------
//
// A navigation starts here on the tap and ends when its destination has
// loaded and settled. NavigationCover watches it, and puts the destination's
// branded screen up only if it is still running after a short delay — so a
// switch from cached data, nearly all of them, shows no cover at all, and a
// slow one is covered rather than seen jittering into place.
//
// Two kinds, ended in two places:
//   "switch"  owner ⇄ staff, a real route change (Phase 132). The link starts
//             it; the destination's LaunchCover ends it once the household's
//             data is in and the page has settled.
//   "tab"     a lateral tab within one view (Phase 134). useTabNavigation
//             starts it and ends it once the new tab is committed and settled.

export type CoverVariant = "owner" | "staff";

export interface PendingNavigation {
  id: number;
  kind: "switch" | "tab";
  /** Whose screen to show: where the navigation is going. */
  variant: CoverVariant;
  /** performance.now() at the tap — the cover's delay counts from here. */
  startedAt: number;
}

let pending: PendingNavigation | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** Starts a navigation, superseding any still running. Returns its id. */
export function beginNavigation(kind: PendingNavigation["kind"], variant: CoverVariant): number {
  pending = { id: nextId++, kind, variant, startedAt: performance.now() };
  notify();
  return pending.id;
}

/** The navigation in progress, if any — read by a mounting LaunchCover. */
export function pendingNavigation(): PendingNavigation | null {
  return pending;
}

/**
 * Ends navigation `id`. A no-op once a later navigation has superseded it, so
 * a slow tab's settle cannot lift the cover a newer tap is waiting under.
 */
export function endNavigation(id: number): void {
  if (pending?.id !== id) return;
  pending = null;
  notify();
}

export function usePendingNavigation(): PendingNavigation | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => null
  );
}
