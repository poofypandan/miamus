// Kakak's pet routines (Phase 173 PR B, D8): add_pet_routine for several
// pets and any kind. The tool's argument checks, the suggestion the phone
// gets, the confirm card in both languages, the rows a confirmed card
// writes (the Add routine sheet's own planner), and one turn against a fake
// API. Nothing here calls Anthropic.

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { addsSomething, describeSuggestion, routineListLine, savedBenefit, savedSummary } from "@/lib/kakak/describe";
import { refinePetRoutine, refinementNote } from "@/lib/kakak/refine";
import { runKakakTurn, type TurnDeps } from "@/lib/kakak/engine";
import { kakakExamples } from "@/lib/kakak/examples";
import { renderHouseholdBlock } from "@/lib/kakak/household";
import { petRoutineRows } from "@/lib/kakak/pet-routine-rows";
import { practiceClient } from "@/lib/kakak/practice";
import { KAKAK_SYSTEM_PROMPT } from "@/lib/kakak/prompt";
import { isSaveableSuggestion, toSuggestion, type PetRoutineSuggestion } from "@/lib/kakak/suggestions";
import { KAKAK_TOOLS } from "@/lib/kakak/tools";
import { newPetTimes, validateToolCall } from "@/lib/kakak/validate";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = "11111111-1111-4111-8111-111111111111";

const rows: ContextRows = {
  staff: [
    { id: id(1), name: "Syam", created_at: "2026-01-01", user_id: null, archived_at: null },
    { id: id(2), name: "Ari", created_at: "2026-01-02", user_id: null, archived_at: null },
    { id: id(3), name: "Dewi", created_at: "2026-01-03", user_id: OWNER, archived_at: null },
  ],
  pets: [
    { id: id(10), name: "Mocha", created_at: "2026-01-01", entity_type: "pet", metadata: {} },
    { id: id(11), name: "Matcha", created_at: "2026-01-02", entity_type: "pet", metadata: {} },
    { id: id(12), name: "Luna", created_at: "2026-01-03", entity_type: "pet", metadata: { species: "cat" } },
  ],
  schedules: [
    { entity_id: id(10), title: "Sarapan", frequency_type: "fixed_time", fixed_times: ["07:00"], is_active: true, expires_at: null },
    // A walk (Phase 172's title, kind walk) is a routine, never a meal.
    { entity_id: id(11), title: "Jalan pagi", frequency_type: "fixed_time", fixed_times: ["06:30:00"], is_active: true, expires_at: null, kind: "walk" },
    { entity_id: id(11), title: "Matikan lampu", frequency_type: "fixed_time", fixed_times: ["21:30"], is_active: true, expires_at: null, kind: "lights" },
    // An Other routine: its typed title stays out of the block.
    { entity_id: id(12), title: "Sisir bulu rahasia", frequency_type: "fixed_time", fixed_times: ["10:00"], is_active: true, expires_at: null, kind: "other" },
    // Ended yesterday: no longer there.
    { entity_id: id(10), title: "Ajak main", frequency_type: "fixed_time", fixed_times: ["16:00"], is_active: true, expires_at: "2026-11-10", kind: "play" },
  ],
  rooms: [],
  items: [],
};

const built = buildContext(rows, { today: "2026-11-11", now: "08:30", ownerLocale: "id", callerUserId: OWNER });
const { household, refs, names } = built;

/** A complete add_pet_routine input, as the strict schema requires every field. */
const call = (overrides: Record<string, unknown> = {}) => ({
  pets: ["P1", "P2"],
  kind: "lights",
  times: ["21:30"],
  days: null,
  until: null,
  title: null,
  title_en: null,
  staff: null,
  note: null,
  remind_staff: false,
  alert_owners: false,
  ...overrides,
});

const check = (input: Record<string, unknown>) => validateToolCall(household, "add_pet_routine", input);
const errors = (input: Record<string, unknown>) => {
  const result = check(input);
  return result.ok ? [] : result.errors;
};
const suggest = (input: Record<string, unknown>) =>
  toSuggestion(household, refs, names, "add_pet_routine", input) as PetRoutineSuggestion;

