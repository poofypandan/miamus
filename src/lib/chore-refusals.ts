/**
 * A small record, kept on this phone, of chore saves the server refused
 * because the chore changed (isChoreChanged; staff chore 403s, 13 Nov 2026).
 *
 * WHY. Those refusals were seen only as 403s in the server's logs, without
 * the chore, the day or the app build the phone sent, and the phone's own
 * view of the chore (which is what went wrong) was gone by the time anyone
 * looked. Now each one is written to the console and kept here, so a phone
 * can be read (remote inspector) after the next one.
 *
 * WHAT. Ids, a date, the build and the server's code: no names, no notes, no
 * photos, nothing about the person or the device. The last 20, on this
 * device only (localStorage); nothing is sent anywhere.
 */

export const CHORE_REFUSALS_KEY = "miamus_chore_refusals";
const KEEP = 20;

export interface ChoreRefusal {
  /** Where it happened: a finish, a claim, a couldn't-do, or a queued save. */
  kind: "finish" | "claim" | "couldnt" | "queued_finish" | "queued_couldnt";
  /** The occurrence's template id, as the phone had it. */
  templateId: string | null;
  /** The chore a record named (couldn't-do), or the repeat a day row pointed at. */
  choreId: string | null;
  /** The day's own row, if the phone had one. */
  rowId: string | null;
  /** The day the phone offered. */
  date: string | null;
  /** The server's code and message (chore_owner_only, …), or the phone's own check. */
  code: string | null;
  message: string | null;
  appVersion: string | null;
  at: string;
}

export function refusalOf(
  kind: ChoreRefusal["kind"],
  ids: { templateId?: string | null; choreId?: string | null; rowId?: string | null; date?: string | null },
  err: unknown,
  now = new Date()
): ChoreRefusal {
  const { code, message, name } = (err ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  return {
    kind,
    templateId: ids.templateId ?? null,
    choreId: ids.choreId ?? null,
    rowId: ids.rowId ?? null,
    date: ids.date ?? null,
    code: typeof code === "string" ? code : typeof name === "string" ? name : null,
    message: typeof message === "string" ? message.slice(0, 120) : null,
    appVersion: process.env.NEXT_PUBLIC_BUILD_ID?.slice(0, 64) ?? null,
    at: now.toISOString(),
  };
}

/** Logs it and keeps it on the phone. Never throws. */
export function recordChoreRefusal(refusal: ChoreRefusal): void {
  console.error("[chore-refused]", JSON.stringify(refusal));
  try {
    const raw = window.localStorage.getItem(CHORE_REFUSALS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const kept = Array.isArray(list) ? list.slice(-(KEEP - 1)) : [];
    window.localStorage.setItem(CHORE_REFUSALS_KEY, JSON.stringify([...kept, refusal]));
  } catch {
    // No storage (a private window, a full device): the console line stands.
  }
}

/** What this phone has kept, oldest first. */
export function readChoreRefusals(): ChoreRefusal[] {
  try {
    const raw = window.localStorage.getItem(CHORE_REFUSALS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as ChoreRefusal[]) : [];
  } catch {
    return [];
  }
}
