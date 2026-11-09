// Kakak's practice mode: whole conversations through the real engine
// (checks, validation, references, suggestions) with the scripted stand-in
// for the AI. No API key, no tokens.
import { describe, expect, it } from "vitest";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { runKakakTurn, type CallRecord, type TurnDeps, type TurnResult } from "@/lib/kakak/engine";
import { practiceAllowed, practiceClient } from "@/lib/kakak/practice";
import { isSaveableSuggestion } from "@/lib/kakak/suggestions";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = "11111111-1111-4111-8111-111111111111";

const rows: ContextRows = {
  staff: [
    { id: id(1), name: "Sari Wulandari", created_at: "2026-01-01", user_id: null, archived_at: null },
    { id: id(2), name: "Ari", created_at: "2026-01-02", user_id: null, archived_at: null },
    { id: id(3), name: "Dewi", created_at: "2026-01-03", user_id: OWNER, archived_at: null },
  ],
  pets: [{ id: id(10), name: "Mochi", created_at: "2026-01-01", entity_type: "pet", metadata: {} }],
  schedules: [
    { entity_id: id(10), title: "Sarapan", frequency_type: "fixed_time", fixed_times: ["07:00"], is_active: true, expires_at: null },
  ],
  rooms: [
    { id: id(20), name: "Teras", created_at: "2026-01-01" },
    { id: id(21), name: "LT2 Lounge", created_at: "2026-01-02" },
  ],
  items: [{ id: id(30), name: "Telur", scope: "home", created_at: "2026-01-01" }],
} as ContextRows;

// Wednesday 11 November 2026.
function setup(locale: "en" | "id") {
  const built = buildContext(rows, { today: "2026-11-11", now: "08:30", ownerLocale: locale, callerUserId: OWNER });
  const records: CallRecord[] = [];
  let begun = 0;
  const deps: TurnDeps = {
    client: practiceClient(built.household),
    model: "claude-opus-5-5",
    effort: "low",
    household: built.household,
    refs: built.refs,
    names: built.names,
    begin: async () => ({ ok: true, requestId: `00000000-0000-4000-8000-${String(++begun).padStart(12, "0")}`, callsLeft: 40 }),
    record: async (_id, call) => {
      records.push(call);
    },
  };
  return { deps, records };
}

function suggestions(result: TurnResult) {
  if (result.kind !== "suggestions") throw new Error(`expected suggestions, got ${result.kind}`);
  for (const item of result.items) expect(isSaveableSuggestion(item)).toBe(true);
  return result;
}

describe("practiceAllowed", () => {
  it("is on only when asked for, and never on production", () => {
    expect(practiceAllowed({ KAKAK_PRACTICE: "true" })).toBe(true);
    expect(practiceAllowed({ KAKAK_PRACTICE: "true", VERCEL_ENV: "preview" })).toBe(true);
    expect(practiceAllowed({ KAKAK_PRACTICE: "true", VERCEL_ENV: "production" })).toBe(false);
    expect(practiceAllowed({ KAKAK_PRACTICE: "1" })).toBe(false);
    expect(practiceAllowed({})).toBe(false);
  });
});

