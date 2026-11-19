import { describe, expect, it } from "vitest";
import {
  canWriteDayOf,
  expandChores,
  occursOn,
  seriesIdOf,
  type ChoreOccurrence,
} from "@/lib/chore-recurrence";
import { choreException } from "@/lib/couldnt-do";
import { ChoreChangedError, choreChangedMessage, isChoreChanged } from "@/lib/chore-settled";
import type { HouseholdTask, TaskException } from "@/types/database";

// Staff chore saves refused on 12-13 Nov 2026 (production): Ari's phone
// showed "Ganti handuk" on a Friday, with both photos taken, and every
// Selesaikan was refused (POST household_tasks 403, chore_owner_only), then
// "Tidak bisa dikerjakan" too (POST task_exceptions 403, task_exception_task).
// The repeat is weekly on Sundays from 11 Oct; its 1 Nov and 8 Nov days are
// written and done. Nothing falls on Friday 13 Nov.
//
// What the phone did: one of the written days carried a cadence of its own
// (recurrence "weekly" on a row with a parent_task_id). expandChores read it
// as a second repeat, found its 8 Nov "missed" (8 Nov has a row, but under
// the real repeat, not under the day row), and offered it with the DAY ROW as
// its template. The server reads only top-level rows as repeats, so writing
// that day (parent_task_id = the day row) and explaining it (chore_id = the
// day row) were both refused, every time.

const HOUSE = "house-1";
const ARI = "staff-ari";

function row(fields: Partial<HouseholdTask> & Pick<HouseholdTask, "id" | "due_date">): HouseholdTask {
  return {
    household_id: HOUSE,
    title: "Ganti handuk",
    notes: null,
    category: "cleaning",
    assigned_to: ARI,
    due_time: null,
    status: "pending",
    completed_by: null,
    completed_at: null,
    photo_url: null,
    before_photo_url: null,
    after_photo_url: null,
    created_at: "2026-10-11T00:00:00Z",
    recurrence: "none",
    recurrence_until: null,
    recurrence_interval: 1,
    remind_days_before: null,
    parent_task_id: null,
    requires_supervision: false,
    location_id: null,
    spot: null,
    repair_id: null,
    ...fields,
  } as HouseholdTask;
}

const template = row({ id: "d812dece", due_date: "2026-10-11", recurrence: "weekly", status: "completed" });
const done = { status: "completed" as const, completed_by: ARI, completed_at: "2026-11-08T07:34:00Z" };
// The written days. The 1 Nov one was given a cadence of its own.
const nov1 = row({ id: "day-nov-1", due_date: "2026-11-01", parent_task_id: template.id, recurrence: "weekly", ...done });
const nov8 = row({ id: "day-nov-8", due_date: "2026-11-08", parent_task_id: template.id, ...done });
const rows = [template, nov1, nov8];

/**
 * household_tasks_owner_guard's rule for a staff phone's insert
 * (migrations/128, as 137 left it): the parent is a top-level repeat in the
 * household, the copied fields match it, the day is a one-off, and the
 * repeat falls on that day (chore_occurs_on, the SQL twin of occursOn).
 */
function guardAllowsDayRow(server: HouseholdTask[], parentId: string, date: string): boolean {
  const parent = server.find(
    (t) => t.id === parentId && t.household_id === HOUSE && !t.parent_task_id && (t.recurrence ?? "none") !== "none"
  );
  return !!parent && occursOn(parent, date);
}

/** task_exceptions_guard (migrations/139): chore_id is a top-level chore, not cancelled. */
function guardAllowsException(server: HouseholdTask[], choreId: string): boolean {
  return server.some((t) => t.id === choreId && t.household_id === HOUSE && !t.parent_task_id && t.status !== "cancelled");
}

/** What the phone would send for each chore it offers: the day row it writes, and the record it files. */
function refusedSaves(occurrences: ChoreOccurrence[], server: HouseholdTask[]): string[] {
  const refused: string[] = [];
  for (const o of occurrences) {
    if (o.status !== "pending") continue;
    // FinishChoreSheet.rowId(): a virtual day is written under its template.
    if (!o.row && !guardAllowsDayRow(server, o.template.id, o.date)) refused.push(`day ${o.key}`);
    // CouldntDoSheet: the record names the chore the day belongs to.
    if (!guardAllowsException(server, seriesIdOf(o))) refused.push(`record ${o.key}`);
  }
  return refused;
}

