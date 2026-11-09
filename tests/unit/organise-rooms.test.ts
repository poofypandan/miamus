import { describe, expect, it } from "vitest";
import { buildSortPlan, canSortIntoFloors, withMoved } from "@/lib/organise-rooms";
import { buildRoomsModel } from "@/lib/rooms-view";
import type { HouseholdLocation, HouseholdTask } from "@/types/database";

const H = "h";
const TODAY = "2026-11-09";
const room = (id: string, name: string, extra: Partial<HouseholdLocation> = {}): HouseholdLocation => ({
  id, household_id: H, name, created_at: "2026-10-01T00:00:00Z", ...extra,
});
let n = 0;
const chore = (over: Partial<HouseholdTask> & { title: string }): HouseholdTask =>
  ({
    id: `t${++n}`, household_id: H, notes: null, category: "cleaning", assigned_to: null, due_date: TODAY,
    due_time: null, status: "pending", completed_by: null, completed_at: null, photo_url: null,
    created_at: "2026-11-01T00:00:00Z", recurrence: "weekly", recurrence_until: null, parent_task_id: null,
    requires_supervision: false, before_photo_url: null, after_photo_url: null, location_id: null, spot: null,
    ...over,
  }) as HouseholdTask;

const ROOMS = [
  room("r1", "LT2"),
  room("r2", "LT2 Lounge"),
  room("r3", "LT2 GB2 Bathroom Toilet"),
  room("r4", "LT2 GB2 Bathroom Wastafel"),
  room("r5", "LT1 Service Area"),
  room("r6", "LT2 Service Area"),
  room("r7", "LT2 Master Bedroom"),
  room("r8", "LT2 Master Lounge"),
  room("r9", "Teras"),
];
const TASKS = [
  chore({ title: "Lap toilet", location_id: "r3" }),
  chore({ title: "Lap keran", location_id: "r4" }),
  chore({ title: "LT2 Lounge - Vacuum & pel" }),
  chore({ title: "LT2 GB2 Bathroom Wastafel - Lap kaca" }),
  chore({ title: "LT2 Lounge - old", status: "completed", recurrence: "none", due_date: "2026-10-01" }),
];

let ids = 0;
const newId = () => `new${++ids}`;

describe("canSortIntoFloors", () => {
  it("helps when rooms are named floor-first and there are no floors yet", () => {
    expect(canSortIntoFloors(ROOMS)).toBe(true);
    expect(canSortIntoFloors([room("a", "Teras"), room("b", "LT2 Lounge")])).toBe(false);
    expect(canSortIntoFloors([...ROOMS, room("f", "LT3", { kind: "floor" })])).toBe(false);
  });
});

