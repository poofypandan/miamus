/**
 * Notes Miamus itself writes into `task_logs.notes`, and how they are shown.
 *
 * The routine-cancellation notice used to start with a cross-mark emoji
 * (U+274C, then "Jadwal Dibatalkan: Grooming"). Miamus no longer shows emoji, but rows
 * written before the change are still in the database, so they are cleaned up
 * when shown instead of rewritten. Notes staff typed themselves are left alone.
 */
/** How cancel-routine-button.tsx starts its note (keep the two in step). */
export const CANCELLED_NOTE_PREFIX = "Jadwal Dibatalkan:";

const LEGACY_PREFIXES = [/^\s*\u{274C}\u{FE0F}?\s*(?=Jadwal Dibatalkan:)/u];

/** A log's note as it should be shown: legacy emoji prefixes removed. */
export function displayLogNote(notes: string): string;
export function displayLogNote(notes: string | null | undefined): string | null;
export function displayLogNote(notes: string | null | undefined): string | null {
  if (notes == null) return null;
  return LEGACY_PREFIXES.reduce((text, pattern) => text.replace(pattern, ""), notes);
}
