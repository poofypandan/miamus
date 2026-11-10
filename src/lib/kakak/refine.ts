// One-tap refinements on Kakak's chore card (owner, 2026-11-10: "ask more
// questions with suggestions and refinements — scheduled, one time, for
// anyone else"). The card shows chips for how often and for whom; a tap
// changes the suggestion on the phone, before saving, with no call to the
// AI: instant, and free. Anything a chip can't say ("Tuesdays instead") is
// still typed through Change, which goes back to Kakak.
//
// Pure, so it is unit-tested; the result passes isSaveableSuggestion like
// anything the route built.

import type { ChoreRecurrence, ChoreSuggestion } from "./suggestions";

export const REPEAT_CHOICES: ChoreRecurrence[] = ["none", "daily", "weekly", "monthly"];

export type ChoreRefinement =
  | { recurrence: ChoreRecurrence }
  /** A roster person, or null for anyone. */
  | { assignee: { id: string; name: string } | null };

export function refineChore(item: ChoreSuggestion, change: ChoreRefinement): ChoreSuggestion {
  if ("recurrence" in change) {
    return {
      ...item,
      recurrence: change.recurrence,
      // An end date belongs to a repeat; a one-time chore has none.
      recurrenceUntil: change.recurrence === "none" ? null : item.recurrenceUntil,
    };
  }
  return {
    ...item,
    assignedTo: change.assignee?.id ?? null,
    assigneeName: change.assignee?.name ?? null,
    assignToSelf: false,
  };
}

/** The chip's words: "Every Monday", "Every month on the 16th" — the card's own wording. */
export function repeatLabel(recurrence: ChoreRecurrence, dueDate: string, locale: "en" | "id"): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const en = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday];
  const id = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][weekday];
  switch (recurrence) {
    case "none":
      return locale === "id" ? "Sekali saja" : "One time";
    case "daily":
      return locale === "id" ? "Setiap hari" : "Every day";
    case "weekly":
      return locale === "id" ? `Setiap ${id}` : `Every ${en}`;
    case "monthly":
      return locale === "id" ? `Setiap tanggal ${d}` : `Monthly on the ${d}${ordinal(d)}`;
  }
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

/** Room the note may take in the owner's next turn (MAX_TYPED is 500). */
export const MAX_REFINEMENT_NOTE = 200;

/**
 * What the chips already changed, for Kakak, sent with the owner's next
 * correction ("at 9 instead") so her new card keeps it (Codex, PR #68). The
 * history itself is never rewritten: it must stay byte-identical. English,
 * like the rest of what the route tells her; she still answers in the
 * owner's language.
 */
export function refinementNote(items: { kind: string }[]): string {
  const parts = items
    .filter((item): item is ChoreSuggestion => item.kind === "chore")
    .map((item) => {
      const how = item.recurrence === "none" ? "one time" : repeatLabel(item.recurrence, item.dueDate, "en").toLowerCase();
      const who = item.assigneeName ? `for ${item.assigneeName}` : "for anyone";
      return `${item.title}: ${how}, ${who}`;
    });
  if (parts.length === 0) return "";
  const note = `(Already set on the card: ${parts.join("; ")}.)`;
  return note.length <= MAX_REFINEMENT_NOTE ? note : `${note.slice(0, MAX_REFINEMENT_NOTE - 2).trimEnd()}…)`;
}
