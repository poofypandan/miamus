import { describe, expect, it } from "vitest";
import { expandChores } from "@/lib/chore-recurrence";
import { buildAgenda } from "@/lib/scheduleEngine";
import {
  buildEveningSummary,
  canFileFor,
  canWithdraw,
  choreException,
  groupExceptions,
  itemException,
  ownerCouldntLine,
  ownerCouldntRowLine,
  reasonsFor,
  staffCouldntLine,
  staffReasonLabel,
  summaryHref,
  summaryOpenCount,
} from "@/lib/couldnt-do";
import { jobPhotos } from "@/lib/offline-queue";
import { pendingException } from "@/lib/task-exceptions-store";
import type {
  HouseholdTask,
  LeaveRequest,
  MasterSchedule,
  RoutineProposal,
  TaskEntity,
  TaskException,
  TaskLog,
} from "@/types/database";

// "Tidak bisa dikerjakan" and the evening summary (Phase 165): reasons,
// labels, which record belongs to which task, done wins, and what the
// summary lists.

const TODAY = "2026-11-10";

let n = 0;
function chore(over: Partial<HouseholdTask>): HouseholdTask {
  return {
    id: `t${++n}`,
    household_id: "h",
    title: `Chore ${n}`,
    notes: null,
    category: "cleaning",
    assigned_to: null,
    due_date: TODAY,
    due_time: null,
    status: "pending",
    completed_by: null,
    completed_at: null,
    photo_url: null,
    created_at: "2026-11-01T00:00:00Z",
    recurrence: "none",
    recurrence_until: null,
    parent_task_id: null,
    requires_supervision: false,
    before_photo_url: null,
    after_photo_url: null,
    location_id: null,
    ...over,
  } as HouseholdTask;
}

function exception(over: Partial<TaskException>): TaskException {
  return {
    id: `x${++n}`,
    household_id: "h",
    chore_id: null,
    schedule_id: null,
    entity_id: null,
    occurs_on: TODAY,
    slot_time: null,
    reason: "out_of_stock",
    note: null,
    photo_url: null,
    inventory_item_id: null,
    staff_id: "sari",
    created_at: "2026-11-10T02:10:00Z", // 09.10 in Jakarta
    ...over,
  };
}

const MOCHI = { id: "mochi", name: "Mochi", entity_type: "pet", icon: null, metadata: {}, status: "home" } as unknown as TaskEntity;
const KOPI = { id: "kopi", name: "Kopi", entity_type: "pet", icon: null, metadata: {}, status: "admitted" } as unknown as TaskEntity;
function schedule(over: Partial<MasterSchedule>): MasterSchedule {
  return {
    id: `s${++n}`,
    entity_id: MOCHI.id,
    title: "Dinner",
    module: "pet",
    frequency_type: "fixed_time",
    fixed_times: ["18:00:00"],
    interval_hours: null,
    start_time: null,
    end_time: null,
    is_active: true,
    expires_at: null,
    created_at: "2026-11-01T00:00:00Z",
    ...over,
  } as MasterSchedule;
}

describe("reasons", () => {
  it("offers 'pet refused' only where a pet can refuse", () => {
    expect(reasonsFor("chore")).toEqual(["out_of_stock", "done_by_other", "other"]);
    expect(reasonsFor("meal")).toContain("pet_refused");
    expect(reasonsFor("medication")).toContain("pet_refused");
    expect(reasonsFor("potty")).not.toContain("pet_refused");
    expect(reasonsFor("grooming")).not.toContain("pet_refused");
  });

  it("reads to staff in Indonesian, and to owners in their language", () => {
    expect(staffReasonLabel("pet_refused")).toBe("Hewan tidak mau makan");
    expect(staffReasonLabel("pet_refused", true)).toBe("Hewan tidak mau minum obat");
    expect(staffReasonLabel("done_by_other")).toBe("Sudah dikerjakan orang lain");
    expect(ownerCouldntLine("out_of_stock", "en")).toBe("Couldn't: out of stock");
    expect(ownerCouldntLine("out_of_stock", "id")).toBe("Tidak bisa: barang habis");
    expect(ownerCouldntLine("pet_refused", "en", true)).toBe("Couldn't: pet wouldn't take medicine");
  });

  it("writes the card lines with who and when", () => {
    expect(staffCouldntLine(exception({}))).toBe("Tidak bisa · Barang habis · 09.10");
    expect(ownerCouldntRowLine(exception({}), "en", "Sari")).toBe("Couldn't: out of stock · Sari · 9:10 AM");
    expect(ownerCouldntRowLine(exception({}), "id", "Sari")).toBe("Tidak bisa: barang habis · Sari · 09.10");
  });
});

