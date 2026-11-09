import { describe, expect, it } from "vitest";
import { choreJobsIn } from "@/lib/chore-jobs";
import {
  allRoomRows,
  placesWithJob,
  buildRoomsModel,
  isSetUp,
  parseRoomName,
  roomHasJob,
  scheduleLabel,
  scheduleSummary,
} from "@/lib/rooms-view";
import type { ChoreRecurrence, HouseholdLocation, HouseholdTask } from "@/types/database";

// Title patterns as households write them (Phase 158 plan; no real data).
describe("choreJobsIn", () => {
  it.each([
    ["Vacuum & pel, dusting plafon", ["vacuum", "mop", "dust"]],
    ["sedot debu karpet", ["vacuum"]],
    ["Lap debu meja", ["dust"]],
    ["Sapu & dusting plafon", ["sweep", "dust"]],
    ["Lap semua permukaan tempat toilet mengunakan alcohol", ["toilet"]],
    ["Buang sampah ke tempat sampah besar, sesuai kategori", ["trash"]],
    ["Ganti handuk", ["towels"]],
    ["Ganti seprei", ["sheets"]],
    ["Rapihkan baju yg tdk dipakai, setrika baju yang akan dipakai ulang", ["tidy", "ironing"]],
    ["Lap2 meja dan ambalan", ["dust"]],
    ["Vacuum sofa", ["vacuum"]],
    ["Mop the terrace", ["mop"]],
    ["Siram tanaman", ["plants"]],
    ["Check stock kebutuhan rumah tangga", []],
    ["Lap keran tempat cuci tangan", []],
  ] as const)("%s", (title, jobs) => {
    expect(choreJobsIn(title)).toEqual(jobs);
  });

  it("matches whole words only", () => {
    expect(choreJobsIn("Pelan-pelan saja")).toEqual([]);
    expect(choreJobsIn("Sapuan")).toEqual([]);
  });
});

describe("parseRoomName", () => {
  it.each([
    ["LT2 Lounge", 2, "LT2", "Lounge"],
    ["LT2 GB2 Bathroom Toilet", 2, "LT2", "GB2 Bathroom Toilet"],
    ["LT3", 3, "LT3", null],
    ["Lt.1 - Service Area", 1, "LT1", "Service Area"],
    ["LT 2: Lounge &Playroom", 2, "LT2", "Lounge &Playroom"],
    ["Lantai 2 Kamar Utama", 2, "Lantai 2", "Kamar Utama"],
    ["2F Kitchen", 2, "2F", "Kitchen"],
  ] as const)("%s", (name, floor, label, room) => {
    expect(parseRoomName(name)).toEqual({ floor, floorLabel: label, room });
  });

  it("leaves names without a floor alone", () => {
    expect(parseRoomName("Teras")).toEqual({ floor: null, floorLabel: null, room: "Teras" });
    // "LTX" and "Lantai atas" aren't floors with numbers.
    expect(parseRoomName("LTX Studio").floor).toBeNull();
    expect(parseRoomName("Lantai atas").floor).toBeNull();
    // A word that only starts like a floor isn't one.
    expect(parseRoomName("2Fun room").floor).toBeNull();
  });
});

const TODAY = "2026-11-09"; // a Monday

let n = 0;
function chore(over: Partial<HouseholdTask> & { title: string }): HouseholdTask {
  n += 1;
  return {
    id: `t${n}`,
    household_id: "h",
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
    recurrence: "none" as ChoreRecurrence,
    recurrence_until: null,
    parent_task_id: null,
    requires_supervision: false,
    before_photo_url: null,
    after_photo_url: null,
    location_id: null,
    ...over,
  } as HouseholdTask;
}

describe("isSetUp", () => {
  it("counts live repeats and upcoming one-offs", () => {
    expect(isSetUp(chore({ title: "a", recurrence: "weekly", due_date: "2026-10-05" }), TODAY)).toBe(true);
    expect(isSetUp(chore({ title: "b", due_date: "2026-11-14" }), TODAY)).toBe(true);
    expect(isSetUp(chore({ title: "c" }), TODAY)).toBe(true);
  });

  it("leaves out history, overdue one-offs, ended repeats and materialised days", () => {
    expect(isSetUp(chore({ title: "a", status: "completed", due_date: "2026-11-14" }), TODAY)).toBe(false);
    expect(isSetUp(chore({ title: "b", due_date: "2026-11-08" }), TODAY)).toBe(false);
    expect(
      isSetUp(chore({ title: "c", recurrence: "weekly", recurrence_until: "2026-11-08" }), TODAY)
    ).toBe(false);
    expect(isSetUp(chore({ title: "d", recurrence: "weekly", status: "cancelled" }), TODAY)).toBe(false);
    expect(isSetUp(chore({ title: "e", parent_task_id: "t1" }), TODAY)).toBe(false);
  });
});

