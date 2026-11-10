// Rooms inside rooms (Phase 168 PR A, docs/phase-168-suites-plan.md): the
// one path every screen shows, the groupings that indent rooms inside, the
// Rooms view counting each room once, the picker, and Kakak's room lines.

import { describe, expect, it } from "vitest";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { renderHouseholdBlock } from "@/lib/kakak/household";
import {
  floorOf,
  insideChoices,
  nameOutside,
  outerRoomOf,
  placeLabel,
  placeMap,
  placePath,
  topLevelRooms,
  withRoomsInside,
} from "@/lib/places";
import { filterGroups, placeGroups } from "@/lib/room-picker";
import { allRoomRows, buildRoomsModel, placesWithJob, roomsInsideOf } from "@/lib/rooms-view";
import type { HouseholdLocation, HouseholdTask } from "@/types/database";

const place = (id: string, name: string, extra: Partial<HouseholdLocation> = {}): HouseholdLocation => ({
  id,
  household_id: "h",
  name,
  created_at: "2026-10-01T00:00:00Z",
  kind: "room",
  parent_id: null,
  sort_order: 0,
  ...extra,
});

// The owner's LT2 (plan, "How it behaves").
const LT2 = place("f2", "LT2", { kind: "floor", sort_order: 1 });
const LT1 = place("f1", "LT1", { kind: "floor", sort_order: 0 });
const MASTER = place("m", "Master Bedroom", { parent_id: "f2", sort_order: 0 });
const M_BATH = place("mb", "Bathroom", { parent_id: "m" });
const M_CLOSET = place("mc", "Walk-in closet", { parent_id: "m" });
const GB1 = place("g1", "GB1", { parent_id: "f2", sort_order: 1 });
const G1_BATH = place("g1b", "Bathroom", { parent_id: "g1" });
const GB2 = place("g2", "GB2", { parent_id: "f2", sort_order: 2 });
const G2_BATH = place("g2b", "Bathroom", { parent_id: "g2" });
const LOUNGE = place("l", "Lounge", { parent_id: "f2", sort_order: 3 });
const STUDIO = place("s", "Studio");
const BALCONY = place("sb", "Balcony", { parent_id: "s" });
const KITCHEN = place("k", "Dapur", { parent_id: "f1" });
const ORPHAN = place("o", "Gudang", { parent_id: "gone" });
const ALL = [GB2, M_CLOSET, LT2, G1_BATH, MASTER, LOUNGE, M_BATH, GB1, G2_BATH, STUDIO, BALCONY, LT1, KITCHEN, ORPHAN];
const byId = placeMap(ALL);

describe("place paths", () => {
  it("reads floor, room, room inside", () => {
    expect(placePath(G1_BATH, byId)).toEqual(["LT2", "GB1", "Bathroom"]);
    expect(placeLabel(M_CLOSET, byId)).toBe("LT2 · Master Bedroom · Walk-in closet");
    expect(placeLabel(LOUNGE, byId)).toBe("LT2 · Lounge");
    expect(placeLabel(BALCONY, byId)).toBe("Studio · Balcony");
    expect(placeLabel(STUDIO, byId)).toBe("Studio");
    expect(placeLabel(LT2, byId)).toBe("LT2");
    expect(placeLabel(ORPHAN, byId)).toBe("Gudang");
  });

  it("knows a room's outer room and floor", () => {
    expect(outerRoomOf(G1_BATH, byId)?.id).toBe("g1");
    expect(outerRoomOf(GB1, byId)).toBeNull();
    expect(floorOf(G1_BATH, byId)?.id).toBe("f2");
    expect(floorOf(BALCONY, byId)).toBeNull();
    expect(floorOf(LT2, byId)).toBeNull();
  });

  it("names a room taken out of its room with the room in front, within 60", () => {
    expect(nameOutside(GB1, G1_BATH)).toBe("GB1 Bathroom");
    const long = place("x", "K".repeat(60));
    expect(nameOutside(long, G1_BATH).length).toBeLessThanOrEqual(60);
  });
});

describe("groupings", () => {
  it("lists top-level rooms per floor, and loose ones, never rooms inside", () => {
    const { floors, onFloor, loose } = topLevelRooms(ALL);
    expect(floors.map((f) => f.name)).toEqual(["LT1", "LT2"]);
    expect(onFloor("f2").map((r) => r.name)).toEqual(["Master Bedroom", "GB1", "GB2", "Lounge"]);
    expect(loose.map((r) => r.name)).toEqual(["Gudang", "Studio"]);
  });

  it("puts each room's rooms inside straight after it", () => {
    const rows = withRoomsInside(topLevelRooms(ALL).onFloor("f2"), ALL);
    expect(rows.map((r) => `${r.depth}:${r.place.name}`)).toEqual([
      "0:Master Bedroom",
      "1:Bathroom",
      "1:Walk-in closet",
      "0:GB1",
      "1:Bathroom",
      "0:GB2",
      "1:Bathroom",
      "0:Lounge",
    ]);
  });

  it("offers as Inside only that floor's top-level rooms, and nothing for a room that holds rooms", () => {
    expect(insideChoices(ALL, LOUNGE, "f2").map((r) => r.name)).toEqual(["Master Bedroom", "GB1", "GB2"]);
    expect(insideChoices(ALL, null, "f1").map((r) => r.name)).toEqual(["Dapur"]);
    expect(insideChoices(ALL, null, null).map((r) => r.name)).toEqual(["Gudang", "Studio"]);
    expect(insideChoices(ALL, GB1, "f2")).toEqual([]);
    // A room inside can move to another room on its floor.
    expect(insideChoices(ALL, G1_BATH, "f2").map((r) => r.name)).toEqual(["Master Bedroom", "GB1", "GB2", "Lounge"]);
  });
});