describe("which record belongs to which task", () => {
  it("finds a repeat's day by the repeat and the day, written or not", () => {
    const laundry = chore({ title: "Laundry", recurrence: "daily", due_date: "2026-11-03" });
    const [today] = expandChores({ rows: [laundry], date: TODAY, today: TODAY });
    const x = exception({ chore_id: laundry.id });
    expect(choreException([x], today)).toBe(x);
    expect(choreException([exception({ chore_id: laundry.id, occurs_on: "2026-11-09" })], today)).toBeNull();
  });

  it("lets done win: a finished chore shows no record", () => {
    const mop = chore({ status: "completed", before_photo_url: "b", after_photo_url: "a" });
    const [occurrence] = expandChores({ rows: [mop], date: TODAY, today: TODAY });
    expect(choreException([exception({ chore_id: mop.id })], occurrence)).toBeNull();
  });

  it("matches a routine slot by schedule, pet, day and time", () => {
    const dinner = schedule({});
    const [group] = buildAgenda({ date: TODAY, entities: [MOCHI], schedules: [dinner], logs: [], now: new Date("2026-11-10T12:00:00Z") });
    const right = exception({ schedule_id: dinner.id, entity_id: MOCHI.id, slot_time: "18:00:00", reason: "pet_refused" });
    const wrongTime = exception({ schedule_id: dinner.id, entity_id: MOCHI.id, slot_time: "08:00:00" });
    expect(itemException([wrongTime, right], TODAY, group.items[0])).toBe(right);
    expect(groupExceptions([wrongTime], TODAY, group)).toEqual([]);
  });

  it("lets done win for a routine too: a logged slot shows no record", () => {
    const dinner = schedule({});
    const log = { id: "l1", schedule_id: dinner.id, entity_id: MOCHI.id, module: "pet", photo_url: null, notes: null,
      completed_at: "2026-11-10T11:30:00Z", staff_id: null, sub_type: "complete" } as TaskLog;
    const [group] = buildAgenda({ date: TODAY, entities: [MOCHI], schedules: [dinner], logs: [log] });
    const x = exception({ schedule_id: dinner.id, entity_id: MOCHI.id, slot_time: "18:00:00" });
    expect(itemException([x], TODAY, group.items[0])).toBeNull();
  });
});

describe("filing and withdrawing", () => {
  it("allows today and the 7 days before, never ahead", () => {
    expect(canFileFor(TODAY, TODAY)).toBe(true);
    expect(canFileFor("2026-11-03", TODAY)).toBe(true);
    expect(canFileFor("2026-11-02", TODAY)).toBe(false);
    expect(canFileFor("2026-11-11", TODAY)).toBe(false);
    expect(canFileFor("2026-10-28", "2026-11-04")).toBe(true);
  });

  it("can be withdrawn for 5 minutes", () => {
    const at = Date.parse("2026-11-10T02:10:00Z");
    expect(canWithdraw({ created_at: "2026-11-10T02:10:00Z" }, at + 4 * 60_000)).toBe(true);
    expect(canWithdraw({ created_at: "2026-11-10T02:10:00Z" }, at + 5 * 60_000)).toBe(false);
    expect(canWithdraw({ created_at: "not a date" }, at)).toBe(false);
  });

  it("waits on the phone with its photo, and shows as the record it will be", () => {
    const input = { id: "x-new", chore_id: "t1", occurs_on: TODAY, reason: "other" as const, note: "Kamar dikunci", photo_url: "http://p/1.webp" };
    expect(jobPhotos({ kind: "couldnt", input })).toEqual(["http://p/1.webp"]);
    const row = pendingException({ id: "q1", job: { kind: "couldnt", input }, householdId: "h", timestamp: Date.parse("2026-11-10T02:10:00Z") }, "h");
    expect(row).toMatchObject({ id: "x-new", household_id: "h", chore_id: "t1", note: "Kamar dikunci", created_at: "2026-11-10T02:10:00.000Z" });
    expect(pendingException({ id: "q2", job: { kind: "couldnt", input }, householdId: "other", timestamp: 0 }, "h")).toBeNull();
  });
});

