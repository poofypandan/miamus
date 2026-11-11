import type { CreateScheduleInput } from "@/lib/data/types";
import { routineKindInfo, ROUTINE_KINDS, proofOf } from "@/lib/pet-routine-kinds";
import type { MasterSchedule, RoutineKind, RoutineProof } from "@/types/database";

/**
 * The Add routine sheet's state, and how it becomes rows (Phase 173, D3).
 *
 * One `master_schedules` row per pet and per time, all sharing one
 * `routine_group_id`: every reader of routines (the staff card, logs per pet,
 * the evening summary, the export) is already per pet and per schedule, and a
 * single-time row is what every editor in the app makes. Two times a day for
 * two pets is four rows in one group.
 *
 * Pure, so the edit rules are tested without a browser.
 */
export type RoutineRepeat = "daily" | "days" | "once";

export interface RoutineDraft {
  kind: RoutineKind;
  /** What staff read: the kind's Indonesian title, or what the owner typed for Other. */
  title: string;
  petIds: string[];
  /** HH:mm, at least one. */
  times: string[];
  repeat: RoutineRepeat;
  /** ISO weekdays for "days". */
  days: number[];
  /** YYYY-MM-DD for "once". */
  onceDate: string;
  /** Optional last day for "daily" and "days"; null = never. */
  endsOn: string | null;
  staffId: string | null;
  note: string;
  proof: RoutineProof;
}

export function newDraft(kind: RoutineKind, petIds: string[], today: string): RoutineDraft {
  const info = routineKindInfo(kind) ?? ROUTINE_KINDS[0];
  return {
    kind,
    title: info.title ?? "",
    petIds,
    times: [info.time],
    repeat: "daily",
    days: [],
    onceDate: today,
    endsOn: null,
    staffId: null,
    note: "",
    proof: info.proof,
  };
}

/**
 * The rows of one routine group, or the single row of an old routine.
 * A row an edit removed (a pet or a time taken off, kept for its history)
 * has left the group: `endedRowPatch` clears its group id, so it is never
 * read back as part of the routine. Dates alone can't tell it from a
 * one-off: a row made yesterday and ended yesterday looks like one (Codex,
 * PR #85).
 */
export function groupRows(schedules: MasterSchedule[], row: MasterSchedule): MasterSchedule[] {
  if (!row.routine_group_id) return [row];
  return schedules.filter((s) => s.routine_group_id === row.routine_group_id);
}

/**
 * What ends a removed row that has history: its last day is yesterday (so
 * its logs keep their title), and it leaves its group.
 */
export function endedRowPatch(today: string): Partial<MasterSchedule> {
  return { expires_at: dayBefore(today), routine_group_id: null };
}

/**
 * Whether a row was saved as a one-off (When: Once): its first and last day
 * are the same day. Its start date is then part of what it is, and a copy
 * must keep it.
 */
export function isOnceRow(row: Pick<MasterSchedule, "created_at" | "expires_at">): boolean {
  return !!row.expires_at && row.expires_at === localDate(row.created_at);
}

/** The sheet filled in from an existing group, for editing (D5: old "Others" rows too). */
export function draftFromRows(rows: MasterSchedule[], today: string): RoutineDraft {
  const first = rows[0];
  const kind: RoutineKind = first.kind ?? "other";
  const times = [...new Set(rows.flatMap((r) => (r.fixed_times ?? []).map((t) => t.slice(0, 5))))].sort();
  const createdOn = localDate(first.created_at);
  const once = !!first.expires_at && first.expires_at === createdOn;
  const days = first.days_of_week ?? [];
  return {
    kind,
    title: first.title,
    petIds: [...new Set(rows.map((r) => r.entity_id))],
    times: times.length > 0 ? times : [routineKindInfo(kind)?.time ?? "08:00"],
    repeat: once ? "once" : days.length > 0 ? "days" : "daily",
    days: [...days].sort(),
    onceDate: once ? first.expires_at! : today,
    endsOn: once ? null : (first.expires_at ?? null),
    staffId: first.staff_id ?? null,
    note: first.note ?? "",
    proof: proofOf(first),
  };
}