function room(id: string, name: string): HouseholdLocation {
  return { id, household_id: "h", name, created_at: "2026-10-01T00:00:00Z" };
}

describe("buildRoomsModel", () => {
  const rooms = [
    room("r1", "LT2 Lounge"),
    room("r2", "LT2"),
    room("r3", "LT2 Master Bedroom"),
    room("r4", "LT1 Service Area"),
    room("r5", "Teras"),
    room("r6", "LT3 Music Room"),
  ];
  const tasks = [
    chore({ title: "Vacuum & pel", recurrence: "weekly", due_date: "2026-11-09", location_id: "r1" }),
    chore({ title: "Vacuum & pel", recurrence: "weekly", due_date: "2026-11-12", location_id: "r1" }),
    chore({ title: "Buang sampah", recurrence: "daily", location_id: "r2" }),
    chore({ title: "Ganti seprei", recurrence: "weekly", due_date: "2026-11-14", location_id: "r3" }),
    chore({ title: "Sapu teras", due_date: "2026-11-20", location_id: "r5" }),
    chore({ title: "Vacuum sofa", location_id: null }),
    chore({ title: "Vacuum old", status: "completed", location_id: "r6" }),
    chore({ title: "Mop deleted room", recurrence: "weekly", location_id: "gone" }),
  ];
  const model = buildRoomsModel(rooms, tasks, TODAY);

  it("groups rooms by floor, in floor order, with the whole-floor room apart", () => {
    expect(model.floors.map((f) => f.label)).toEqual(["LT1", "LT2", "LT3"]);
    const lt2 = model.floors[1];
    expect(lt2.whole?.id).toBe("r2");
    expect(lt2.rooms.map((r) => r.label)).toEqual(["Lounge", "Master Bedroom"]);
    expect(model.otherRooms.map((r) => r.label)).toEqual(["Teras"]);
  });

  it("puts only set-up chores in rooms, and roomless ones apart", () => {
    expect(model.floors[2].rooms[0].chores).toEqual([]); // the finished vacuum isn't set up
    expect(model.noRoom.map((c) => c.task.title)).toEqual(["Vacuum sofa", "Mop deleted room"]);
  });

  it("lists the jobs that appear, in the fixed order", () => {
    expect(model.jobs).toEqual(["vacuum", "mop", "sweep", "sheets", "trash"]);
  });

  it("counts rooms with and without a job, whole floors left out", () => {
    const rows = allRoomRows(model);
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => roomHasJob(r, "vacuum")).map((r) => r.label)).toEqual(["Lounge"]);
  });

  it("counts a job's places for its chip, whole floors included", () => {
    // Trash is only set up for the whole of LT2: one place, not zero.
    expect(placesWithJob(model, "trash")).toBe(1);
    expect(placesWithJob(model, "vacuum")).toBe(1);
  });
});

describe("schedule labels", () => {
  it("names the day, cadence or date", () => {
    expect(scheduleLabel(chore({ title: "a", recurrence: "weekly", due_date: "2026-11-12" }), "en")).toBe("Thu");
    expect(scheduleLabel(chore({ title: "a", recurrence: "weekly", due_date: "2026-11-12" }), "id")).toBe("Kam");
    expect(scheduleLabel(chore({ title: "a", recurrence: "daily" }), "id")).toBe("Setiap hari");
    expect(scheduleLabel(chore({ title: "a", recurrence: "monthly", due_date: "2026-11-14" }), "en")).toBe("Monthly, 14th");
    expect(scheduleLabel(chore({ title: "a", due_date: "2026-11-14" }), "en")).toBe("Sat 14 Nov");
  });

  it("joins a room's days in week order", () => {
    const thu = chore({ title: "a", recurrence: "weekly", due_date: "2026-11-12" });
    const mon = chore({ title: "b", recurrence: "weekly", due_date: "2026-11-09" });
    expect(scheduleSummary([thu, mon], "en")).toBe("Mon, Thu");
    expect(scheduleSummary([thu, mon], "id")).toBe("Sen, Kam");
  });
});