describe("the evening summary", () => {
  const laundry = chore({ title: "Laundry", due_time: "09:00", assigned_to: "sari" });
  const mop = chore({ title: "Mop the terrace", due_time: "08:00" });
  const sweep = chore({ title: "Sweep", due_time: "23:00" });
  const done = chore({ title: "Done thing", status: "completed", before_photo_url: "b", after_photo_url: "a" });
  const dinner = schedule({});
  const kopiDinner = schedule({ entity_id: KOPI.id });
  const chores = expandChores({ rows: [laundry, mop, sweep, done], date: TODAY, today: TODAY });
  const groups = buildAgenda({
    date: TODAY,
    entities: [MOCHI, KOPI],
    schedules: [dinner, kopiDinner],
    logs: [],
    now: new Date("2026-11-10T12:00:00Z"),
  });
  const leave = { id: "lv", household_id: "h", staff_id: "sari", start_date: "2026-11-12", end_date: "2026-11-14", status: "pending" } as LeaveRequest;
  const over = { ...leave, id: "lv2", start_date: "2026-11-01", end_date: "2026-11-02" } as LeaveRequest;
  const proposals = [
    { id: "p1", status: "pending", batch_id: "b1" },
    { id: "p2", status: "pending", batch_id: "b1" },
    { id: "p3", status: "approved", batch_id: "b2" },
  ] as RoutineProposal[];

  function at(minutes: number | null, exceptions: TaskException[] = []) {
    return buildEveningSummary({
      date: TODAY,
      chores,
      groups,
      exceptions,
      leaves: [leave, over],
      proposals,
      admittedIds: new Set([KOPI.id]),
      untilMinutes: minutes,
    });
  }

  it("lists what is due by the summary time and not done, leaving out pets at the clinic", () => {
    const summary = at(19 * 60);
    expect(summary.notDone.map((r) => r.title)).toEqual(["Mop the terrace", "Laundry", "Dinner"]);
    expect(summary.notDone.find((r) => r.kind === "routine")?.petName).toBe("Mochi");
    expect(summary.done).toBe(1);
    expect(summaryOpenCount(summary)).toBe(3);
  });

  it("lists a couldn't-do task once, under Couldn't, whatever its time", () => {
    const summary = at(8 * 60 + 30, [
      exception({ chore_id: laundry.id }),
      exception({ chore_id: sweep.id, reason: "done_by_other" }),
    ]);
    expect(summary.couldnt.map((r) => r.title)).toEqual(["Laundry", "Sweep"]);
    expect(summary.notDone.map((r) => r.title)).toEqual(["Mop the terrace"]);
  });

  it("counts pending leave not yet over, and suggestions once each", () => {
    const summary = at(19 * 60);
    expect(summary.leaves.map((l) => l.id)).toEqual(["lv"]);
    expect(summary.suggestions).toBe(1);
  });

  it("covers the whole day for an earlier day", () => {
    expect(at(null).notDone.map((r) => r.title)).toContain("Sweep");
  });

  it("links to the summary for a day", () => {
    expect(summaryHref(TODAY)).toBe("/dashboard?module=agenda&summary=2026-11-10");
  });
});
