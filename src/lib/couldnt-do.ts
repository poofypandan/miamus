import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import type { AgendaGroup, AgendaItem } from "@/lib/scheduleEngine";
import type { ScheduleCategory } from "@/lib/schedule-categories";
import type { OwnerLocale } from "@/lib/owner-locale";
import { formatTime } from "@/lib/time";
import type { LeaveRequest, RoutineProposal, TaskException, TaskExceptionReason, TaskLog } from "@/types/database";
import { vetVisitState } from "@/lib/staff-agenda";

/**
 * "Tidak bisa dikerjakan" and the evening summary (Phase 165,
 * docs/phase-165-couldnt-do-and-evening-summary-plan.md, migrations/139).
 * Pure: which reasons a task offers, how each reads to staff (Indonesian)
 * and to owners (their language), which record belongs to which task, and
 * what the evening summary lists.
 *
 * DONE WINS. A record says a task couldn't be done; if it is done after all
 * (finished later, logged later), every screen shows it done and the record
 * stops showing. Nothing is rewritten.
 */

/** What a task is, for the reasons it offers. */
export type ExceptionKind = "chore" | ScheduleCategory;

/** Meals and medicine can be refused; potty, grooming and visits can't. */
function canRefuse(kind: ExceptionKind): boolean {
  return kind === "meal" || kind === "medication" || kind === "temporary";
}

/** The reasons offered, in order (D2 A: the audit's four, where they fit). */
export function reasonsFor(kind: ExceptionKind): TaskExceptionReason[] {
  return canRefuse(kind)
    ? ["out_of_stock", "pet_refused", "done_by_other", "other"]
    : ["out_of_stock", "done_by_other", "other"];
}

/** Staff screens: Bahasa Indonesia only. */
export function staffReasonLabel(reason: TaskExceptionReason, medicine = false): string {
  switch (reason) {
    case "out_of_stock":
      return "Barang habis";
    case "pet_refused":
      return medicine ? "Hewan tidak mau minum obat" : "Hewan tidak mau makan";
    case "done_by_other":
      return "Sudah dikerjakan orang lain";
    case "other":
      return "Lainnya";
  }
}

/** Owner screens, sentence case ("Out of stock"). */
export function ownerReasonLabel(reason: TaskExceptionReason, locale: OwnerLocale, medicine = false): string {
  const id = locale === "id";
  switch (reason) {
    case "out_of_stock":
      return id ? "Barang habis" : "Out of stock";
    case "pet_refused":
      return medicine
        ? id
          ? "Hewan tidak mau minum obat"
          : "Pet wouldn't take medicine"
        : id
          ? "Hewan tidak mau makan"
          : "Pet wouldn't eat";
    case "done_by_other":
      return id ? "Sudah dikerjakan orang lain" : "Already done by someone else";
    case "other":
      return id ? "Lainnya" : "Other";
  }
}

/** "Couldn't: out of stock" / "Tidak bisa: barang habis", for a row's subtitle. */
export function ownerCouldntLine(reason: TaskExceptionReason, locale: OwnerLocale, medicine = false): string {
  const label = ownerReasonLabel(reason, locale, medicine);
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  return locale === "id" ? `Tidak bisa: ${lower}` : `Couldn't: ${lower}`;
}

/** A staff card's line: "Tidak bisa · Barang habis · 09.10". */
export function staffCouldntLine(exception: Pick<TaskException, "reason" | "created_at">, medicine = false): string {
  return `Tidak bisa · ${staffReasonLabel(exception.reason, medicine)} · ${formatTime(new Date(exception.created_at), "id")}`;
}

/** An owner row's line: "Couldn't: out of stock · Sari · 9:10 AM". */
export function ownerCouldntRowLine(
  exception: Pick<TaskException, "reason" | "created_at">,
  locale: OwnerLocale,
  who: string | null,
  medicine = false
): string {
  return [ownerCouldntLine(exception.reason, locale, medicine), who, formatTime(new Date(exception.created_at), locale)]
    .filter(Boolean)
    .join(" · ");
}

/** "HH:MM" from a time column ("18:00:00") or an agenda slot ("18:00"). */
export function slotOf(time: string | null | undefined): string | null {
  return time ? time.slice(0, 5) : null;
}

/** The record for a chore's day, unless the chore is done (done wins) or called off. */
export function choreException(list: readonly TaskException[], occurrence: ChoreOccurrence): TaskException | null {
  if (occurrence.status !== "pending") return null;
  return list.find((x) => x.chore_id === occurrence.template.id && x.occurs_on === occurrence.date) ?? null;
}

