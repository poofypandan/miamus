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

// --- Role switches (Phase 132) ---------------------------------------------
//
// "Open Staff View →" and "← Owner Dashboard" are real route changes: the
// middleware's round trips on the way into /dashboard, a whole layout
// unmounting and another mounting and filling. That is the one navigation
// after launch that earns a branded cover, so the launch cover is reused for
// it: the link starts the switch (the cover goes up on the tap), and the
// destination's LaunchCover takes it over when it mounts, lifting it the same
// way it lifts a cold start — data in, page settled.


export type CoverVariant = "owner" | "staff";

let pendingSwitch: CoverVariant | null = null;
const switchListeners = new Set<() => void>();

function notifySwitch() {
  switchListeners.forEach((listener) => listener());
}

/** Called from the cross-view link's tap: covers the screen with `to`'s picture. */
export function startRoleSwitch(to: CoverVariant): void {
  pendingSwitch = to;
  notifySwitch();
}

/** The switch in progress, if any — read by a mounting LaunchCover. */
export function pendingRoleSwitch(): CoverVariant | null {
  return pendingSwitch;
}

/** The destination has taken the cover over, or the switch was abandoned. */
export function endRoleSwitch(): void {
  if (pendingSwitch === null) return;
  pendingSwitch = null;
  notifySwitch();
}

export function useRoleSwitch(): CoverVariant | null {
  return useSyncExternalStore(
    (listener) => {
      switchListeners.add(listener);
      return () => switchListeners.delete(listener);
    },
    () => pendingSwitch,
    () => null
  );
}
