import type { HouseholdTask, MasterSchedule, TaskEntity, TaskLog } from "@/types/database";

/**
 * A small, made-up household for tests. Never real data: the repository is
 * not a place for anyone's pets, schedules or photos (see the privacy policy).
 *
 *   Mochi  lunch 12:00, dinner 18:00, potty 07/11/15/19, medicine 08:00
 *   Bento  lunch 12:00, dinner 18:00, potty 07/11/15/19
 *
 * so 13 routine slots a day, in 7 rows (pet × task).
 */
export const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000001";

export function pet(id: string, name: string): TaskEntity {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    entity_type: "pet",
    name,
    icon: "dog",
    metadata: {},
    status: "home",
    created_at: "2026-09-01T03:00:00Z",
  };
}

export const MOCHI = pet("00000000-0000-4000-8000-0000000000a1", "Mochi");
export const BENTO = pet("00000000-0000-4000-8000-0000000000b1", "Bento");

let scheduleCount = 0;
export function schedule(
  entity: TaskEntity,
  title: string,
  times: string[],
  extra: Partial<MasterSchedule> = {}
): MasterSchedule {
  scheduleCount += 1;
  return {
    id: `00000000-0000-4000-8000-${String(scheduleCount).padStart(12, "0")}`,
    entity_id: entity.id,
    title,
    module: "pet",
    frequency_type: "fixed_time",
    interval_hours: null,
    fixed_times: times,
    start_time: null,
    end_time: null,
    is_active: true,
    expires_at: null,
    created_at: "2026-10-01T02:00:00Z",
    ...extra,
  };
}

const POTTY_TIMES = ["07:00", "11:00", "15:00", "19:00"];

export const SCHEDULES: MasterSchedule[] = [
  schedule(MOCHI, "Makan Siang", ["12:00"]),
  schedule(MOCHI, "Makan Malam", ["18:00"]),
  schedule(MOCHI, "Pipis & Pup", POTTY_TIMES),
  schedule(MOCHI, "Medication: Obat Uji", ["08:00"]),
  schedule(BENTO, "Makan Siang", ["12:00"]),
  schedule(BENTO, "Makan Malam", ["18:00"]),
  schedule(BENTO, "Pipis & Pup", POTTY_TIMES),
];

/** A log for `s` at `time` (HH:mm, local) on `date`. */
export function logFor(s: MasterSchedule, date: string, time: string): TaskLog {
  return {
    id: `log-${s.id}-${date}-${time}`,
    schedule_id: s.id,
    entity_id: s.entity_id,
    module: s.module,
    photo_url: null,
    notes: null,
    // Local wall-clock time in Asia/Jakarta (+07:00), as the phones record it.
    completed_at: `${date}T${time}:00+07:00`,
  } as TaskLog;
}

export function chore(id: string, title: string, due: string, extra: Partial<HouseholdTask> = {}) {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    title,
    notes: null,
    category: "cleaning",
    assigned_to: null,
    due_date: due,
    due_time: null,
    status: "pending",
    completed_by: null,
    completed_at: null,
    photo_url: null,
    created_at: "2026-10-01T02:00:00Z",
    recurrence: "none",
    recurrence_until: null,
    parent_task_id: null,
    ...extra,
  } as HouseholdTask;
}