describe("practice conversations", () => {
  it("a full chore sentence becomes a weekly chore with the right person, room, day and time", async () => {
    const { deps, records } = setup("id");
    const result = suggestions(await runKakakTurn(deps, null, "Ari pel teras setiap Senin jam 9"));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      kind: "chore",
      title: "Pel teras",
      assignedTo: id(2),
      locationId: id(20),
      dueDate: "2026-11-16",
      dueTime: "09:00",
      recurrence: "weekly",
    });
    // Nothing costs anything.
    expect(records.every((r) => r.costMicroUsd === 0 && r.inputTokens === 0)).toBe(true);
  });

  it("two days are two chores", async () => {
    const { deps } = setup("en");
    const result = suggestions(await runKakakTurn(deps, null, "Sari mops the LT2 Lounge every Monday and Thursday"));
    expect(result.items.map((i) => (i.kind === "chore" ? i.dueDate : null))).toEqual(["2026-11-16", "2026-11-12"]);
  });

  it("a chore typed in English is saved in Bahasa Indonesia, with the English kept as the gloss", async () => {
    const { deps } = setup("en");
    const result = suggestions(await runKakakTurn(deps, null, "Sari mops the LT2 Lounge every Monday"));
    expect(result.items[0]).toMatchObject({ title: "Pel LT2 Lounge", titleEn: "Mops the LT2 Lounge" });
    const kitchen = suggestions(await runKakakTurn(setup("en").deps, null, "Ari cleans the kitchen tomorrow"));
    expect(kitchen.items[0]).toMatchObject({ title: "Bersihkan dapur", locationId: null });
    const trash = suggestions(await runKakakTurn(setup("id").deps, null, "Ari takes out the trash every day"));
    expect(trash.items[0]).toMatchObject({ title: "Buang sampah", recurrence: "daily" });
  });

  it("English it doesn't know is never saved as an English chore", async () => {
    const { deps } = setup("en");
    const result = await runKakakTurn(deps, null, "Sort out the attic every Monday");
    expect(result).toMatchObject({ kind: "message" });
    expect(result.kind === "message" ? result.text : "").toMatch(/practice mode/);
  });

  it("asks which day when it's missing, then suggests with the answer", async () => {
    const { deps } = setup("id");
    const first = await runKakakTurn(deps, null, "Lap jendela teras");
    expect(first).toMatchObject({ kind: "question", question: "Hari apa?", answers: ["Hari ini", "Besok", "Setiap hari"] });
    if (first.kind !== "question") return;
    const second = suggestions(await runKakakTurn(deps, first.history, "Besok"));
    expect(second.items[0]).toMatchObject({ kind: "chore", dueDate: "2026-11-12", recurrence: "none", locationId: id(20) });
  });

  it("shopping: an existing item is matched, the rest become notes", async () => {
    const { deps } = setup("id");
    const result = suggestions(await runKakakTurn(deps, null, "Beli telur dan gula 2 kg"));
    expect(result.items[0]).toMatchObject({ kind: "shopping" });
    const entries = result.items[0].kind === "shopping" ? result.items[0].entries : [];
    expect(entries).toEqual([
      expect.objectContaining({ type: "item", itemId: id(30) }),
      expect.objectContaining({ type: "note", note: "Gula 2 kg" }),
    ]);
  });

  it("food asks for the date, then adds it with who gave it", async () => {
    const { deps } = setup("en");
    const first = await runKakakTurn(deps, null, "Lapis legit from Tante Rina");
    expect(first).toMatchObject({ kind: "question", question: "When does it need eating by?" });
    if (first.kind !== "question") return;
    const second = suggestions(await runKakakTurn(deps, first.history, "In 3 days"));
    expect(second.items[0]).toMatchObject({
      kind: "food",
      name: "Lapis legit",
      keptIn: "fridge",
      expiresOn: "2026-11-14",
      source: "gift",
      fromWhom: "Tante Rina",
    });
  });

  it("pet meal times skip the ones the pet already has", async () => {
    const { deps } = setup("id");
    const result = suggestions(await runKakakTurn(deps, null, "Mochi makan jam 7 dan jam 5 sore"));
    expect(result.items[0]).toMatchObject({ kind: "pet_routine", petId: id(10) });
    const times = result.items[0].kind === "pet_routine" ? result.items[0].times.map((t) => t.time) : [];
    expect(times).toEqual(["17:00"]);
  });

  it("a correction's time replaces the first one", async () => {
    const { deps } = setup("id");
    const first = suggestions(await runKakakTurn(deps, null, "Pel teras besok jam 9"));
    expect(first.items[0]).toMatchObject({ dueTime: "09:00" });
    // The owner taps Change and types a correction.
    const second = suggestions(await runKakakTurn(deps, first.history, "Ganti jam 10"));
    expect(second.items[0]).toMatchObject({ dueTime: "10:00", dueDate: "2026-11-12", locationId: id(20) });
  });

  it("12 am is midnight, once", async () => {
    const { deps } = setup("en");
    const result = suggestions(await runKakakTurn(deps, null, "Feed Mochi at 12 am"));
    const times = result.items[0].kind === "pet_routine" ? result.items[0].times.map((t) => t.time) : [];
    expect(times).toEqual(["00:00"]);
  });

  it("the history it returns goes back through the engine's checks", async () => {
    const { deps } = setup("en");
    const first = await runKakakTurn(deps, null, "Clean the terrace");
    if (first.kind !== "question") throw new Error("expected a question");
    // A correction after the question still works end to end.
    const second = await runKakakTurn(deps, first.history, "Every day at 7");
    expect(suggestions(second).items[0]).toMatchObject({ recurrence: "daily", dueTime: "07:00" });
  });
});
