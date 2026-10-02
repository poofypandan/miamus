/**
 * Time helpers for the Agenda's Week grid (Phase 113). Pure, so they can be
 * tested without a browser.
 *
 * The grid used to place blocks at their exact minute and split overlapping
 * ones side by side (Phase 113's layoutLanes). Phase 114 dropped that: at a
 * phone's column width two blocks side by side were too narrow to read, so
 * blocks now stack inside the hour they start in, and all the grid needs to
 * know about a time is which hour that is.
 */

/** "08:30" or "08:30:00" -> 510. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** "08:30" -> 8, clamped to the day. */
export function hourOf(time: string): number {
  return Math.min(23, Math.max(0, Math.floor(minutesOf(time) / 60)));
}
