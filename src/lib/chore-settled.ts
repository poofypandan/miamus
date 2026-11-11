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