/** The record for one pet's slot, unless it is logged (done wins). */
export function itemException(
  list: readonly TaskException[],
  date: string,
  item: AgendaItem
): TaskException | null {
  if (item.status === "completed") return null;
  return (
    list.find(
      (x) =>
        x.schedule_id === item.scheduleId &&
        x.entity_id === item.entityId &&
        x.occurs_on === date &&
        slotOf(x.slot_time) === item.time
    ) ?? null
  );
}

/** Each open pet of a routine block that someone said couldn't be done, with its record. */
export function groupExceptions(
  list: readonly TaskException[],
  date: string,
  group: AgendaGroup
): { item: AgendaItem; exception: TaskException }[] {
  const out: { item: AgendaItem; exception: TaskException }[] = [];
  for (const item of group.items) {
    const exception = itemException(list, date, item);
    if (exception) out.push({ item, exception });
  }
  return out;
}

/** Staff may explain a day from the last 7 and today, never ahead (the guard's rule). */
export function canFileFor(date: string, today: string): boolean {
  if (date > today) return false;
  const [y, m, d] = today.split("-").map(Number);
  const weekAgo = new Date(y, m - 1, d - 7);
  const floor = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, "0")}-${String(weekAgo.getDate()).padStart(2, "0")}`;
  return date >= floor;
}

/** True when the record is still inside the 5-minute Batalkan window (migrations/139). */
export const WITHDRAW_WINDOW_MS = 5 * 60 * 1000;
export function canWithdraw(exception: Pick<TaskException, "created_at">, now = Date.now()): boolean {
  const at = new Date(exception.created_at).getTime();
  return Number.isFinite(at) && now < at + WITHDRAW_WINDOW_MS;
}

// --- The evening summary ------------------------------------------------------------

/** The hours an admin can pick (D6): 18.00 to 21.00, Jakarta. */
export const SUMMARY_HOURS = [18, 19, 20, 21] as const;
export const DEFAULT_SUMMARY_HOUR = 19;

export function summaryHref(date: string): string {
  return `/dashboard?module=agenda&summary=${date}`;
}

export interface SummaryRow {
  key: string;
  kind: "chore" | "routine";
  title: string;
  /** "HH:MM", or null for an anytime chore. */
  time: string | null;
  /** Who it is for (a chore), or who said it couldn't be done. */
  staffId: string | null;
  /** Routines: the pet's name. */
  petName?: string;
  medicine?: boolean;
  exception?: TaskException;
  occurrence?: ChoreOccurrence;
}

export interface EveningSummary {
  couldnt: SummaryRow[];
  notDone: SummaryRow[];
  leaves: LeaveRequest[];
  /** Pending schedule suggestions, counted per suggestion (batch). */
  suggestions: number;
  done: number;
}

function minutesOf(time: string | null): number {
  if (!time) return -1;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function byTime(a: SummaryRow, b: SummaryRow): number {
  return minutesOf(a.time) - minutesOf(b.time) || a.title.localeCompare(b.title);
}

/**
 * One task on one day, as both the evening summary and the staff progress
 * rows on Today read it (Phase 165, Phase 174 prep): done, couldn't (a record
 * says why, and done still wins), or open. The rules are the database's
 * (chore_days_open, migrations/139; routine_slots_open, migrations/144): a
 * chore counts on its own day unless called off; a pet slot counts unless its
 * pet is at the clinic (a vet visit still counts); a vet visit checked in but
 * not closed is open; a three-photo walk is done at its end photo (buildAgenda
 * already reads it so).
 */
export interface DayTask {
  key: string;
  kind: "chore" | "routine";
  state: "done" | "couldnt" | "open";
  title: string;
  /** "HH:MM", or null for an anytime chore. */
  time: string | null;
  exception?: TaskException;
  /** Chores. */
  occurrence?: ChoreOccurrence;
  /** Routines: the slot and its card. */
  item?: AgendaItem;
  group?: AgendaGroup;
  petName?: string;
  medicine?: boolean;
}

/** One chore as a DayTask: done, couldn't (a record for its day; done wins) or open. */
export function classifyChore(occurrence: ChoreOccurrence, exceptions: readonly TaskException[]): DayTask {
  const exception = choreException(exceptions, occurrence);
  return {
    key: occurrence.key,
    kind: "chore",
    state: occurrence.status === "completed" ? "done" : exception ? "couldnt" : "open",
    title: occurrence.task.title,
    time: slotOf(occurrence.task.due_time),
    occurrence,
    exception: exception ?? undefined,
  };
}

export function classifyDay(params: {
  date: string;
  chores: readonly ChoreOccurrence[];
  groups: readonly AgendaGroup[];
  exceptions: readonly TaskException[];
  admittedIds: ReadonlySet<string>;
  /** The day's logs: a vet visit checked in but not closed is still open. */
  logs?: readonly TaskLog[];
}): DayTask[] {
  const { date, chores, groups, exceptions, admittedIds, logs = [] } = params;
  const out: DayTask[] = [];

  for (const occurrence of chores) {
    if (occurrence.date !== date) continue;
    if (occurrence.status !== "completed" && occurrence.status !== "pending") continue;
    out.push(classifyChore(occurrence, exceptions));
  }

  for (const group of groups) {
    // A vet visit logs "complete" at check-in, but stays open until it is
    // closed (vetVisitState; Codex, PR #71).
    const visitOpen =
      group.category === "vet" &&
      (() => {
        const visit = vetVisitState(group.items, logs as TaskLog[]);
        return visit.checkedIn && !visit.closed;
      })();
    for (const item of group.items) {
      if (admittedIds.has(item.entityId) && group.category !== "vet") continue;
      const done = item.status === "completed" && !visitOpen;
      const exception = done ? null : itemException(exceptions, date, item);
      out.push({
        key: `${item.key}|${item.entityId}`,
        kind: "routine",
        state: done ? "done" : exception ? "couldnt" : "open",
        title: item.title,
        time: item.time,
        item,
        group,
        petName: item.entityName,
        medicine: item.category === "medication",
        exception: exception ?? undefined,
      });
    }
  }

  return out;
}

/**
 * What the evening summary lists for one day (D7 A), the way the push does
 * (migrations/139): what couldn't be done, whatever its time; what isn't done
 * yet and was due by `untilMinutes` (null: the whole day); leave and
 * suggestions waiting for an admin. Pets at the clinic are left out, as on
 * Today. `chores` are the day's occurrences with leave applied
 * (useChoreOccurrences).
 */
export function buildEveningSummary(params: {
  date: string;
  chores: readonly ChoreOccurrence[];
  groups: readonly AgendaGroup[];
  exceptions: readonly TaskException[];
  leaves: readonly LeaveRequest[];
  proposals: readonly RoutineProposal[];
  admittedIds: ReadonlySet<string>;
  untilMinutes: number | null;
  /** The day's logs: a vet visit checked in but not closed is still open. */
  logs?: readonly TaskLog[];
}): EveningSummary {
  const { date, leaves, proposals, untilMinutes } = params;
  const due = (time: string | null) => untilMinutes === null || time === null || minutesOf(time) <= untilMinutes;
  const couldnt: SummaryRow[] = [];
  const notDone: SummaryRow[] = [];
  let done = 0;

  for (const task of classifyDay(params)) {
    if (task.state === "done") {
      done += 1;
      continue;
    }
    const row: SummaryRow =
      task.kind === "chore"
        ? {
            key: task.key,
            kind: "chore",
            title: task.title,
            time: task.time,
            staffId: task.exception?.staff_id ?? task.occurrence!.task.assigned_to,
            occurrence: task.occurrence,
            exception: task.exception,
          }
        : {
            key: task.key,
            kind: "routine",
            title: task.title,
            time: task.time,
            staffId: task.exception?.staff_id ?? null,
            petName: task.petName,
            medicine: task.medicine,
            exception: task.exception,
          };
    if (task.state === "couldnt") couldnt.push(row);
    else if (due(task.time)) notDone.push(row);
  }

  const waitingLeaves = leaves
    .filter((l) => l.status === "pending" && l.end_date >= date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const suggestions = new Set(
    proposals.filter((p) => p.status === "pending").map((p) => p.batch_id ?? p.id)
  ).size;

  return {
    couldnt: couldnt.sort(byTime),
    notDone: notDone.sort(byTime),
    leaves: waitingLeaves,
    suggestions,
    done,
  };
}

/** How many things the quiet line on Today counts: couldn't-do and not done. */
export function summaryOpenCount(summary: EveningSummary): number {
  return summary.couldnt.length + summary.notDone.length;
}
