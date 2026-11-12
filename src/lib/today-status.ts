import type { OwnerLocale } from "@/lib/owner-locale";
import type { StaffProgress } from "@/lib/staff-progress";

/**
 * Today's status line (Phase 175, S3; docs/phase-175-tabs-and-today-plan.md,
 * section 3): the one sentence an owner reads first. "All on track" while
 * nothing waits for them, "3 waiting for you" otherwise, with the day's
 * count under it.
 *
 * Pure, so the rules are unit-tested (tests/unit/today-status.test.ts).
 * Everything is read from what Today already holds; nothing is stored.
 */

export interface DayTotals {
  /** Finished, of the tasks that fall on the day. */
  done: number;
  /** Tasks that fall on the day (carried-over ones aren't the day's own). */
  total: number;
  /** Open and late, carried-over ones included: they are still owed. */
  late: number;
  /** Marked "couldn't be done" by staff. */
  couldnt: number;
}

/**
 * The day's counts, from the same rows the progress card shows
 * (lib/staff-progress), so the status line and the card never disagree.
 */
export function dayTotals(progress: StaffProgress | null): DayTotals {
  if (!progress) return { done: 0, total: 0, late: 0, couldnt: 0 };
  const tasks = [...progress.people.flatMap((person) => person.tasks), ...(progress.anyone?.tasks ?? [])];
  const onDay = tasks.filter((task) => !task.carried);
  return {
    done: onDay.filter((task) => task.state === "done").length,
    total: onDay.length,
    late: tasks.filter((task) => task.late).length,
    couldnt: tasks.filter((task) => task.state === "couldnt").length,
  };
}

/** What can put a row under "Waiting for you". Counts, never content. */
export interface WaitingInput {
  /** Staff suggestions waiting for a decision: one row each. */
  approvals: number;
  /** Medicine courses ending, ended or never started: one row each. */
  medicine: number;
  /** Open and late today. */
  late: number;
  /** Marked "couldn't be done" today. */
  couldnt: number;
  /** The evening summary's open count; 0 before the owner's summary hour. */
  notDone: number;
  /** Staff repair reports to review. */
  repairsToReview: number;
  /** Repair visits finished, photos to check. */
  repairsToCheck: number;
  /** Food whose date staff didn't know. */
  foodNeedsDate: number;
}

/**
 * The one row about work that slipped. After the owner's summary hour the
 * evening line covers it (not done, couldn't, to buy); before that, a row
 * for what is late or couldn't be done. Never both: they are the same tasks.
 */
export type SlipRow = "evening" | "late" | null;

export function slipRow(input: Pick<WaitingInput, "notDone" | "late" | "couldnt">): SlipRow {
  if (input.notDone > 0) return "evening";
  return input.late > 0 || input.couldnt > 0 ? "late" : null;
}

/**
 * How many rows "Waiting for you" holds: the number in its heading and in
 * the status line. Rows, not items: "3 repairs to review" is one row.
 */
export function waitingRows(input: WaitingInput): number {
  return (
    input.approvals +
    input.medicine +
    (slipRow(input) ? 1 : 0) +
    (input.repairsToReview > 0 ? 1 : 0) +
    (input.repairsToCheck > 0 ? 1 : 0) +
    (input.foodNeedsDate > 0 ? 1 : 0)
  );
}

/** "All on track" / "3 waiting for you". */
export function statusTitle(waiting: number, locale: OwnerLocale): string {
  if (waiting === 0) return locale === "id" ? "Semua lancar" : "All on track";
  return locale === "id" ? `${waiting} menunggu Anda` : `${waiting} waiting for you`;
}

/**
 * "31 of 39 done · nothing late" / "25 of 39 done · 1 late". Null on a day
 * with no tasks and nothing late: the title says it all.
 */
export function statusDetail(totals: DayTotals, locale: OwnerLocale): string | null {
  const id = locale === "id";
  const late =
    totals.late > 0
      ? id
        ? `${totals.late} terlambat`
        : `${totals.late} late`
      : id
        ? "tidak ada yang terlambat"
        : "nothing late";
  if (totals.total === 0) return totals.late > 0 ? late : null;
  const done = id ? `${totals.done} dari ${totals.total} selesai` : `${totals.done} of ${totals.total} done`;
  return `${done} · ${late}`;
}

/** The late row's words: "1 late · 2 couldn't be done", as the progress card says them. */
export function slipLabel(totals: Pick<DayTotals, "late" | "couldnt">, locale: OwnerLocale): string {
  const id = locale === "id";
  return [
    totals.late > 0 ? (id ? `${totals.late} terlambat` : `${totals.late} late`) : null,
    totals.couldnt > 0
      ? id
        ? `${totals.couldnt} tidak bisa dikerjakan`
        : `${totals.couldnt} couldn't be done`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
