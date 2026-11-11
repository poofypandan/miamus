/**
 * Timed reminders and "not done" alerts on routines (Phase 173 PR C, D7 and
 * D15; migrations/150).
 *
 * The server decides what is sent (`notify_routines_due`, every 5 minutes, in
 * Jakarta time); these rules only tell the owner's sheet when a switch can
 * work at all, and must say the same as the SQL:
 *
 * - A staff reminder rings at the routine's time, from 06:00 and before
 *   22:00 (166's quiet hours, 21:00 to 06:00, stretched to 22:00 for a
 *   reminder the owner turned on; D7 A). A time from 22:00 to 05:59 is too
 *   late for one.
 * - An owner alert comes 30 minutes after the routine's time, from 06:00,
 *   and until 22:30 for a routine at 22:00 or earlier (D15). So the routine's
 *   time must be from 05:30 to 22:00.
 */

/** Minutes after midnight of "HH:mm" (or "HH:mm:ss"); NaN if it isn't a time. */
function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return Number.NaN;
  return h * 60 + m;
}

/** How long after a routine's time the owners hear it isn't done. */
export const OWNER_ALERT_DELAY_MINUTES = 30;

/** Whether a staff reminder can ring at this time: 06:00 to 21:59. */
export function reminderTimeAllowed(time: string): boolean {
  const m = minutesOf(time);
  return m >= 6 * 60 && m < 22 * 60;
}

/** Whether an owner alert can follow a routine at this time: 05:30 to 22:00. */
export function ownerAlertTimeAllowed(time: string): boolean {
  const m = minutesOf(time);
  return m >= 6 * 60 - OWNER_ALERT_DELAY_MINUTES && m <= 22 * 60;
}

/**
 * The state of one switch for a routine's times: "ok" when every time can
 * use it, "some" when only some can (the others are named in the hint),
 * "none" when none can (the switch is greyed).
 */
export function switchState(times: string[], allowed: (time: string) => boolean): "ok" | "some" | "none" {
  if (times.length === 0) return "ok";
  const n = times.filter(allowed).length;
  return n === times.length ? "ok" : n === 0 ? "none" : "some";
}