describe("the tool", () => {
  it("is still called add_pet_routine (126's CHECK on kakak_requests.tools is unchanged)", () => {
    const tool = KAKAK_TOOLS.find((t) => t.name === "add_pet_routine")!;
    const schema = tool.input_schema as { required: string[]; properties: Record<string, { enum?: string[] }> };
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(schema.properties.kind.enum).toEqual(["meal", "potty", "walk", "lights", "play", "water", "teeth", "other"]);
    expect(KAKAK_SYSTEM_PROMPT).toContain('"both dogs", "Mocha and Matcha" is one call');
  });
});

describe("household block", () => {
  it("lists a pet's routines by kind, never a walk as a meal, and no Other titles", () => {
    expect(household.pets[1]).toMatchObject({ meals: [], routines: [
      { kind: "walk", title: "Jalan pagi", times: ["06:30"] },
      { kind: "lights", title: "Matikan lampu", times: ["21:30"] },
    ] });
    // The ended play routine is gone.
    expect(household.pets[0].routines).toBeUndefined();
    const block = renderHouseholdBlock(household);
    expect(block).toContain("- P2: Matcha (dog). Meals: none. Potty: none. Routines: walk 06:30; lights 21:30.");
    expect(block).toContain("- P1: Mocha (dog). Meals: 07:00. Potty: none.\n");
    expect(block).toContain("- P3: Luna (cat). Meals: none. Potty: none.\n");
    expect(block).not.toContain("Sisir bulu rahasia");
  });
});

