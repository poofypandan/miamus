/**
 * The calm first screen (Phase 172 PR A1, D11; docs/phase-172-first-ten-
 * minutes-plan.md, section 5). Pure rules, unit-tested
 * (tests/unit/calm-start.test.ts); the components read them.
 *
 *   1. No What's new card for a new household: none while it is under 14
 *      days old or its first-run checklist isn't past, whichever ends later.
 *   2. Never the backlog: an entry published before the household existed is
 *      never shown to it.
 *   3. At most one card a week: the first card that may show claims the
 *      week on this phone; until 7 days have passed no other card shows.
 *   5. Add to Home Screen and the notifications prompt wait until a first
 *      task is given and the checklist is off screen (Phase 175 S2: while
 *      it shows, its own "Turn on notifications" row asks instead). Then
 *      one at a time, the notifications prompt first, and neither while the
 *      checklist is back on screen after Undo (Phase 175 check, P2;
 *      hooks/use-top-banners).
 *   6. "Any pets at home?" never asks a household made since the sign-up
 *      question (Phase 162), which already answered.
 *
 * Rules 4 (the checklist first) and 7 (one-line instructions) are layout and
 * wording, in the components.
 */

/** How far a household has come, as Today last saw it on this phone. */
export type SetupStage = "new" | "task" | "past";

const STAGE_RANK: Record<SetupStage, number> = { new: 0, task: 1, past: 2 };

/** Rule 1: the quiet days of a new household. */
export const NEW_HOUSEHOLD_QUIET_DAYS = 14;

/** Rule 3: one card a week. */
export const WHATS_NEW_EVERY_DAYS = 7;

/** Rule 6: the day "Who lives here?" reached sign-up (Phase 162, migrations/133). */
export const WHO_LIVES_HERE_SINCE = "2026-11-09";

/** Whole days from `from` to `to`, both YYYY-MM-DD (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

export function parseSetupStage(value: string | null | undefined): SetupStage | null {
  return value === "new" || value === "task" || value === "past" ? value : null;
}

/** Never backwards: a stage once reached on this phone stays. */
export function laterStage(known: SetupStage | null, seen: SetupStage): SetupStage {
  return known && STAGE_RANK[known] >= STAGE_RANK[seen] ? known : seen;
}

/** The stage Today sees: past setup, a first task given, or neither. */
export function stageFrom(input: { past: boolean; taskGiven: boolean }): SetupStage {
  return input.past ? "past" : input.taskGiven ? "task" : "new";
}

/** Rule 5. Unknown (Today hasn't been opened on this phone yet) waits too. */
export function homeScreenTipAllowed(stage: SetupStage | null): boolean {
  return stage === "task" || stage === "past";
}

/** Rule 6. Unknown age: ask as before (only old households never answered). */
export function petsQuestionAllowed(createdOn: string | null): boolean {
  return !createdOn || createdOn < WHO_LIVES_HERE_SINCE;
}

/** What this phone remembers of rule 3: which card claimed which week. */
export interface WhatsNewWeek {
  id: string;
  /** YYYY-MM-DD, the day it first showed. */
  on: string;
}

export function parseWhatsNewWeek(value: string | null): WhatsNewWeek | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<WhatsNewWeek>;
    return typeof parsed.id === "string" && typeof parsed.on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.on)
      ? { id: parsed.id, on: parsed.on }
      : null;
  } catch {
    return null;
  }
}

export interface WhatsNewInput {
  id: string;
  /** The entry's own date: when it reached the app. */
  entryDate: string;
  /** The household's creation day, null while not known. */
  createdOn: string | null;
  stage: SetupStage | null;
  today: string;
  week: WhatsNewWeek | null;
}

/**
 * "hide", "show" (this card already holds the week) or "claim" (show it, and
 * remember it holds the week). Seen cards are handled by the caller.
 */
export function whatsNewDecision(input: WhatsNewInput): "hide" | "show" | "claim" {
  const { id, entryDate, createdOn, stage, today, week } = input;
  // Rule 1: not known yet counts as new.
  if (!createdOn || stage !== "past") return "hide";
  const age = daysBetween(createdOn, today);
  if (!(age >= NEW_HOUSEHOLD_QUIET_DAYS)) return "hide";
  // Rule 2.
  if (entryDate < createdOn) return "hide";
  // Rule 3.
  if (week) {
    const since = daysBetween(week.on, today);
    if (since >= 0 && since < WHATS_NEW_EVERY_DAYS) return week.id === id ? "show" : "hide";
  }
  return "claim";
}
