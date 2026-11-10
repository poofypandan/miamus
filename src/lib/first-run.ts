/**
 * The first-run checklist on an owner's Today (audit batch B1, item 3 of
 * docs/product-audit-2026-11-09.md): household → staff → their phone → a
 * first task → the first finished task.
 *
 * Every step is read from data the app already holds; nothing here is
 * stored except whether this owner closed the card on this phone. Pure, so
 * the rules are unit-tested (tests/unit/first-run.test.ts).
 */

export type FirstRunStepId = "home" | "staff" | "phone" | "task" | "done";

export const FIRST_RUN_STEPS: readonly FirstRunStepId[] = ["home", "staff", "phone", "task", "done"];

export interface FirstRunStep {
  id: FirstRunStepId;
  done: boolean;
}

/** The roster row fields the rules read. */
export interface FirstRunPerson {
  id: string;
  name: string;
  user_id?: string | null;
  archived_at?: string | null;
}

/** The chore fields the rules read. */
export interface FirstRunChore {
  assigned_to: string | null;
  status: string;
}

export interface FirstRunInput {
  /** The roster, admins included; null while it loads. */
  people: FirstRunPerson[] | null;
  /** How many staff phones are linked; null when not known (loading, or the read failed). */
  linkedPhones: number | null;
  /** The household's chores as loaded for Today. */
  chores: FirstRunChore[];
  /** Pet routines (master schedules), counted only while pets are on. */
  petRoutines: number;
  /** Routine logs on record (any, by anyone). */
  logs: number;
  /**
   * Whether the household has ever finished a chore, on any date
   * (dataProvider.hasFinishedChore); null while not known. `chores` alone
   * can't say: it holds only the days around the one on screen.
   */
  finishedChore?: boolean | null;
}

/** Staff: on the roster, not an admin (migrations/106), not archived (109). */
export function staffOf(people: FirstRunPerson[] | null): FirstRunPerson[] {
  return (people ?? []).filter((person) => !person.user_id && !person.archived_at);
}

/**
 * Past setup: anything finished, by anyone. A routine logged or a chore
 * completed means the household already works, so an existing household
 * never sees the checklist, and a new one is done with it the moment its
 * first task is finished.
 */
export function isPastFirstRun(input: Pick<FirstRunInput, "chores" | "logs" | "finishedChore">): boolean {
  return (
    input.logs > 0 || input.finishedChore === true || input.chores.some((chore) => chore.status === "completed")
  );
}

export function firstRunSteps(input: FirstRunInput): FirstRunStep[] {
  const staff = staffOf(input.people);
  const admins = new Set((input.people ?? []).filter((person) => !!person.user_id).map((person) => person.id));
  // A task the staff will see: a chore that isn't an admin's own (theirs, or
  // anyone's to take), or a pet routine, which every staff phone shows.
  const hasTask =
    input.chores.some(
      (chore) => chore.status !== "cancelled" && !(chore.assigned_to && admins.has(chore.assigned_to))
    ) || input.petRoutines > 0;
  const done: Record<FirstRunStepId, boolean> = {
    home: true,
    staff: staff.length > 0,
    phone: (input.linkedPhones ?? 0) > 0,
    task: hasTask,
    done: isPastFirstRun(input),
  };
  return FIRST_RUN_STEPS.map((id) => ({ id, done: done[id] }));
}

/** The step the card opens: the first one not done, in order. */
export function nextFirstRunStep(steps: FirstRunStep[]): FirstRunStepId | null {
  return steps.find((step) => !step.done)?.id ?? null;
}

/**
 * What this phone remembers about the card for this owner (localStorage):
 *   "shown"     the checklist has been on screen;
 *   "completed" the first task was finished after that, and the one-time
 *               "your home is set up" note hasn't been closed yet;
 *   "finished"  done with: the note was closed, or the household was past
 *               setup before the checklist ever showed;
 *   "dismissed" Not now.
 *
 * "completed" is written as soon as it's true, so the note doesn't depend on
 * the finished chore still being loaded: Today reads chores around the day
 * on screen, and browsing next week must not bring the checklist back.
 */
export type FirstRunMemory = "shown" | "completed" | "dismissed" | "finished" | null;

export type FirstRunView = "hidden" | "checklist" | "finished";

/**
 * Whether Today shows the checklist, the one-time "your home is set up"
 * note, or nothing.
 *
 * The note only follows a checklist this owner actually saw on this phone:
 * a household that was past setup before it ever showed (every existing one)
 * gets nothing at all.
 */
export function firstRunView(steps: FirstRunStep[], memory: FirstRunMemory): FirstRunView {
  if (memory === "dismissed" || memory === "finished") return "hidden";
  if (memory === "completed") return "finished";
  const finished = steps.find((step) => step.id === "done")?.done ?? false;
  if (finished) return memory === "shown" ? "finished" : "hidden";
  return "checklist";
}

/**
 * What to remember after showing `view` (null: nothing new to write).
 *
 * - The checklist marks itself seen.
 * - A finish after that is latched at once, so the note survives browsing.
 * - A household past setup before the checklist ever showed is done with on
 *   this phone for good: Today's chores are read around the day on screen,
 *   and browsing next week (where last week's completions aren't loaded)
 *   must not suddenly offer an existing household its setup.
 */
export function nextFirstRunMemory(
  steps: FirstRunStep[],
  view: FirstRunView,
  memory: FirstRunMemory
): FirstRunMemory {
  if (view === "checklist" && memory === null) return "shown";
  if (view === "finished" && memory !== "completed") return "completed";
  const past = steps.find((step) => step.id === "done")?.done ?? false;
  if (view === "hidden" && memory === null && past) return "finished";
  return null;
}

/** The localStorage key: per roster row, so per owner and per household. */
export function firstRunStorageKey(ownerKey: string): string {
  return `miamus.first-run.${ownerKey}`;
}

export function parseFirstRunMemory(value: string | null): FirstRunMemory {
  return value === "shown" || value === "completed" || value === "dismissed" || value === "finished"
    ? value
    : null;
}