describe("argument checks", () => {
  it("accepts the owner's two sentences", () => {
    expect(check(call())).toEqual({ ok: true });
    expect(check(call({ pets: ["P2"], kind: "walk", times: ["07:00"] }))).toEqual({ ok: true });
  });

  it("accepts days, an end, a person, a note and both switches on a routine", () => {
    expect(
      check(call({ kind: "teeth", days: ["mon", "wed", "fri"], until: "2026-11-13", staff: "S1", note: "Pakai sikat biru", remind_staff: true, alert_owners: true })),
    ).toEqual({ ok: true });
    expect(check(call({ kind: "other", title: "Sisir bulu", title_en: "Brush the coat" }))).toEqual({ ok: true });
  });

  it("refuses pets that aren't there, repeat, or are too many", () => {
    expect(errors(call({ pets: [] }))).toContain("pets must have 1 to 8 entries");
    expect(errors(call({ pets: ["P9"] })).join(" ")).toMatch(/pets\[0\] "P9" is not a reference/);
    expect(errors(call({ pets: ["P1", "P1"] }))).toContain("pets repeat");
    expect(errors(call({ pets: Array(9).fill("P1") }))).toContain("pets must have 1 to 8 entries");
  });

  it("refuses bad kinds, times, days and ends", () => {
    expect(errors(call({ kind: "bath" }))).toContain("kind is not a routine kind");
    expect(errors(call({ times: [] }))).toContain("times must have 1 to 12 entries");
    expect(errors(call({ times: ["9.30"] }))).toContain("every time must be HH:mm");
    expect(errors(call({ times: ["21:30", "21:30"] }))).toContain("times repeat");
    expect(errors(call({ days: [] }))).toContain("days must be null (every day) or 1 to 7 weekdays");
    expect(errors(call({ days: ["mon", "funday"] }))).toContain("days must be mon … sun");
    expect(errors(call({ days: ["mon", "mon"] }))).toContain("days repeat");
    expect(errors(call({ until: "2026-11-10" })).join(" ")).toMatch(/until 2026-11-10 is outside/);
    expect(errors(call({ until: "2026-02-30" })).join(" ")).toMatch(/until must be a real date/);
  });

  it("needs a title for Other, and keeps titles, notes and people within limits", () => {
    expect(errors(call({ kind: "other" }))).toContain("title is required");
    expect(errors(call({ kind: "other", title: "x".repeat(61) }))).toContain("title is longer than 60 characters");
    expect(errors(call({ note: "x".repeat(121) }))).toContain("note is longer than 120 characters");
    // The owner isn't a routine's person (migrations/144's trigger checks staff).
    expect(errors(call({ staff: "M1" })).join(" ")).toMatch(/staff "M1" is not a reference/);
    expect(errors(call({ staff: "S9" })).join(" ")).toMatch(/staff "S9" is not a reference/);
  });

  it("keeps meals and potty breaks as they were: every day, for anyone, no switches", () => {
    expect(check(call({ pets: ["P1"], kind: "meal", times: ["12:00"], title: "Makan Siang" }))).toEqual({ ok: true });
    const extras = errors(call({ kind: "potty", days: ["mon"], staff: "S1", note: "x", remind_staff: true }));
    expect(extras.join(" ")).toMatch(/days, staff, note, remind_staff can't be set on potty/);
    expect(errors(call({ kind: "meal", title: "x".repeat(41) }))).toContain("title is longer than 40 characters");
  });

  it("refuses a switch none of the times can use, so Kakak says so instead", () => {
    expect(errors(call({ times: ["23:00"], remind_staff: true })).join(" ")).toMatch(/06:00 to 21:59/);
    expect(errors(call({ times: ["05:00"], alert_owners: true })).join(" ")).toMatch(/05:30 to 22:00/);
    // One usable time is enough; the other is left off when saved.
    expect(check(call({ times: ["21:30", "23:00"], remind_staff: true }))).toEqual({ ok: true });
  });
});

describe("the suggestion the phone gets", () => {
  it("lights off for both dogs is one card: Matcha already has 21:30, Mocha gets it", () => {
    const item = suggest(call());
    expect(item).toMatchObject({
      kind: "pet_routine",
      routine: "lights",
      title: "Matikan lampu",
      proof: "photo",
      days: null,
      until: null,
      staffId: null,
      pets: [
        { petId: id(10), petName: "Mocha", times: [{ time: "21:30", title: "Matikan lampu" }], alreadyThere: [] },
        { petId: id(11), petName: "Matcha", times: [], alreadyThere: ["21:30"] },
      ],
    });
    expect(isSaveableSuggestion(item)).toBe(true);
    expect(addsSomething(item)).toBe(true);
  });

  it("a walk for one pet is three photos; for several, one photo of them all", () => {
    expect(suggest(call({ pets: ["P1"], kind: "walk", times: ["07:00"] })).proof).toBe("three");
    expect(suggest(call({ pets: ["P1", "P3"], kind: "walk", times: ["07:00"] })).proof).toBe("photo");
  });

  it("a walk at a time the pet walks already, under another title, counts as there", () => {
    const item = suggest(call({ pets: ["P2"], kind: "walk", times: ["06:30", "17:00"] }));
    expect(item.pets[0]).toMatchObject({ times: [{ time: "17:00", title: "Jalan-jalan" }], alreadyThere: ["06:30"] });
  });

  it("an Other routine is matched by its title", () => {
    const item = suggest(call({ pets: ["P3"], kind: "other", title: "Sisir bulu rahasia", times: ["10:00", "18:00"] }));
    expect(item.pets[0].alreadyThere).toEqual(["10:00"]);
  });

  it("weekdays become ISO days, every day is null, and people become ids", () => {
    const item = suggest(call({ kind: "teeth", days: ["fri", "mon", "wed"], until: "2026-11-13", staff: "S1", note: "Pelan-pelan" }));
    expect(item).toMatchObject({ days: [1, 3, 5], until: "2026-11-13", staffId: id(1), staffName: "Syam", note: "Pelan-pelan" });
    expect(suggest(call({ days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] })).days).toBeNull();
  });

  it("meals keep their per-time titles and no routine fields", () => {
    const item = suggest(call({ pets: ["P1", "P2"], kind: "meal", times: ["07:00", "12:00"] }));
    expect(item).toMatchObject({ title: null, proof: null, days: null, staffId: null });
    expect(item.pets[0]).toMatchObject({ times: [{ time: "12:00", title: "Makan Siang" }], alreadyThere: ["07:00"] });
    expect(item.pets[1].times.map((t) => t.time)).toEqual(["07:00", "12:00"]);
    expect(isSaveableSuggestion(item)).toBe(true);
  });

  it("the phone refuses a card it didn't get from the route", () => {
    const item = suggest(call());
    expect(isSaveableSuggestion({ ...item, proof: "gps" })).toBe(false);
    expect(isSaveableSuggestion({ ...item, days: [0] })).toBe(false);
    expect(isSaveableSuggestion({ ...item, pets: [] })).toBe(false);
    expect(isSaveableSuggestion({ ...item, staffId: "Syam" })).toBe(false);
    const meal = suggest(call({ kind: "meal" }));
    expect(isSaveableSuggestion({ ...meal, days: [1] })).toBe(false);
    expect(isSaveableSuggestion({ ...meal, remindStaff: true })).toBe(false);
  });
});

