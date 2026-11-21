// Kakak's recipe ideas and the household's food preferences (PR C2, owner
// 20 Nov; migrations/176). The preference is a closed set, asked once with
// the app's own card (ask_food_preferences) and read by Kakak from the
// household block; ideas are saved through save_recipe_idea as names only;
// the guard catches an amount in an idea reply.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FOOD_RULES_PRESETS,
  foodRulesForKakak,
  foodRulesFromRow,
  foodRulesLabel,
  foodRulesQuestion,
  foodRulesReply,
  normalizeFoodRules,
} from "@/lib/food-preferences";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { describeSuggestion, savedSummary } from "@/lib/kakak/describe";
import { nextUserTurn, runKakakTurn, type KakakHistory, type TurnDeps } from "@/lib/kakak/engine";
import { renderHouseholdBlock, type KakakHousehold } from "@/lib/kakak/household";
import { practiceClient } from "@/lib/kakak/practice";
import { MAX_ANSWER_CHARS, MAX_IDEAS_CHARS, guardReplyText, replyProblems, watchesAmounts } from "@/lib/kakak/reply-guard";
import { clientVersionFor, isSaveableSuggestion, needsNewerApp, toSuggestions, type RecipeIdeaSuggestion } from "@/lib/kakak/suggestions";
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
  ...over,
});

const rows: ContextRows = {
  staff: [{ id: id(1), name: "Dewi", created_at: "2026-01-01", user_id: OWNER, archived_at: null }],
  pets: [],
  schedules: [],
  rooms: [],
  items: [item(30, "Santan"), item(31, "Labu siam", { stock_status: "low" }), item(32, "Ayam")],
  recipes: [
    {
      id: id(41),
      name: "Opor ayam",
      name_id: null,
      servings: 4,
      written_in: "id",
      created_at: "2026-02-01",
      ingredients: [{ id: id(901), item_id: id(32), name: "Ayam", name_id: null, amount: null, unit: null, position: 0 }],
    },
  ],
} as ContextRows;

const opts = { today: "2026-11-11", now: "08:30", ownerLocale: "en" as const, callerUserId: OWNER };
const built = (over: Partial<ContextRows> = {}, locale: "en" | "id" = "en") => buildContext({ ...rows, ...over }, { ...opts, ownerLocale: locale });

const idea = (over: Record<string, unknown> = {}) => ({
  name: "Sayur lodeh",
  name_en: "Vegetable curry",
  ingredients: [
    { item: "I1", name: "Santan" },
    { item: "none", name: "Tempe" },
  ],
  servings: 0,
  ...over,
});

describe("the food preferences", () => {
  it("are a closed set, once each, in a fixed order", () => {
    expect(normalizeFoodRules(["no_alcohol", "halal", "halal", "kosher", null])).toEqual(["halal", "no_alcohol"]);
    expect(foodRulesFromRow(null)).toBeNull();
    expect(foodRulesFromRow([])).toEqual([]);
    expect(foodRulesFromRow(["vegetarian", "no_beef"])).toEqual(["no_beef", "vegetarian"]);
  });

  it("read in both languages, and to Kakak with what each means", () => {
    expect(foodRulesLabel(["halal", "no_alcohol"], "id")).toBe("Halal · Tanpa alkohol");
    expect(foodRulesLabel(["no_beef"], "en")).toBe("No beef");
    expect(foodRulesLabel([], "id")).toBe("Tidak ada aturan");
    expect(foodRulesForKakak(null)).toBe("not asked yet");
    expect(foodRulesForKakak([])).toBe("none");
    expect(foodRulesForKakak(["halal"])).toBe("halal (no pork or lard)");
  });

  it("are asked with the app's own words, and the answer says whether it was saved", () => {
    expect(foodRulesQuestion("id")).toBe("Ada aturan makanan untuk ide masak?");
    expect(FOOD_RULES_PRESETS.map((p) => p.id)).toEqual(["Halal", "Halal, tanpa alkohol", "Tidak ada"]);
    expect(FOOD_RULES_PRESETS.map((p) => p.en)).toEqual(["Halal", "Halal, no alcohol", "No rules"]);
    expect(foodRulesReply(["halal", "no_alcohol"], true, "id")).toBe("Halal · Tanpa alkohol. (Disimpan untuk ide berikutnya.)");
    expect(foodRulesReply([], false, "en")).toBe("No food rules. (Just for this conversation.)");
  });
});

