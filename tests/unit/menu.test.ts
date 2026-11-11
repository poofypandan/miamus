// The weekly menu and cooking (Phase 170 PR C, migrations/153): days and
// weeks, Copy last week, the cook's confirm lists, the shortfall review,
// the To buy line and WhatsApp text, and the shortfall rules mirrored from
// the database's amount trigger.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MEALS,
  addDays,
  canCopyLastWeek,
  cookReadiness,
  copyLastWeek,
  cookLines,
  dishTitle,
  dishesOn,
  friendlyAmount,
  lineInItemUnit,
  mealsOf,
  menuShortfall,
  nextPosition,
  roundUpBuy,
  shortfallLine,
  toBuyAmountLabel,
  toBuyPatch,
  todayMenuLine,
  usesFrom,
  weekDays,
  weekRangeLabel,
  weekStart,
} from "@/lib/menu";
import { applyAmountRules, unitChangePatch } from "@/lib/kitchen-units";
import { buildShoppingList } from "@/lib/inventory";
import type { RecipeWithLines } from "@/lib/recipes";
import type { InventoryItem, MenuDish, RecipeIngredient } from "@/types/database";

function item(patch: Partial<InventoryItem>): InventoryItem {
  return {
    id: "i",
    household_id: "h1",
    scope: "home",
    name: "Item",
    variant: null,
    category: "pantry",
    quantity: 0,
    unit: "kg",
    min_threshold: 0,
    photo_url: null,
    stock_status: "ok",
    track_amount: true,
    to_buy_amount: null,
    created_at: "2026-10-01T00:00:00Z",
    ...patch,
  } as unknown as InventoryItem;
}

const chicken = item({ id: "chicken", name: "Ayam", quantity: 1, unit: "kg", category: "fresh_food", min_threshold: 0.3 });
const rice = item({ id: "rice", name: "Beras", quantity: 4, unit: "kg" });
const eggs = item({ id: "eggs", name: "Telur", quantity: 10, unit: "butir" });
const shallots = item({ id: "shallots", name: "Bawang merah", unit: "pcs", track_amount: false, stock_status: "ok" });
const items = [chicken, rice, eggs, shallots];

let lineSeq = 0;
function line(patch: Partial<RecipeIngredient>): RecipeIngredient {
  lineSeq += 1;
  return {
    id: `l${lineSeq}`,
    household_id: "h1",
    recipe_id: "soto",
    item_id: null,
    name: "Garam",
    name_id: null,
    amount: null,
    unit: null,
    position: lineSeq,
    ...patch,
  };
}

const soto: RecipeWithLines = {
  id: "soto",
  household_id: "h1",
  name: "Chicken soto",
  servings: 4,
  steps: null,
  written_in: "en",
  name_id: "Soto ayam",
  steps_id: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  ingredients: [
    line({ item_id: "chicken", name: "Chicken", amount: 1, unit: "kg" }),
    line({ item_id: "rice", name: "Rice", amount: 500, unit: "g" }),
    line({ item_id: "rice", name: "Rice for the side", amount: 250, unit: "g" }),
    line({ item_id: "eggs", name: "Eggs", amount: 4, unit: "pcs" }),
    line({ item_id: "chicken", name: "Chicken stock", amount: 2, unit: "sdm" }),
    line({ item_id: "shallots", name: "Shallots", amount: 6, unit: "pcs" }),
    line({ name: "Lime leaves", name_id: "Daun jeruk", amount: 3, unit: "lembar" }),
    line({ name: "Salt", name_id: "Garam" }),
  ],
};

let dishSeq = 0;
function dish(patch: Partial<MenuDish>): MenuDish {
  dishSeq += 1;
  return {
    id: `d${dishSeq}`,
    household_id: "h1",
    day: "2026-11-11",
    meal: "lunch",
    recipe_id: null,
    title: "Nasi goreng",
    servings: null,
    notes: null,
    position: 0,
    cooked_at: null,
    cooked_by: null,
    cooked_uses: null,
    created_by: null,
    created_at: `2026-11-10T00:00:0${dishSeq % 10}Z`,
    updated_at: "",
    ...patch,
  };
}

