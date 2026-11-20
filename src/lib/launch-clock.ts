/**
 * One clock for the launch mark (20 Nov, the home-screen opening).
 *
 * A cold start draws the Miamus mark several times over: the "/" page's
 * server-rendered splash, the same splash again once React takes over, then
 * the dashboard's launch cover after the redirect. Each is a fresh element,
 * and a fresh element restarts its CSS animations, so the mark used to jump
 * back to its first frame at every hand-over: the stutter owners saw.
 *
 * Every launch mark hangs its animations from this one start time instead,
 * so the second and third marks pick up exactly where the first one was and
 * the hand-overs cannot be seen. Moving an animation's start time keeps it on
 * the compositor; nothing is re-rendered.
 */

let launchStart: number | null = null;

/**
 * Past this, a mark that appears is not part of a cold start (someone came in
 * through another page first). It starts settled, not from the opening frame.
 */
const COLD_START_WINDOW_MS = 3000;

/**
 * Where a late mark starts on the clock: just past the opening (which ends
 * 720ms in, see the mark-tile/mark-settle keyframes in globals.css), still
 * in the loop's rest, so its first frame is the whole, settled mark.
 */
const LATE_MARK_OFFSET_MS = 760;

/**
 * Picks the clock's start, in performance.now() milliseconds, for the first
 * launch mark of this page session. Pure, so it can be tested.
 *
 *   ownStarts  when this mark's own animations began (a server-rendered mark
 *              has been animating since first paint, before any script ran)
 *   firstPaint the first contentful paint, which on a cold start is this same
 *              splash: the best guess when the first mark was replaced before
 *              it could report (React swapping a Suspense fallback)
 */
export function pickLaunchStart({
  ownStarts,
  firstPaint,
  now,
}: {
  ownStarts: number[];
  firstPaint: number | null;
  now: number;
}): number {
  const own = ownStarts.filter((t) => Number.isFinite(t) && t <= now);
  if (own.length > 0) return Math.min(...own);
  if (firstPaint !== null && now - firstPaint <= COLD_START_WINDOW_MS) return firstPaint;
  return now - LATE_MARK_OFFSET_MS;
}

function asMs(value: CSSNumberish | null | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function firstContentfulPaint(): number | null {
  try {
    const entry = performance.getEntriesByName("first-contentful-paint")[0];
    return entry ? entry.startTime : null;
  } catch {
    return null;
  }
}

/**
 * Hangs every animation inside `el` from the launch clock, starting the clock
 * if this is the first launch mark. Call before paint (a layout effect).
 */
export function alignToLaunchClock(el: Element): void {
  if (typeof el.getAnimations !== "function") return;
  const animations = el.getAnimations({ subtree: true });
  if (launchStart === null) {
    launchStart = pickLaunchStart({
      ownStarts: animations.map((a) => asMs(a.startTime)).filter((t): t is number => t !== null),
      firstPaint: firstContentfulPaint(),
      now: performance.now(),
    });
  }
  for (const animation of animations) animation.startTime = launchStart;
}

/** Whether a launch mark has been on screen in this page session. */
export function launchMarkShown(): boolean {
  return launchStart !== null;
}
