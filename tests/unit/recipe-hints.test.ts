// Recipes that learn (Phase 177, plan section 4): when the same ingredient
// was used differently three dishes in a row, each at least 10% off, the
// owner is offered the middle amount, rounded like a recipe.
import { describe, expect, it } from "vitest";
import { HINT_COOKS, HINT_MIN_CHANGE, hintAmounts, payloadOfRecipe, recipeHints, roundHint, type HintDish } from "@/lib/recipe-hints";
import type { RecipeWithLines } from "@/lib/recipes";
import type { CookedUse, InventoryItem, RecipeIngredient } from "@/types/database";

function item(patch: Partial<InventoryItem>): InventoryItem {
  return {
    id: "i",
    household_id: "h1",
    scope: "home",
    name: "Item",
    variant: null,
    category: "fresh_food",
    quantity: 5,
    unit: "g",
    min_threshold: 0,
    photo_url: null,
    stock_status: "ok",
    track_amount: true,
    created_at: "2026-10-01T00:00:00Z",
    ...patch,
  } as unknown as InventoryItem;
}

const beef = item({ id: "beef", name: "Daging sapi", unit: "kg" });
const santan = item({ id: "santan", name: "Santan", unit: "ml" });
const eggs = item({ id: "eggs", name: "Telur", unit: "butir" });
const salt = item({ id: "salt", name: "Garam", track_amount: false });
const items = [beef, santan, eggs, salt];

let seq = 0;
function line(patch: Partial<RecipeIngredient>): RecipeIngredient {
  seq += 1;
  return { id: `l${seq}`, household_id: "h1", recipe_id: "rendang", item_id: null, name: "x", name_id: null, amount: null, unit: null, position: seq, ...patch };
}

function recipe(patch: Partial<RecipeWithLines> = {}): RecipeWithLines {
  return {
    id: "rendang",
    household_id: "h1",
    name: "Rendang",
    servings: 4,
    steps: "Masak.",
    written_in: "id",
    name_id: null,
    steps_id: null,
    hints_off: [],
    created_by: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ingredients: [
      line({ item_id: "beef", name: "Daging sapi", amount: 500, unit: "g" }),
      line({ item_id: "santan", name: "Santan", amount: 400, unit: "ml" }),
      line({ item_id: "eggs", name: "Telur", amount: 4, unit: "pcs" }),
      line({ item_id: "salt", name: "Garam", amount: 1, unit: "sdt" }),
    ],
    ...patch,
  };
}

let dishSeq = 0;
/** A dish cooked on 2 Nov + n days, from the recipe, with these entries. */
function cooked(n: number, uses: CookedUse[], recipeId = "rendang"): HintDish {
  dishSeq += 1;
  return { id: `d${dishSeq}`, recipe_id: recipeId, cooked_at: `2026-11-${String(2 + n).padStart(2, "0")}T12:00:00Z`, cooked_uses: uses };
}
const beefUse = (planned: number, said: number): CookedUse => ({ item_id: "beef", amount: said, unit: "kg", said, planned });
const santanUse = (planned: number, said: number): CookedUse => ({ item_id: "santan", amount: said, unit: "ml", said, planned });

