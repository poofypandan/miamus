// One-tap refinements on Kakak's chore card (owner, 2026-11-10: "ask more
// questions with suggestions and refinements — scheduled, one time, for
// anyone else"). The card shows chips for how often and for whom; a tap
// changes the suggestion on the phone, before saving, with no call to the
// AI: instant, and free. Anything a chip can't say ("Tuesdays instead") is
// still typed through Change, which goes back to Kakak.
//
// Pure, so it is unit-tested; the result passes isSaveableSuggestion like
// anything the route built.

import { ownerAlertTimeAllowed, reminderTimeAllowed } from "@/lib/routine-alerts";
import type { ChoreRecurrence, ChoreSuggestion, PetRoutineSuggestion } from "./suggestions";

export const REPEAT_CHOICES: ChoreRecurrence[] = ["none", "daily", "weekly", "monthly"];

export type ChoreRefinement =
  | { recurrence: ChoreRecurrence }
  /** A roster person, or null for anyone. */
  | { assignee: { id: string; name: string } | null }
  /** "Remind me" (migrations/137): 0, 1, 3 or 7 days before, or null for off. */
  | { remindDaysBefore: number | null };

export function refineChore(item: ChoreSuggestion, change: ChoreRefinement): ChoreSuggestion {
  if ("remindDaysBefore" in change) return { ...item, remindDaysBefore: change.remindDaysBefore };
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

/**
 * A pet routine card's switches (Phase 173 PR B): remind staff, tell us if
 * it isn't done. Flipped on the phone with no call to Kakak; a switch none of
 * the routine's times can use stays off, as the Add routine sheet saves it.
 */
export type PetRoutineRefinement = { remindStaff: boolean } | { alertOwners: boolean };

export function refinePetRoutine(item: PetRoutineSuggestion, change: PetRoutineRefinement): PetRoutineSuggestion {
  if (item.routine === "meal" || item.routine === "potty") return item;
  const times = item.pets.flatMap((p) => p.times.map((t) => t.time));
  if ("remindStaff" in change) return { ...item, remindStaff: change.remindStaff && times.some(reminderTimeAllowed) };
  return { ...item, alertOwners: change.alertOwners && times.some(ownerAlertTimeAllowed) };
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

/** The most room the note takes in the owner's next turn (MAX_TYPED is 500). */
export const MAX_REFINEMENT_NOTE = 200;

const NOTE_OPEN = "(Set on the card with one tap; the owner's words after this win: ";
const NOTE_CLOSE = ".)";

/**
 * What the chips already changed, for Kakak, sent before the owner's next
 * correction ("at 9 instead") so her new card keeps it (Codex, PR #68). The
 * history itself is never rewritten: it must stay byte-identical. The owner's
 * own words come after it and win where they differ ("Tuesday instead").
 *
 * `room` is what is left after the owner's words: the note shrinks to fit,
 * the owner's text is never cut for it, and with too little room there is
 * no note at all. English, like the rest of what the route tells Kakak; she
 * still answers in the owner's language.
 */
export function refinementNote(items: { kind: string }[], room: number = MAX_REFINEMENT_NOTE): string {
  const max = Math.min(room, MAX_REFINEMENT_NOTE);
  const parts = items
    .filter((item): item is ChoreSuggestion | PetRoutineSuggestion => item.kind === "chore" || item.kind === "pet_routine")
    .map((item) => {
      if (item.kind === "pet_routine") {
        // Only a routine's switches can be flipped on the card.
        if (item.routine === "meal" || item.routine === "potty") return null;
        const remind = item.remindStaff ? "remind staff" : "no staff reminder";
        const alert = item.alertOwners ? "tell owners if not done" : "no alert";
        return `${item.title}: ${remind}, ${alert}`;
      }
      const how = item.recurrence === "none" ? "one time" : repeatLabel(item.recurrence, item.dueDate, "en").toLowerCase();
      const who = item.assigneeName ? `for ${item.assigneeName}` : "for anyone";
      const days = item.remindDaysBefore ?? null;
      const remind =
        days === null ? "no reminder" : days === 0 ? "remind on the day" : days === 7 ? "remind 1 week before" : `remind ${days} day${days === 1 ? "" : "s"} before`;
      return `${item.title}: ${how}, ${who}, ${remind}`;
    })
    .filter((part): part is string => part !== null);
  // Whole parts only, as many as fit: a half-cut "every Mon…" would mislead.
  const kept: string[] = [];
  for (const part of parts) {
    const next = `${NOTE_OPEN}${[...kept, part].join("; ")}${NOTE_CLOSE}`;
    if (next.length > max) break;
    kept.push(part);
  }
  return kept.length ? `${NOTE_OPEN}${kept.join("; ")}${NOTE_CLOSE}` : "";
}

/** The note and the owner's own words, apart (practice mode reads them separately). */
export function splitRefinementNote(text: string): { note: string | null; words: string } {
  if (!text.startsWith(NOTE_OPEN)) return { note: null, words: text };
  const end = text.indexOf(NOTE_CLOSE, NOTE_OPEN.length);
  if (end === -1) return { note: null, words: text };
  return { note: text.slice(NOTE_OPEN.length, end), words: text.slice(end + NOTE_CLOSE.length).trim() };
}
