import { describe, expect, it } from "vitest";
import { floorNameOf } from "@/lib/places";
import { nameSaysPlace } from "@/lib/room-in-name";
import type { HouseholdLocation } from "@/types/database";

// A staff card whose task name says the room still shows the floor (19 Nov,
// Codex on PR #153): the same room name can be on two floors (migrations/129).

const place = (id: string, name: string, kind: "room" | "floor", parent_id: string | null = null) =>
  ({ id, name, kind, parent_id, household_id: "h", sort_order: 0, created_at: "" }) as unknown as HouseholdLocation;

const locations = [
  place("f1", "LT1", "floor"),
  place("f2", "LT2", "floor"),
  place("sa1", "Service Area", "room", "f1"),
  place("sa2", "Service Area", "room", "f2"),
  place("gb", "Kamar Tamu", "room", "f2"),
  place("km", "Kamar Mandi", "room", "gb"),
  place("teras", "Teras", "room"),
];

describe("floorNameOf", () => {
  it("names the floor of a room on one, and through its outer room", () => {
    expect(floorNameOf("sa1", locations)).toBe("LT1");
    expect(floorNameOf("sa2", locations)).toBe("LT2");
    expect(floorNameOf("km", locations)).toBe("LT2");
  });

  it("is null for no floor, an unknown place, or no rooms loaded", () => {
    expect(floorNameOf("teras", locations)).toBeNull();
    expect(floorNameOf("gone", locations)).toBeNull();
    expect(floorNameOf(null, locations)).toBeNull();
    expect(floorNameOf("sa1", null)).toBeNull();
  });

  it("keeps two same-named rooms apart once the name says the room", () => {
    const line = (id: string) => (nameSaysPlace(["Bersihkan service area"], id, null, locations) ? floorNameOf(id, locations) : "full");
    expect(line("sa1")).toBe("LT1");
    expect(line("sa2")).toBe("LT2");
  });
});
