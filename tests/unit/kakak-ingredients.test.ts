// Phase 176 PR 4 (docs/phase-176-kitchen-places-plan.md, section 10): Kakak
// puts ingredients away with put_away_ingredient. The household block marks
// ingredients only while Kitchen amounts and Food at home are both on, the
// tool is offered only then, it isn't strict (the union limit), so
// validateToolCall checks all of it, and the card saves through the two
// context actions.
import { describe, expect, it } from "vitest";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { describeSuggestion, savedSummary } from "@/lib/kakak/describe";
import { runKakakTurn, toolsFor, type TurnDeps, type TurnResult } from "@/lib/kakak/engine";
import { renderHouseholdBlock } from "@/lib/kakak/household";
import { practiceClient } from "@/lib/kakak/practice";
import { KAKAK_SYSTEM_PROMPT } from "@/lib/kakak/prompt";
import { isSaveableSuggestion, toSuggestion, type IngredientSuggestion } from "@/lib/kakak/suggestions";
import { KAKAK_TOOLS } from "@/lib/kakak/tools";
import { validateToolCall } from "@/lib/kakak/validate";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = "11111111-1111-4111-8111-111111111111";

const rows: ContextRows = {
  staff: [{ id: id(1), name: "Dewi", created_at: "2026-01-01", user_id: OWNER, archived_at: null }],
  pets: [],
  schedules: [],
  rooms: [],
  items: [
    // I1: an ingredient with a place and a date.
    { id: id(30), name: "Dada Ayam", scope: "home", created_at: "2026-01-01", category: "fresh_food", kept_in: "freezer", expires_on: "2026-11-20" },
    // I2: an ingredient nobody has placed yet.
    { id: id(31), name: "Beras", scope: "home", created_at: "2026-01-02", category: "pantry", kept_in: null, expires_on: null },
    // I3: household supplies, never an ingredient.
    { id: id(32), name: "Sabun cuci", scope: "home", created_at: "2026-01-03", category: "household_supplies", kept_in: null, expires_on: null },
    // I4: a pet item.
    { id: id(33), name: "Makanan anjing", scope: "pet", created_at: "2026-01-04", category: "dog_food", kept_in: null, expires_on: null },
  ],
} as ContextRows;

// Wednesday 11 November 2026.
const opts = { today: "2026-11-11", now: "08:30", ownerLocale: "en" as const, callerUserId: OWNER };
const on = () => buildContext({ ...rows, kitchenOn: true }, opts);

const call = (over: Record<string, unknown> = {}) => ({
  item: "I1",
  kept_in: "fridge",
  expiry: "set",
  expires_on: "2026-11-12",
  expiry_is_guess: false,
  ...over,
});

describe("the household block", () => {
  it("marks Fresh Food and Pantry items as ingredients, with only what is stored", () => {
    const block = renderHouseholdBlock(on().household);
    expect(block).toContain("- I1: Dada Ayam (ingredient) · freezer · expires 2026-11-20");
    // No place stored: the default (Cupboard) is never sent as a fact.
    expect(block).toContain("- I2: Beras (ingredient)\n");
    expect(block).toContain("- I3: Sabun cuci\n");
    expect(block).toContain("- I4: Makanan anjing (pet)\n");
    expect(block).toContain("Ingredients: on.");
  });

  it("is exactly as before unless Kitchen amounts is explicitly on and Food at home isn't off", () => {
    const before = renderHouseholdBlock(buildContext({ ...rows, items: rows.items.map(({ id, name, scope, created_at }) => ({ id, name, scope, created_at })) }, opts).household);
    for (const flags of [{}, { kitchenOn: null }, { kitchenOn: false }]) {
      const { household } = buildContext({ ...rows, ...flags }, opts);
      expect(household.ingredientsOn).toBeUndefined();
      expect(household.items.every((item) => item.ingredient === undefined)).toBe(true);
      expect(renderHouseholdBlock(household)).toBe(before);
    }
    const foodOff = buildContext({ ...rows, kitchenOn: true, foodOn: false }, opts).household;
    expect(foodOff.ingredientsOn).toBeUndefined();
    expect(renderHouseholdBlock(foodOff)).not.toContain("(ingredient)");
  });

  it("drops a place or date it doesn't recognise", () => {
    const { household } = buildContext(
      { ...rows, kitchenOn: true, items: [{ ...rows.items[0], kept_in: "garage", expires_on: "soon" }] },
      opts,
    );
    expect(household.items[0]).toMatchObject({ ingredient: true, keptIn: null, expiresOn: null });
  });
});

