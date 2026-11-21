import { describe, expect, it } from "vitest";
import { earliestLate, factsLine, lateLine, tilePhotoWidth, wallLayout } from "@/lib/pet-wall";
import { petFocus, petPictureKind } from "@/lib/pets";
import type { AgendaItem } from "@/lib/scheduleEngine";
import type { TaskEntity } from "@/types/database";

describe("the Pets wall", () => {
  it("gives every pet the same size: bands up to three, two by two from four, scrolling from seven", () => {
    expect(wallLayout(1)).toEqual({ columns: 1, rows: 1 });
    expect(wallLayout(2)).toEqual({ columns: 1, rows: 2 });
    expect(wallLayout(3)).toEqual({ columns: 1, rows: 3 });
    expect(wallLayout(4)).toEqual({ columns: 2, rows: 2 });
    expect(wallLayout(5)).toEqual({ columns: 2, rows: 3 });
    expect(wallLayout(6)).toEqual({ columns: 2, rows: 3 });
    expect(wallLayout(7)).toEqual({ columns: 2, rows: null });
    expect(tilePhotoWidth(wallLayout(3))).toBe(1280);
    expect(tilePhotoWidth(wallLayout(4))).toBe(640);
  });

  it("says only what is known: three facts on a full-width tile, two on a half", () => {
    expect(factsLine({ breed: "Toy poodle", age: "3 years", sex: "Female" }, 1)).toBe("Toy poodle · 3 years · Female");
    expect(factsLine({ breed: "Toy poodle", age: "3 years", sex: "Female" }, 2)).toBe("Toy poodle · 3 years");
    expect(factsLine({ breed: "  Pomeranian " }, 2)).toBe("Pomeranian");
    expect(factsLine({ breed: "" }, 1)).toBeNull();
    expect(factsLine({}, 1)).toBeNull();
  });

  const item = (title: string, time: string, status: AgendaItem["status"] = "pending") =>
    ({ key: title, title, time, status }) as AgendaItem;

  it("names the earliest late routine by Today's rule (an hour's grace)", () => {
    const items = [item("Makan malam", "18:00"), item("Jalan pagi", "07:00"), item("Makan pagi", "08:00", "completed")];
    // 07:59: nothing is an hour past its time yet.
    expect(earliestLate(items, "2026-11-21", 7 * 60 + 59)).toBeNull();
    // 08:01: the walk is late; breakfast was done.
    expect(earliestLate(items, "2026-11-21", 8 * 60 + 1)?.title).toBe("Jalan pagi");
    // 19:30: the walk, the earliest, still names it.
    expect(earliestLate(items, "2026-11-21", 19 * 60 + 30)?.title).toBe("Jalan pagi");
    expect(lateLine(item("Makan malam", "18:00"), "en")).toBe("Late: Makan malam");
    expect(lateLine(item("Makan malam", "18:00"), "id")).toBe("Makan malam terlambat");
  });
});

describe("a pet's picture", () => {
  const pet = (metadata: Record<string, unknown>) =>
    ({ id: "p", name: "Mocha", entity_type: "pet", metadata }) as unknown as TaskEntity;

  it("centres on the framed square, or a little above the middle when none was kept", () => {
    expect(petFocus(pet({}))).toEqual({ x: 50, y: 40 });
    expect(petFocus(pet({ frame: { x: 10, y: 20, width: 40, height: 30 } }))).toEqual({ x: 30, y: 35 });
  });

  it("is the full photo, a print of the old square, or none", () => {
    expect(petPictureKind(pet({ full_image_url: "a", avatar_url: "b" }))).toBe("full");
    expect(petPictureKind(pet({ avatar_url: "b" }))).toBe("print");
    expect(petPictureKind(pet({}))).toBe("none");
  });
});