describe("the rule", () => {
  it("three more in a row: the middle ratio, rounded", () => {
    const hints = recipeHints([recipe()], [cooked(1, [beefUse(0.5, 0.6)]), cooked(2, [beefUse(1, 1.25)]), cooked(3, [beefUse(0.5, 0.575)])], items);
    expect(hints).toHaveLength(1);
    // Ratios 1.2, 1.25, 1.15 → middle 1.2 → 500 g × 1.2 = 600 g.
    expect(hints[0].lines).toEqual([{ itemId: "beef", name: "Daging sapi", unit: "g", recipeAmount: 500, suggested: 600 }]);
    expect(hints[0].lastCooked).toBe("2026-11-05T12:00:00Z");
  });

  it("three less in a row", () => {
    const hints = recipeHints([recipe()], [cooked(1, [santanUse(400, 300)]), cooked(2, [santanUse(400, 320)]), cooked(3, [santanUse(800, 600)])], items);
    expect(hints[0].lines).toEqual([{ itemId: "santan", name: "Santan", unit: "ml", recipeAmount: 400, suggested: 300 }]);
  });

  it("two are not enough; a mixed third breaks it; the newest three decide", () => {
    expect(recipeHints([recipe()], [cooked(1, [beefUse(0.5, 0.6)]), cooked(2, [beefUse(0.5, 0.6)])], items)).toEqual([]);
    expect(
      recipeHints([recipe()], [cooked(1, [beefUse(0.5, 0.6)]), cooked(2, [beefUse(0.5, 0.4)]), cooked(3, [beefUse(0.5, 0.6)])], items)
    ).toEqual([]);
    // An old outlier no longer counts once three newer agree.
    const hints = recipeHints(
      [recipe()],
      [cooked(0, [beefUse(0.5, 0.4)]), cooked(1, [beefUse(0.5, 0.6)]), cooked(2, [beefUse(0.5, 0.6)]), cooked(3, [beefUse(0.5, 0.6)])],
      items
    );
    expect(hints[0].lines[0].suggested).toBe(600);
  });

  it("exactly 10% counts; less than that doesn't", () => {
    expect(HINT_COOKS).toBe(3);
    expect(HINT_MIN_CHANGE).toBe(0.1);
    const exact = [1, 2, 3].map((n) => cooked(n, [beefUse(0.5, 0.55)]));
    expect(recipeHints([recipe()], exact, items)[0].lines[0].suggested).toBe(550);
    const under = [1, 2, 3].map((n) => cooked(n, [beefUse(0.5, 0.545)]));
    expect(recipeHints([recipe()], under, items)).toEqual([]);
    const exactLess = [1, 2, 3].map((n) => cooked(n, [santanUse(400, 360)]));
    expect(recipeHints([recipe()], exactLess, items)[0].lines[0].suggested).toBe(360);
  });

  it("a dish where the cook unticked it, or where it was unticked in a change (said 0), is skipped, not counted", () => {
    const dishes = [
      cooked(1, [beefUse(0.5, 0.6)]),
      cooked(2, [santanUse(400, 400)]), // beef unticked when cooking: no entry
      cooked(3, [{ item_id: "beef", amount: 0, unit: "kg", said: 0, planned: 0.5 }]),
      cooked(4, [beefUse(0.5, 0.6)]),
      cooked(5, [beefUse(0.5, 0.6)]),
    ];
    expect(recipeHints([recipe()], dishes, items)[0].lines.map((l) => l.itemId)).toEqual(["beef"]);
    // Without the older dish, only two count.
    expect(recipeHints([recipe()], dishes.slice(1), items)).toEqual([]);
  });

  it("dishes from before this phase (no planned) don't count", () => {
    const old = [1, 2, 3].map((n) => cooked(n, [{ item_id: "beef", amount: 0.6, unit: "kg" }]));
    expect(recipeHints([recipe()], old, items)).toEqual([]);
  });

  it("only dishes cooked since the recipe was last saved", () => {
    const dishes = [1, 2, 3].map((n) => cooked(n, [beefUse(0.5, 0.6)]));
    expect(recipeHints([recipe({ updated_at: "2026-11-04T00:00:00Z" })], dishes, items)).toEqual([]);
  });

  it("not for an item linked by two lines, an untracked item, a spoon line, or one the owner kept", () => {
    const twoLines = recipe({
      ingredients: [line({ item_id: "beef", amount: 500, unit: "g" }), line({ item_id: "beef", name: "Kaldu", amount: 100, unit: "g" })],
    });
    const dishes = [1, 2, 3].map((n) => cooked(n, [beefUse(0.5, 0.6)]));
    expect(recipeHints([twoLines], dishes, items)).toEqual([]);
    const saltDishes = [1, 2, 3].map((n) => cooked(n, [{ item_id: "salt", amount: 2, unit: "g", said: 2, planned: 1 }]));
    expect(recipeHints([recipe()], saltDishes, items)).toEqual([]);
    expect(recipeHints([recipe({ hints_off: ["beef"] })], dishes, items)).toEqual([]);
  });

  it("all a recipe's suggested ingredients are in one card; the recipe cooked most recently comes first", () => {
    const soto = recipe({ id: "soto", name: "Soto", ingredients: [line({ recipe_id: "soto", item_id: "eggs", amount: 4, unit: "pcs" })] });
    const dishes = [
      ...[1, 2, 3].map((n) => cooked(n, [beefUse(0.5, 0.6), santanUse(400, 300)])),
      ...[4, 5, 6].map((n) => cooked(n, [{ item_id: "eggs", amount: 6, unit: "butir", said: 6, planned: 4 }], "soto")),
    ];
    const hints = recipeHints([recipe(), soto], dishes, items);
    expect(hints.map((h) => h.recipe.id)).toEqual(["soto", "rendang"]);
    expect(hints[0].lines[0]).toMatchObject({ unit: "pcs", recipeAmount: 4, suggested: 6 });
    expect(hints[1].lines.map((l) => l.itemId)).toEqual(["beef", "santan"]);
  });

  it("no suggestion when the rounded amount equals the recipe's", () => {
    // 4 eggs × 1.1 = 4.4 → 4.
    const dishes = [1, 2, 3].map((n) => cooked(n, [{ item_id: "eggs", amount: 4.4, unit: "butir", said: 4.4, planned: 4 }]));
    expect(recipeHints([recipe()], dishes, items)).toEqual([]);
  });
});

