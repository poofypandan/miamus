// Can we cook it? with Kakak (owner, 20 Nov): the household block carries
// each saved recipe as the app checked it (names only), plan_dish isn't
// strict and is checked whole by validateToolCall, one call becomes the
// Menu card and the Shopping list card, and the guard and the eval keep her
// from stating an amount or an ingredient she was never given.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KAKAK_CLIENT_VERSION } from "@/lib/kakak/client";
import { buildContext, type ContextRecipeRow, type ContextRows } from "@/lib/kakak/context";
import { describeSuggestion, savedSummary } from "@/lib/kakak/describe";
import { dishAnswerFromBlock, dishAnswerLine } from "@/lib/kakak/dish-answer";
import { kakakSystem, runKakakTurn, type TurnDeps, type TurnResult } from "@/lib/kakak/engine";
import { MAX_RECIPES_IN_BLOCK, renderHouseholdBlock, type KakakHousehold } from "@/lib/kakak/household";
import { practiceClient } from "@/lib/kakak/practice";
import { correctionFor, guardReplyText, replyProblems, watchesAmounts } from "@/lib/kakak/reply-guard";
import { clientVersionFor, isSaveableSuggestion, needsNewerApp, toSuggestions, type KakakSuggestion, type MenuDishSuggestion } from "@/lib/kakak/suggestions";
import { KAKAK_TOOLS } from "@/lib/kakak/tools";
import { validateToolCall } from "@/lib/kakak/validate";
import { gradeCase, type ActualTurn } from "../kakak/grade";
import type { KakakTestSet } from "../kakak/types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = "11111111-1111-4111-8111-111111111111";

const item = (n: number, name: string, over: Record<string, unknown> = {}) => ({
  id: id(n),
  name,
  scope: "home",
  created_at: `2026-01-${String(n % 28).padStart(2, "0")}`,
  category: "pantry",
  stock_status: "ok",
  track_amount: false,
  unit: "pcs",
  quantity: 0,
  ...over,
});

let lineSeq = 0;
const line = (fields: Partial<ContextRecipeRow["ingredients"][number]>) => ({
  id: id(900 + ++lineSeq),
  item_id: null,
  name: "Garam",
  name_id: null,
  amount: null,
  unit: null,
  position: lineSeq,
  ...fields,
});

const recipe = (n: number, name: string, ingredients: ContextRecipeRow["ingredients"], over: Partial<ContextRecipeRow> = {}): ContextRecipeRow => ({
  id: id(n),
  name,
  name_id: null,
  servings: 4,
  written_in: "id",
  created_at: `2026-02-${String(n % 28).padStart(2, "0")}`,
  ingredients,
  ...over,
});

const rows: ContextRows = {
  staff: [{ id: id(1), name: "Dewi", created_at: "2026-01-01", user_id: OWNER, archived_at: null }],
  pets: [],
  schedules: [],
  rooms: [],
  items: [
    item(30, "Ayam", { category: "fresh_food", track_amount: true, unit: "kg", quantity: 0.5, stock_status: "ok" }),
    item(31, "Santan", { stock_status: "out" }),
    item(32, "Beras"),
    item(33, "Bihun", { stock_status: "low" }),
  ],
  recipes: [
    recipe(41, "Opor ayam", [line({ item_id: id(30), name: "Ayam", amount: 1, unit: "kg" }), line({ item_id: id(31), name: "Santan", amount: 400, unit: "ml" }), line({ name: "Serai", amount: 2, unit: "batang" })]),
    recipe(42, "Nasi goreng", [line({ item_id: id(32), name: "Beras", amount: 500, unit: "g" })]),
    recipe(43, "Chicken soto", [line({ item_id: id(33), name: "Bihun" })], { written_in: "en", name_id: "Soto ayam" }),
    recipe(44, "Sayur asem", [line({ name: "Asam jawa" })]),
  ],
  menu: [
    { day: "2026-11-12", meal: "lunch", title: "Nasi goreng", recipe_id: id(42), position: 0, cooked_at: null },
    { day: "2026-11-11", meal: "breakfast", title: "Bubur", recipe_id: null, position: 0, cooked_at: "2026-11-11T00:30:00Z" },
    { day: "2026-11-20", meal: "dinner", title: "Too late", recipe_id: null, position: 0, cooked_at: null },
    { day: "2026-11-10", meal: "dinner", title: "Yesterday", recipe_id: null, position: 0, cooked_at: null },
  ],
} as ContextRows;

// Wednesday 11 November 2026.
const opts = { today: "2026-11-11", now: "08:30", ownerLocale: "en" as const, callerUserId: OWNER };
const built = (over: Partial<ContextRows> = {}, locale: "en" | "id" = "en") => buildContext({ ...rows, ...over }, { ...opts, ownerLocale: locale });

const plan = (over: Record<string, unknown> = {}) => ({
  recipe: "D1",
  dish_name: "none",
  day: "2026-11-11",
  meal: "dinner",
  servings: 0,
  add_missing: true,
  put_on_menu: true,
  ...over,
});

