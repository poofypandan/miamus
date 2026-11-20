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
import { runKakakTurn, type TurnDeps, type TurnResult } from "@/lib/kakak/engine";
import { MAX_RECIPES_IN_BLOCK, renderHouseholdBlock, type KakakHousehold } from "@/lib/kakak/household";
import { practiceClient } from "@/lib/kakak/practice";
import { correctionFor, guardReplyText, replyProblems, watchesAmounts } from "@/lib/kakak/reply-guard";
import { clientVersionFor, isSaveableSuggestion, needsNewerApp, toSuggestions, type KakakSuggestion } from "@/lib/kakak/suggestions";
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
  ...over,
});

describe("what Kakak is told", () => {
  it("each saved recipe as the app checked it, by name only, with amounts only while Kitchen amounts is on", () => {
    const { household, refs } = built();
    expect(household.recipes).toEqual([
      { ref: "D1", name: "Opor ayam", state: "missing", missing: ["Santan"], unchecked: ["Serai"] },
      { ref: "D2", name: "Nasi goreng", state: "ready", missing: [], unchecked: [] },
      { ref: "D3", name: "Chicken soto", nameId: "Soto ayam", state: "missing", missing: ["Bihun"], unchecked: [] },
      { ref: "D4", name: "Sayur asem", state: "unknown", missing: [], unchecked: ["Asam jawa"] },
    ]);
    // Kitchen amounts on: 0.5 kg of chicken is short of 1 kg, though it is Enough.
    const on = built({ kitchenOn: true, featuresRead: true });
    expect(on.household.recipes?.[0].missing).toEqual(["Ayam", "Santan"]);
    // The server keeps the ids and the status each goes on the list with.
    expect(on.refs.recipes?.D1).toEqual({
      id: id(41),
      name: "Opor ayam",
      missing: [
        { itemId: id(30), name: "Ayam", status: "low" },
        { itemId: id(31), name: "Santan", status: "out" },
      ],
    });
    expect(refs.recipes?.D3.missing).toEqual([{ itemId: id(33), name: "Bihun", status: "low" }]);
  });

  it("names a missing item with its variant, as the recipe screen does (Codex, PR #156)", () => {
    const withVariant = built({ items: rows.items.map((i) => (i.id === id(31) ? { ...i, variant: "Kara" } : i)) });
    expect(withVariant.household.recipes?.[0].missing).toEqual(["Santan (Kara)"]);
    expect(withVariant.refs.recipes?.D1.missing[0].name).toBe("Santan (Kara)");
  });

  it("the menu from today for 7 days, not cooked, in order", () => {
    expect(built().household.menu).toEqual([{ day: "2026-11-12", meal: "lunch", title: "Nasi goreng", recipe: "D2" }]);
  });

  it("renders lines with no amount, step or id, and nothing at all for a home with no recipes or menu", () => {
    const block = renderHouseholdBlock(built().household);
    expect(block).toContain("- D1: Opor ayam — missing: Santan; not checked: Serai");
    expect(block).toContain("- D2: Nasi goreng — ready");
    expect(block).toContain("- D3: Chicken soto (Soto ayam) — missing: Bihun");
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

  it("one call is the Menu card and, with add_missing, a Shopping list card the server fills from the app's check", () => {
    const cards = toSuggestions(household, refs, names, "plan_dish", plan());
    expect(cards).toEqual([
      { kind: "menu_dish", recipeId: id(41), title: "Opor ayam", day: "2026-11-11", meal: "dinner", servings: null, missing: [] },
      { kind: "shopping", entries: [{ type: "item", itemId: id(31), name: "Santan", status: "out" }] },
    ]);
    for (const card of cards) expect(isSaveableSuggestion(card)).toBe(true);
  });

  it("without add_missing: the Menu card alone, saying what is missing and that it isn't added", () => {
    const [dish, ...rest] = toSuggestions(household, refs, names, "plan_dish", plan({ add_missing: false, servings: 6 }));
    expect(rest).toEqual([]);
    expect(dish).toMatchObject({ kind: "menu_dish", servings: 6, missing: ["Santan"] });
    expect(describeSuggestion(dish, "en")).toEqual({
      heading: "Menu",
      rows: [
        { label: "What", value: "Opor ayam" },
        { label: "When", value: "Wednesday 11 Nov · Dinner" },
        { label: "For", value: "6 servings" },
      ],
      note: "Also missing, not added to the shopping list: Santan.",
    });
    expect(describeSuggestion(dish, "id").rows[1]).toEqual({ label: "Kapan", value: "Rabu 11 Nov · Makan malam" });
  });

  it("a typed dish has no recipe; an unknown recipe makes no card", () => {
    expect(toSuggestions(household, refs, names, "plan_dish", plan({ recipe: "none", dish_name: "Ayam bakar madu", add_missing: false }))).toEqual([
      { kind: "menu_dish", recipeId: null, title: "Ayam bakar madu", day: "2026-11-11", meal: "dinner", servings: null, missing: [] },
    ]);
    expect(toSuggestions(household, refs, names, "plan_dish", plan({ recipe: "D9" }))).toEqual([]);
  });

  it("keeps what the shopping card can't hold (past 10) on the Menu card's note", () => {
    const many = Array.from({ length: 12 }, (_, i) => item(200 + i, `Bahan ${i}`, { stock_status: "out" }));
    const big = recipe(60, "Nasi tumpeng", many.map((m) => line({ item_id: m.id, name: m.name })));
    const b = built({ items: many, recipes: [big], menu: [] });
    const [dish, shopping] = toSuggestions(b.household, b.refs, b.names, "plan_dish", plan());
    expect(shopping).toMatchObject({ kind: "shopping" });
    expect((shopping as Extract<KakakSuggestion, { kind: "shopping" }>).entries).toHaveLength(10);
    expect(dish).toMatchObject({ missing: ["Bahan 10", "Bahan 11"] });
  });

  it("other tools still make one card", () => {
    expect(toSuggestions(household, refs, names, "add_to_shopping_list", { items: [{ item: "I2", status: "out", note: null, pet: null }] })).toHaveLength(1);
  });

  it("the toast names the dish; the phone refuses a bad dish card", () => {
    const cards = toSuggestions(household, refs, names, "plan_dish", plan());
    expect(savedSummary(cards, "en")).toBe("Saved — Opor ayam and 1 more");
    expect(savedSummary(cards, "id")).toBe("Tersimpan — Opor ayam dan 1 lainnya");
    const dish = cards[0] as Extract<KakakSuggestion, { kind: "menu_dish" }>;
    expect(isSaveableSuggestion({ ...dish, meal: "supper" })).toBe(false);
    expect(isSaveableSuggestion({ ...dish, recipeId: "D1" })).toBe(false);
    expect(isSaveableSuggestion({ ...dish, servings: 0 })).toBe(false);
    expect(isSaveableSuggestion({ ...dish, title: "" })).toBe(false);
  });

  it("is sent only to a page that can draw it (version 4)", () => {
    const [dish] = toSuggestions(household, refs, names, "plan_dish", plan());
    expect(KAKAK_CLIENT_VERSION).toBe(4);
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
    expect(result.items.map((i) => i.kind)).toEqual(["menu_dish", "shopping"]);
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
    expect(result.items.map((i) => i.kind)).toEqual(["chore", "chore", "menu_dish", "shopping"]);
    for (const item of result.items) expect(isSaveableSuggestion(item)).toBe(true);
    expect(result.text).toContain("everything but Santan");
  });
});