describe("already there only when an existing routine covers every day (Codex, PR #100)", () => {
  // Matcha's walks as the route reads them: a Monday-only 07:00 walk, a
  // daily 18:00 one, a one-off on 20 Nov at 09:00, and lights off that
  // ended yesterday (ended rows never reach the block; one is added here to
  // check the rule itself).
  const withRoutines = (routines: NonNullable<(typeof household.pets)[number]["routines"]>) => ({
    ...household,
    pets: household.pets.map((p) => (p.ref === "P2" ? { ...p, routines } : p)),
  });
  const monday = { kind: "walk" as const, title: "Jalan-jalan", times: ["07:00"], days: [1], from: "2026-11-01", until: null };
  const daily = { kind: "walk" as const, title: "Jalan-jalan", times: ["18:00"], days: null, from: "2026-11-01", until: null };
  const oneOff = { kind: "walk" as const, title: "Jalan-jalan", times: ["09:00"], days: null, from: "2026-11-20", until: "2026-11-20" };
  const ended = { kind: "lights" as const, title: "Matikan lampu", times: ["21:30"], days: null, from: "2026-10-01", until: "2026-11-10" };
  const h = withRoutines([monday, daily, oneOff, ended]);

  it("a Monday-only walk doesn't hide a Tuesday one, or a daily one", () => {
    expect(newPetTimes(h, "P2", "walk", ["07:00"], "Jalan-jalan", { days: [2], until: null })).toEqual(["07:00"]);
    expect(newPetTimes(h, "P2", "walk", ["07:00"], "Jalan-jalan", { days: null, until: null })).toEqual(["07:00"]);
    // Mondays only, asked again: that one is there.
    expect(newPetTimes(h, "P2", "walk", ["07:00"], "Jalan-jalan", { days: [1], until: null })).toEqual([]);
  });

  it("daily against daily: already there; a daily routine covers some days too", () => {
    expect(newPetTimes(h, "P2", "walk", ["18:00"], "Jalan-jalan", { days: null, until: null })).toEqual([]);
    expect(newPetTimes(h, "P2", "walk", ["18:00"], "Jalan-jalan", { days: [1, 3, 5], until: "2026-11-30" })).toEqual([]);
  });

  it("a future one-off doesn't block a new daily routine", () => {
    expect(newPetTimes(h, "P2", "walk", ["09:00"], "Jalan-jalan", { days: null, until: null })).toEqual(["09:00"]);
  });

  it("a routine that ended doesn't block a new one", () => {
    expect(newPetTimes(h, "P2", "lights", ["21:30"], "Matikan lampu", { days: null, until: null })).toEqual(["21:30"]);
    // One that runs until a date covers a request ending sooner, not one with no end.
    const until = withRoutines([{ ...ended, until: "2026-11-30" }]);
    expect(newPetTimes(until, "P2", "lights", ["21:30"], "Matikan lampu", { days: null, until: "2026-11-20" })).toEqual([]);
    expect(newPetTimes(until, "P2", "lights", ["21:30"], "Matikan lampu", { days: null, until: null })).toEqual(["21:30"]);
  });

  it("the card and the suggestion follow the same rule", () => {
    const toS = (input: Record<string, unknown>) =>
      toSuggestion(h, refs, names, "add_pet_routine", { ...call({ pets: ["P2"], kind: "walk", times: ["07:00"] }), ...input }) as PetRoutineSuggestion;
    expect(toS({ days: ["tue"] }).pets[0]).toMatchObject({ times: [{ time: "07:00" }], alreadyThere: [] });
    expect(toS({ days: ["mon"] }).pets[0]).toMatchObject({ times: [], alreadyThere: ["07:00"] });
  });

  it("the block tells Kakak when each routine happens", () => {
    const block = renderHouseholdBlock(h);
    expect(block).toContain("Routines: walk 07:00 (Mon), 09:00 (from 2026-11-20; until 2026-11-20), 18:00; lights 21:30 (until 2026-11-10).");
  });

  it("the context keeps each row's weekdays and first and last day", () => {
    const ctx = buildContext(
      {
        ...rows,
        schedules: [
          { entity_id: id(10), title: "Jalan-jalan", frequency_type: "fixed_time", fixed_times: ["07:00"], is_active: true, expires_at: null, kind: "walk", days_of_week: [1], created_at: "2026-11-01T03:00:00Z" },
          // 23:30 UTC on 19 Nov is 20 Nov in Jakarta.
          { entity_id: id(10), title: "Jalan-jalan", frequency_type: "fixed_time", fixed_times: ["09:00"], is_active: true, expires_at: "2026-11-20", kind: "walk", days_of_week: null, created_at: "2026-11-19T23:30:00Z" },
        ],
      },
      { today: "2026-11-11", now: "08:30", ownerLocale: "id", callerUserId: OWNER },
    );
    expect(ctx.household.pets[0].routines).toEqual([
      { kind: "walk", title: "Jalan-jalan", times: ["07:00"], days: [1], from: "2026-11-01", until: null },
      { kind: "walk", title: "Jalan-jalan", times: ["09:00"], days: null, from: "2026-11-20", until: "2026-11-20" },
    ]);
  });
});