describe("what Kakak is told", () => {
  it("each saved recipe as the app checked it, by name only, with amounts only while Kitchen amounts is on", () => {
    const { household, refs } = built();
    // Listed ready first, then fewest missing (PR C1); the D-refs keep their age order.
    expect(household.recipes).toEqual([
      { ref: "D2", name: "Nasi goreng", state: "ready", missing: [], unchecked: [] },
      { ref: "D1", name: "Opor ayam", state: "missing", missing: ["Santan"], onList: ["Santan"], unchecked: ["Serai"] },
      { ref: "D3", name: "Chicken soto", nameId: "Soto ayam", state: "missing", missing: ["Bihun"], onList: ["Bihun"], unchecked: [] },
      { ref: "D4", name: "Sayur asem", state: "unknown", missing: [], unchecked: ["Asam jawa"] },
    ]);
    // Kitchen amounts on: 0.5 kg of chicken is short of 1 kg, though it is Enough.
    const on = built({ kitchenOn: true, featuresRead: true });
    expect(on.household.recipes?.find((r) => r.ref === "D1")?.missing).toEqual(["Ayam", "Santan"]);
    // The server keeps the ids and the status each goes on the list with.
    expect(on.refs.recipes?.D1).toMatchObject({
      id: id(41),
      name: "Opor ayam",
      missing: [
        { itemId: id(30), name: "Ayam", status: "low", listed: false },
        { itemId: id(31), name: "Santan", status: "out", listed: true },
      ],
    });
    expect(refs.recipes?.D3.missing).toEqual([{ itemId: id(33), name: "Bihun", status: "low", listed: true }]);
  });

  it("names a missing item with its variant, as the recipe screen does (Codex, PR #156)", () => {
    const withVariant = built({ items: rows.items.map((i) => (i.id === id(31) ? { ...i, variant: "Kara" } : i)) });
    expect(withVariant.household.recipes?.find((r) => r.ref === "D1")?.missing).toEqual(["Santan (Kara)"]);
    expect(withVariant.refs.recipes?.D1.missing[0].name).toBe("Santan (Kara)");
  });

  it("the menu from today for 7 days, not cooked, in order", () => {
    expect(built().household.menu).toEqual([{ day: "2026-11-12", meal: "lunch", title: "Nasi goreng", recipe: "D2" }]);
  });

  it("renders lines with no amount, step or id, and nothing at all for a home with no recipes or menu", () => {
    const block = renderHouseholdBlock(built().household);
    expect(block).toContain("- D1: Opor ayam — missing: Santan (already on the shopping list); not checked: Serai");
    expect(block).toContain("- D2: Nasi goreng — ready");
    expect(block).toContain("- D3: Chicken soto (Soto ayam) — missing: Bihun (already on the shopping list)");
    expect(block).toContain("- D4: Sayur asem — not checked: Asam jawa");
    expect(block).toContain("- 2026-11-12 lunch: Nasi goreng (D2)");
    expect(block).not.toMatch(/400|ml|kg|batang|0000-4000/);
    const bare = renderHouseholdBlock(built({ recipes: [], menu: [] }).household);
    expect(bare).not.toContain("recipes");
    expect(bare).not.toContain("Menu, from today");
  });

  it("lists at most MAX_RECIPES_IN_BLOCK recipes and counts the rest", () => {
    const many = Array.from({ length: MAX_RECIPES_IN_BLOCK + 3 }, (_, i) => recipe(100 + i, `Masakan ${i}`, []));
    const block = renderHouseholdBlock(built({ recipes: many, menu: [] }).household);
    expect(block).toContain("- and 3 more saved recipes not listed here");
    expect(block.match(/no ingredients listed/g)).toHaveLength(MAX_RECIPES_IN_BLOCK);
  });
});

describe("plan_dish", () => {
  const household = built().household;

  it("isn't strict, closes its shape and has no nullable field (no strict union used)", () => {
    const tool = KAKAK_TOOLS.find((t) => t.name === "plan_dish")!;
    expect(tool.strict).toBeUndefined();
    expect(JSON.stringify(tool.input_schema)).not.toMatch(/"null"|anyOf/);
  });

  it("accepts a saved recipe, or a typed dish without add_missing", () => {
    expect(validateToolCall(household, "plan_dish", plan())).toEqual({ ok: true });
    expect(validateToolCall(household, "plan_dish", plan({ recipe: "D2", add_missing: false, servings: 8 }))).toEqual({ ok: true });
    expect(validateToolCall(household, "plan_dish", plan({ recipe: "none", dish_name: "Ayam bakar madu", add_missing: false }))).toEqual({ ok: true });
  });

  it.each([
    [{ recipe: "D9" }, /recipe "D9" is not a reference/],
    [{ recipe: "none" }, /both "none"/],
    [{ dish_name: "Opor" }, /dish_name must be "none"/],
    [{ recipe: "none", dish_name: "Gulai" }, /add_missing needs a saved recipe/],
    [{ recipe: "D2" }, /missing nothing/],
    [{ recipe: "D2", day: "2026-11-12", meal: "lunch", add_missing: false }, /already on the menu/],
    [{ day: "2026-11-10" }, /outside/],
    [{ meal: "supper" }, /meal must be/],
    [{ servings: 51 }, /servings/],
    [{ servings: 2.5 }, /servings/],
    [{ add_missing: "yes" }, /add_missing must be true or false/],
    [{ extra: 1 }, /unknown fields: extra/],
  ])("refuses %j", (over, error) => {
    const result = validateToolCall(household, "plan_dish", plan(over));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(error);
  });

  it("refuses a call with a field left out", () => {
    const rest: Record<string, unknown> = plan();
    delete rest.add_missing;
    const result = validateToolCall(household, "plan_dish", rest);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/missing add_missing/);
  });
});