describe("what Kakak is told", () => {
  it("the preference and whether there are kitchen notes, never their text", () => {
    const { household } = built({ foodPreferences: ["halal"], kitchenNotes: true });
    expect(household.foodRules).toEqual(["halal"]);
    expect(household.kitchenNotes).toBe(true);
    const block = renderHouseholdBlock(household);
    expect(block).toContain("Food preferences (for recipe ideas): halal (no pork or lard).");
    expect(block).toContain("Kitchen notes: yes (for whoever cooks; you never see what they say).");
  });

  it("not asked yet, none, and nothing at all when they weren't read", () => {
    expect(renderHouseholdBlock(built({ foodPreferences: null, kitchenNotes: false }).household)).toContain(
      "Food preferences (for recipe ideas): not asked yet.\nKitchen notes: none.",
    );
    expect(renderHouseholdBlock(built({ foodPreferences: [] }).household)).toContain("Food preferences (for recipe ideas): none.");
    // An older read (a database before 176): the block is exactly as it was.
    const older = built();
    expect(older.household).not.toHaveProperty("foodRules");
    expect(older.household).not.toHaveProperty("kitchenNotes");
    expect(renderHouseholdBlock(older.household)).not.toMatch(/Food preferences|Kitchen notes/);
  });
});

describe("ask_food_preferences", () => {
  it("is allowed once, while nobody has answered", () => {
    expect(validateToolCall(built({ foodPreferences: null }).household, "ask_food_preferences", { for: "ideas" })).toEqual({ ok: true });
    const saved = validateToolCall(built({ foodPreferences: ["halal"] }).household, "ask_food_preferences", { for: "ideas" });
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.errors.join(" ")).toMatch(/already saved \(halal.*never ask again/);
    const none = validateToolCall(built({ foodPreferences: [] }).household, "ask_food_preferences", { for: "ideas" });
    expect(none.ok).toBe(false);
    // A database before 176: nothing could be saved, so she doesn't ask.
    expect(validateToolCall(built().household, "ask_food_preferences", { for: "ideas" }).ok).toBe(false);
    const bad = validateToolCall(built({ foodPreferences: null }).household, "ask_food_preferences", { for: "dinner", extra: 1 });
    expect(bad.ok).toBe(false);
  });
});

describe("save_recipe_idea", () => {
  it("accepts names only, with listed items by reference", () => {
    expect(validateToolCall(built().household, "save_recipe_idea", idea())).toEqual({ ok: true });
  });

  it("refuses an unknown item, too many lines, bad servings, and a name already saved", () => {
    const check = (input: Record<string, unknown>) => {
      const result = validateToolCall(built().household, "save_recipe_idea", input);
      return result.ok ? "" : result.errors.join(" ");
    };
    expect(check(idea({ ingredients: [{ item: "I9", name: "Tempe" }] }))).toMatch(/I9/);
    expect(check(idea({ ingredients: Array.from({ length: 21 }, () => ({ item: "none", name: "Garam" })) }))).toMatch(/1 to 20/);
    expect(check(idea({ ingredients: [] }))).toMatch(/1 to 20/);
    expect(check(idea({ servings: 51 }))).toMatch(/servings/);
    expect(check(idea({ name: "Opor Ayam", name_en: "none" }))).toMatch(/D1 Opor ayam is already a saved recipe/);
    expect(check(idea({ amount: "2 kg" }))).toMatch(/unknown fields: amount/);
    expect(check(idea({ name_en: null }))).toMatch(/name_en/);
  });

  it("becomes a recipe card with the item's id, and an English name only for an English-speaking owner", () => {
    const en = built();
    const [card] = toSuggestions(en.household, en.refs, en.names, "save_recipe_idea", idea());
    expect(card).toEqual({
      kind: "recipe_idea",
      name: "Sayur lodeh",
      nameEn: "Vegetable curry",
      ingredients: [
        { itemId: id(30), name: "Santan" },
        { itemId: null, name: "Tempe" },
      ],
      servings: 4,
    });
    expect(isSaveableSuggestion(card)).toBe(true);
    expect(clientVersionFor(card)).toBe(6);
    expect(needsNewerApp(card, 5)).toBe(true);
    const ind = built({}, "id");
    const [kartu] = toSuggestions(ind.household, ind.refs, ind.names, "save_recipe_idea", idea({ servings: 6 }));
    expect(kartu).toMatchObject({ nameEn: null, servings: 6 });
    expect(isSaveableSuggestion({ ...card, ingredients: [] })).toBe(false);
    expect(isSaveableSuggestion({ ...card, servings: 0 })).toBe(false);
  });

  it("reads as an idea, with the amounts and steps left to the owner", () => {
    const card: RecipeIdeaSuggestion = {
      kind: "recipe_idea",
      name: "Sayur lodeh",
      nameEn: "Vegetable curry",
      ingredients: [{ itemId: null, name: "Santan" }, { itemId: null, name: "Tempe" }],
      servings: 4,
    };
    expect(describeSuggestion(card, "en")).toEqual({
      heading: "Recipe idea",
      rows: [
        { label: "Name", value: "Vegetable curry (Sayur lodeh)" },
        { label: "For", value: "4 servings" },
        { label: "Ingredients", value: "Santan, Tempe" },
      ],
      note: "Kakak's idea. Add the amounts and steps yourself.",
    });
    expect(describeSuggestion(card, "id").heading).toBe("Ide resep");
    expect(describeSuggestion(card, "id").note).toBe("Ide Kakak. Tambahkan jumlah dan cara membuatnya sendiri.");
    expect(savedSummary([card], "en")).toBe("Saved — Vegetable curry");
    expect(savedSummary([card], "id")).toBe("Tersimpan — Sayur lodeh");
  });
});

