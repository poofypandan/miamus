import { describe, expect, it } from "vitest";
import { categorizeSchedule } from "@/lib/schedule-categories";
import { buildAgenda, isScheduleActiveOn } from "@/lib/scheduleEngine";
import { isoWeekday, proofChoices, strongestProof } from "@/lib/pet-routine-kinds";
import {
  FRESH_PHOTO_MS,
  isFreshCapture,
  stepTime,
  threePhotoState,
  walkMinutes,
} from "@/lib/staff-agenda";
import {
  dayBefore,
  draftFromRows,
  draftProblem,
  endedRowPatch,
  groupRows,
  isOnceRow,
  newDraft,
  planRoutineSave,
} from "@/lib/routine-groups";
import type { MasterSchedule, TaskEntity, TaskLog } from "@/types/database";

// Phase 173 PR A (docs/phase-173-pet-routines-plan.md). The test zone is
// Asia/Jakarta (vitest.config.ts).

const pet = (id: string, name: string): TaskEntity =>
  ({ id, name, entity_type: "pet", icon: null, metadata: {}, status: "home", household_id: "h", created_at: "2026-01-01T00:00:00+07:00" }) as TaskEntity;
const MOCHA = pet("mocha", "Mocha");
const MATCHA = pet("matcha", "Matcha");

function row(over: Partial<MasterSchedule> & { id: string; entity_id: string }): MasterSchedule {
  return {
    title: "Matikan lampu",
    module: "pet",
    frequency_type: "fixed_time",
    interval_hours: null,
    fixed_times: ["21:30"],
    start_time: null,
    end_time: null,
    is_active: true,
    expires_at: null,
    created_at: "2026-11-01T08:00:00+07:00",
    kind: "lights",
    routine_group_id: "g1",
    days_of_week: null,
    note: null,
    staff_id: null,
    proof: "photo",
    ...over,
  };
}

function log(over: Partial<TaskLog> & { id: string; schedule_id: string; entity_id: string; completed_at: string }): TaskLog {
  return { module: "pet", photo_url: null, notes: null, sub_type: "complete", ...over };
}

// 2026-11-16 is a Monday; 2026-11-15 a Sunday.
const MONDAY = "2026-11-16";
const SUNDAY = "2026-11-15";
const at = (day: string, hhmm: string) => `${day}T${hhmm}:00+07:00`;
const NOW = new Date(at(MONDAY, "23:00"));

describe("categorizeSchedule (kinds first)", () => {
  it("files any row with a kind as a routine, whatever its title or end date", () => {
    expect(categorizeSchedule({ title: "Matikan lampu", expires_at: null, kind: "lights" })).toBe("routine");
    expect(categorizeSchedule({ title: "Pipis & Pup", expires_at: null, kind: "other" })).toBe("routine");
    expect(categorizeSchedule({ title: "Vet: beli makanan", expires_at: "2026-12-01", kind: "other" })).toBe("routine");
  });
  it("leaves old rows to the title rules", () => {
    expect(categorizeSchedule({ title: "Matikan lampu", expires_at: null, kind: null })).toBe("meal");
    expect(categorizeSchedule({ title: "Matikan lampu", expires_at: "2026-12-31" })).toBe("temporary");
    expect(categorizeSchedule({ title: "Pipis & Pup", expires_at: null })).toBe("potty");
  });
});

describe("isScheduleActiveOn (weekdays, once)", () => {
  it("reads ISO weekdays from the calendar date", () => {
    expect(isoWeekday(MONDAY)).toBe(1);
    expect(isoWeekday(SUNDAY)).toBe(7);
  });
  it("shows a Monday-and-Wednesday routine on Monday only", () => {
    const teeth = row({ id: "t", entity_id: "mocha", days_of_week: [1, 3] });
    expect(isScheduleActiveOn(teeth, MONDAY)).toBe(true);
    expect(isScheduleActiveOn(teeth, SUNDAY)).toBe(false);
  });
  it("treats null (or an empty list) as every day", () => {
    expect(isScheduleActiveOn(row({ id: "a", entity_id: "mocha" }), SUNDAY)).toBe(true);
    expect(isScheduleActiveOn(row({ id: "b", entity_id: "mocha", days_of_week: [] }), SUNDAY)).toBe(true);
  });
  it("shows a Once routine on its day alone", () => {
    const once = row({ id: "o", entity_id: "mocha", created_at: new Date(`${MONDAY}T00:00:00`).toISOString(), expires_at: MONDAY });
    expect(isScheduleActiveOn(once, SUNDAY)).toBe(false);
    expect(isScheduleActiveOn(once, MONDAY)).toBe(true);
    expect(isScheduleActiveOn(once, "2026-11-17")).toBe(false);
  });
});

