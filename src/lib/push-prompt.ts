/**
 * When the dashboard asks an owner to turn notifications on (2026-11-10).
 *
 * Push only ever reached a phone whose owner found Household → Notifications
 * and tapped Enable. Nobody did: production had no subscriptions at all, so
 * urgent repair reports, sick-pet alerts and food reminders reached nobody.
 * The dashboard now asks, on each device where it would help, and remembers
 * "Not now" on that device for a while rather than for ever.
 *
 * Kept free of browser and Supabase imports so the rule is unit-testable.
 */

/** This device's push state, as the settings card and the prompt show it. */
export type PushStatus =
  | "loading"
  | "unsupported"
  | "ios-install-first"
  | "unconfigured"
  | "denied"
  | "off"
  | "on";

export const PUSH_PROMPT_SNOOZE_KEY = "miamus.push-prompt.snoozed-until";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Not now": ask again in a week. Blocked: a month, since only settings can fix it. */
export function snoozeDays(status: PushStatus): number {
  return status === "denied" ? 30 : 7;
}

export function snoozeUntil(status: PushStatus, now: number): number {
  return now + snoozeDays(status) * DAY_MS;
}

/**
 * Whether the dashboard should show the prompt.
 *
 * - off: the one-tap way to turn it on.
 * - ios-install-first: how to get to where iPhone allows it — unless the
 *   Add to Home Screen tip is still showing, which already says the first
 *   half of that.
 * - denied: once in a while, that it's blocked and where to fix it.
 * Never while loading, when it's on, or where nothing can be done
 * (unsupported browser, server not set up).
 */
export function shouldShowPushPrompt(
  status: PushStatus,
  snoozedUntil: number | null,
  now: number,
  installTipShowing: boolean
): boolean {
  if (snoozedUntil !== null && now < snoozedUntil) return false;
  if (status === "off" || status === "denied") return true;
  if (status === "ios-install-first") return !installTipShowing;
  return false;
}

export function readSnooze(): number | null {
  try {
    const raw = localStorage.getItem(PUSH_PROMPT_SNOOZE_KEY);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeSnooze(until: number): void {
  try {
    localStorage.setItem(PUSH_PROMPT_SNOOZE_KEY, String(until));
  } catch {
    // Private mode or storage off: the prompt just shows again next visit.
  }
}