describe("the confirm card", () => {
  it("in Indonesian", () => {
    const card = describeSuggestion(suggest(call()), "id");
    expect(card.heading).toBe("Rutinitas · Mocha & Matcha");
    expect(card.rows).toEqual([
      { label: "Apa", value: "Matikan lampu" },
      { label: "Untuk", value: "Mocha" },
      { label: "Kapan", value: "21.30" },
      { label: "Ulangi", value: "Setiap hari" },
      { label: "Siapa", value: "Siapa saja" },
      { label: "Bukti", value: "Foto" },
      { label: "Ingatkan staf", value: "Tidak", toggle: { field: "remindStaff", on: false, allowed: true } },
      { label: "Kabari kami", value: "Tidak", toggle: { field: "alertOwners", on: false, allowed: true } },
    ]);
    expect(card.note).toBe("Matcha: 21.30 sudah ada.");
  });

  it("in English, with what staff will read", () => {
    const item = suggest(
      call({ pets: ["P1"], kind: "walk", times: ["07:00"], days: ["mon", "tue", "wed", "thu", "fri"], until: "2026-11-13", staff: "S1", note: "Pakai tali", remind_staff: true, alert_owners: true }),
    );
    const card = describeSuggestion(item, "en");
    expect(card.heading).toBe("Routine · Mocha");
    expect(card.rows).toEqual([
      { label: "What", value: "Walk (Jalan-jalan)" },
      { label: "When", value: "07:00" },
      { label: "Repeats", value: "Mon, Tue, Wed, Thu, Fri, until Friday 13 Nov" },
      { label: "Who", value: "Syam" },
      { label: "Note for staff", value: "Pakai tali" },
      { label: "Proof", value: "3 photos (start, there, back)" },
      { label: "Remind staff", value: "At this time", toggle: { field: "remindStaff", on: true, allowed: true } },
      { label: "Tell us", value: "If it's not done", toggle: { field: "alertOwners", on: true, allowed: true } },
    ]);
    expect(savedSummary([item], "en")).toBe("Saved — Walk · Mocha");
  });

  it("a switch no time can use is shown greyed, and stays off", () => {
    const rows = describeSuggestion(suggest(call({ times: ["23:00"] })), "en").rows;
    expect(rows.slice(-2)).toEqual([
      { label: "Remind staff", value: "Too late for a reminder", toggle: { field: "remindStaff", on: false, allowed: false } },
      { label: "Tell us", value: "Too late for an alert", toggle: { field: "alertOwners", on: false, allowed: false } },
    ]);
  });

  it("the card's switches flip with no call to Kakak, never past the hours they can work", () => {
    const item = suggest(call({ pets: ["P1"] }));
    expect(refinePetRoutine(item, { remindStaff: true })).toMatchObject({ remindStaff: true, alertOwners: false });
    expect(refinePetRoutine(item, { alertOwners: true })).toMatchObject({ alertOwners: true });
    const late = suggest(call({ pets: ["P1"], times: ["23:00"] }));
    expect(refinePetRoutine(late, { remindStaff: true }).remindStaff).toBe(false);
    const meal = suggest(call({ kind: "meal" }));
    expect(refinePetRoutine(meal, { remindStaff: true })).toBe(meal);
    expect(isSaveableSuggestion(refinePetRoutine(item, { remindStaff: true }))).toBe(true);
    // A typed correction afterwards tells Kakak what the switches say.
    expect(refinementNote([refinePetRoutine(item, { remindStaff: true })])).toContain("Matikan lampu: remind staff, no alert");
  });

  it("an Other routine shows the owner's English gloss", () => {
    const card = describeSuggestion(suggest(call({ pets: ["P3"], kind: "other", title: "Sisir bulu", title_en: "Brush the coat" })), "en");
    expect(card.rows[0]).toEqual({ label: "What", value: "Brush the coat (Sisir bulu)" });
  });

  it("meals for two pets name the pet only where they differ", () => {
    const card = describeSuggestion(suggest(call({ kind: "meal", times: ["07:00", "12:00"] })), "id");
    expect(card.heading).toBe("Makan · Mocha & Matcha");
    expect(card.rows).toEqual([
      { label: "07.00", value: "Sarapan · Matcha" },
      { label: "12.00", value: "Makan Siang" },
    ]);
    expect(card.note).toBe("Mocha: 07.00 sudah ada.");
  });

  it("a routine every pet already has adds nothing", () => {
    const item = suggest(call({ pets: ["P2"] }));
    expect(addsSomething(item)).toBe(false);
    expect(describeSuggestion(item, "en").note).toBe("21:30 is already there.");
  });
});