describe("buildAgenda with routines", () => {
  it("makes one card for lights off for two pets, with the note", () => {
    const groups = buildAgenda({
      date: MONDAY,
      entities: [MOCHA, MATCHA],
      schedules: [
        row({ id: "l1", entity_id: "mocha", note: "Lampu ruang tamu" }),
        row({ id: "l2", entity_id: "matcha", note: "Lampu ruang tamu" }),
      ],
      logs: [],
      now: NOW,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.entityName)).toEqual(["Matcha", "Mocha"]);
    expect(groups[0]).toMatchObject({ category: "routine", kind: "lights", proof: "photo", note: "Lampu ruang tamu" });
  });

  it("keeps two routines apart when their note or person differ", () => {
    const groups = buildAgenda({
      date: MONDAY,
      entities: [MOCHA, MATCHA],
      schedules: [
        row({ id: "w1", entity_id: "matcha", title: "Jalan-jalan", kind: "walk", fixed_times: ["07:00"], staff_id: "yanti", note: "Pakai tali" }),
        row({ id: "w2", entity_id: "mocha", title: "Jalan-jalan", kind: "walk", fixed_times: ["07:00"], staff_id: "sari", routine_group_id: "g2" }),
      ],
      logs: [],
      now: NOW,
    });
    expect(groups).toHaveLength(2);
  });

  it("groups old rows by time and title, as before", () => {
    const groups = buildAgenda({
      date: MONDAY,
      entities: [MOCHA, MATCHA],
      schedules: [
        row({ id: "m1", entity_id: "mocha", title: "Makan malam", kind: null, routine_group_id: null, fixed_times: ["17:00"] }),
        row({ id: "m2", entity_id: "matcha", title: "Makan malam", kind: null, routine_group_id: null, fixed_times: ["17:00"] }),
      ],
      logs: [],
      now: NOW,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("meal");
  });

  it("finishes a three-photo routine at its end photo only", () => {
    const walk = row({ id: "w", entity_id: "matcha", title: "Jalan-jalan", kind: "walk", fixed_times: ["07:00"], proof: "three" });
    const started = [
      log({ id: "a", schedule_id: "w", entity_id: "matcha", completed_at: at(MONDAY, "07:02"), sub_type: "check_in" }),
      log({ id: "b", schedule_id: "w", entity_id: "matcha", completed_at: at(MONDAY, "07:15"), sub_type: "arrived" }),
    ];
    const open = buildAgenda({ date: MONDAY, entities: [MATCHA], schedules: [walk], logs: started, now: NOW });
    expect(open[0].items[0].status).toBe("overdue");
    const done = buildAgenda({
      date: MONDAY,
      entities: [MATCHA],
      schedules: [walk],
      logs: [...started, log({ id: "c", schedule_id: "w", entity_id: "matcha", completed_at: at(MONDAY, "07:34"), sub_type: "check_out" })],
      now: NOW,
    });
    expect(done[0].items[0].status).toBe("completed");
    expect(done[0].items[0].log?.id).toBe("c");
  });

  it("finishes a walk set to 1 photo on its one log", () => {
    const walk = row({ id: "w", entity_id: "matcha", title: "Jalan-jalan", kind: "walk", fixed_times: ["07:00"], proof: "photo" });
    const groups = buildAgenda({
      date: MONDAY,
      entities: [MATCHA],
      schedules: [walk],
      logs: [log({ id: "a", schedule_id: "w", entity_id: "matcha", completed_at: at(MONDAY, "07:10") })],
      now: NOW,
    });
    expect(groups[0].items[0].status).toBe("completed");
  });

  it("lets a card follow three photos, then a photo, then a tick", () => {
    expect(strongestProof(["tick", "three", "photo"])).toBe("three");
    expect(strongestProof(["tick", "photo"])).toBe("photo");
    expect(strongestProof(["tick"])).toBe("tick");
    expect(proofChoices("walk")).toEqual(["three", "photo", "tick"]);
    expect(proofChoices("lights")).toEqual(["photo", "tick"]);
  });
});

describe("threePhotoState", () => {
  const walk = row({ id: "w", entity_id: "matcha", title: "Jalan-jalan", kind: "walk", fixed_times: ["07:00"], proof: "three" });
  const items = buildAgenda({ date: MONDAY, entities: [MATCHA], schedules: [walk], logs: [], now: NOW })[0].items;

  it("starts at Mulai with no logs", () => {
    expect(threePhotoState(items, [], MONDAY).next).toBe("start");
  });
  it("follows the steps in order, from the day's logs (queued ones included)", () => {
    const start = log({ id: "a", schedule_id: "w", entity_id: "matcha", completed_at: at(MONDAY, "07:02"), sub_type: "check_in" });
    const arrived = log({ id: "b", schedule_id: "w", entity_id: "matcha", completed_at: at(MONDAY, "07:15"), sub_type: "arrived" });
    const end = log({ id: "c", schedule_id: "w", entity_id: "matcha", completed_at: at(MONDAY, "07:34"), sub_type: "check_out" });
    expect(threePhotoState(items, [start], MONDAY).next).toBe("arrived");
    expect(threePhotoState(items, [start, arrived], MONDAY).next).toBe("end");
    const done = threePhotoState(items, [end, start, arrived], MONDAY);
    expect(done.next).toBeNull();
    expect(done.logs.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
  it("ignores an arrived log with no start, and another day's walk", () => {
    const arrived = log({ id: "b", schedule_id: "w", entity_id: "matcha", completed_at: at(MONDAY, "07:15"), sub_type: "arrived" });
    const yesterday = log({ id: "y", schedule_id: "w", entity_id: "matcha", completed_at: at(SUNDAY, "07:02"), sub_type: "check_in" });
    expect(threePhotoState(items, [arrived, yesterday], MONDAY).next).toBe("start");
  });
});

describe("walk minutes and times (server time first)", () => {
  it("counts from the server times when both saves arrived on time", () => {
    const start = { completed_at: at(MONDAY, "07:01"), received_at: at(MONDAY, "07:02") };
    const end = { completed_at: at(MONDAY, "07:33"), received_at: at(MONDAY, "07:34") };
    expect(walkMinutes(start, end)).toEqual({ minutes: 32, phoneTime: false });
  });
  it("falls back to phone times, marked, when a step was sent late (offline)", () => {
    const start = { completed_at: at(MONDAY, "07:02"), received_at: at(MONDAY, "07:02") };
    const end = { completed_at: at(MONDAY, "07:34"), received_at: at(MONDAY, "07:50") };
    expect(walkMinutes(start, end)).toEqual({ minutes: 32, phoneTime: true });
    expect(stepTime(end)).toEqual({ at: end.completed_at, sentAt: end.received_at, phoneTime: true });
  });
  it("uses the phone time for a step still in the queue", () => {
    expect(stepTime({ completed_at: at(MONDAY, "07:02") }).phoneTime).toBe(true);
  });
});

describe("isFreshCapture (2 minutes)", () => {
  const now = Date.parse(at(MONDAY, "07:02"));
  it("accepts a photo just taken", () => {
    expect(isFreshCapture(now - 5_000, now)).toBe(true);
    expect(isFreshCapture(now - FRESH_PHOTO_MS, now)).toBe(true);
  });
  it("refuses an old file, a file from the future, and one with no time", () => {
    expect(isFreshCapture(now - FRESH_PHOTO_MS - 1, now)).toBe(false);
    expect(isFreshCapture(now + FRESH_PHOTO_MS + 1, now)).toBe(false);
    expect(isFreshCapture(0, now)).toBe(false);
  });
});

describe("planRoutineSave (one row per pet and time, one group)", () => {
  const base = { groupId: "g1", onceStart: new Date(`${MONDAY}T00:00:00`).toISOString(), nowIso: NOW.toISOString(), today: MONDAY };

  it("adds lights off for two pets as two rows in one group, every day, photo", () => {
    const draft = newDraft("lights", ["mocha", "matcha"], MONDAY);
    const plan = planRoutineSave({ ...base, draft, existing: [] });
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.create).toHaveLength(2);
    expect(plan.create[0]).toMatchObject({
      title: "Matikan lampu",
      kind: "lights",
      routine_group_id: "g1",
      fixed_times: ["21:30"],
      days_of_week: null,
      expires_at: null,
      proof: "photo",
      staff_id: null,
      note: null,
    });
    expect(plan.create[0].created_at).toBeUndefined();
  });

  it("adds a walk for Matcha with three photos by default", () => {
    const draft = { ...newDraft("walk", ["matcha"], MONDAY), times: ["07:00"] };
    const plan = planRoutineSave({ ...base, draft, existing: [] });
    expect(plan.create).toEqual([
      expect.objectContaining({ entity_id: "matcha", title: "Jalan-jalan", kind: "walk", fixed_times: ["07:00"], proof: "three" }),
    ]);
  });

  it("moves a row in place when its time changes, so logs keep pointing at it", () => {
    const existing = [row({ id: "l1", entity_id: "mocha" }), row({ id: "l2", entity_id: "matcha" })];
    const draft = { ...draftFromRows(existing, MONDAY), times: ["22:00"] };
    const plan = planRoutineSave({ ...base, draft, existing });
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.update.map((u) => [u.id, u.patch.fixed_times])).toEqual([
      ["l1", ["22:00"]],
      ["l2", ["22:00"]],
    ]);
  });

  it("adds a row for a new pet or a new time, and removes a pet's rows", () => {
    const existing = [row({ id: "l1", entity_id: "mocha" }), row({ id: "l2", entity_id: "matcha" })];
    const draft = { ...draftFromRows(existing, MONDAY), petIds: ["matcha", "coco"], times: ["21:30", "06:00"] };
    const plan = planRoutineSave({ ...base, draft, existing });
    expect(plan.remove.map((r) => r.id)).toEqual(["l1"]);
    expect(plan.update.map((u) => u.id)).toEqual(["l2"]);
    expect(plan.create.map((c) => [c.entity_id, c.fixed_times])).toEqual([
      ["matcha", ["06:00"]],
      ["coco", ["06:00"]],
      ["coco", ["21:30"]],
    ]);
  });

  it("saves Once as that day's start and end, and some days as sorted weekdays", () => {
    const once = { ...newDraft("other", ["mocha"], MONDAY), title: "Ke toko hewan", repeat: "once" as const, onceDate: MONDAY };
    expect(planRoutineSave({ ...base, draft: once, existing: [] }).create[0]).toMatchObject({
      expires_at: MONDAY,
      created_at: base.onceStart,
      days_of_week: null,
    });
    const days = { ...newDraft("teeth", ["mocha"], MONDAY), repeat: "days" as const, days: [5, 1, 3] };
    expect(planRoutineSave({ ...base, draft: days, existing: [] }).create[0].days_of_week).toEqual([1, 3, 5]);
  });

  it("turns an old Others row into a routine when it is edited, keeping its end", () => {
    const old = row({ id: "o", entity_id: "mocha", title: "Kunjungan", kind: null, routine_group_id: null, expires_at: "2026-11-30", fixed_times: ["09:00"] });
    const draft = draftFromRows([old], MONDAY);
    expect(draft).toMatchObject({ kind: "other", title: "Kunjungan", repeat: "daily", endsOn: "2026-11-30", times: ["09:00"] });
    const plan = planRoutineSave({ ...base, groupId: "new", draft, existing: [old] });
    expect(plan.update).toEqual([
      { id: "o", patch: expect.objectContaining({ kind: "other", routine_group_id: "new", expires_at: "2026-11-30" }) },
    ]);
  });

  it("needs only what and when; everything else has a default", () => {
    expect(draftProblem(newDraft("lights", ["mocha"], MONDAY))).toBeNull();
    expect(draftProblem({ ...newDraft("other", ["mocha"], MONDAY), title: " " })).toBe("title");
    expect(draftProblem(newDraft("lights", [], MONDAY))).toBe("pets");
    expect(draftProblem({ ...newDraft("lights", ["mocha"], MONDAY), repeat: "days", days: [] })).toBe("days");
  });
});

describe("group rows", () => {
  it("never reads a removed row back into its group, even one made the day before (Codex, PR #85)", () => {
    const live = row({ id: "a", entity_id: "mocha", created_at: new Date(`${SUNDAY}T09:00:00`).toISOString() });
    // Made yesterday, removed today with history: it ends yesterday, which is
    // also its first day, so by dates alone it would look like a one-off.
    const removed = { ...row({ id: "b", entity_id: "matcha", created_at: live.created_at }), ...endedRowPatch(MONDAY) };
    expect(removed).toMatchObject({ expires_at: SUNDAY, routine_group_id: null });
    expect(isOnceRow(removed)).toBe(true);
    expect(groupRows([live, removed], live).map((r) => r.id)).toEqual(["a"]);
    expect(draftFromRows(groupRows([live, removed], live), MONDAY)).toMatchObject({ petIds: ["mocha"], repeat: "daily" });
  });
  it("tells a one-off by its first and last day being the same", () => {
    expect(isOnceRow({ created_at: new Date(`${MONDAY}T00:00:00`).toISOString(), expires_at: MONDAY })).toBe(true);
    expect(isOnceRow({ created_at: new Date(`${SUNDAY}T00:00:00`).toISOString(), expires_at: MONDAY })).toBe(false);
    expect(isOnceRow({ created_at: new Date(`${MONDAY}T00:00:00`).toISOString(), expires_at: null })).toBe(false);
  });
  it("ends a removed row the day before", () => {
    expect(dayBefore("2026-12-01")).toBe("2026-11-30");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
  });
});