describe("rounding like a recipe (plan 4a)", () => {
  it("g and ml: 1 below 10, 5 to 99, 10 to 999, 50 from 1,000", () => {
    expect(roundHint(7.4, "g")).toBe(7);
    expect(roundHint(43, "ml")).toBe(45);
    expect(roundHint(612, "g")).toBe(610);
    expect(roundHint(1234, "ml")).toBe(1250);
  });

  it("kg and L: 0.05; counted units: 1", () => {
    expect(roundHint(1.234, "kg")).toBe(1.25);
    expect(roundHint(0.61, "L")).toBe(0.6);
    expect(roundHint(4.6, "siung")).toBe(5);
    expect(roundHint(2.4, "butir")).toBe(2);
  });

  it("never below one step of its row, never above 100,000", () => {
    expect(roundHint(0.4, "g")).toBe(1);
    expect(roundHint(0.01, "kg")).toBe(0.05);
    expect(roundHint(0.2, "pcs")).toBe(1);
    expect(roundHint(250_000, "g")).toBe(100_000);
  });

  it("a small amount that would round to 0 stays at least 1 g", () => {
    const tiny = recipe({ ingredients: [line({ item_id: "beef", amount: 2, unit: "g" })] });
    const dishes = [1, 2, 3].map((n) => cooked(n, [{ item_id: "beef", amount: 0.0004, unit: "kg", said: 0.0004, planned: 0.002 }]));
    expect(recipeHints([tiny], dishes, items)[0].lines[0]).toMatchObject({ recipeAmount: 2, suggested: 1 });
  });
});

describe("the save that Update recipe sends", () => {
  it("the whole recipe as it is, with only the suggested amounts replaced", () => {
    const r = recipe();
    const hint = recipeHints([r], [1, 2, 3].map((n) => cooked(n, [beefUse(0.5, 0.6)])), items)[0];
    const payload = payloadOfRecipe(r, hintAmounts(hint));
    expect(payload.recipe).toEqual({ id: "rendang", name: "Rendang", servings: 4, steps: "Masak.", written_in: "id", name_id: null, steps_id: null });
    expect(payload.ingredients.map((l) => [l.item_id, l.amount, l.unit])).toEqual([
      ["beef", 600, "g"],
      ["santan", 400, "ml"],
      ["eggs", 4, "pcs"],
      ["salt", 1, "sdt"],
    ]);
    // Undo: the recipe as it was.
    expect(payloadOfRecipe(r).ingredients[0].amount).toBe(500);
  });
});