describe("days and weeks (Senin first)", () => {
  it("finds the Monday of any day's week", () => {
    expect(weekStart("2026-11-11")).toBe("2026-11-09"); // Wednesday
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Monday
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // across a month
  });

  it("lists the seven days and reads the range", () => {
    expect(weekDays("2026-11-09")).toEqual([
      "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15",
    ]);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(weekRangeLabel("2026-11-09", "en")).toBe("9–15 Nov");
    expect(weekRangeLabel("2026-11-30", "en")).toBe("30 Nov – 6 Dec");
  });
});

describe("dishes", () => {
  const day = [
    dish({ meal: "dinner", title: "Rendang" }),
    dish({ meal: "breakfast", title: "Bubur" }),
    dish({ meal: "lunch", title: "Soto", position: 1 }),
    dish({ meal: "lunch", title: "Tempe", position: 0 }),
    dish({ day: "2026-11-12", title: "Other day" }),
  ];

  it("orders breakfast, lunch, dinner, then position", () => {
    expect(dishesOn(day, "2026-11-11").map((d) => d.title)).toEqual(["Bubur", "Tempe", "Soto", "Rendang"]);
    expect(mealsOf(dishesOn(day, "2026-11-11")).map((g) => g.meal)).toEqual(MEALS);
    expect(nextPosition(day, "2026-11-11", "lunch")).toBe(2);
    expect(nextPosition(day, "2026-11-11", "breakfast")).toBe(1);
    expect(nextPosition(day, "2026-11-13", "dinner")).toBe(0);
  });

  it("the owner's Today line, or nothing", () => {
    expect(todayMenuLine(day, "2026-11-11", "en")).toBe("Menu today: Bubur, Tempe, Soto, Rendang");
    expect(todayMenuLine(day, "2026-11-11", "id")).toBe("Menu hari ini: Bubur, Tempe, Soto, Rendang");
    expect(todayMenuLine(day, "2026-11-20", "en")).toBeNull();
  });

  it("staff read a recipe dish by its Indonesian name; owners by the planned title", () => {
    const d = dish({ recipe_id: "soto", title: "Chicken soto" });
    expect(dishTitle(d, soto, true)).toBe("Soto ayam");
    expect(dishTitle(d, soto, false)).toBe("Chicken soto");
    expect(dishTitle(dish({ title: "Nasi goreng" }), null, true)).toBe("Nasi goreng");
  });
});

describe("Copy last week", () => {
  it("fills only the empty days from the same weekday a week earlier, uncooked", () => {
    const held = [
      dish({ day: "2026-11-02", meal: "lunch", title: "Soto", recipe_id: "soto", servings: 6, cooked_at: "2026-11-02T05:00:00Z" }),
      dish({ day: "2026-11-02", meal: "dinner", title: "Rendang", notes: "less spicy" }),
      dish({ day: "2026-11-03", meal: "lunch", title: "Gado-gado" }),
      dish({ day: "2026-11-10", meal: "lunch", title: "Already planned" }),
    ];
    const copied = copyLastWeek(held, "2026-11-09");
    expect(copied).toEqual([
      { day: "2026-11-09", meal: "lunch", recipe_id: "soto", title: "Soto", servings: 6, notes: null, position: 0 },
      { day: "2026-11-09", meal: "dinner", recipe_id: null, title: "Rendang", servings: null, notes: "less spicy", position: 0 },
    ]);
    expect(copied.some((d) => "cooked_at" in d)).toBe(false);
  });
});