describe("Kakak's Done (the benefit, not the mechanics)", () => {
  it("a named person, a reminder and an alert", () => {
    const item = suggest(call({ pets: ["P1", "P3"], staff: "S1", remind_staff: true, alert_owners: true }));
    expect(savedBenefit([item], "en")).toBe("Done. Syam gets a reminder at 21:30; you'll only hear from me if it isn't done.");
    expect(savedBenefit([item], "id")).toBe("Beres. Syam diingatkan jam 21.30; Kakak hanya mengabari Anda jika belum dikerjakan.");
  });

  it("anyone, no switches: staff see it, and a photo comes back", () => {
    const item = suggest(call({ pets: ["P1"] }));
    expect(savedBenefit([item], "en")).toBe("Done. Staff see it on Today at 21:30; a photo comes back each time.");
    expect(savedBenefit([item], "id")).toBe("Beres. Staf melihatnya di Hari ini jam 21.30; fotonya masuk setiap kali.");
  });

  it("meals keep the toast; the routine line is what the owner will find", () => {
    expect(savedBenefit([suggest(call({ kind: "meal" }))], "en")).toBeNull();
    const item = suggest(call({ pets: ["P1", "P3"], days: ["mon", "wed"] }));
    expect(routineListLine(item, "id")).toEqual({ title: "Matikan lampu · 21.30", detail: "Mocha & Luna · Sen, Rab" });
    expect(routineListLine(suggest(call({ kind: "potty" })), "en")).toBeNull();
  });
});

