// Phase 176 PR 4 (docs/phase-176-kitchen-places-plan.md, section 10): Kakak
// puts ingredients away with put_away_ingredient. The household block marks
// ingredients only while Kitchen amounts and Food at home are both on, the
// tool is offered only then, it isn't strict (the union limit), so
// validateToolCall checks all of it, and the card saves through the two
// context actions.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { describeSuggestion, savedSummary } from "@/lib/kakak/describe";
import { runKakakTurn, toolsFor, type TurnDeps, type TurnResult } from "@/lib/kakak/engine";
import { renderHouseholdBlock } from "@/lib/kakak/household";
import { practiceClient } from "@/lib/kakak/practice";
import { KAKAK_SYSTEM_PROMPT } from "@/lib/kakak/prompt";
import {
  isSaveableSuggestion,
  needsNewerApp,
  toSuggestion,
  type IngredientSuggestion,
  type NewIngredientSuggestion,
} from "@/lib/kakak/suggestions";
import { INGREDIENT_SHELVES, INGREDIENT_UNITS, KAKAK_TOOL_NAMES, KAKAK_TOOLS } from "@/lib/kakak/tools";
import { amountGiven, validateToolCall } from "@/lib/kakak/validate";
import { addsSomething } from "@/lib/kakak/describe";
import { isIngredient, STOCK_UNITS } from "@/lib/kitchen-units";

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
    // I5: an ingredient marked Out: it keeps no date.
    { id: id(34), name: "Telur", scope: "home", created_at: "2026-01-05", category: "fresh_food", stock_status: "out", kept_in: "fridge", expires_on: null },
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
    expect(block).toContain("- I5: Telur (ingredient) · out · fridge\n");
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
    // Since 2026-11-14 an ingredient that isn't listed is suggested, not sent to the form.
    expect(KAKAK_SYSTEM_PROMPT).not.toContain("Tambah bahan masakan / Add ingredient");
    expect(KAKAK_SYSTEM_PROMPT).toContain("never send the owner to add it by hand");
  });

  it("takes every unit the kitchen counts in, and both ingredient shelves", () => {
    // tools.ts keeps its own list so it imports nothing; this keeps it the kitchen's.
    expect([...INGREDIENT_UNITS].sort()).toEqual([...STOCK_UNITS].sort());
    expect(INGREDIENT_SHELVES.every((shelf) => isIngredient({ category: shelf }))).toBe(true);
    const schema = KAKAK_TOOLS.find((t) => t.name === "put_away_ingredient")!.input_schema as { required: string[]; properties: Record<string, unknown> };
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
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

  it("refuses a date for an ingredient marked Out, which the database would clear", () => {
    expect(check(call({ item: "I5", kept_in: "counter" })).ok).toBe(false);
    expect(check(call({ item: "I5", kept_in: "counter", expiry: "keep", expires_on: null }))).toEqual({ ok: true });
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
      amount: null,
      amountSkipped: null,
    });
    expect(isSaveableSuggestion(item)).toBe(true);
    // A card from a page or a history older than amounts still saves.
    const { amount: _amount, amountSkipped: _skipped, ...older } = item;
    void _amount;
    void _skipped;
    expect(isSaveableSuggestion(older)).toBe(true);
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

// ---------------------------------------------------------------------------
// 2026-11-14 (owner: "Add 2 kg of brown rice into the pantry" got "Sorry, I
// can't add a new ingredient"): an ingredient that isn't listed, and amounts.

/** The same household, with how each item's amount is kept, as the route reads it (migrations/148). */
const stocked: ContextRows = {
  ...rows,
  kitchenOn: true,
  items: [
    // I1: Dada Ayam, not counted.
    { ...rows.items[0], track_amount: false, unit: "pcs", quantity: 0 },
    // I2: Beras, counted in kg: 1.5 kg left.
    { ...rows.items[1], track_amount: true, unit: "kg", quantity: 1.5 },
    rows.items[2],
    rows.items[3],
    // I5: Telur, counted in butir, and Out.
    { ...rows.items[4], track_amount: true, unit: "butir", quantity: 0 },
    // I6: Minyak goreng, counted in bottles: no weight or volume to add to.
    { id: id(35), name: "Minyak goreng", scope: "home", created_at: "2026-01-06", category: "pantry", kept_in: null, expires_on: null, track_amount: true, unit: "bottle", quantity: 2 },
  ],
} as ContextRows;
const withStock = (locale: "en" | "id" = "en") => buildContext(stocked, { ...opts, ownerLocale: locale });

const fresh = (over: Record<string, unknown> = {}) => ({
  item: null,
  new_name: "Beras merah",
  new_name_en: "Brown rice",
  shelf: "pantry",
  kept_in: "pantry",
  amount: 2,
  unit: "kg",
  amount_is: "bought",
  expiry: "keep",
  expires_on: null,
  expiry_is_guess: false,
  ...over,
});
const listed = (over: Record<string, unknown> = {}) => ({
  item: "I2",
  new_name: null,
  new_name_en: null,
  shelf: null,
  kept_in: null,
  amount: 2,
  unit: "kg",
  amount_is: "bought",
  expiry: "keep",
  expires_on: null,
  expiry_is_guess: false,
  ...over,
});

describe("a new ingredient (2026-11-14)", () => {
  const built = withStock();
  const check = (input: Record<string, unknown>) => validateToolCall(built.household, "put_away_ingredient", input);
  const suggest = (input: Record<string, unknown>, from = built) => toSuggestion(from.household, from.refs, from.names, "put_away_ingredient", input);

  it("is accepted by name, with a shelf, and an amount, a place and a date only when given", () => {
    expect(check(fresh())).toEqual({ ok: true });
    expect(check(fresh({ kept_in: null, amount: null, unit: null, new_name_en: null }))).toEqual({ ok: true });
    expect(check(fresh({ new_name: "Ikan tongkol", shelf: "fresh_food", kept_in: "freezer", amount: null, unit: null, expiry: "set", expires_on: "2026-11-30" }))).toEqual({ ok: true });
  });

  it("needs a name and a shelf, and never both an item and a name", () => {
    expect(check(fresh({ new_name: null })).ok).toBe(false);
    expect(check(fresh({ new_name: "  " })).ok).toBe(false);
    expect(check(fresh({ new_name: "x".repeat(61) })).ok).toBe(false);
    expect(check(fresh({ shelf: null })).ok).toBe(false);
    expect(check(fresh({ shelf: "household_supplies" })).ok).toBe(false);
    expect(check(fresh({ item: "I2" })).ok).toBe(false);
    expect(check(listed({ shelf: "pantry" })).ok).toBe(false);
    // Nothing to clear on something new.
    expect(check(fresh({ expiry: "clear" })).ok).toBe(false);
  });

  it("is sent back to the listed item when its name is already there", () => {
    const again = check(fresh({ new_name: " beras ", amount: null, unit: null }));
    expect(again).toEqual({ ok: false, errors: ["new_name is already listed as I2: use item I2 instead"] });
    // A supply of the same name isn't an ingredient: the new one stands.
    expect(check(fresh({ new_name: "Sabun cuci", amount: null, unit: null }))).toEqual({ ok: true });
  });

  it("isn't taken while ingredients are off", () => {
    expect(validateToolCall(buildContext(rows, opts).household, "put_away_ingredient", fresh()).ok).toBe(false);
  });

  it("becomes a card the phone can save, named for staff and glossed for an English-speaking owner", () => {
    const item = suggest(fresh()) as NewIngredientSuggestion;
    expect(item).toEqual({
      kind: "new_ingredient",
      name: "Beras merah",
      nameEn: "Brown rice",
      category: "pantry",
      keptIn: "pantry",
      expiresOn: null,
      expiryIsGuess: false,
      amount: { value: 2, unit: "kg" },
    });
    expect(isSaveableSuggestion(item)).toBe(true);
    expect(addsSomething(item)).toBe(true);
    expect(needsNewerApp(item)).toBe(true);
    expect(describeSuggestion(item, "en")).toEqual({
      heading: "New ingredient",
      rows: [
        { label: "What", value: "Beras merah (Brown rice)" },
        { label: "Amount", value: "2 kg" },
        { label: "Kept in", value: "Cupboard" },
      ],
      note: undefined,
    });
    expect(describeSuggestion(item, "id")).toEqual({
      heading: "Bahan masakan baru",
      rows: [
        { label: "Apa", value: "Beras merah" },
        { label: "Jumlah", value: "2 kg" },
        { label: "Disimpan di", value: "Lemari" },
      ],
      note: undefined,
    });
    expect(savedSummary([item], "en")).toBe("Saved — Brown rice");
    expect(savedSummary([item], "id")).toBe("Tersimpan — Beras merah");
  });

  it("shows its shelf's usual place when none was said, and stores none", () => {
    const fish = suggest(fresh({ new_name: "Ikan tongkol", new_name_en: null, shelf: "fresh_food", kept_in: null, amount: null, unit: null, expiry: "set", expires_on: "2026-11-30", expiry_is_guess: true })) as NewIngredientSuggestion;
    expect(fish).toMatchObject({ keptIn: null, category: "fresh_food", amount: null, expiresOn: "2026-11-30", expiryIsGuess: true });
    expect(describeSuggestion(fish, "id")).toEqual({
      heading: "Bahan masakan baru",
      rows: [
        { label: "Apa", value: "Ikan tongkol" },
        { label: "Disimpan di", value: "Kulkas" },
        { label: "Kedaluwarsa", value: "Senin 30 Nov · Tebakan Kakak — cek lagi", guess: true },
      ],
      note: "Kalau baunya atau tampilannya aneh, buang saja.",
    });
  });

  it("is refused by the phone when its shape isn't what the route builds", () => {
    const item = suggest(fresh()) as NewIngredientSuggestion;
    expect(isSaveableSuggestion({ ...item, name: "" })).toBe(false);
    expect(isSaveableSuggestion({ ...item, category: "household_supplies" })).toBe(false);
    expect(isSaveableSuggestion({ ...item, keptIn: "garage" })).toBe(false);
    expect(isSaveableSuggestion({ ...item, amount: { value: 0, unit: "kg" } })).toBe(false);
    expect(isSaveableSuggestion({ ...item, amount: { value: 2, unit: "karung" } })).toBe(false);
    expect(isSaveableSuggestion({ ...item, expiryIsGuess: true })).toBe(false);
  });
});

describe("an amount (2026-11-14)", () => {
  const built = withStock();
  const check = (input: Record<string, unknown>) => validateToolCall(built.household, "put_away_ingredient", input);
  const suggest = (input: Record<string, unknown>, from = built) =>
    toSuggestion(from.household, from.refs, from.names, "put_away_ingredient", input) as IngredientSuggestion;

  it("needs a number above 0 with a unit the kitchen counts in, or neither", () => {
    expect(check(listed())).toEqual({ ok: true });
    expect(check(listed({ amount: 0 })).ok).toBe(false);
    expect(check(listed({ amount: -1 })).ok).toBe(false);
    expect(check(listed({ amount: "2" })).ok).toBe(false);
    expect(check(listed({ amount: 100_001 })).ok).toBe(false);
    expect(check(listed({ unit: null })).ok).toBe(false);
    expect(check(listed({ amount: null })).ok).toBe(false);
    expect(check(listed({ unit: "karung" })).ok).toBe(false);
    expect(check(listed({ amount_is: "maybe" })).ok).toBe(false);
    expect(amountGiven(listed())).toEqual({ value: 2, unit: "kg", is: "bought" });
    expect(amountGiven(listed({ amount_is: "now" }))).toEqual({ value: 2, unit: "kg", is: "now" });
    expect(amountGiven(listed({ amount: null, unit: null }))).toBeNull();
  });

  it("is a change by itself: an amount alone is never 'nothing would change'", () => {
    expect(check(listed())).toEqual({ ok: true });
    expect(check(listed({ amount: null, unit: null })).ok).toBe(false);
  });

  it("lets a date stand on an ingredient marked Out, because buying brings it back", () => {
    const eggs = listed({ item: "I5", amount: 30, unit: "butir", kept_in: null, expiry: "set", expires_on: "2026-11-25" });
    expect(check(eggs)).toEqual({ ok: true });
    expect(check({ ...eggs, amount: null, unit: null }).ok).toBe(false);
  });

  it("leaves the date off too when the amount can't be written and the item stays Out (Codex, PR #144)", () => {
    // Telur is counted in butir and marked Out. "2 kg of eggs, good until the 25th": the check lets
    // the date through because an amount came with it, but 2 kg can't be added to butir.
    const eggs = listed({ item: "I5", amount: 2, unit: "kg", kept_in: "counter", expiry: "set", expires_on: "2026-11-25" });
    expect(check(eggs)).toEqual({ ok: true });
    const card = suggest(eggs);
    expect(card).toMatchObject({ amount: null, amountSkipped: { value: 2, unit: "kg", itemUnit: "butir" }, expiry: "keep", expiresOn: null, expiryIsGuess: false, dateSkipped: true, keptIn: "counter" });
    // Nothing it saves can be dropped by the database: the place alone.
    expect(isSaveableSuggestion(card)).toBe(true);
    expect(describeSuggestion(card, "en").rows).toEqual([
      { label: "What", value: "Telur" },
      { label: "Kept in", value: "Counter (was Fridge)" },
    ]);
    expect(describeSuggestion(card, "en").note).toBe(
      "The 2 kg isn't added: here Telur is counted in butir. The date isn't kept while it is marked Out. Set it once it is marked Bought.",
    );
    expect(describeSuggestion(card, "id").note).toBe(
      "2 kg tidak ditambahkan: di sini Telur dicatat dalam butir. Tanggalnya tidak disimpan selama masih ditandai Habis. Atur setelah ditandai Sudah dibeli.",
    );
    // With an amount that can be written, the eggs are bought again and the date stands.
    const bought = suggest(listed({ item: "I5", amount: 30, unit: "butir", expiry: "set", expires_on: "2026-11-25" }));
    expect(bought).toMatchObject({ amount: { value: 30, unit: "butir", mode: "add", before: 0 }, expiry: "set", expiresOn: "2026-11-25" });
    expect(bought.dateSkipped).toBeUndefined();
    // And with no place either, the card has nothing to save: its button stays off.
    const nothing = suggest(listed({ item: "I5", amount: 2, unit: "kg", kept_in: null, expiry: "set", expires_on: "2026-11-25" }));
    expect(addsSomething(nothing)).toBe(false);
  });

  it("is added to an item that is counted, in the item's own unit", () => {
    const more = suggest(listed({ amount: 500, unit: "g", kept_in: "pantry" }));
    expect(more.amount).toEqual({ value: 0.5, unit: "kg", mode: "add", before: 1.5 });
    expect(more.amountSkipped).toBeNull();
    expect(isSaveableSuggestion(more)).toBe(true);
    expect(needsNewerApp(more)).toBe(true);
    expect(describeSuggestion(more, "en").rows).toEqual([
      { label: "What", value: "Beras" },
      { label: "Amount", value: "+0.5 kg · 2 kg in all" },
      { label: "Kept in", value: "Cupboard" },
    ]);
    expect(describeSuggestion(more, "id").rows[1]).toEqual({ label: "Jumlah", value: "+0,5 kg · jadi 2 kg" });
  });

  it("replaces what is there when the owner says what is left", () => {
    const left = suggest(listed({ amount: 1, amount_is: "now" }));
    expect(left.amount).toEqual({ value: 1, unit: "kg", mode: "set", before: 1.5 });
    expect(describeSuggestion(left, "en").rows[1]).toEqual({ label: "Amount", value: "1 kg (was 1.5 kg)" });
    expect(describeSuggestion(left, "id").rows[1]).toEqual({ label: "Jumlah", value: "1 kg (sebelumnya 1,5 kg)" });
    expect(isSaveableSuggestion(left)).toBe(true);
  });

  it("starts the count on an item that wasn't counted, and says so", () => {
    const chicken = suggest(listed({ item: "I1", amount: 2, unit: "kg", kept_in: "freezer" }));
    // Already in the freezer: the amount is the news.
    expect(chicken.amount).toEqual({ value: 2, unit: "kg", mode: "start", before: null });
    expect(describeSuggestion(chicken, "en")).toMatchObject({
      rows: [
        { label: "What", value: "Dada Ayam" },
        { label: "Amount", value: "2 kg" },
        { label: "Kept in", value: "Freezer" },
      ],
      note: "Miamus keeps count of it from now on.",
    });
    expect(describeSuggestion(chicken, "id").note).toBe("Mulai sekarang jumlahnya dicatat.");
    expect(isSaveableSuggestion(chicken)).toBe(true);
  });

  it("is left off, with the reason on the card, when the item is counted another way", () => {
    const oil = suggest(listed({ item: "I6", amount: 2, unit: "L", kept_in: "pantry" }));
    expect(oil.amount).toBeNull();
    expect(oil.amountSkipped).toEqual({ value: 2, unit: "L", itemUnit: "bottle" });
    expect(describeSuggestion(oil, "en").note).toBe("The 2 L isn't added: here Minyak goreng is counted in bottle.");
    expect(describeSuggestion(oil, "id").note).toBe("2 L tidak ditambahkan: di sini Minyak goreng dicatat dalam botol.");
    // The place still saves; with nothing else to save the card's button stays off.
    expect(addsSomething(oil)).toBe(true);
    const only = suggest(listed({ item: "I6", amount: 2, unit: "L" }));
    expect(addsSomething(only)).toBe(false);
    expect(needsNewerApp(only)).toBe(true);
  });

  it("is never guessed onto an item whose count wasn't read", () => {
    const blind = buildContext({ ...rows, kitchenOn: true }, opts);
    const item = suggest(listed({ kept_in: "pantry" }), blind);
    expect(item.amount).toBeNull();
    expect(item.amountSkipped).toEqual({ value: 2, unit: "kg", itemUnit: null });
    expect(describeSuggestion(item, "en").note).toBe("The 2 kg isn't added. Set the amount on the ingredient itself.");
  });

  it("never reaches Anthropic: the household block is the same with or without it", () => {
    const withAmounts = renderHouseholdBlock(built.household);
    expect(withAmounts).not.toMatch(/1\.5|kg|butir|bottle/);
    expect(JSON.stringify(built.household)).not.toContain("quantity");
    expect(built.refs.stock).toEqual({
      I1: { tracked: false, unit: "pcs", quantity: 0 },
      I2: { tracked: true, unit: "kg", quantity: 1.5 },
      I5: { tracked: true, unit: "butir", quantity: 0 },
      I6: { tracked: true, unit: "bottle", quantity: 2 },
    });
  });

  it("is refused by the phone when the amount isn't one it can write", () => {
    const more = suggest(listed());
    expect(isSaveableSuggestion({ ...more, amount: { ...more.amount, value: 0 } })).toBe(false);
    expect(isSaveableSuggestion({ ...more, amount: { ...more.amount, mode: "double" } })).toBe(false);
    expect(isSaveableSuggestion({ ...more, amount: { ...more.amount, unit: "karung" } })).toBe(false);
    // An amount alone is a change; nothing at all still isn't.
    expect(isSaveableSuggestion(more)).toBe(true);
    expect(isSaveableSuggestion({ ...more, amount: null })).toBe(false);
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

describe("practice mode, a new ingredient and amounts (2026-11-14)", () => {
  function setup(locale: "en" | "id") {
    const built = withStock(locale);
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

  it("adds the owner's own sentence: 2 kg of brown rice into the pantry", async () => {
    const result = await runKakakTurn(setup("en"), null, "Add 2 kg of brown rice into the pantry thank you");
    expect(items(result)).toEqual([
      { kind: "new_ingredient", name: "Beras merah", nameEn: "Brown rice", category: "pantry", keptIn: "pantry", expiresOn: null, expiryIsGuess: false, amount: { value: 2, unit: "kg" } },
    ]);
  });

  it("adds one in Indonesian, on the fresh shelf, with no amount", async () => {
    const result = await runKakakTurn(setup("id"), null, "Tambah ikan tongkol di freezer");
    expect(items(result)).toEqual([
      expect.objectContaining({ kind: "new_ingredient", name: "Ikan tongkol", nameEn: null, category: "fresh_food", keptIn: "freezer", amount: null }),
    ]);
  });

  it("adds an amount to a listed ingredient, and sets what is left", async () => {
    const more = await runKakakTurn(setup("id"), null, "Tambah beras 2 kg di lemari");
    expect(items(more)).toEqual([expect.objectContaining({ kind: "ingredient", itemId: id(31), keptIn: "pantry", amount: { value: 2, unit: "kg", mode: "add", before: 1.5 } })]);
    const left = await runKakakTurn(setup("id"), null, "Beras tinggal 1 kg di lemari");
    expect(items(left)).toEqual([expect.objectContaining({ kind: "ingredient", itemId: id(31), amount: { value: 1, unit: "kg", mode: "set", before: 1.5 } })]);
  });

  it("doesn't save a name it can't vouch is Indonesian", async () => {
    const result = await runKakakTurn(setup("en"), null, "Add 2 kg of quinoa to the pantry");
    expect(result.kind).toBe("message");
  });
});

describe("the database records every tool Kakak has", () => {
  it("kakak_record and the tools check in the newest migration list exactly KAKAK_TOOL_NAMES", () => {
    // A name missing there makes kakak_record raise bad_tools, and the call's
    // tokens and cost are never written (Codex, PR #115; migrations/155).
    const dir = join(__dirname, "..", "..", "supabase", "migrations");
    const newest = readdirSync(dir)
      .filter((name) => /^\d+_.*\.sql$/.test(name) && readFileSync(join(dir, name), "utf8").includes("kakak_requests_tools_check"))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .pop()!;
    const sql = readFileSync(join(dir, newest), "utf8");
    const lists = [...sql.matchAll(/tools <@ array\[([^\]]*)\]::text\[\]/g)].map((m) =>
      m[1].split(",").map((name) => name.trim().replace(/^'|'$/g, "")),
    );
    expect(lists).toHaveLength(2); // the column's check and kakak_record's
    for (const list of lists) expect([...list].sort()).toEqual([...KAKAK_TOOL_NAMES].sort());
  });
});
