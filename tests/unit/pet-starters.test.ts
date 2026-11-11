import { describe, expect, it } from "vitest";
import { BENTO, MOCHI, pet, schedule } from "../fixtures/household";
import { starterOptions, starterRows } from "@/lib/pet-starters";

// Phase 173 PR B (D9): the usual routines offered after adding a pet.

const COCO = pet("00000000-0000-4000-8000-0000000000c1", "Coco");
const ARCHIVED = pet("00000000-0000-4000-8000-0000000000d1", "Old");
const today = "2026-11-11";
const pets = [MOCHI, BENTO, COCO].map((p) => ({ id: p.id, name: p.name }));

const LIGHTS = "00000000-0000-4000-8000-0000000173a1";
const WALK3 = "00000000-0000-4000-8000-0000000173b1";
const WATER = "00000000-0000-4000-8000-0000000173c1";
const lights = [MOCHI, BENTO].map((p) =>
  schedule(p, "Matikan lampu", ["21:30"], { kind: "lights", routine_group_id: LIGHTS, note: "Lampu teras juga", staff_id: "staff-1", proof: "photo" })
);
const walk3 = schedule(BENTO, "Jalan-jalan", ["07:00"], { kind: "walk", routine_group_id: WALK3, proof: "three" });

describe("starterOptions", () => {
  it("a dog with nothing else in the house: the three usual ones, ticked", () => {
    const options = starterOptions({ species: "dog", petId: COCO.id, schedules: [], pets, today });
    expect(options.map((o) => [o.title, o.times, o.ticked, o.type])).toEqual([
      ["Jalan pagi", ["06:30"], true, "starter"],
      ["Jalan sore", ["16:30"], true, "starter"],
      ["Ganti air minum", ["08:00"], true, "starter"],
    ]);
    expect(options[0]).toMatchObject({ kind: "walk", en: "Morning walk" });
  });

  it("a cat: fresh water and the litter box", () => {
    const options = starterOptions({ species: "cat", petId: COCO.id, schedules: [], pets, today });
    expect(options.map((o) => [o.kind, o.title, o.en])).toEqual([
      ["water", "Ganti air minum", "Fresh water"],
      ["other", "Bersihkan pasir kucing", "Clean the litter box"],
    ]);
  });

  it("offers the household's routine groups to join, unticked, with who is on them", () => {
    const options = starterOptions({ species: "dog", petId: COCO.id, schedules: lights, pets, today });
    expect(options).toHaveLength(4);
    expect(options[3]).toMatchObject({
      key: `group:${LIGHTS}`,
      type: "join",
      kind: "lights",
      title: "Matikan lampu",
      en: "Lights off",
      times: ["21:30"],
      ticked: false,
      petNames: ["Mochi", "Bento"],
    });
  });

  it("a group named like a starter takes its place, ticked", () => {
    const water = [MOCHI, BENTO].map((p) => schedule(p, "Ganti air minum", ["09:00"], { kind: "water", routine_group_id: WATER }));
    const options = starterOptions({ species: "dog", petId: COCO.id, schedules: water, pets, today });
    expect(options.map((o) => o.key)).toEqual(["starter:walk-am", "starter:walk-pm", `group:${WATER}`]);
    expect(options[2]).toMatchObject({ ticked: true, times: ["09:00"] });
  });

  it("never offers a three-photo walk, an ended or one-off routine, old rows, or an archived pet's", () => {
    const schedules = [
      walk3,
      schedule(MOCHI, "Ajak main", ["16:00"], { kind: "play", routine_group_id: "g-ended", expires_at: "2026-11-10" }),
      schedule(MOCHI, "Sikat gigi", ["19:00"], { kind: "teeth", routine_group_id: "g-once", created_at: "2026-11-12T00:00:00", expires_at: "2026-11-12" }),
      schedule(MOCHI, "Makan Siang", ["12:00"]),
      schedule(ARCHIVED, "Matikan lampu", ["22:00"], { kind: "lights", routine_group_id: "g-archived" }),
      schedule(MOCHI, "Ganti air minum", ["08:00"], { kind: "water", routine_group_id: "g-off", is_active: false }),
    ];
    const options = starterOptions({ species: "dog", petId: COCO.id, schedules, pets, today });
    expect(options.every((o) => o.type === "starter")).toBe(true);
  });
});

describe("starterRows", () => {
  const ids = () => {
    let n = 0;
    return () => `new-group-${++n}`;
  };

  it("each starter is a routine of its own for the new pet, made as the sheet makes it", () => {
    const options = starterOptions({ species: "dog", petId: COCO.id, schedules: [], pets, today });
    const rows = starterRows({ petId: COCO.id, options, schedules: [], today, nowIso: "2026-11-11T02:00:00Z", newGroupId: ids() });
    expect(rows).toEqual([
      expect.objectContaining({ entity_id: COCO.id, title: "Jalan pagi", kind: "walk", fixed_times: ["06:30"], proof: "three", routine_group_id: "new-group-1", days_of_week: null, expires_at: null, staff_id: null, note: null, remind_staff: false, alert_owners: false }),
      expect.objectContaining({ title: "Jalan sore", fixed_times: ["16:30"], proof: "three", routine_group_id: "new-group-2" }),
      expect.objectContaining({ title: "Ganti air minum", kind: "water", fixed_times: ["08:00"], proof: "photo", routine_group_id: "new-group-3" }),
    ]);
  });

  it("joining a group adds only the new pet's row, with the group's settings", () => {
    const options = starterOptions({ species: "dog", petId: COCO.id, schedules: lights, pets, today }).filter((o) => o.type === "join");
    const rows = starterRows({ petId: COCO.id, options, schedules: lights, today, nowIso: "2026-11-11T02:00:00Z", newGroupId: ids() });
    expect(rows).toEqual([
      expect.objectContaining({
        entity_id: COCO.id,
        title: "Matikan lampu",
        kind: "lights",
        fixed_times: ["21:30"],
        routine_group_id: LIGHTS,
        note: "Lampu teras juga",
        staff_id: "staff-1",
        proof: "photo",
      }),
    ]);
  });

  it("joins nothing twice", () => {
    const already = [...lights, schedule(COCO, "Matikan lampu", ["21:30"], { kind: "lights", routine_group_id: LIGHTS })];
    const option = { key: `group:${LIGHTS}`, type: "join" as const, kind: "lights" as const, title: "Matikan lampu", en: null, times: ["21:30"], ticked: true, groupId: LIGHTS };
    expect(starterRows({ petId: COCO.id, options: [option], schedules: already, today, nowIso: "2026-11-11T02:00:00Z", newGroupId: ids() })).toEqual([]);
  });
});