describe("cooking: what comes off stock", () => {
  it("converts a line to the item's unit, only when tracked and exact", () => {
    expect(lineInItemUnit({ amount: 500, unit: "g" }, rice, 4, 4)).toBe(0.5);
    expect(lineInItemUnit({ amount: 500, unit: "g" }, rice, 4, 6)).toBe(0.75);
    expect(lineInItemUnit({ amount: 4, unit: "pcs" }, eggs, 4, 4)).toBe(4); // pieces 1 : 1 with butir
    expect(lineInItemUnit({ amount: 2, unit: "sdm" }, chicken, 4, 4)).toBeNull(); // spoons never
    expect(lineInItemUnit({ amount: null, unit: null }, rice, 4, 4)).toBeNull(); // to taste
    expect(lineInItemUnit({ amount: 6, unit: "pcs" }, shallots, 4, 4)).toBeNull(); // not tracked
    expect(lineInItemUnit({ amount: 1, unit: "L" }, rice, 4, 4)).toBeNull(); // another group
    expect(lineInItemUnit({ amount: 1, unit: "kg" }, null, 4, 4)).toBeNull(); // no item
  });

  it("lists the tracked lines scaled and summed per item, and the rest as not counted", () => {
    const { counted, uncounted } = cookLines(soto, 6, items, true);
    expect(counted).toEqual([
      { itemId: "chicken", name: "Ayam", amount: 1.5, unit: "kg", have: 1 },
      // 500 g + 250 g for 4 → 750 g + 375 g for 6 = 1,125 kg (375 rounds to the nearest 5)
      { itemId: "rice", name: "Beras", amount: 1.125, unit: "kg", have: 4 },
      { itemId: "eggs", name: "Telur", amount: 6, unit: "butir", have: 10 },
    ]);
    // Staff read the Indonesian names of free lines; linked lines read as the item.
    expect(uncounted.map((l) => l.name)).toEqual(["Ayam", "Bawang merah", "Daun jeruk", "Garam"]);
    expect(uncounted.find((l) => l.name === "Garam")?.amount).toBeNull();
  });

  it("a dish without a recipe takes nothing off", () => {
    expect(cookLines(null, null, items, true)).toEqual({ counted: [], uncounted: [] });
  });

  it("sends only the ticked lines with an amount, with the unit the phone saw (Codex, PR #101)", () => {
    expect(
      usesFrom([
        { itemId: "a", amount: 1.5, unit: "kg", on: true },
        { itemId: "b", amount: 2, unit: "kg", on: false },
        { itemId: "c", amount: 0, unit: "g", on: true },
      ])
    ).toEqual([{ item_id: "a", amount: 1.5, unit: "kg" }]);
  });

  it("cooks for the servings on the stepper, not the dish's (Codex, PR #101)", () => {
    // The dish says 4; the cook stepped up to 8 on the recipe: 8 is what comes off.
    const { counted } = cookLines(soto, 8, items, true);
    expect(counted.find((l) => l.itemId === "chicken")?.amount).toBe(2);
    expect(cookLines(soto, 4, items, true).counted.find((l) => l.itemId === "chicken")?.amount).toBe(1);
  });
});

describe("cooking waits until the recipe and items have loaded (Codex, PR #101)", () => {
  const state = { recipes: [soto], recipesFresh: true, recipesErrored: false, listsFresh: true, listsFailed: false };
  const withRecipe = dish({ recipe_id: "soto" });
  const plain = { ...soto, id: "plain", ingredients: [line({ name: "Garam" })] };

  it("a dish without a recipe needs nothing", () => {
    expect(cookReadiness(dish({}), { ...state, recipesFresh: false, listsFresh: false })).toBe("ready");
  });

  it("recipes only from the phone's copy: loading, or failed when the read failed", () => {
    expect(cookReadiness(withRecipe, { ...state, recipesFresh: false })).toBe("loading");
    expect(cookReadiness(withRecipe, { ...state, recipesFresh: false, recipesErrored: true })).toBe("failed");
  });

  it("a recipe with linked lines also waits for the household's items", () => {
    expect(cookReadiness(withRecipe, { ...state, listsFresh: false })).toBe("loading");
    expect(cookReadiness(withRecipe, { ...state, listsFresh: false, listsFailed: true })).toBe("failed");
    expect(cookReadiness(withRecipe, state)).toBe("ready");
  });

  it("a recipe with only free lines doesn't need the items; a deleted recipe has nothing to take off", () => {
    expect(cookReadiness(dish({ recipe_id: "plain" }), { ...state, recipes: [plain], listsFresh: false })).toBe("ready");
    expect(cookReadiness(dish({ recipe_id: "gone" }), state)).toBe("ready");
  });
});