describe("the guard on an idea reply", () => {
  const ideas = "Ide: Sayur lodeh, pakai Santan; masih perlu Tempe.\nIde: Tumis kangkung, masih perlu Kangkung.\nMau Kakak simpan salah satunya jadi resep?";

  it("watches for an amount, and gives ideas more room than an answer", () => {
    expect(watchesAmounts(ideas, [], false)).toBe(true);
    expect(watchesAmounts("Sama-sama.", [], false)).toBe(false);
    expect(replyProblems(ideas.replace("Santan", "Santan 400 ml"), "id", { noAmounts: true })).toEqual(["amount"]);
    const long = `${ideas}\n${"Ide: Sayur asem, pakai Labu siam; masih perlu Asam jawa dan Kacang panjang. ".repeat(6)}`.slice(0, 700);
    expect(long.length).toBeGreaterThan(MAX_ANSWER_CHARS);
    expect(long.length).toBeLessThanOrEqual(MAX_IDEAS_CHARS);
    expect(guardReplyText("message", long, "id").tells).toEqual([]);
    expect(guardReplyText("message", "x".repeat(MAX_ANSWER_CHARS + 1), "id").tells).toContain("too_long");
  });
});

describe("the conversation", () => {
  const fake = (content: unknown[]) => {
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
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    return new Anthropic({ apiKey: "k", authToken: null, baseURL: "http://fake.test", maxRetries: 0, fetch });
  };
  const deps = (client: Anthropic, over: Partial<ContextRows> = {}, locale: "en" | "id" = "id"): TurnDeps => {
    const { household, refs, names } = built(over, locale);
    return {
      client,
      model: "claude-opus-5-5",
      effort: "low",
      household,
      refs,
      names,
      begin: async () => ({ ok: true, requestId: id(700), callsLeft: 5 }),
      record: async () => undefined,
    };
  };
  const ask = { type: "tool_use", id: "toolu_1", name: "ask_food_preferences", input: { for: "ideas" } };

  it("turns ask_food_preferences into the app's own card, and the tap into Kakak's answer", async () => {
    const result = await runKakakTurn(deps(fake([ask]), { foodPreferences: null }), null, "Ada ide masak apa?");
    expect(result).toMatchObject({
      kind: "question",
      question: "Ada aturan makanan untuk ide masak?",
      answers: ["Halal", "Halal, tanpa alkohol", "Tidak ada"],
      allowTyping: true,
      foodRules: true,
    });
    if (result.kind !== "question") throw new Error("expected a question");
    expect(nextUserTurn(result.history, "Halal. (Disimpan untuk ide berikutnya.)")).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "Halal. (Disimpan untuk ide berikutnya.)" }],
    });
  });

  it("never shows the card twice in one conversation, nor beside a card", async () => {
    const history: KakakHistory = {
      messages: [
        { role: "user", content: "Ada ide masak apa?" },
        { role: "assistant", content: [ask as Anthropic.ToolUseBlockParam] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "Tidak ada aturan makanan. (Hanya untuk percakapan ini.)" }] },
        { role: "assistant", content: [{ type: "text", text: "Ide: Sayur lodeh, pakai Santan." }] },
      ],
    };
    const again = { ...ask, id: "toolu_2" };
    const second = await runKakakTurn(deps(fake([again]), { foodPreferences: null }), history, "Ide lain?");
    expect(second.kind).toBe("failed");
    const mixed = await runKakakTurn(
      deps(fake([{ ...ask, id: "toolu_3" }, { type: "tool_use", id: "toolu_4", name: "save_recipe_idea", input: idea() }]), { foodPreferences: null }),
      null,
      "Ada ide?",
    );
    expect(mixed.kind).toBe("failed");
  });

  it("practice mode asks first, then gives marked ideas, then saves one by name only", async () => {
    let { household, refs, names } = built({ foodPreferences: null, kitchenNotes: true }, "id");
    const turn = (history: KakakHistory | null, words: string) =>
      runKakakTurn(
        {
          client: practiceClient(household),
          model: "claude-opus-5-5",
          effort: "low",
          household,
          refs,
          names,
          begin: async () => ({ ok: true, requestId: id(701), callsLeft: 5 }),
          record: async () => undefined,
        },
        history,
        words,
      );
    const first = await turn(null, "Ada ide masak apa?");
    if (first.kind !== "question") throw new Error(`expected a question, got ${first.kind}`);
    expect(first.foodRules).toBe(true);
    const second = await turn(first.history, foodRulesReply(["halal"], true, "id"));
    if (second.kind !== "message") throw new Error(`expected a message, got ${second.kind}`);
    expect(second.text.split("\n")).toEqual([
      "(Latihan) Ide: Sayur lodeh, pakai Santan; masih perlu Labu siam, Tempe.",
      "Ide: Ayam goreng kunyit, pakai Ayam; masih perlu Kunyit, Bawang putih.",
      "Cek catatan dapur sebelum masak.",
      "Mau Kakak simpan salah satunya jadi resep?",
    ]);
    const third = await turn(second.history, "Simpan yang pertama");
    if (third.kind !== "suggestions") throw new Error(`expected suggestions, got ${third.kind}`);
    expect(third.items).toEqual([
      {
        kind: "recipe_idea",
        name: "Sayur lodeh",
        nameEn: null,
        ingredients: [
          { itemId: id(31), name: "Labu siam" },
          { itemId: id(30), name: "Santan" },
          { itemId: null, name: "Tempe" },
        ],
        servings: 4,
      },
    ]);
    // With halal saved, the next conversation goes straight to ideas.
    ({ household, refs, names } = built({ foodPreferences: ["halal"] }, "id"));
    const later = await turn(null, "Ada ide masak?");
    expect(later.kind).toBe("message");
  });
});

