import { describe, expect, it } from "vitest";
import { buildHouse, housePlaceIds, showHouse } from "@/lib/house-view";
import { buildRoomsModel } from "@/lib/rooms-view";
import type { HouseholdLocation } from "@/types/database";

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

const TODAY = "2026-11-21";

// A three-floor demo house (no real data).
const LT1 = place("f1", "Lantai 1", { kind: "floor", sort_order: 0 });
const LT2 = place("f2", "Lantai 2", { kind: "floor", sort_order: 1 });
const LT3 = place("f3", "Lantai 3", { kind: "floor", sort_order: 2 });
const KITCHEN = place("k", "Dapur", { parent_id: "f1", sort_order: 0 });
const LIVING = place("l", "Ruang tamu", { parent_id: "f1", sort_order: 1 });
const MASTER = place("m", "Kamar Utama", { parent_id: "f3", sort_order: 0 });
const M_BATH = place("mb", "Kamar mandi", { parent_id: "m" });
const GUEST = place("g", "Kamar Tamu", { parent_id: "f2", sort_order: 0 });
const SHED = place("s", "Gudang");

describe("the house view", () => {
  it("is drawn from three rooms; fewer keep the list", () => {
    expect(showHouse(buildRoomsModel([place("a", "Teras"), place("b", "Garasi")], [], TODAY))).toBe(false);
    expect(
      showHouse(buildRoomsModel([place("a", "Teras"), place("b", "Garasi"), place("c", "Taman")], [], TODAY))
    ).toBe(true);
    // A floor is not a room.
    expect(showHouse(buildRoomsModel([LT1, LT2, KITCHEN, LIVING], [], TODAY))).toBe(false);
  });

  it("stands top floor first, with each floor's rooms in its own order", () => {
    const model = buildRoomsModel([LT1, LT2, LT3, KITCHEN, LIVING, MASTER, M_BATH, GUEST], [], TODAY);
    const house = buildHouse(model, new Set());
    expect(house.floors.map((f) => f.label)).toEqual(["Lantai 3", "Lantai 2", "Lantai 1"]);
    expect(house.floors[2].rooms.map((r) => r.label)).toEqual(["Dapur", "Ruang tamu"]);
    expect(house.other).toBeNull();
  });

  it("draws a room inside as a quieter tile beside its room", () => {
    const model = buildRoomsModel([LT3, MASTER, M_BATH, GUEST, LT2], [], TODAY);
    const top = buildHouse(model, new Set()).floors[0];
    expect(top.rooms.map((r) => [r.label, r.inside])).toEqual([
      ["Kamar Utama", false],
      ["Kamar mandi", true],
    ]);
  });

  it("marks only the places that need attention, a floor included", () => {
    const model = buildRoomsModel([LT1, LT2, KITCHEN, LIVING, GUEST], [], TODAY);
    const house = buildHouse(model, new Set(["k", "f2"]));
    const ground = house.floors.find((f) => f.key === "f1")!;
    expect(ground.rooms.map((r) => [r.id, r.attention])).toEqual([
      ["k", true],
      ["l", false],
    ]);
    expect(ground.attention).toBe(false);
    expect(house.floors.find((f) => f.key === "f2")!.attention).toBe(true);
  });

  it("puts rooms on no floor in their own band under the house", () => {
    const model = buildRoomsModel([LT1, KITCHEN, LIVING, SHED], [], TODAY);
    const house = buildHouse(model, new Set(["s"]));
    expect(house.other?.rooms.map((r) => [r.label, r.attention])).toEqual([["Gudang", true]]);
  });

  it("is one unnamed band for a house with no floors", () => {
    const model = buildRoomsModel([place("a", "Teras"), place("b", "Garasi"), place("c", "Taman")], [], TODAY);
    const house = buildHouse(model, new Set());
    expect(house.floors).toHaveLength(1);
    expect(house.floors[0].label).toBeNull();
    expect(house.floors[0].rooms).toHaveLength(3);
    expect(house.other).toBeNull();
  });

  it("reads floors from names too (LT2 Lounge), top first", () => {
    const model = buildRoomsModel(
      [place("a", "LT1 Dapur"), place("b", "LT2 Lounge"), place("c", "LT2 GB1"), place("w", "LT2")],
      [],
      TODAY
    );
    const house = buildHouse(model, new Set(["w"]));
    expect(house.floors.map((f) => f.label)).toEqual(["LT2", "LT1"]);
    expect(house.floors[0].rooms.map((r) => r.label)).toEqual(["GB1", "Lounge"]);
    // A repair on "LT2" itself is the whole floor's.
    expect(house.floors[0].attention).toBe(true);
  });

  it("knows which places are in the house", () => {
    const model = buildRoomsModel([LT1, LT2, KITCHEN, GUEST, SHED], [], TODAY);
    expect([...housePlaceIds(model)].sort()).toEqual(["f1", "f2", "g", "k", "s"]);
  });
});
