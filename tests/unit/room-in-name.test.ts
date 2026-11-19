import { describe, expect, it } from "vitest";
import { nameSaysPlace, nameSaysRoom } from "@/lib/room-in-name";
import type { HouseholdLocation } from "@/types/database";

// A card leaves the room out when the task's name already says it (19 Nov).

const place = (id: string, name: string, kind: "room" | "floor", parent_id: string | null = null) =>
  ({ id, name, kind, parent_id, household_id: "h", sort_order: 0, created_at: "" }) as unknown as HouseholdLocation;

const locations = [
  place("f1", "LT1", "floor"),
  place("teras", "Teras", "room", "f1"),
  place("gb2", "Kamar Tamu 2", "room", "f1"),
  place("km", "Kamar Mandi", "room", "gb2"),
  place("service", "Service Area", "room"),
];

describe("nameSaysRoom", () => {
  it("needs every word of the room in the title or its English", () => {
    expect(nameSaysRoom(["Pel teras", null], "Teras")).toBe(true);
    expect(nameSaysRoom(["Sapu", "Sweep the terrace"], "Terrace")).toBe(true);
    expect(nameSaysRoom(["Bersihkan service area"], "Service Area")).toBe(true);
    expect(nameSaysRoom(["Pel teras"], "Teras depan")).toBe(false);
    expect(nameSaysRoom(["Pel terasnya"], "Teras")).toBe(false);
    expect(nameSaysRoom(["Cuci piring"], "Dapur")).toBe(false);
  });
});

describe("nameSaysPlace", () => {
  it("leaves out a room on a floor, or on none, that the name says", () => {
    expect(nameSaysPlace(["Pel teras"], "teras", null, locations)).toBe(true);
    expect(nameSaysPlace(["Bersihkan service area"], "service", "", locations)).toBe(true);
  });

  it("always shows a room inside a room, a spot, or a room it can't find", () => {
    expect(nameSaysPlace(["Bersihkan kamar mandi"], "km", null, locations)).toBe(false);
    expect(nameSaysPlace(["Pel teras"], "teras", "Pojok kiri", locations)).toBe(false);
    expect(nameSaysPlace(["Pel teras"], "teras", null, null)).toBe(false);
    expect(nameSaysPlace(["Pel teras"], "gone", null, locations)).toBe(false);
    expect(nameSaysPlace(["Pel teras"], null, null, locations)).toBe(false);
  });
});