describe("the tool", () => {
  it("is offered only while ingredients are on, and isn't strict", () => {
    const tool = KAKAK_TOOLS.find((t) => t.name === "put_away_ingredient")!;
    expect(tool.strict).toBeUndefined();
    expect(toolsFor(on().household).map((t) => t.name)).toContain("put_away_ingredient");
    const off = toolsFor(buildContext(rows, opts).household).map((t) => t.name);
    expect(off).toEqual(["create_chore", "add_to_shopping_list", "add_pet_routine", "add_food", "ask_question"]);
  });

  it("is in Kakak's instructions, with raw ingredients kept off add_food", () => {
    expect(KAKAK_SYSTEM_PROMPT).toContain("put_away_ingredient");
    expect(KAKAK_SYSTEM_PROMPT).toContain("is never add_food");
    expect(KAKAK_SYSTEM_PROMPT).toContain("Tambah bahan masakan / Add ingredient");
  });
});

describe("validateToolCall for put_away_ingredient", () => {
  const { household } = on();
  const check = (input: Record<string, unknown>) => validateToolCall(household, "put_away_ingredient", input);

  it("accepts a move with a date, a move alone, and a cleared date", () => {
    expect(check(call())).toEqual({ ok: true });
    expect(check(call({ expiry: "keep", expires_on: null }))).toEqual({ ok: true });
    expect(check(call({ kept_in: null, expiry: "clear", expires_on: null }))).toEqual({ ok: true });
    expect(check(call({ item: "I2", kept_in: "pantry", expiry: "keep", expires_on: null }))).toEqual({ ok: true });
    // A label may already be past.
    expect(check(call({ expires_on: "2026-11-01" }))).toEqual({ ok: true });
  });

  it("rejects missing and unknown fields", () => {
    const { expiry_is_guess: _guess, ...missing } = call();
    void _guess;
    expect(check(missing).ok).toBe(false);
    expect(check({ ...call(), notes: "x" }).ok).toBe(false);
  });

  it("rejects values outside the enums", () => {
    expect(check(call({ kept_in: "garage" })).ok).toBe(false);
    expect(check(call({ expiry: "later" })).ok).toBe(false);
    expect(check(call({ expiry_is_guess: "no" })).ok).toBe(false);
  });

  it("checks dates against expiry", () => {
    expect(check(call({ expires_on: null })).ok).toBe(false); // set without a date
    expect(check(call({ expires_on: "2026-02-30" })).ok).toBe(false);
    expect(check(call({ expiry: "keep", expires_on: "2026-11-12" })).ok).toBe(false);
    expect(check(call({ expiry: "keep", expires_on: null, expiry_is_guess: true })).ok).toBe(false);
  });

  it("takes only an item marked (ingredient)", () => {
    expect(check(call({ item: "I3" })).ok).toBe(false);
    expect(check(call({ item: "I4" })).ok).toBe(false);
    expect(check(call({ item: "I9" })).ok).toBe(false);
    // Ingredients off: nothing is marked.
    expect(validateToolCall(buildContext(rows, opts).household, "put_away_ingredient", call()).ok).toBe(false);
  });

  it("refuses a call that changes nothing", () => {
    expect(check(call({ kept_in: null, expiry: "keep", expires_on: null })).ok).toBe(false);
    expect(check(call({ kept_in: "freezer", expiry: "keep", expires_on: null })).ok).toBe(false);
    expect(check(call({ kept_in: "freezer", expires_on: "2026-11-20" })).ok).toBe(false);
    expect(check(call({ item: "I2", kept_in: null, expiry: "clear", expires_on: null })).ok).toBe(false);
  });
});