describe("the cards", () => {
  const { household, refs, names } = built();

  it("one call is one Menu section (Fable (a)); a Buy row only for what isn't on the shopping list yet", () => {
    const cards = toSuggestions(household, refs, names, "plan_dish", plan());
    // Santan is Out, so already on the list: no Buy row; the card says "On the shopping list".
    expect(describeSuggestion(cards[0], "en").rows.map((r) => r.label)).toEqual(["What", "When"]);
    expect(cards).toEqual([
      {
        kind: "menu_dish",
        recipeId: id(41),
        title: "Opor ayam",
        day: "2026-11-11",
        meal: "dinner",
        servings: null,
        relative: "today",
        check: { state: "missing", missing: [{ name: "Santan", listed: true }], unchecked: ["Serai"] },
        missing: [],
        overflow: false,
        toBuy: [],
      },
    ]);
    for (const card of cards) expect(isSaveableSuggestion(card)).toBe(true);
  });

  it("without add_missing: the Menu card alone, saying what is missing, what is already on the list, and what isn't added", () => {
    const [dish, ...rest] = toSuggestions(household, refs, names, "plan_dish", plan({ add_missing: false, servings: 6 }));
    expect(rest).toEqual([]);
    // Santan is Out: already on the list, so nothing "not added".
    expect(dish).toMatchObject({ kind: "menu_dish", servings: 6, missing: [] });
    // The card says "Today" (Fable W5) and always carries the app's own answer (Fable S0).
    expect(describeSuggestion(dish, "en")).toEqual({
      heading: "Menu",
      rows: [
        { label: "What", value: "Opor ayam" },
        { label: "When", value: "Today · Dinner" },
        { label: "For", value: "6 servings" },
      ],
      // Owner, 20 Nov (three sections): "Missing 1: Santan", then quietly what is already on the list.
      checks: [
        { tone: "missing", text: "Missing 1: Santan" },
        { tone: "listed", text: "On the shopping list: Santan" },
        { tone: "muted", text: "Not on your list: Serai" },
      ],
      note: undefined,
    });
    const id = describeSuggestion(dish, "id");
    expect(id.rows[1]).toEqual({ label: "Kapan", value: "Hari ini · Makan malam" });
    expect(id.checks?.map((c) => c.text)).toEqual(["Kurang 1: Santan", "Sudah di daftar belanja: Santan", "Belum ada di daftar: Serai"]);
    // Something not on the list yet (Kitchen amounts on, short): a Buy row when added, the note when not.
    const on = built({ kitchenOn: true, featuresRead: true });
    const [added] = toSuggestions(on.household, on.refs, on.names, "plan_dish", plan());
    expect(describeSuggestion(added, "en").rows).toContainEqual({ label: "Buy", value: "Ayam" });
    expect(describeSuggestion(added, "en").checks?.slice(0, 2).map((c) => c.text)).toEqual(["Missing 2: Ayam, Santan", "On the shopping list: Santan"]);
    const [kept] = toSuggestions(on.household, on.refs, on.names, "plan_dish", plan({ add_missing: false }));
    expect(describeSuggestion(kept, "en").note).toBe("Missing, not added to the shopping list: Ayam.");
    expect(describeSuggestion(kept, "id").note).toBe("Kurang, tidak ditambahkan ke daftar belanja: Ayam.");
    // Tomorrow, and later: the ready line says "now".
    const [ready] = toSuggestions(household, refs, names, "plan_dish", plan({ recipe: "D2", day: "2026-11-13", add_missing: false }));
    expect(describeSuggestion(ready, "en").rows[1].value).toBe("Friday 13 Nov · Dinner");
    expect(describeSuggestion(ready, "en").checks).toEqual([{ tone: "ready", text: "Ready to cook now" }]);
    const [tomorrow] = toSuggestions(household, refs, names, "plan_dish", plan({ day: "2026-11-12", add_missing: false }));
    expect(describeSuggestion(tomorrow, "id").rows[1].value).toBe("Besok · Makan malam");
  });

  it("a typed dish has no recipe; an unknown recipe makes no card", () => {
    const typed = toSuggestions(household, refs, names, "plan_dish", plan({ recipe: "none", dish_name: "Ayam bakar madu", add_missing: false }));
    expect(typed).toEqual([
      { kind: "menu_dish", recipeId: null, title: "Ayam bakar madu", day: "2026-11-11", meal: "dinner", servings: null, relative: "today", check: null, missing: [], overflow: false, toBuy: [] },
    ]);
    expect(describeSuggestion(typed[0], "en").checks).toEqual([{ tone: "muted", text: "No saved recipe" }]);
    expect(toSuggestions(household, refs, names, "plan_dish", plan({ recipe: "D9" }))).toEqual([]);
  });

  it("keeps what the card can't add (past 10) on its note", () => {
    // Kitchen amounts on, amounts short, still Enough: none is on the list yet.
    const many = Array.from({ length: 12 }, (_, i) => item(200 + i, `Bahan ${i}`, { track_amount: true, unit: "g", quantity: 1 }));
    const big = recipe(60, "Nasi tumpeng", many.map((m) => line({ item_id: m.id, name: m.name, amount: 100, unit: "g" })));
    const b = built({ items: many, recipes: [big], menu: [], kitchenOn: true, featuresRead: true });
    const [dish, ...rest] = toSuggestions(b.household, b.refs, b.names, "plan_dish", plan());
    expect(rest).toEqual([]);
    expect((dish as Extract<KakakSuggestion, { kind: "menu_dish" }>).toBuy).toHaveLength(10);
    expect(describeSuggestion(dish, "en").rows.filter((r) => r.label === "Buy")).toHaveLength(10);
    expect(dish).toMatchObject({ missing: ["Bahan 10", "Bahan 11"], overflow: true });
    expect(describeSuggestion(dish, "en").note).toBe("Also missing, not added to the shopping list: Bahan 10, Bahan 11.");
  });

  it("checks again at the servings asked for, while Kitchen amounts is on (Codex, PR #156)", () => {
    const rice = item(70, "Beras merah", { track_amount: true, unit: "g", quantity: 600 });
    const nasi = recipe(71, "Nasi merah", [line({ item_id: rice.id, name: "Beras merah", amount: 500, unit: "g" })]);
    const b = built({ items: [rice], recipes: [nasi], menu: [], kitchenOn: true, featuresRead: true });
    expect(b.household.recipes?.[0].state).toBe("ready");
    // The recipe's own 4 servings need nothing; 8 need 1 kg.
    expect(validateToolCall(b.household, "plan_dish", plan({ servings: 0 })).ok).toBe(false);
    expect(validateToolCall(b.household, "plan_dish", plan({ servings: 8 }))).toEqual({ ok: true });
    const cards = toSuggestions(b.household, b.refs, b.names, "plan_dish", plan({ servings: 8 }));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ toBuy: [{ itemId: rice.id, name: "Beras merah", status: "low" }] });
    // Fewer servings than the recipe: nothing more to buy.
    expect(toSuggestions(b.household, b.refs, b.names, "plan_dish", plan({ servings: 2 }))[0]).toMatchObject({ toBuy: [] });
  });

  it("other tools still make one card", () => {
    expect(toSuggestions(household, refs, names, "add_to_shopping_list", { items: [{ item: "I2", status: "out", note: null, pet: null }] })).toHaveLength(1);
  });

  it("the toast names the dish; the phone refuses a bad dish card", () => {
    const cards = toSuggestions(household, refs, names, "plan_dish", plan());
    // Fable W6: what was saved, and when.
    expect(savedSummary(cards, "en")).toBe("Saved — Opor ayam, tonight");
    expect(savedSummary(cards, "id")).toBe("Tersimpan — Opor ayam, malam ini");
    const dish = cards[0] as Extract<KakakSuggestion, { kind: "menu_dish" }>;
    expect(isSaveableSuggestion({ ...dish, meal: "supper" })).toBe(false);
    expect(isSaveableSuggestion({ ...dish, recipeId: "D1" })).toBe(false);
    expect(isSaveableSuggestion({ ...dish, servings: 0 })).toBe(false);
    expect(isSaveableSuggestion({ ...dish, title: "" })).toBe(false);
    expect(isSaveableSuggestion({ ...dish, toBuy: [{ itemId: "I1", name: "Santan", status: "out" }] })).toBe(false);
  });

  it("is sent only to a page that can draw it (version 4)", () => {
    const [dish] = toSuggestions(household, refs, names, "plan_dish", plan());
    expect(KAKAK_CLIENT_VERSION).toBe(5);
    expect(clientVersionFor(dish)).toBe(4);
    expect(needsNewerApp(dish, 3)).toBe(true);
    expect(needsNewerApp(dish, 4)).toBe(false);
  });
});

