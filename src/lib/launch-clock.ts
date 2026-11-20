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
 * through another page first), and starts its own clock: the whole mark, still
 * for its first 2.2s, like any launch.
 */
const COLD_START_WINDOW_MS = 3000;

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
  return now;
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

/**
 * When a hand-over that waits `delayMs` on the launch clock should be counted
 * from: from the launch, or from now if that moment has already passed, so a
 * hand-over is never seen half done when its screen appears. Returns the
 * start time to give an animation whose CSS delay is `delayMs`.
 */
export function handOverStart(delayMs: number, now: number = performance.now()): number {
  return Math.max(launchStart ?? now, now - delayMs);
}

/**
 * Starts the animations named `names` inside `el` on handOverStart(delayMs).
 * Call before paint, after the launch mark inside `el` has set the clock.
 */
export function startHandOver(el: Element, names: string[], delayMs: number): void {
  if (typeof el.getAnimations !== "function") return;
  const start = handOverStart(delayMs);
  for (const animation of el.getAnimations({ subtree: true })) {
    if (animation instanceof CSSAnimation && names.includes(animation.animationName)) {
      animation.startTime = start;
    }
  }
}