describe("the eval's ideas cases", () => {
  const root = join(process.cwd(), "tests", "kakak");
  const evalHousehold = JSON.parse(readFileSync(join(root, "household.json"), "utf8")) as KakakHousehold;
  const testSet = JSON.parse(readFileSync(join(root, "test-set.json"), "utf8")) as KakakTestSet;
  const kase = (cid: string) => testSet.cases.find((c) => c.id === cid)!;
  const message = (text: string): ActualTurn => ({ kind: "message", calls: [], text });
  const cardTurn: ActualTurn = { kind: "question", calls: [{ name: "ask_food_preferences", input: { for: "ideas" } }], text: "" };

  it("passes the card then marked ideas, and fails an idea with pork after Halal was tapped", () => {
    const k207 = kase("K207");
    const good = gradeCase(evalHousehold, k207, [cardTurn, message("Ide: Sayur lodeh, pakai Tomat; masih perlu Tempe.\nIde: Ayam kecap tanpa arak, pakai Ayam.\nMau Kakak simpan salah satunya jadi resep?")]);
    expect(good).toMatchObject({ pass: true, mustNever: [] });
    const pork = gradeCase(evalHousehold, k207, [cardTurn, message("Ide: Babi kecap, pakai Telur.\nIde: Sayur lodeh.")]);
    expect(pork.mustNever.join(" ")).toMatch(/broke the food preferences: halal: babi/);
    // The card must be the app's own, not a question in her words.
    const words: ActualTurn = { kind: "question", calls: [{ name: "ask_question", input: { question: "Ada aturan makanan?", answers: ["Halal", "Tidak ada"], allow_typing: true } }], text: "" };
    expect(gradeCase(evalHousehold, k207, [words, message("Ide: Sayur lodeh.")]).failures.join(" ")).toMatch(/food-rules card/);
  });

  it("fails asking again once the preference is saved, and an idea called ready", () => {
    expect(gradeCase(evalHousehold, kase("K209"), [cardTurn]).mustNever.join(" ")).toMatch(/asked the food rules again/);
    const ready = gradeCase(evalHousehold, kase("K219"), [message("Ide: Tumis tomat telur, siap dimasak malam ini.")]);
    expect(ready.mustNever).toContain("called an idea ready or a saved recipe");
    // A typed Vegetarian on the card counts as the rule for the rest of the conversation.
    const meat = gradeCase(evalHousehold, kase("K221"), [cardTurn, message("Idea: Chicken fried rice (Nasi goreng ayam), uses Ayam.")]);
    expect(meat.mustNever.join(" ")).toMatch(/vegetarian: (ayam|chicken)/);
  });
});