/** Why a draft can't be saved yet, or null. Only What and When matter (stop rule). */
export function draftProblem(draft: RoutineDraft): "title" | "pets" | "times" | "days" | null {
  if (!draft.title.trim()) return "title";
  if (draft.petIds.length === 0) return "pets";
  if (draft.times.length === 0) return "times";
  if (draft.repeat === "days" && draft.days.length === 0) return "days";
  return null;
}

/** The fields every row of the group shares. */
function sharedFields(draft: RoutineDraft, groupId: string) {
  const once = draft.repeat === "once";
  return {
    title: draft.title.trim(),
    kind: draft.kind,
    routine_group_id: groupId,
    days_of_week: draft.repeat === "days" ? [...new Set(draft.days)].sort((a, b) => a - b) : null,
    note: draft.note.trim() ? draft.note.trim() : null,
    staff_id: draft.staffId,
    proof: draft.proof,
    expires_at: once ? draft.onceDate : draft.endsOn || null,
  };
}

export interface RoutineSavePlan {
  create: CreateScheduleInput[];
  update: { id: string; patch: Partial<MasterSchedule> }[];
  /** Rows no longer wanted: ended if they have history, deleted if not. */
  remove: MasterSchedule[];
}

/**
 * The writes that turn `existing` (the group's rows, or none for a new
 * routine) into the draft.
 *
 * Rows are kept wherever they can be, so logs keep pointing at them: a pet's
 * row at an unchanged time is updated in place, and a pet's row whose time
 * moved is moved (07:00 to 07:30 is the same walk). Only a pet or a time that
 * is new gets a row; only a pet or a time that is gone loses one.
 *
 * `onceStart` is the once-date's local midnight as an ISO string: the same
 * trick vet visits use, so a one-off stays hidden until its day.
 */
export function planRoutineSave(params: {
  draft: RoutineDraft;
  existing: MasterSchedule[];
  groupId: string;
  onceStart: string;
  nowIso: string;
  today: string;
}): RoutineSavePlan {
  const { draft, existing, groupId, onceStart, nowIso, today } = params;
  const shared = sharedFields(draft, groupId);
  const times = [...new Set(draft.times)].sort();
  const once = draft.repeat === "once";
  const plan: RoutineSavePlan = { create: [], update: [], remove: [] };

  for (const petId of draft.petIds) {
    const mine = existing.filter((r) => r.entity_id === petId);
    const timeOf = (r: MasterSchedule) => (r.fixed_times?.[0] ?? "").slice(0, 5);
    const kept = new Set<string>();
    const free: MasterSchedule[] = [];
    for (const row of mine) {
      const t = timeOf(row);
      if (times.includes(t) && !kept.has(t) && (row.fixed_times?.length ?? 0) <= 1) kept.add(t);
      else free.push(row);
    }
    const startFor = (row: MasterSchedule): string | undefined => {
      if (once) return onceStart;
      // A row that was a one-off on a later day starts today when it repeats.
      return localDate(row.created_at) > today ? nowIso : undefined;
    };
    for (const row of mine) {
      if (free.includes(row)) continue;
      const created = startFor(row);
      plan.update.push({
        id: row.id,
        patch: { ...shared, fixed_times: [timeOf(row)], ...(created ? { created_at: created } : {}) },
      });
    }
    for (const t of times.filter((t) => !kept.has(t))) {
      const reuse = free.shift();
      if (reuse) {
        const created = startFor(reuse);
        plan.update.push({
          id: reuse.id,
          patch: {
            ...shared,
            frequency_type: "fixed_time",
            fixed_times: [t],
            interval_hours: null,
            start_time: null,
            end_time: null,
            ...(created ? { created_at: created } : {}),
          },
        });
      } else {
        plan.create.push({
          entity_id: petId,
          module: "pet",
          frequency_type: "fixed_time",
          fixed_times: [t],
          ...shared,
          ...(once ? { created_at: onceStart } : {}),
        });
      }
    }
    plan.remove.push(...free);
  }
  plan.remove.push(...existing.filter((r) => !draft.petIds.includes(r.entity_id)));
  return plan;
}

/** "YYYY-MM-DD" of a timestamp on this phone's clock (the app runs on Jakarta time). */
function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The day before a "YYYY-MM-DD" date: a removed row with history ends there. */
export function dayBefore(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return prev.toISOString().slice(0, 10);
}
