import { leaveCovering } from "@/lib/leave";
import { classifyChore, classifyDay, type DayTask } from "@/lib/couldnt-do";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import type { AgendaGroup } from "@/lib/scheduleEngine";
import type { LeaveRequest, StaffProfile, TaskException, TaskLog } from "@/types/database";

/**
 * Staff progress on Today (owner and wife, 11 Nov): one row per person,
 * house chores and pet routines together, so the owner sees at a glance who
 * is on track and only hears about what didn't happen.
 *
 * Which tasks count, and when one is done or couldn't be done, is the
 * evening summary's own reading (classifyDay in lib/couldnt-do, which mirrors
 * chore_days_open and routine_slots_open). This file only adds who each task
 * belongs to and whether an open one is late.
 *
 * WHO. A chore counts for whoever it is assigned to, or failing that whoever
 * finished it (the old Chores strip's rule). A routine with a person on it
 * (its staff chip, migrations/144) counts for that person; an "Anyone"
 * routine counts for whoever logged it. A couldn't-do record on an unowned
 * task puts it on the person who said so. What nobody owns and nobody has
 * done sits on the "Anyone, not done yet" row.
 *
 * LEAVE. Someone on approved leave shows "Libur". Their chores were already
 * handed on or paused by the leave triage (lib/leave, applied in
 * useChoreOccurrences); a routine with their name on it goes to whoever logs
 * it, or to Anyone while it is open.
 *
 * Pure, so the owner's rows, the person sheet and the staff phone's own line
 * can never disagree.
 */

export type ProgressKind = "house" | "pets";

/** Done out of total, for one kind of work. Absent when a person has none. */
export interface KindCount {
  done: number;
  total: number;
}

/**
 * What someone is busy with that is not on a list, shown in place of the
 * counts' calm line: "Mengawasi perbaikan sejak 10.00". Nothing fills it yet;
 * it is the place Phase 174 (repairs supervision) plugs into.
 */
export interface StaffBusy {
  /** Already in the reader's language: "Supervising a repair". */
  label: string;
  /** "HH:MM", when it started. */
  since: string;
}

/** Neutral while on track; amber when something couldn't be done; red only when late. */
export type ProgressTone = "neutral" | "amber" | "red";

export interface ProgressTask extends DayTask {
  /** Open and past its time (or from an earlier day). A couldn't-do is never late. */
  late: boolean;
  /** Rolled over from an earlier day: listed, but not in the day's fraction. */
  carried: boolean;
  /** Who logged or finished it, when known. */
  doneBy: string | null;
}

export interface PersonProgress {
  id: string;
  name: string;
  /** An admin's own roster row (migrations/106), shown after the staff. */
  admin: boolean;
  house: KindCount | null;
  pets: KindCount | null;
  late: number;
  couldnt: number;
  tone: ProgressTone;
  onLeave: boolean;
  busy: StaffBusy | null;
  /** Their whole day, by time; carried-over chores first. */
  tasks: ProgressTask[];
}

export interface AnyoneProgress {
  /** Open tasks nobody owns, carried-over ones included. */
  open: number;
  late: number;
  couldnt: number;
  tone: ProgressTone;
  tasks: ProgressTask[];
}

export interface StaffProgress {
  people: PersonProgress[];
  /** Null when nothing unowned is left. */
  anyone: AnyoneProgress | null;
}

/**
 * How long past its time a task may still be open before it reads as late.
 * A 07:00 walk done at 07:40 is a normal morning, not a red row.
 */
export const LATE_GRACE_MINUTES = 60;

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Open and late: from an earlier day, or past its time plus the grace today. Never ahead. */
export function isLate(params: {
  date: string;
  today: string;
  nowMinutes: number;
  time: string | null;
}): boolean {
  const { date, today, nowMinutes, time } = params;
  if (date < today) return true;
  if (date > today) return false;
  // An anytime chore has the whole day.
  if (!time) return false;
  return nowMinutes > minutesOf(time) + LATE_GRACE_MINUTES;
}

function toneOf(late: number, couldnt: number): ProgressTone {
  return late > 0 ? "red" : couldnt > 0 ? "amber" : "neutral";
}

function byTime(a: ProgressTask, b: ProgressTask): number {
  if (a.carried !== b.carried) return a.carried ? -1 : 1;
  const am = a.time ? minutesOf(a.time) : -1;
  const bm = b.time ? minutesOf(b.time) : -1;
  return am - bm || a.title.localeCompare(b.title);
}