describe("a written day is never a repeat of its own (staff chore 403, 13 Nov)", () => {
  it.each(["2026-11-09", "2026-11-12", "2026-11-13", "2026-11-14"])(
    "Ganti handuk is not offered on %s: both its November days are done",
    (today) => {
      const offered = expandChores({ rows, date: today, today });
      expect(offered.map((o) => o.key)).toEqual([]);
    }
  );

  it("everything a staff phone is offered, the guards accept", () => {
    for (const today of ["2026-11-08", "2026-11-12", "2026-11-13", "2026-11-15"]) {
      const offered = expandChores({ rows, date: today, today });
      expect(refusedSaves(offered, rows), today).toEqual([]);
    }
  });

  it("the next Sunday is the real repeat's day, written under the repeat", () => {
    const offered = expandChores({ rows, date: "2026-11-15", today: "2026-11-15" });
    expect(offered).toHaveLength(1);
    expect(offered[0]).toMatchObject({ date: "2026-11-15", virtual: true });
    expect(offered[0].template.id).toBe(template.id);
    expect(canWriteDayOf(offered[0].template, offered[0].date)).toBe(true);
  });

  it("a pending day row with a cadence still rolls over as itself, under its repeat", () => {
    const owed = { ...nov8, status: "pending" as const, completed_by: null, completed_at: null, recurrence: "weekly" as const };
    const offered = expandChores({ rows: [template, nov1, owed], date: "2026-11-13", today: "2026-11-13" });
    expect(offered.map((o) => o.key)).toEqual([`${template.id}|2026-11-08`]);
    expect(offered[0].row?.id).toBe(owed.id);
    expect(offered[0].template.id).toBe(template.id);
    expect(seriesIdOf(offered[0])).toBe(template.id);
  });
});

describe("the chore a couldn't-do record names", () => {
  it("is the repeat even when the phone doesn't have it (turned off, still carried over)", () => {
    // The repeat no longer reads as one (an owner turned it off), so the
    // phone's repeat read doesn't return it; its pending day still rolls over.
    const owed = row({ id: "day-nov-8b", due_date: "2026-11-08", parent_task_id: template.id });
    const [occurrence] = expandChores({ rows: [owed], date: "2026-11-13", today: "2026-11-13" });
    // Its own template on the phone: the day row itself.
    expect(occurrence.template.id).toBe(owed.id);
    // But the record names the repeat, which the server accepts.
    expect(seriesIdOf(occurrence)).toBe(template.id);
    expect(guardAllowsException([template, owed], seriesIdOf(occurrence))).toBe(true);
    // And its record is found under the repeat.
    const record = { chore_id: template.id, occurs_on: "2026-11-08" } as TaskException;
    expect(choreException([record], occurrence)).toBe(record);
  });

  it("is the row itself for a one-off", () => {
    const oneOff = row({ id: "one-off", due_date: "2026-11-13" });
    const [occurrence] = expandChores({ rows: [oneOff], date: "2026-11-13", today: "2026-11-13" });
    expect(seriesIdOf(occurrence)).toBe("one-off");
  });
});

describe("canWriteDayOf (the guard's insert rule, checked before sending)", () => {
  it("allows a top-level repeat's own days only", () => {
    expect(canWriteDayOf(template, "2026-11-08")).toBe(true);
    expect(canWriteDayOf(template, "2026-11-13")).toBe(false);
    // A written day, whatever its cadence says.
    expect(canWriteDayOf(nov1, "2026-11-08")).toBe(false);
    // A one-off, or a repeat that has ended.
    expect(canWriteDayOf({ ...template, recurrence: "none" }, "2026-11-08")).toBe(false);
    expect(canWriteDayOf({ ...template, recurrence_until: "2026-11-01" }, "2026-11-08")).toBe(false);
  });
});

describe("telling a changed chore from other refusals", () => {
  it("reads the guards' refusals, and the phone's own check, as changed", () => {
    expect(isChoreChanged(new ChoreChangedError())).toBe(true);
    expect(isChoreChanged({ code: "42501", message: "chore_owner_only", status: 403 })).toBe(true);
    expect(isChoreChanged({ code: "42501", message: "task_exception_task", status: 403 })).toBe(true);
    expect(isChoreChanged({ code: "23514", message: "task_exception_not_open", status: 400 })).toBe(true);
    expect(isChoreChanged({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
    expect(isChoreChanged({ code: "", message: "TypeError: Failed to fetch" })).toBe(false);
    expect(isChoreChanged(null)).toBe(false);
  });

  it("says, in Indonesian for staff, that it wasn't sent, the list was refreshed, and the photos are kept", () => {
    const id = choreChangedMessage("id", "Ganti handuk");
    expect(id).toContain('"Ganti handuk" tidak terkirim');
    expect(id).toContain("Daftar tugas sudah diperbarui");
    expect(id).toContain("Foto tetap tersimpan di HP");
    expect(choreChangedMessage("id", "Ganti handuk", false)).not.toContain("Foto");
    expect(choreChangedMessage("en", "Ganti handuk")).toContain("wasn't saved");
  });
});