describe("the reply guard and amounts", () => {
  it("watches beside a dish card, or in a reply that names a saved recipe", () => {
    expect(watchesAmounts("For opor, you have everything", [], true)).toBe(true);
    expect(watchesAmounts("Opor ayam needs 400 ml of santan", ["Opor ayam"], false)).toBe(true);
    expect(watchesAmounts("I'll put 2 kg of brown rice in the cupboard", ["Opor ayam"], false)).toBe(false);
  });

  it("drops a line with an amount beside the card, and sends a plain reply back once, saying why", () => {
    expect(guardReplyText("suggestions", "Opor needs 400 ml santan.", "en", { noAmounts: true }).text).toBe("");
    expect(guardReplyText("suggestions", "For opor, you have everything but coconut milk.", "en", { noAmounts: true }).text).toBe(
      "For opor, you have everything but coconut milk.",
    );
    expect(guardReplyText("suggestions", "Opor needs 400 ml santan.", "en").tells).toEqual([]);
    const problems = replyProblems("Untuk opor ayam perlu santan 2 kaleng.", "id", { noAmounts: true });
    expect(problems).toEqual(["amount"]);
    expect(correctionFor(problems, "id")).toContain("never given amounts");
  });

  it("drops a D reference like any other", () => {
    expect(guardReplyText("message", "D1 is missing santan.", "en").tells).toContain("reference");
  });
});

describe("practice mode", () => {
  it("answers \"Masak apa malam ini?\" from the block's order, with no card (PR C1)", async () => {
    const { household, refs, names } = built({}, "id");
    const deps: TurnDeps = {
      client: practiceClient(household),
      model: "claude-opus-5-5",
      effort: "low",
      household,
      refs,
      names,
      begin: async () => ({ ok: true, requestId: id(850), callsLeft: 40 }),
      record: async () => undefined,
    };
    const result: TurnResult = await runKakakTurn(deps, null, "Masak apa malam ini?");
    if (result.kind !== "message") throw new Error(`expected a message, got ${result.kind}`);
    expect(result.text).toBe("(Latihan) Malam ini bisa masak: Nasi goreng, Opor ayam (kurang Santan), Chicken soto (kurang Bihun).");
  });

  it("checks a saved recipe and offers the two cards, with no AI", async () => {
    const { household, refs, names } = built({}, "id");
    let n = 0;
    const deps: TurnDeps = {
      client: practiceClient(household),
      model: "claude-opus-5-5",
      effort: "low",
      household,
      refs,
      names,
      begin: async () => ({ ok: true, requestId: id(800 + ++n), callsLeft: 40 }),
      record: async () => undefined,
    };
    const result: TurnResult = await runKakakTurn(deps, null, "Malam ini kita masak opor. Bahannya lengkap?");
    if (result.kind !== "suggestions") throw new Error(`expected suggestions, got ${result.kind}`);
    expect(result.text).toBe("(Latihan) Untuk opor ayam, semua ada kecuali Santan.");
    expect(result.items.map((i) => i.kind)).toEqual(["menu_dish"]);
  });
});