describe("the rows a confirmed card writes (the Add routine sheet's planner)", () => {
  const at = { groupId: "group-1", today: "2026-11-11", nowIso: "2026-11-11T01:00:00.000Z" };

  it("lights off: one group, a row for each pet that needs it", () => {
    const rows = petRoutineRows(suggest(call({ pets: ["P1", "P3"] })), at);
    expect(rows).toEqual([
      expect.objectContaining({ entity_id: id(10), title: "Matikan lampu", kind: "lights", fixed_times: ["21:30"], routine_group_id: "group-1", proof: "photo", days_of_week: null, expires_at: null, staff_id: null, note: null, remind_staff: false, alert_owners: false }),
      expect.objectContaining({ entity_id: id(12), fixed_times: ["21:30"], routine_group_id: "group-1" }),
    ]);
  });

  it("never writes a time the pet already has", () => {
    const rows = petRoutineRows(suggest(call()), at);
    expect(rows.map((r) => r.entity_id)).toEqual([id(10)]);
    expect(petRoutineRows(suggest(call({ pets: ["P2"] })), at)).toEqual([]);
  });

  it("days, end, person, note and switches go on every row", () => {
    const rows = petRoutineRows(
      suggest(call({ pets: ["P1"], kind: "walk", times: ["07:00", "17:00"], days: ["mon", "fri"], until: "2026-11-20", staff: "S2", note: "Pakai tali", remind_staff: true })),
      at,
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ kind: "walk", title: "Jalan-jalan", days_of_week: [1, 5], expires_at: "2026-11-20", staff_id: id(2), note: "Pakai tali", proof: "three", remind_staff: true, alert_owners: false });
    }
  });

  it("meals and potty are written as before: no kind, no group", () => {
    const rows = petRoutineRows(suggest(call({ pets: ["P1"], kind: "potty", times: ["06:00", "18:00"] })), at);
    expect(rows).toEqual([
      { entity_id: id(10), module: "pet", frequency_type: "fixed_time", fixed_times: ["06:00"], title: "Pipis & Pup" },
      { entity_id: id(10), module: "pet", frequency_type: "fixed_time", fixed_times: ["18:00"], title: "Pipis & Pup" },
    ]);
  });
});

/** A fake Anthropic API: answers in order, records each request body. */
function fake(replies: { content: unknown[]; stop_reason: string }[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetch = async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body)));
    const reply = replies[bodies.length - 1];
    if (!reply) throw new Error("unexpected extra call");
    return new Response(
      JSON.stringify({
        id: `msg_${bodies.length}`,
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: reply.content,
        stop_reason: reply.stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new Anthropic({ apiKey: "k", authToken: null, baseURL: "http://fake.test", maxRetries: 0, fetch });
  const deps: TurnDeps = {
    client,
    model: "claude-opus-5-5",
    effort: "low",
    household,
    refs,
    names,
    begin: async () => ({ ok: true, requestId: id(900 + bodies.length), callsLeft: 5 }),
    record: async () => undefined,
  };
  return { deps, bodies };
}

const toolUse = (input: Record<string, unknown>, n = 1) => ({ type: "tool_use", id: `toolu_${n}`, name: "add_pet_routine", input });

describe("the confirm step", () => {
  it("a sentence becomes a card to confirm; nothing is saved by the route", async () => {
    const { deps, bodies } = fake([
      { content: [{ type: "text", text: "Kakak siapkan ini:" }, toolUse(call())], stop_reason: "tool_use" },
    ]);
    const result = await runKakakTurn(deps, null, "Matikan lampu untuk Mocha dan Matcha setiap hari jam 21.30, pakai foto");
    expect(result.kind).toBe("suggestions");
    if (result.kind !== "suggestions") return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ kind: "pet_routine", routine: "lights" });
    // One call to the API, and its tools are the cached list.
    expect(bodies).toHaveLength(1);
    expect((bodies[0].tools as { name: string }[]).map((t) => t.name)).toContain("add_pet_routine");
  });

  it("a wrong call goes back to Kakak once with the reason, then the corrected card comes", async () => {
    const { deps, bodies } = fake([
      { content: [toolUse(call({ pets: ["P2"], kind: "walk", times: ["07:00"], staff: "M1" }))], stop_reason: "tool_use" },
      { content: [toolUse(call({ pets: ["P2"], kind: "walk", times: ["07:00"] }), 2)], stop_reason: "tool_use" },
    ]);
    const result = await runKakakTurn(deps, null, "Jalan-jalan Matcha tiap pagi jam 7");
    expect(result.kind).toBe("suggestions");
    const second = bodies[1].messages as { role: string; content: { type: string; is_error?: boolean; content?: string }[] }[];
    const feedback = second[second.length - 1].content[0];
    expect(feedback).toMatchObject({ type: "tool_result", is_error: true });
    expect(feedback.content).toMatch(/staff "M1" is not a reference/);
  });

  it("still wrong after one correction: nothing to confirm", async () => {
    const bad = toolUse(call({ kind: "meal", days: ["mon"] }));
    const { deps } = fake([
      { content: [bad], stop_reason: "tool_use" },
      { content: [{ ...bad, id: "toolu_2" }], stop_reason: "tool_use" },
    ]);
    expect(await runKakakTurn(deps, null, "Makan tiap Senin")).toEqual({ kind: "failed", reason: "invalid" });
  });
});

