import { describe, expect, it } from "vitest";
import {
  cleanSpot,
  filterGroups,
  placeGroups,
  sameSpot,
  spotsUsed,
} from "@/lib/room-picker";
import type { HouseholdLocation, HouseholdTask } from "@/types/database";

const place = (id: string, name: string, extra: Partial<HouseholdLocation> = {}): HouseholdLocation => ({
  id,
  household_id: "h",
  name,
  created_at: "2026-10-01T00:00:00Z",
  ...extra,
});

const LT3 = place("f3", "LT3", { kind: "floor", sort_order: 1 });
const LT2 = place("f2", "LT2", { kind: "floor", sort_order: 0 });
const ROOMS = [
  LT3,
  place("r1", "Music Room", { kind: "room", parent_id: "f3" }),
  place("r2", "Lounge", { kind: "room", parent_id: "f2", sort_order: 1 }),
  place("r3", "Bedroom 10", { kind: "room", parent_id: "f2", sort_order: 0 }),
  place("r4", "Bedroom 2", { kind: "room", parent_id: "f2", sort_order: 0 }),
  LT2,
  place("r5", "Teras"),
  // Its floor was deleted on another phone: shown as having none.
  place("r6", "Gudang", { kind: "room", parent_id: "gone" }),
];

const label = (p: HouseholdLocation) => {
  if (p.kind === "floor") return `${p.name} · Whole floor`;
  const floor = ROOMS.find((f) => f.id === p.parent_id);
  return floor ? `${floor.name} · ${p.name}` : p.name;
};

describe("placeGroups", () => {
  it("lists floors in order, each with itself first and then its rooms, loose rooms last", () => {
    const groups = placeGroups(ROOMS);
    expect(groups.map((g) => g.floor?.name ?? null)).toEqual(["LT2", "LT3", null]);
    expect(groups[0].places.map((p) => p.name)).toEqual(["LT2", "Bedroom 2", "Bedroom 10", "Lounge"]);
    expect(groups[1].places.map((p) => p.name)).toEqual(["LT3", "Music Room"]);
    expect(groups[2].places.map((p) => p.name)).toEqual(["Gudang", "Teras"]);
  });

  it("is one plain list for a household without floors", () => {
    const groups = placeGroups([place("a", "Dapur"), place("b", "Teras")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].floor).toBeNull();
  });
});

describe("filterGroups", () => {
  it("matches every typed word against floor and room together", () => {
    const groups = filterGroups(placeGroups(ROOMS), "lt2 bed", label, new Set());
    expect(groups).toHaveLength(1);
    expect(groups[0].places.map((p) => p.name)).toEqual(["Bedroom 2", "Bedroom 10"]);
  });

  it("finds a floor's whole-floor place by its floor name, and drops empty groups", () => {
    const groups = filterGroups(placeGroups(ROOMS), "whole", label, new Set());
    expect(groups.flatMap((g) => g.places.map((p) => p.id))).toEqual(["f2", "f3"]);
  });

  it("leaves out places already picked", () => {
    const groups = filterGroups(placeGroups(ROOMS), "", label, new Set(["f2", "r2"]));
    expect(groups[0].places.map((p) => p.id)).toEqual(["r4", "r3"]);
  });
});

describe("spots", () => {
  const task = (location_id: string | null, spot: string | null) => ({ location_id, spot }) as HouseholdTask;

  it("lists the spots used in the chosen rooms, most used first, one chip whatever the case", () => {
    const tasks = [
      task("r1", "Wastafel"),
      task("r1", "wastafel"),
      task("r1", "Wastafel "),
      task("r1", "Toilet"),
      task("r2", "AC"),
      task("r9", "Elsewhere"),
      task("r1", null),
      task("r1", "   "),
    ];
    expect(spotsUsed(tasks, ["r1"])).toEqual(["Wastafel", "Toilet"]);
    expect(spotsUsed(tasks, ["r1", "r2"])).toEqual(["Wastafel", "AC", "Toilet"]);
    expect(spotsUsed(tasks, [])).toEqual([]);
    // A tie between spellings goes to the capitalised one.
    expect(spotsUsed([task("r1", "wastafel"), task("r1", "Wastafel")], ["r1"])).toEqual(["Wastafel"]);
  });

  it("cleans a typed spot to at most 40 characters, null when blank", () => {
    expect(cleanSpot("  Wastafel   kiri ")).toBe("Wastafel kiri");
    expect(cleanSpot("   ")).toBeNull();
    expect(cleanSpot("x".repeat(50))).toHaveLength(40);
  });

  it("compares spots without case", () => {
    expect(sameSpot("Wastafel", "wastafel ")).toBe(true);
    expect(sameSpot(null, null)).toBe(true);
    expect(sameSpot("AC", null)).toBe(false);
  });
});