describe("the eval's Can we cook it? cases", () => {
  const root = join(process.cwd(), "tests", "kakak");
  const evalHousehold = JSON.parse(readFileSync(join(root, "household.json"), "utf8")) as KakakHousehold;
  const testSet = JSON.parse(readFileSync(join(root, "test-set.json"), "utf8")) as KakakTestSet;
  const kase = (cid: string) => testSet.cases.find((c) => c.id === cid)!;
  const card = (text: string, input: Record<string, unknown>): ActualTurn => ({ kind: "suggestions", text, calls: [{ name: "plan_dish", input }] });

  it("passes the film's sentence with one line and one card, and fails a made-up amount as a must-never", () => {
    const k161 = kase("K161");
    const good = card("Untuk opor, semua ada kecuali santan.", plan());
    expect(gradeCase(evalHousehold, k161, [good])).toMatchObject({ pass: true, mustNever: [] });
    const amount = gradeCase(evalHousehold, k161, [card("Untuk opor perlu 400 ml santan.", plan())]);
    expect(amount.pass).toBe(false);
    expect(amount.mustNever.join(" ")).toContain("amount");
    expect(gradeCase(evalHousehold, k161, [card("Bahan opor lengkap.", plan())]).failures.join(" ")).toContain("santan");
  });

  it("fails a guessed ingredient list for a dish with no saved recipe", () => {
    const k167 = kase("K167");
    const fine: ActualTurn = { kind: "message", calls: [], text: "Kakak belum punya resep gulai kambing. Tambahkan di Dapur → Menu, nanti Kakak bisa cek." };
    expect(gradeCase(evalHousehold, k167, [fine]).pass).toBe(true);
    const guessed = gradeCase(evalHousehold, k167, [{ ...fine, text: "Biasanya perlu santan, jahe dan bawang. Resep bisa ditambah di Dapur → Menu." }]);
    expect(guessed.mustNever.join(" ")).toContain("named an ingredient no recipe lists");
  });

  it("counts an invented recipe reference as a must-never", () => {
    const result = gradeCase(evalHousehold, kase("K173"), [card("Of course.", plan({ recipe: "D9", day: "2026-11-15", meal: "lunch" }))]);
    expect(result.mustNever.join(" ")).toContain('invented reference recipe="D9"');
  });
});

describe("the film's sentence: two chores and a dish from one turn (owner, 20 Nov, decision 7)", () => {
  it("one turn returns both chores and plan_dish's two cards, all saveable", async () => {
    const withSari = built({
      staff: [
        { id: id(1), name: "Dewi", created_at: "2026-01-01", user_id: OWNER, archived_at: null },
        { id: id(2), name: "Sari", created_at: "2026-01-02", user_id: null, archived_at: null },
        { id: id(3), name: "Joko", created_at: "2026-01-03", user_id: null, archived_at: null },
      ],
      rooms: [{ id: id(20), name: "Teras", created_at: "2026-01-01" }],
    });
    const chore = (over: Record<string, unknown>) => ({
      title: "Pel teras",
      title_en: "Mop the terrace",
      category: "cleaning",
      assignee: "S1",
      due_date: "2026-11-11",
      due_time: null,
      recurrence: "daily",
      recurrence_until: null,
      requires_supervision: false,
      room: "R1",
      new_room_name: null,
      new_room_floor: null,
      notes: null,
      remind_days_before: null,
      ...over,
    });
    const content = [
      { type: "text", text: "Of course. Sari mops the terrace every morning, Joko picks up Maya at 1, and for opor you have everything but Santan." },
      { type: "tool_use", id: "toolu_1", name: "create_chore", input: chore({}) },
      {
        type: "tool_use",
        id: "toolu_2",
        name: "create_chore",
        input: chore({ title: "Jemput Maya", title_en: "Pick up Maya", category: "errand", assignee: "S2", due_time: "13:00", recurrence: "none", room: null }),
      },
      { type: "tool_use", id: "toolu_3", name: "plan_dish", input: plan() },
    ];
    const fetch = async () =>
      new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content,
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const client = new Anthropic({ apiKey: "k", authToken: null, baseURL: "http://fake.test", maxRetries: 0, fetch });
    const deps: TurnDeps = {
      client,
      model: "claude-opus-5-5",
      effort: "medium",
      household: withSari.household,
      refs: withSari.refs,
      names: withSari.names,
      begin: async () => ({ ok: true, requestId: id(700), callsLeft: 5 }),
      record: async () => undefined,
    };
    const result = await runKakakTurn(deps, null, "Kak, Sari mops the terrace every morning. Joko picks up Maya at 1. Opor tonight: do we have everything?");
    if (result.kind !== "suggestions") throw new Error(`expected suggestions, got ${result.kind}`);
    // Fable (a): three sections for three asks.
    expect(result.items.map((i) => i.kind)).toEqual(["chore", "chore", "menu_dish"]);
    for (const item of result.items) expect(isSaveableSuggestion(item)).toBe(true);
    expect(result.text).toContain("everything but Santan");
  });
});

