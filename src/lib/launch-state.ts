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