describe("Copy last week waits for both weeks from the server (Codex, PR #101)", () => {
  const toCopy = [{ day: "2026-11-09", meal: "lunch" as const, recipe_id: null, title: "Soto", servings: null, notes: null, position: 0 }];
  it("only when this week and last week have loaded, and there's something to copy", () => {
    expect(canCopyLastWeek(["2026-11-09", "2026-11-02"], "2026-11-09", toCopy)).toBe(true);
    expect(canCopyLastWeek(["2026-11-02"], "2026-11-09", toCopy)).toBe(false);
    expect(canCopyLastWeek(["2026-11-09"], "2026-11-09", toCopy)).toBe(false);
    expect(canCopyLastWeek(["2026-11-09", "2026-11-02"], "2026-11-09", [])).toBe(false);
  });
});

describe("Add missing to Shopping", () => {
  const dishes = [
    dish({ day: "2026-11-11", recipe_id: "soto", title: "Soto", servings: 6 }),
    dish({ day: "2026-11-12", recipe_id: "soto", title: "Soto", servings: 2 }),
    dish({ day: "2026-11-13", recipe_id: "soto", title: "Soto", servings: 4, cooked_at: "2026-11-13T05:00:00Z" }),
    dish({ day: "2026-11-10", recipe_id: "soto", title: "Before the window" }),
    dish({ day: "2026-11-12", title: "Nasi goreng (no recipe)" }),
  ];

  it("adds up the uncooked dishes in the window against what's there", () => {
    const result = menuShortfall(dishes, [soto], items, "2026-11-11", "2026-11-15");
    // Chicken: 1,5 + 0,5 = 2 kg against 1 kg → buy 1 kg.
    expect(result.toBuy).toEqual([{ item: chicken, need: 2, have: 1, buy: 1 }]);
    // Rice 1,125 + 0,375 = 1,5 kg and eggs 6 + 2 = 8 butir: enough.
    expect(result.enough.map((e) => [e.item.id, e.need])).toEqual([
      ["rice", 1.5],
      ["eggs", 8],
    ]);
    expect(result.check.map((i) => i.id)).toEqual(["shallots"]);
    expect(result.unlisted).toEqual(["Lime leaves", "Salt"]);
  });

  it("a tracked item counted by one line isn't also a Check these, even when another line is in spoons", () => {
    const result = menuShortfall(dishes, [soto], items, "2026-11-11", "2026-11-15");
    expect(result.check.some((i) => i.id === "chicken")).toBe(false);
  });

  it("nothing in the window: nothing to add", () => {
    const result = menuShortfall(dishes, [soto], items, "2026-11-20", "2026-11-22");
    expect(result).toEqual({ toBuy: [], enough: [], check: [], unlisted: [] });
  });

  it("rounds a shortfall up so the shopper buys enough", () => {
    expect(roundUpBuy(0.42, "kg")).toBe(0.5);
    expect(roundUpBuy(0.5, "kg")).toBe(0.5);
    expect(roundUpBuy(372, "g")).toBe(375);
    expect(roundUpBuy(3.2, "g")).toBe(4);
    expect(roundUpBuy(2.1, "butir")).toBe(3);
  });

  it("reads the shortfall in friendly units, in both languages", () => {
    expect(friendlyAmount(0.5, "kg", "en")).toBe("500 g");
    expect(friendlyAmount(1.5, "kg", "id")).toBe("1,5 kg");
    expect(friendlyAmount(0.25, "L", "id")).toBe("250 ml");
    expect(shortfallLine(1.5, 1, 0.5, "kg", "en")).toBe("Need 1.5 kg · have 1 kg · buy 500 g");
    expect(shortfallLine(1.5, 1, 0.5, "kg", "id")).toBe("Perlu 1,5 kg · ada 1 kg · beli 500 g");
  });

  it("writes Running low, or Out when there's none, with the shortfall", () => {
    expect(toBuyPatch({ item: chicken, buy: 0.5 })).toEqual({ stock_status: "low", to_buy_amount: 0.5 });
    expect(toBuyPatch({ item: { ...chicken, quantity: 0 }, buy: 2 })).toEqual({ stock_status: "out", to_buy_amount: 2 });
  });

  it("To buy and WhatsApp read the shortfall", () => {
    const listed = { ...chicken, stock_status: "low" as const, to_buy_amount: 0.5 };
    expect(toBuyAmountLabel(listed, "id")).toBe("500 g");
    expect(toBuyAmountLabel(chicken, "id")).toBeNull();
    const text = buildShoppingList([listed, { ...rice, stock_status: "low" as const }], [], "id");
    expect(text).toContain("- Ayam 500 g");
    expect(text).toContain("- Beras (hampir habis)");
  });
});