describe("her answer is never missing (paid run 44705966410, 20 Nov)", () => {
  const dish = (check: MenuDishSuggestion["check"], relative: MenuDishSuggestion["relative"] = "today"): MenuDishSuggestion => ({
    kind: "menu_dish",
    recipeId: id(9),
    title: "Opor ayam",
    day: "2026-11-11",
    meal: "dinner",
    servings: null,
    relative,
    check,
    missing: [],
  });

  it("words the app's own check the way her instructions do, in the owner's language", () => {
    const missing = dish({ state: "missing", missing: [{ name: "Santan", listed: true }], unchecked: ["Serai"] });
    expect(dishAnswerLine([missing], "en")).toBe(
      "For Opor ayam, you have everything but Santan. Santan is already on the shopping list. I couldn't check Serai; it isn't on your list.",
    );
    expect(dishAnswerLine([missing], "id")).toBe(
      "Untuk Opor ayam, semua ada kecuali Santan. Santan sudah ada di daftar belanja. Serai belum bisa Kakak cek; belum ada di daftar.",
    );
    // Ready with something unchecked never says "everything" (Codex, PR #156).
    const readyButSerai = dish({ state: "ready", missing: [], unchecked: ["Serai"] });
    expect(dishAnswerLine([readyButSerai], "en")).toBe("For Opor ayam, everything on your list is there. I couldn't check Serai; it isn't on your list.");
    expect(dishAnswerLine([readyButSerai], "id")).toBe("Untuk Opor ayam, semua yang ada di daftar tersedia. Serai belum bisa Kakak cek; belum ada di daftar.");
    const two = dish({ state: "missing", missing: [{ name: "Ayam", listed: false }, { name: "Bihun", listed: false }], unchecked: [] });
    expect(dishAnswerLine([two], "en")).toBe("For Opor ayam, you have everything but Ayam and Bihun.");
    expect(dishAnswerLine([dish({ state: "ready", missing: [], unchecked: [] })], "id")).toBe("Bahan Opor ayam lengkap.");
    expect(dishAnswerLine([dish({ state: "ready", missing: [], unchecked: [] }, "tomorrow")], "en")).toBe("You have everything for Opor ayam right now.");
    expect(dishAnswerLine([dish({ state: "unknown", missing: [], unchecked: ["Serai"] })], "en")).toContain("couldn't check");
    // A typed dish has no check, so nothing to say; never an amount.
    expect(dishAnswerLine([dish(null)], "en")).toBe("");
  });

  async function turnWith(content: unknown[], text: string) {
    const fetch = async () =>
      new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content,
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const client = new Anthropic({ apiKey: "k", authToken: null, baseURL: "http://fake.test", maxRetries: 0, fetch });
    const b = built();
    const deps: TurnDeps = {
      client,
      model: "claude-opus-5-5",
      effort: "medium",
      household: b.household,
      refs: b.refs,
      names: b.names,
      begin: async () => ({ ok: true, requestId: id(701), callsLeft: 5 }),
      record: async () => undefined,
    };
    return runKakakTurn(deps, null, text);
  }

  it("a card with no line gets the app's answer, not \"Here's what I'll add:\"", async () => {
    const result = await turnWith([{ type: "tool_use", id: "toolu_1", name: "plan_dish", input: plan() }], "Opor tonight, do we have everything?");
    if (result.kind !== "suggestions") throw new Error(`expected suggestions, got ${result.kind}`);
    expect(result.text).toMatch(/Opor ayam/);
    expect(result.text).not.toMatch(/\d+\s*(ml|g|kg)\b/);
  });

  it("a line too long beside one card is replaced by the app's answer", async () => {
    const long = "For opor ayam you have everything but Santan, which is already on the shopping list, and I couldn't check the lemongrass because it isn't on your list yet, so you may want to add it under Kitchen and check again before tonight.";
    const result = await turnWith(
      [{ type: "text", text: long }, { type: "tool_use", id: "toolu_1", name: "plan_dish", input: plan() }],
      "Opor tonight, do we have everything?",
    );
    if (result.kind !== "suggestions") throw new Error(`expected suggestions, got ${result.kind}`);
    expect(result.text).not.toBe(long);
    expect(result.text).toMatch(/Opor ayam/);
  });

  it("the paid run gives the same answer from the household block (K161)", () => {
    const fixture = JSON.parse(readFileSync(join(__dirname, "../kakak/household.json"), "utf8")) as KakakHousehold;
    const household = { ...fixture, ownerLocale: "id" as const };
    const call = { name: "plan_dish", input: { recipe: "D1", dish_name: "none", day: household.today, meal: "dinner", servings: 0, add_missing: true } };
    expect(dishAnswerFromBlock(household, [call])).toBe(
      "Untuk Opor ayam, semua ada kecuali Santan. Santan sudah ada di daftar belanja. Serai belum bisa Kakak cek; belum ada di daftar.",
    );
    // Another number of servings is checked again by the app only.
    expect(dishAnswerFromBlock(household, [{ ...call, input: { ...call.input, servings: 8 } }])).toBe("");
  });

  it("beside several cards the line still fits 200: the prompt's model for the film's sentence", () => {
    const line = "Baik. Kakak siapkan pel teras untuk Sari, jemput Maya untuk Joko, dan opor malam ini. Semua ada kecuali Santan.";
    expect(line.length).toBeLessThanOrEqual(200);
    expect(guardReplyText("suggestions", line, "id").text).toBe(line);
    // Too long is still dropped (Fable pass 30 keeps the cap); the app's answer covers it.
    const long = `${line} Santan sudah ada di daftar belanja, dan Serai belum bisa Kakak cek karena belum ada di daftar, jadi mungkin perlu ditambahkan dulu.`;
    expect(long.length).toBeGreaterThan(200);
    expect(guardReplyText("suggestions", long, "id").text).toBe("");
  });
});