describe("practice mode and the examples", () => {
  const deps = (): TurnDeps => ({
    client: practiceClient(household),
    model: "claude-opus-5-5",
    effort: "low",
    household,
    refs,
    names,
    begin: async () => ({ ok: true, requestId: id(990), callsLeft: 5 }),
    record: async () => undefined,
  });

  it("two pets get the lights-off example, and it becomes one card in practice mode", async () => {
    const [example] = kakakExamples({ locale: "id", staffNames: ["Syam"], petNames: ["Mocha", "Matcha"] }).filter((e) => e.kind === "pet");
    expect(example.text).toBe("Matikan lampu untuk Mocha dan Matcha setiap hari jam 21.30");
    const result = await runKakakTurn(deps(), null, example.text);
    if (result.kind !== "suggestions") throw new Error(result.kind);
    expect(result.items[0]).toMatchObject({ kind: "pet_routine", routine: "lights", title: "Matikan lampu" });
    expect((result.items[0] as PetRoutineSuggestion).pets.map((p) => p.petName)).toEqual(["Mocha", "Matcha"]);
  });

  it("the English example too", async () => {
    const [example] = kakakExamples({ locale: "en", staffNames: [], petNames: ["Mocha", "Matcha"] }).filter((e) => e.kind === "pet");
    expect(example.text).toBe("Lights off for Mocha and Matcha every day at 9:30 pm");
    const result = await runKakakTurn(deps(), null, example.text);
    if (result.kind !== "suggestions") throw new Error(result.kind);
    expect((result.items[0] as PetRoutineSuggestion).pets[0].times).toEqual([{ time: "21:30", title: "Matikan lampu" }]);
  });

  it("the demo sentence: a person, a reminder, an alert, and a warm reply", async () => {
    const result = await runKakakTurn(
      deps(),
      null,
      "Syam matikan lampu untuk Mocha dan Luna jam 21.30, pakai foto. Ingatkan Syam, kabari saya kalau belum",
    );
    if (result.kind !== "suggestions") throw new Error(result.kind);
    expect(result.text).toBe("(Latihan) Baik. Kakak siapkan: Syam matikan lampu untuk Mocha dan Luna setiap hari jam 21.30.");
    expect(result.items[0]).toMatchObject({ routine: "lights", staffName: "Syam", remindStaff: true, alertOwners: true });
  });

  it("'remind me' alone is not a staff reminder", async () => {
    const result = await runKakakTurn(deps(), null, "Matikan lampu untuk Mocha jam 21.30");
    if (result.kind !== "suggestions") throw new Error(result.kind);
    expect(result.items[0]).toMatchObject({ remindStaff: false, alertOwners: false, staffId: null });
  });

  it("a walk for one pet in practice mode", async () => {
    const result = await runKakakTurn(deps(), null, "Jalan-jalan Mocha jam 7 pagi");
    if (result.kind !== "suggestions") throw new Error(result.kind);
    expect(result.items[0]).toMatchObject({ routine: "walk", proof: "three" });
  });
});