describe("the suggestion", () => {
  const built = on();
  const suggest = (input: Record<string, unknown>) =>
    toSuggestion(built.household, built.refs, built.names, "put_away_ingredient", input) as IngredientSuggestion;

  it("maps the reference to the item, with the place it had", () => {
    const item = suggest(call());
    expect(item).toEqual({
      kind: "ingredient",
      itemId: id(30),
      name: "Dada Ayam",
      keptIn: "fridge",
      fromPlace: "freezer",
      expiry: "set",
      expiresOn: "2026-11-12",
      expiryIsGuess: false,
    });
    expect(isSaveableSuggestion(item)).toBe(true);
  });

  it("is refused by the phone when it would change nothing or its date doesn't fit", () => {
    const item = suggest(call());
    expect(isSaveableSuggestion({ ...item, keptIn: null, expiry: "keep", expiresOn: null })).toBe(false);
    expect(isSaveableSuggestion({ ...item, expiresOn: null })).toBe(false);
    expect(isSaveableSuggestion({ ...item, expiry: "clear" })).toBe(false);
    expect(isSaveableSuggestion({ ...item, keptIn: "garage" })).toBe(false);
    expect(isSaveableSuggestion({ ...item, itemId: "I1" })).toBe(false);
    expect(isSaveableSuggestion({ ...item, expiry: "keep", expiresOn: null, expiryIsGuess: true })).toBe(false);
  });

  it("reads on the card in both languages", () => {
    const moved = suggest(call({ expiry_is_guess: true }));
    expect(describeSuggestion(moved, "en")).toEqual({
      heading: "Ingredient",
      rows: [
        { label: "What", value: "Dada Ayam" },
        { label: "Kept in", value: "Fridge (was Freezer)" },
        { label: "Expires", value: "Thursday 12 Nov · Kakak's guess — check it", guess: true },
      ],
      note: "If it smells or looks off, throw it away.",
    });
    expect(describeSuggestion(moved, "id")).toMatchObject({
      heading: "Bahan masakan",
      rows: [
        { label: "Apa", value: "Dada Ayam" },
        { label: "Disimpan di", value: "Kulkas (sebelumnya Freezer)" },
        { label: "Kedaluwarsa", value: "Kamis 12 Nov · Tebakan Kakak — cek lagi", guess: true },
      ],
    });
    const cleared = suggest(call({ item: "I2", kept_in: "pantry", expiry: "clear", expires_on: null }));
    expect(describeSuggestion(cleared, "id").rows).toEqual([
      { label: "Apa", value: "Beras" },
      { label: "Disimpan di", value: "Lemari" },
      { label: "Kedaluwarsa", value: "Tidak ada" },
    ]);
    expect(savedSummary([cleared], "id")).toBe("Tersimpan — Beras");
  });
});

describe("practice mode", () => {
  function setup(locale: "en" | "id") {
    const built = buildContext({ ...rows, kitchenOn: true }, { ...opts, ownerLocale: locale });
    let begun = 0;
    const deps: TurnDeps = {
      client: practiceClient(built.household),
      model: "claude-opus-5-5",
      effort: "low",
      household: built.household,
      refs: built.refs,
      names: built.names,
      begin: async () => ({ ok: true, requestId: id(900 + ++begun), callsLeft: 40 }),
      record: async () => undefined,
    };
    return deps;
  }
  const items = (result: TurnResult) => {
    if (result.kind !== "suggestions") throw new Error(`expected suggestions, got ${result.kind}`);
    for (const item of result.items) expect(isSaveableSuggestion(item)).toBe(true);
    return result.items;
  };

  it("puts a listed ingredient away, before 'beli' makes it shopping", async () => {
    const result = await runKakakTurn(setup("id"), null, "Saya beli beras, sudah di lemari");
    expect(items(result)).toEqual([expect.objectContaining({ kind: "ingredient", itemId: id(31), keptIn: "pantry", expiry: "keep" })]);
  });

  it("asks for the date when an ingredient comes out of the freezer, then moves it", async () => {
    const deps = setup("en");
    const first = await runKakakTurn(deps, null, "Took the dada ayam out of the freezer, it's in the fridge");
    if (first.kind !== "question") throw new Error(`expected a question, got ${first.kind}`);
    expect(first.question).toBe("When does it expire now?");
    const second = await runKakakTurn(deps, first.history, "Tomorrow");
    expect(items(second)).toEqual([
      expect.objectContaining({ kind: "ingredient", itemId: id(30), keptIn: "fridge", fromPlace: "freezer", expiry: "set", expiresOn: "2026-11-12" }),
    ]);
  });
});