describe("buildSortPlan", () => {
  const { plan, undo, preview } = buildSortPlan(H, ROOMS, TASKS, TODAY, { mergeParts: true, linkChores: true }, newId);

  it("makes floors from the prefixes, reusing the room named just LT2", () => {
    const floors = plan.places.filter((p) => p.kind === "floor");
    expect(floors.map((f) => [f.id, f.name])).toEqual([["new1", "LT1"], ["r1", "LT2"]]);
    expect(plan.places.indexOf(floors[1])).toBeLessThan(plan.places.findIndex((p) => p.id === "r2"));
  });

  it("moves rooms onto their floor without the prefix, names unique per floor", () => {
    expect(plan.places).toContainEqual({ id: "r2", name: "Lounge", parent_id: "r1" });
    expect(plan.places).toContainEqual({ id: "r5", name: "Service Area", parent_id: "new1" });
    expect(plan.places).toContainEqual({ id: "r6", name: "Service Area", parent_id: "r1" });
    expect(plan.places.find((p) => p.id === "r9")).toBeUndefined(); // no floor in its name
  });

  it("merges a bathroom's parts into one room with spots, never Master Bedroom/Lounge", () => {
    expect(plan.places).toContainEqual({ id: "r3", name: "GB2 Bathroom", parent_id: "r1" });
    expect(plan.delete).toEqual(["r4"]);
    // The database moves every chore of each part (history too).
    expect(plan.merges).toEqual([
      { from: "r3", into: "r3", spot: "Toilet" },
      { from: "r4", into: "r3", spot: "Wastafel" },
    ]);
    expect(preview.merges).toEqual([
      { floor: "LT2", room: "GB2 Bathroom", parts: [{ from: "LT2 GB2 Bathroom Toilet", spot: "Toilet" }, { from: "LT2 GB2 Bathroom Wastafel", spot: "Wastafel" }] },
    ]);
    expect(plan.places).toContainEqual({ id: "r7", name: "Master Bedroom", parent_id: "r1" });
    expect(plan.places).toContainEqual({ id: "r8", name: "Master Lounge", parent_id: "r1" });
  });

  it("links set-up chores whose title names a room, trimming the title, history untouched", () => {
    expect(plan.chores).toContainEqual({ id: "t3", location_id: "r2", title: "Vacuum & pel" });
    // Named a merged part: linked to the kept room with that part's spot.
    expect(plan.chores).toContainEqual({ id: "t4", location_id: "r3", spot: "Wastafel", title: "Lap kaca" });
    expect(plan.chores.find((c) => c.id === "t5")).toBeUndefined();
    expect(preview.linked).toBe(2);
  });

  it("Undo puts every name, floor, room and chore back, floors last", () => {
    expect(undo.delete).toEqual(["new1"]);
    expect(undo.places).toContainEqual({ id: "r2", name: "LT2 Lounge", parent_id: null });
    expect(undo.places).toContainEqual({ id: "r4", name: "LT2 GB2 Bathroom Wastafel", kind: "room", parent_id: null, sort_order: 0 });
    expect(undo.places[undo.places.length - 1]).toEqual({ id: "r1", name: "LT2", kind: "room", parent_id: null, sort_order: 0 });
    expect(undo.chores).toContainEqual({ id: "t3", location_id: null, title: "LT2 Lounge - Vacuum & pel" });
    // Finished with what the database moved: each merged chore goes back.
    const full = withMoved(undo, [{ id: "t2", location_id: "r4", spot: null }, { id: "old", location_id: "r4", spot: null }]);
    expect(full.chores.slice(0, 2)).toEqual([
      { id: "t2", location_id: "r4", spot: null },
      { id: "old", location_id: "r4", spot: null },
    ]);
  });

  it("without the options, only floors and rooms", () => {
    const plain = buildSortPlan(H, ROOMS, TASKS, TODAY, { mergeParts: false, linkChores: false }, newId);
    expect(plain.plan.delete).toEqual([]);
    expect(plain.plan.merges).toEqual([]);
    expect(plain.plan.chores).toEqual([]);
    expect(plain.plan.places).toContainEqual({ id: "r3", name: "GB2 Bathroom Toilet", parent_id: "r1" });
  });
});

describe("buildRoomsModel with stored floors", () => {
  const stored = [
    room("f2", "LT2", { kind: "floor", sort_order: 2 }),
    room("f1", "LT1", { kind: "floor", sort_order: 1 }),
    room("a", "Lounge", { parent_id: "f2" }),
    room("b", "Service Area", { parent_id: "f1" }),
    room("c", "Teras"),
  ];
  const model = buildRoomsModel(
    stored,
    [chore({ title: "Buang sampah", location_id: "f2" }), chore({ title: "Vacuum", location_id: "a", spot: null })],
    TODAY
  );
  it("groups rooms under their stored floors, in order, with whole-floor chores", () => {
    expect(model.storedFloors).toBe(true);
    expect(model.floors.map((f) => f.label)).toEqual(["LT1", "LT2"]);
    expect(model.floors[1].whole?.chores).toHaveLength(1);
    expect(model.floors[0].whole).toBeNull();
    expect(model.floors[1].rooms.map((r) => [r.label, r.fullName])).toEqual([["Lounge", "LT2 · Lounge"]]);
    expect(model.otherRooms.map((r) => r.label)).toEqual(["Teras"]);
  });
});

describe("nested parts", () => {
  it("never merges into a room that is itself merged away", () => {
    const nested = [
      room("f", "LT2"),
      room("a", "LT2 GB2 Bathroom"),
      room("b", "LT2 GB2 Bathroom Shower"),
      room("c", "LT2 GB2 Bathroom Shower Cermin"),
    ];
    const { plan } = buildSortPlan(H, nested, [], TODAY, { mergeParts: true, linkChores: false }, newId);
    // Cermin joins Shower; Shower (a receiver) is kept, not merged into Bathroom.
    expect(plan.merges).toEqual([{ from: "c", into: "b", spot: "Cermin" }]);
    expect(plan.delete).toEqual(["c"]);
    const merged = new Set(plan.delete);
    for (const m of plan.merges ?? []) expect(merged.has(m.into)).toBe(false);
  });
});