describe("the shortfall rules (mirrors migrations/153's trigger)", () => {
  const listed = { ...chicken, quantity: 1, stock_status: "low" as const, to_buy_amount: 0.5 };

  it("cooking above the low level keeps a menu shortfall on the list", () => {
    const after = applyAmountRules(listed, { ...listed, quantity: 0.8 });
    expect(after.stock_status).toBe("low");
    expect(after.to_buy_amount).toBe(0.5);
  });

  it("without a shortfall, the status follows the amount as before (148)", () => {
    const plain = { ...listed, to_buy_amount: null };
    expect(applyAmountRules(plain, { ...plain, quantity: 0.8 }).stock_status).toBe("ok");
  });

  it("a purchase (which clears the shortfall) or a tap on Enough clears it", () => {
    const bought = applyAmountRules(listed, { ...listed, quantity: 1.5, to_buy_amount: null, stock_status: "ok" });
    expect(bought.stock_status).toBe("ok");
    expect(bought.to_buy_amount).toBeNull();
    const untracked = { ...shallots, stock_status: "low" as const, to_buy_amount: 6 };
    expect(applyAmountRules(untracked, { ...untracked, stock_status: "ok" }).to_buy_amount).toBeNull();
  });
});

describe("a unit change converts the shortfall (Codex, PR #101)", () => {
  const listed = { ...chicken, stock_status: "low" as const, to_buy_amount: 0.5, last_bought_amount: 2 };

  it("setTrackAmount's patch converts the pre-fill and the shortfall, or drops them", () => {
    expect(unitChangePatch(listed, "g")).toEqual({ last_bought_amount: 2000, to_buy_amount: 500 });
    expect(unitChangePatch(listed, "buah")).toEqual({ last_bought_amount: null, to_buy_amount: null });
    expect(unitChangePatch({ ...listed, to_buy_amount: null }, "g")).toEqual({ last_bought_amount: 2000 });
    expect(unitChangePatch(listed, "kg")).toEqual({});
  });

  it("the screen's copy of the trigger converts it when a write changes only the unit", () => {
    expect(applyAmountRules(listed, { ...listed, unit: "g", quantity: 1000 }).to_buy_amount).toBe(500);
    expect(applyAmountRules(listed, { ...listed, unit: "buah" }).to_buy_amount).toBeNull();
    // A write that sends the shortfall itself keeps it.
    expect(applyAmountRules(listed, { ...listed, unit: "g", quantity: 1000, to_buy_amount: 750 }).to_buy_amount).toBe(750);
  });

  it("migrations/153's convert_kitchen_amount has the same exact conversions", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/153_kitchen_menu_and_cooking.sql"), "utf8");
    expect(sql).toContain("when p_from in ('g', 'kg') and p_to in ('g', 'kg')");
    expect(sql).toContain("when p_from in ('ml', 'L') and p_to in ('ml', 'L')");
    expect(sql).toContain("when p_from in ('pcs', 'buah', 'butir') and p_to in ('pcs', 'buah', 'butir') then p_amount");
  });
});

describe("the menu's limits agree with migrations/153", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/153_kitchen_menu_and_cooking.sql"), "utf8");
  it("meals, title, servings, notes and kitchen notes", () => {
    expect(sql).toContain("meal in ('breakfast', 'lunch', 'dinner')");
    expect(sql).toContain("char_length(btrim(title)) between 1 and 80");
    expect(sql).toContain("servings between 1 and 50");
    expect(sql).toContain("char_length(notes) <= 200");
    expect(sql).toContain("char_length(kitchen_notes) <= 300");
  });
});