describe("the room picker", () => {
  const label = (p: HouseholdLocation) => (p.kind === "floor" ? `${p.name} · Whole floor` : placeLabel(p, byId));

  it("lists rooms inside under their room, in each floor's group", () => {
    const groups = placeGroups(ALL);
    expect(groups.map((g) => g.floor?.name ?? null)).toEqual(["LT1", "LT2", null]);
    expect(groups[1].places.map((p) => p.id)).toEqual(["f2", "m", "mb", "mc", "g1", "g1b", "g2", "g2b", "l"]);
    expect(groups[2].places.map((p) => p.id)).toEqual(["o", "s", "sb"]);
  });

  it("finds a bathroom by its bedroom", () => {
    const groups = filterGroups(placeGroups(ALL), "gb1 bath", label, new Set());
    expect(groups.flatMap((g) => g.places.map((p) => p.id))).toEqual(["g1b"]);
    const all = filterGroups(placeGroups(ALL), "bathroom", label, new Set());
    expect(all.flatMap((g) => g.places.map((p) => p.id))).toEqual(["mb", "g1b", "g2b"]);
  });
});

describe("the Rooms view with rooms inside", () => {
  const today = "2026-11-10";
  let n = 0;
  const chore = (title: string, location_id: string): HouseholdTask =>
    ({
      id: `t${++n}`,
      household_id: "h",
      title,
      notes: null,
      category: "cleaning",
      assigned_to: null,
      due_date: today,
      due_time: null,
      status: "pending",
      recurrence: "weekly",
      recurrence_until: null,
      parent_task_id: null,
      location_id,
      spot: null,
      created_at: "2026-11-01T00:00:00Z",
    }) as unknown as HouseholdTask;
  const chores = [
    chore("Vacuum & pel", "m"),
    chore("Vacuum", "g1"),
    chore("Vacuum", "g2"),
    chore("Vacuum & pel", "l"),
    chore("Sikat toilet", "mb"),
  ];

  it("lists rooms inside under their room, each a row of its own", () => {
    const model = buildRoomsModel(ALL, chores, today);
    const lt2 = model.floors.find((f) => f.label === "LT2")!;
    expect(lt2.rooms.map((r) => `${r.depth}:${r.label}`)).toEqual([
      "0:Master Bedroom",
      "1:Bathroom",
      "1:Walk-in closet",
      "0:GB1",
      "1:Bathroom",
      "0:GB2",
      "1:Bathroom",
      "0:Lounge",
    ]);
    expect(lt2.rooms.find((r) => r.id === "g1b")?.fullName).toBe("LT2 · GB1 · Bathroom");
    expect(model.otherRooms.map((r) => r.label)).toEqual(["Gudang", "Studio", "Balcony"]);
  });

  it("counts every room once, rooms inside included (D4)", () => {
    const model = buildRoomsModel(ALL, chores, today);
    const lt2 = model.floors.find((f) => f.label === "LT2")!;
    expect(lt2.rooms).toHaveLength(8);
    // Vacuumed: Master Bedroom, GB1, GB2, Lounge — the closet and bathrooms not.
    expect(placesWithJob(model, "vacuum")).toBe(4);
    expect(allRoomRows(model)).toHaveLength(8 + 1 + 3);
  });

  it("finds a bedroom's rooms inside for its sheet", () => {
    const model = buildRoomsModel(ALL, chores, today);
    expect(roomsInsideOf(model, "m").map((r) => r.label)).toEqual(["Bathroom", "Walk-in closet"]);
    expect(roomsInsideOf(model, "l")).toEqual([]);
  });

  it("reads what's stored when a house has rooms inside but no floors", () => {
    const model = buildRoomsModel([STUDIO, BALCONY, place("t", "Teras")], [], today);
    expect(model.storedFloors).toBe(true);
    expect(model.otherRooms.map((r) => `${r.depth}:${r.label}`)).toEqual(["0:Studio", "1:Balcony", "0:Teras"]);
  });
});

describe("Kakak's rooms inside rooms", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const rows: ContextRows = {
    staff: [],
    pets: [],
    schedules: [],
    rooms: [
      { id: id(1), name: "LT2", created_at: "2026-01-01", kind: "floor", parent_id: null },
      { id: id(2), name: "GB1", created_at: "2026-01-02", kind: "room", parent_id: id(1) },
      { id: id(3), name: "Bathroom", created_at: "2026-01-03", kind: "room", parent_id: id(2) },
      { id: id(4), name: "Studio", created_at: "2026-01-04", kind: "room", parent_id: null },
      { id: id(5), name: "Balcony", created_at: "2026-01-05", kind: "room", parent_id: id(4) },
    ],
    items: [],
  };
  const built = buildContext(rows, {
    today: "2026-11-11",
    now: "08:30",
    ownerLocale: "en",
    callerUserId: "11111111-1111-4111-8111-111111111111",
  });

  it("lists a room inside with its floor and its room", () => {
    const block = renderHouseholdBlock(built.household);
    expect(block).toContain("- R2: LT2 · GB1");
    expect(block).toContain("- R3: LT2 · GB1 · Bathroom (inside GB1)");
    expect(block).toContain("- R5: Studio · Balcony (inside Studio)");
    expect(built.names.rooms).toMatchObject({ R3: "LT2 · GB1 · Bathroom", R5: "Studio · Balcony" });
  });
});