describe("a dish with no saved recipe gets a card only when the owner asked to plan it (paid run 44723348875, K167)", () => {
  it("refuses recipe \"none\" with put_on_menu false, and accepts it with true", () => {
    const { household } = built({}, "id");
    const typed = plan({ recipe: "none", dish_name: "Gulai kambing", add_missing: false });
    expect(validateToolCall(household, "plan_dish", typed)).toEqual({ ok: true });
    const asked = validateToolCall(household, "plan_dish", { ...typed, put_on_menu: false });
    expect(asked.ok).toBe(false);
    if (!asked.ok) expect(asked.errors.join(" ")).toContain("only when the owner asked to cook or plan it");
  });

  it("a saved recipe may still be checked with a card when the owner only asked", () => {
    const { household } = built({}, "id");
    expect(validateToolCall(household, "plan_dish", plan({ put_on_menu: false }))).toEqual({ ok: true });
  });

  it("put_on_menu is required, as every other field", () => {
    const { household } = built({}, "id");
    const { put_on_menu: _dropped, ...without } = plan();
    void _dropped;
    expect(validateToolCall(household, "plan_dish", without).ok).toBe(false);
  });
});

describe("what can we cook tonight? (PR C1)", () => {
  // Ingredients on: Kitchen amounts and Food at home, so a use-by date is shown and sent.
  const ingredientsOn = { kitchenOn: true, foodOn: true, featuresRead: true } as Partial<ContextRows>;
  const withDates = (ayam: string | null, beras: string | null, over: Record<string, unknown> = {}) =>
    [
      item(30, "Ayam", { category: "fresh_food", track_amount: true, unit: "kg", quantity: 2, stock_status: "ok", expires_on: ayam, ...over }),
      item(31, "Santan", { stock_status: "ok" }),
      item(32, "Beras", { expires_on: beras }),
      item(33, "Bihun", { stock_status: "low" }),
    ] as ContextRows["items"];

  it("lists ready first, then the fewest missing; the D-refs keep their age order", () => {
    const on = built({ kitchenOn: true, featuresRead: true });
    // Opor misses two with amounts on (0.5 kg of 1 kg chicken, and Santan); soto misses one.
    expect(on.household.recipes?.map((r) => r.ref)).toEqual(["D2", "D3", "D1", "D4"]);
    expect(on.refs.recipes?.D1.name).toBe("Opor ayam");
  });

  it("marks what uses an ingredient expiring within two days, and puts it first in its group", () => {
    const { household } = built({ ...ingredientsOn, items: withDates("2026-11-12", null) });
    // Opor (ready now: 2 kg of chicken, santan Enough) uses Ayam tomorrow: before Nasi goreng.
    expect(household.recipes?.map((r) => r.ref).slice(0, 2)).toEqual(["D1", "D2"]);
    expect(household.recipes?.[0].usesSoon).toEqual([{ name: "Ayam", expiresOn: "2026-11-12" }]);
    const block = renderHouseholdBlock(household);
    expect(block).toContain("- D1: Opor ayam — ready; not checked: Serai; uses soon: Ayam (expires 2026-11-12)");
    expect(block).toContain("Listed ready first, then fewest missing.");
  });

  it("never puts a recipe missing more ahead of one missing less, even when it uses something soon (Codex, PR #162)", () => {
    // Santan Out: opor misses Santan (one) and uses Ayam tomorrow; soto misses Bihun (one). Equal: opor first.
    const equal = built({ ...ingredientsOn, items: withDates("2026-11-12", null).map((i) => (i.name === "Santan" ? { ...i, stock_status: "out" } : i)) });
    expect(equal.household.recipes?.filter((r) => r.state === "missing").map((r) => r.ref)).toEqual(["D1", "D3"]);
    // Ayam short too (amounts on): opor misses two, so soto (one) goes first despite the date.
    const short = built({
      ...ingredientsOn,
      items: withDates("2026-11-12", null, { quantity: 0.5 }).map((i) => (i.name === "Santan" ? { ...i, stock_status: "out" } : i)),
    });
    expect(short.household.recipes?.filter((r) => r.state === "missing").map((r) => r.ref)).toEqual(["D3", "D1"]);
  });

  it("never for a date in the past, past two days, an item that is out, or while Ingredients are off", () => {
    for (const ayam of ["2026-11-10", "2026-11-14"]) {
      expect(built({ ...ingredientsOn, items: withDates(ayam, null) }).household.recipes?.some((r) => r.usesSoon)).toBe(false);
    }
    expect(built({ ...ingredientsOn, items: withDates("2026-11-13", null) }).household.recipes?.find((r) => r.ref === "D1")?.usesSoon).toHaveLength(1);
    expect(built({ ...ingredientsOn, items: withDates("2026-11-12", null, { stock_status: "out" }) }).household.recipes?.some((r) => r.usesSoon)).toBe(false);
    expect(built({ kitchenOn: true, foodOn: false, featuresRead: true, items: withDates("2026-11-12", null) }).household.recipes?.some((r) => r.usesSoon)).toBe(false);
    expect(built({ items: withDates("2026-11-12", null) }).household.recipes?.some((r) => r.usesSoon)).toBe(false);
  });

  it("past the cap of 40, the most useful recipes are the ones listed", () => {
    const many = Array.from({ length: MAX_RECIPES_IN_BLOCK }, (_, i) => recipe(100 + i, `Masakan ${i + 1}`, [line({ item_id: id(31), name: "Santan" })]));
    // The newest recipe is the only ready one: it still makes the list.
    const ready = recipe(200, "Nasi goreng baru", [line({ item_id: id(32), name: "Beras" })], { created_at: "2026-12-01" });
    const block = renderHouseholdBlock(built({ recipes: [...many, ready] }).household);
    expect(block).toContain("Nasi goreng baru — ready");
    expect(block).toContain("and 1 more saved recipes not listed here");
  });

  it("her instructions answer \"what can we cook tonight?\" with a short reply, ready first", () => {
    const system = JSON.stringify(kakakSystem(built().household));
    expect(system).toContain("Masak apa malam ini?");
    expect(system).toContain("Never call a recipe ready unless the block says ready");
  });
});

