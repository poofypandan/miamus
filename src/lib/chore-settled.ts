/**
 * A finish that arrived after the chore was settled elsewhere (pre-launch
 * audit M4). The queued save only completes a chore that is still pending:
 * someone else finished it meanwhile ("completed"), or an admin cancelled it
 * ("cancelled"). The newer state stays, and this phone's photos stay out.
 */
export class ChoreAlreadySettledError extends Error {
  constructor(readonly state: "completed" | "cancelled") {
    super(`Chore was already ${state}`);
    this.name = "ChoreAlreadySettledError";
  }
}

export function isChoreAlreadySettled(err: unknown): err is ChoreAlreadySettledError {
  return err instanceof ChoreAlreadySettledError;
}

/** What a staff phone says (staff screens are Indonesian). */
export function choreSettledMessageId(state: ChoreAlreadySettledError["state"], title?: string): string {
  const name = title ? `"${title}"` : "Tugas ini";
  return state === "cancelled"
    ? `${name} sudah dibatalkan admin, jadi tidak disimpan.`
    : `${name} sudah diselesaikan orang lain, jadi tidak disimpan lagi.`;
}

/** The same, in English, for an owner who chose English. */
export function choreSettledMessageEn(state: ChoreAlreadySettledError["state"], title?: string): string {
  const name = title ? `"${title}"` : "This task";
  return state === "cancelled"
    ? `${name} was cancelled, so this finish wasn't saved.`
    : `${name} was already done by someone else, so this finish wasn't saved.`;
}

/**
 * The chore isn't what this phone thinks it is any more, so the server will
 * never take this save, however often it is sent: the repeat's days were
 * changed, it was turned off or ended, or the day the phone offered was never
 * one of its days. Thrown before writing, when the template as the server has
 * it no longer allows the day (canWriteDayOf).
 */
export class ChoreChangedError extends Error {
  constructor() {
    super("The chore changed since this phone loaded it");
    this.name = "ChoreChangedError";
  }
}

/**
 * The database's own refusals that mean the same, by the guard's message:
 * household_tasks_owner_guard on a staff phone's day row (42501), and
 * task_exceptions_guard on a couldn't-do record whose chore or day isn't
 * open (migrations/137, /139). Permanent: never retried, and not the phone's
 * sign-in being refused, so the queue must not call the phone unlinked.
 */
const CHANGED_REFUSALS = new Set([
  "chore_owner_only",
  "task_exception_task",
  "task_exception_not_open",
  "task_exception_day",
]);

export function isChoreChanged(err: unknown): boolean {
  if (err instanceof ChoreChangedError) return true;
  if (!err || typeof err !== "object") return false;
  const { message } = err as { message?: unknown };
  return typeof message === "string" && CHANGED_REFUSALS.has(message.trim());
}

/**
 * What the phone says when a finish is refused that way: staff phones in
 * Indonesian, owners in their language. With photos, they stay on the phone
 * (the draft is kept), so if the chore is still on the list after the refresh
 * it can be finished again without retaking them; the message says so.
 */
export function choreChangedMessage(lang: "en" | "id", title?: string, withPhotos = true): string {
  if (lang === "id") {
    const name = title ? `"${title}"` : "Tugas ini";
    const base = `${name} tidak terkirim karena tugasnya sudah diubah atau sudah selesai. Daftar tugas sudah diperbarui.`;
    return withPhotos ? `${base} Foto tetap tersimpan di HP; kalau tugasnya masih ada, selesaikan lagi dari daftar.` : base;
  }
  const name = title ? `"${title}"` : "This task";
  const base = `${name} wasn't saved because the task was changed or is already done. The list has been refreshed.`;
  return withPhotos ? `${base} The photos are kept on this phone; if the task is still there, finish it again from the list.` : base;
}

/** A "Tidak bisa dikerjakan" record refused that way (staff, Indonesian). */
export const COULDNT_CHANGED_MESSAGE_ID =
  "Tidak terkirim karena tugasnya sudah diubah atau sudah selesai. Daftar tugas sudah diperbarui.";