export function buildStaffProgress(params: {
  date: string;
  today: string;
  /** Minutes into the phone's day now, for lateness. */
  nowMinutes: number;
  /** The day's chores with leave applied (useChoreOccurrences); carried-over ones included. */
  chores: readonly ChoreOccurrence[];
  groups: readonly AgendaGroup[];
  exceptions: readonly TaskException[];
  leaves: readonly LeaveRequest[];
  admittedIds: ReadonlySet<string>;
  logs?: readonly TaskLog[];
  /** Everyone still here (useStaffProfiles().profiles): removed people are left out. */
  roster: readonly Pick<StaffProfile, "id" | "name" | "user_id">[];
  /** Phase 174: who is busy with what. Empty until repairs supervision lands. */
  busy?: ReadonlyMap<string, StaffBusy>;
}): StaffProgress {
  const { date, today, nowMinutes, chores, groups, exceptions, leaves, admittedIds, logs, roster, busy } = params;
  const known = new Set(roster.map((p) => p.id));
  const away = (id: string | null | undefined) => !!id && !!leaveCovering(leaves as LeaveRequest[], id, date);

  const day = classifyDay({ date, chores, groups, exceptions, admittedIds, logs });
  // Carried over from earlier days: still owed, and late by definition,
  // unless a couldn't-do record from its own day says why (Today's chore
  // rows read it the same way; Codex, PR #89). Only ever present when
  // browsing today (expandChores).
  const carried: DayTask[] = chores
    .filter((o) => o.overdue && o.status === "pending" && o.date !== date)
    .map((occurrence) => classifyChore(occurrence, exceptions));

  const ownerOf = (task: DayTask): string | null => {
    if (task.kind === "chore") {
      const t = task.occurrence!.task;
      // Done by someone else while the assignee was away: the doer's work,
      // not hidden under a "Libur" row (the leave triage only moves open ones).
      if (task.state === "done" && t.completed_by && t.assigned_to && away(t.assigned_to)) return t.completed_by;
      return t.assigned_to ?? t.completed_by ?? task.exception?.staff_id ?? null;
    }
    const chip = task.item!.staffId;
    if (chip && !away(chip)) return chip;
    if (task.state === "done") return task.item!.log?.staff_id ?? null;
    return task.exception?.staff_id ?? null;
  };
  const doneByOf = (task: DayTask): string | null =>
    task.state !== "done"
      ? null
      : task.kind === "chore"
        ? (task.occurrence!.task.completed_by ?? null)
        : (task.item!.log?.staff_id ?? null);

  const byPerson = new Map<string | null, ProgressTask[]>();
  const add = (task: DayTask, isCarried: boolean) => {
    let owner = ownerOf(task);
    // Someone no longer on the roster: their open work is anyone's; what they
    // finished is history, not today's progress for anybody here.
    if (owner && !known.has(owner)) {
      if (task.state === "done") return;
      owner = null;
    }
    const entry: ProgressTask = {
      ...task,
      carried: isCarried,
      late: task.state === "open" && (isCarried || isLate({ date, today, nowMinutes, time: task.time })),
      doneBy: doneByOf(task),
    };
    const list = byPerson.get(owner);
    if (list) list.push(entry);
    else byPerson.set(owner, [entry]);
  };
  for (const task of carried) add(task, true);
  for (const task of day) add(task, false);

  const count = (tasks: ProgressTask[], kind: DayTask["kind"]): KindCount | null => {
    const onDay = tasks.filter((t) => t.kind === kind && !t.carried);
    return onDay.length === 0 ? null : { done: onDay.filter((t) => t.state === "done").length, total: onDay.length };
  };

  // Staff first, in roster order; an admin only on a day they have work (R9).
  const ordered = [...roster.filter((p) => !p.user_id), ...roster.filter((p) => p.user_id)];
  const people = ordered.flatMap((p): PersonProgress[] => {
    const tasks = (byPerson.get(p.id) ?? []).sort(byTime);
    const admin = !!p.user_id;
    if (admin && tasks.length === 0) return [];
    const late = tasks.filter((t) => t.late).length;
    const couldnt = tasks.filter((t) => t.state === "couldnt").length;
    return [
      {
        id: p.id,
        name: p.name,
        admin,
        house: count(tasks, "chore"),
        pets: count(tasks, "routine"),
        late,
        couldnt,
        tone: toneOf(late, couldnt),
        onLeave: away(p.id),
        busy: busy?.get(p.id) ?? null,
        tasks,
      },
    ];
  });

  const unowned = (byPerson.get(null) ?? []).filter((t) => t.state !== "done").sort(byTime);
  const anyoneLate = unowned.filter((t) => t.late).length;
  const anyoneCouldnt = unowned.filter((t) => t.state === "couldnt").length;
  return {
    people,
    anyone:
      unowned.length === 0
        ? null
        : {
            open: unowned.length,
            late: anyoneLate,
            couldnt: anyoneCouldnt,
            tone: toneOf(anyoneLate, anyoneCouldnt),
            tasks: unowned,
          },
  };
}