describe("Kakak sees ready-to-eat food (E1)", () => {
  const foods = [
    { name: "Lapis legit", kept_in: "counter", expires_on: "2026-11-12", expiry_unknown: false, created_at: "2026-11-10T01:00:00Z" },
    { name: "Rendang", kept_in: "fridge", expires_on: "2026-11-11", expiry_unknown: false, created_at: "2026-11-09T01:00:00Z" },
    { name: "Sop", kept_in: "fridge", expires_on: "2026-11-10", expiry_unknown: false, created_at: "2026-11-08T01:00:00Z" },
    { name: null, kept_in: "fridge", expires_on: null, expiry_unknown: true, created_at: "2026-11-10T02:00:00Z" },
    { name: "Kue", kept_in: "attic", expires_on: null, expiry_unknown: false, created_at: "2026-11-10T03:00:00Z" },
  ];

  it("lists name, place and date only, soonest first, in the block", () => {
    const { household } = built({ foods, foodOn: true, featuresRead: true } as Partial<ContextRows>);
    expect(household.foods?.map((f) => f.name)).toEqual(["Sop", "Rendang", "Lapis legit", "Kue", null]);
    // An unknown place is dropped, never guessed.
    expect(household.foods?.find((f) => f.name === "Kue")?.keptIn).toBeNull();
    const block = renderHouseholdBlock(household);
    expect(block).toContain("Ready to eat at home (Dapur / Kitchen → Makanan / Food), soonest first:");
    expect(block).toContain("- Sop · fridge · past its date (2026-11-10)");
    expect(block).toContain("- Rendang · fridge · expires today (2026-11-11)");
    expect(block).toContain("- Lapis legit · counter · expires 2026-11-12");
    expect(block).toContain("- a dish saved with a photo only, no name · fridge · date not known");
    expect(block).toContain("- Kue · no date noted");
  });

  it("says when there is nothing, and sends nothing while Food at home is off or the read failed", () => {
    expect(renderHouseholdBlock(built({ foods: [], foodOn: true, featuresRead: true } as Partial<ContextRows>).household)).toContain(
      "Ready to eat at home (Dapur / Kitchen → Makanan / Food): nothing.",
    );
    const off = built({ foods, foodOn: false, featuresRead: true } as Partial<ContextRows>).household;
    expect(off.foods).toBeUndefined();
    expect(renderHouseholdBlock(off)).not.toContain("Rendang");
    expect(built({ foodOn: true, featuresRead: true }).household.foods).toBeUndefined();
    // The switches not read: nothing sent, never assumed on (Codex, PR #166).
    expect(built({ foods, foodOn: null, featuresRead: false } as Partial<ContextRows>).household.foods).toBeUndefined();
  });

  it("her instructions answer \"what should we eat?\" from the list, and never suggest food past its date", () => {
    const system = JSON.stringify(kakakSystem(built().household));
    expect(system).toContain("Ready to eat at home");
    expect(system).toContain("never suggest eating it");
  });
});

describe("\"I bought it\" and what is running low (E2)", () => {
  it("tells Kakak each listed item's status, and that nothing means Enough", () => {
    const { household } = built();
    const block = renderHouseholdBlock(household);
    expect(household.statusesRead).toBe(true);
    expect(block).toContain("nothing means Enough; never an amount");
    expect(block).toContain("- I2: Santan · out");
    expect(block).toContain("- I4: Bihun · running low");
    expect(block).toMatch(/- I3: Beras\n/);
  });

  it("bought is status ok on a listed item that is low or out, with its own card and Undo path", () => {
    const { household, refs, names } = built({}, "id");
    expect(validateToolCall(household, "add_to_shopping_list", { items: [{ item: "I2", status: "ok", note: null, pet: null }] })).toEqual({ ok: true });
    // Already Enough: she says so instead.
    const enough = validateToolCall(household, "add_to_shopping_list", { items: [{ item: "I3", status: "ok", note: null, pet: null }] });
    expect(enough.ok).toBe(false);
    // A new note can't be bought.
    expect(validateToolCall(household, "add_to_shopping_list", { items: [{ item: null, status: "ok", note: "Gula", pet: null }] }).ok).toBe(false);
    // Counted by amount with Kitchen amounts on: Bought in the app asks how much (review, E2).
    const counted = built({ kitchenOn: true, featuresRead: true, items: rows.items.map((i) => (i.name === "Santan" ? { ...i, track_amount: true, unit: "ml" } : i)) });
    const ref = counted.household.items.find((i) => i.name === "Santan")!.ref;
    const refused = validateToolCall(counted.household, "add_to_shopping_list", { items: [{ item: ref, status: "ok", note: null, pet: null }] });
    expect(refused.ok).toBe(false);
    expect(renderHouseholdBlock(counted.household)).not.toContain("tracked");
    const [card] = toSuggestions(household, refs, names, "add_to_shopping_list", { items: [{ item: "I2", status: "ok", note: null, pet: null }] });
    expect(card).toMatchObject({ kind: "shopping", entries: [{ type: "item", name: "Santan", status: "ok" }] });
    expect(clientVersionFor(card)).toBe(5);
    // The page's own check before saving lets it through (Codex, PR #168).
    expect(isSaveableSuggestion(card)).toBe(true);
    expect(needsNewerApp(card, 4)).toBe(true);
    const shown = describeSuggestion(card, "id");
    expect(shown.rows).toEqual([{ label: "Sudah dibeli", value: "Santan · Masih ada" }]);
  });
});
