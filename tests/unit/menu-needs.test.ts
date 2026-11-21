// For the menu (the owner's wish list, step 1, 21 Nov): what the dishes
// planned for the coming week still need, derived and never stored.
import { describe, expect, it } from "vitest";
import { canAddNeed, dishWithDay, dishesWithAddable, isStaple, menuNeeds, neededForLine } from "@/lib/menu-needs";
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
    track_amount: false,
    created_at: "2026-10-01T00:00:00Z",
    ...patch,
  } as unknown as InventoryItem;
}

let seq = 0;
function line(patch: Partial<RecipeIngredient>): RecipeIngredient {
  seq += 1;
  return { id: `l${seq}`, household_id: "h1", recipe_id: "r", item_id: null, name: "Garam", name_id: null, amount: null, unit: null, position: seq, ...patch };
}

function recipe(id: string, name: string, lines: RecipeIngredient[], patch: Partial<RecipeWithLines> = {}): RecipeWithLines {
  return {
    id,
    household_id: "h1",
    name,
    servings: 4,
    steps: null,
    written_in: "id",
    name_id: null,
    steps_id: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ingredients: lines,
    ...patch,
  };
}

function dish(id: string, day: string, recipeId: string | null, title: string, patch: Partial<MenuDish> = {}): MenuDish {
  return {
    id,
    household_id: "h1",
    day,
    meal: "dinner",
    recipe_id: recipeId,
    title,
    servings: null,
    notes: null,
    position: 0,
    cooked_at: null,
    cooked_by: null,
    cooked_uses: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...patch,
  } as unknown as MenuDish;
}

// Wednesday 18 November 2026.
const TODAY = "2026-11-18";
const ayam = item({ id: "ayam", name: "Ayam" });
const santan = item({ id: "santan", name: "Santan", stock_status: "out" });
const bihun = item({ id: "bihun", name: "Bihun", stock_status: "low" });
const garam = item({ id: "garam", name: "Garam", stock_status: "low" });
const minyak = item({ id: "minyak", name: "Minyak goreng", stock_status: "out" });

const rendang = recipe("rendang", "Rendang", [
  line({ item_id: "ayam", name: "Ayam" }),
  line({ name: "Serai" }),
  line({ item_id: "santan", name: "Santan" }),
  line({ name: "Garam" }),
  line({ name: "Bawang putih" }),
]);
const soto = recipe("soto", "Soto ayam", [line({ name: "Serai" }), line({ item_id: "bihun", name: "Bihun" }), line({ item_id: "garam", name: "Garam" })]);
const items = [ayam, santan, bihun, garam, minyak];
const base = { recipes: [rendang, soto], items, today: TODAY, amounts: false, forStaff: false };

describe("menuNeeds", () => {
  it("lists each missing thing once, with every dish it is for, never staples", () => {
    const needs = menuNeeds({ ...base, dishes: [dish("d2", "2026-11-22", "soto", "Soto ayam"), dish("d1", "2026-11-21", "rendang", "Rendang")] });
    expect(needs.map((n) => [n.name, n.kind, n.dishes.map((d) => d.title)])).toEqual([
      // Nothing on any list first, then what is already on it (Out, then Running low).
      ["Serai", "not_there", ["Rendang", "Soto ayam"]],
      ["Santan", "out", ["Rendang"]],
      ["Bihun", "low", ["Soto ayam"]],
    ]);
    // Garam (a staple) is left out whether it has an item or not; Ayam is there.
    expect(needs.find((n) => n.name === "Serai")).toMatchObject({ key: "name:serai", item: null, saveName: "Serai" });
  });

  it("shows a staple once someone marked it Out", () => {
    const fry = recipe("fry", "Ayam goreng", [line({ item_id: "minyak", name: "Minyak goreng" })]);
    const needs = menuNeeds({ ...base, recipes: [fry], dishes: [dish("d1", TODAY, "fry", "Ayam goreng")] });
    expect(needs.map((n) => [n.name, n.kind])).toEqual([["Minyak goreng", "out"]]);
  });

  it("reads only the coming week's dishes that aren't cooked, with a recipe", () => {
    const needs = menuNeeds({
      ...base,
      dishes: [
        dish("past", "2026-11-17", "rendang", "Rendang"),
        dish("cooked", TODAY, "rendang", "Rendang", { cooked_at: "2026-11-18T05:00:00Z" }),
        dish("typed", TODAY, null, "Bakso"),
        dish("far", "2026-11-25", "rendang", "Rendang"),
      ],
    });
    expect(needs).toEqual([]);
    // The seventh day is still in.
    expect(menuNeeds({ ...base, dishes: [dish("d", "2026-11-24", "soto", "Soto ayam")] }).length).toBeGreaterThan(0);
  });

  it("with Kitchen amounts on, a short counted item says what to buy", () => {
    const counted = item({ id: "ayam", name: "Ayam", track_amount: true, quantity: 0.5, unit: "kg" });
    const opor = recipe("opor", "Opor", [line({ item_id: "ayam", name: "Ayam", amount: 1, unit: "kg" })]);
    const [need] = menuNeeds({ ...base, items: [counted], recipes: [opor], amounts: true, dishes: [dish("d", TODAY, "opor", "Opor")] });
    expect(need).toMatchObject({ name: "Ayam", kind: "short", buy: 0.5 });
    expect(canAddNeed(need)).toBe(true);
  });

  it("names things the staff way on a staff phone and saves them under the Indonesian name", () => {
    const curry = recipe("curry", "Chicken curry", [line({ name: "Lemongrass", name_id: "Serai" })], { written_in: "en", name_id: "Kari ayam" });
    const owner = menuNeeds({ ...base, recipes: [curry], dishes: [dish("d", TODAY, "curry", "Chicken curry")] });
    expect(owner[0]).toMatchObject({ name: "Lemongrass", saveName: "Serai", key: "name:serai", dishes: [{ title: "Chicken curry" }] });
    const staff = menuNeeds({ ...base, recipes: [curry], forStaff: true, dishes: [dish("d", TODAY, "curry", "Chicken curry")] });
    expect(staff[0]).toMatchObject({ name: "Serai", dishes: [{ title: "Kari ayam" }] });
    // Once added (an item named Serai, Out), it is that item, never offered again.
    const added = item({ id: "new", name: "Serai", stock_status: "out" });
    const after = menuNeeds({ ...base, items: [...items, added], recipes: [curry], dishes: [dish("d", TODAY, "curry", "Chicken curry")] });
    expect(after.map((n) => [n.name, n.kind, canAddNeed(n)])).toEqual([["Serai", "out", false]]);
    // Bought (Enough): gone.
    const bought = menuNeeds({ ...base, items: [...items, { ...added, stock_status: "ok" }], recipes: [curry], dishes: [dish("d", TODAY, "curry", "Chicken curry")] });
    expect(bought).toEqual([]);
  });

  it("knows the staples in both languages", () => {
    expect(isStaple(" Bawang  Putih ")).toBe(true);
    expect(isStaple("garlic")).toBe(true);
    expect(isStaple("Serai")).toBe(false);
  });
});

describe("the words", () => {
  const needs = menuNeeds({
    ...base,
    dishes: [dish("d1", TODAY, "rendang", "Rendang"), dish("d2", "2026-11-19", "soto", "Soto ayam"), dish("d3", "2026-11-21", "soto", "Soto ayam")],
  });
  const serai = needs.find((n) => n.name === "Serai")!;

  it("say which dishes and when, never the colour alone", () => {
    expect(dishWithDay(serai.dishes[0], TODAY, "en")).toBe("Rendang (today)");
    expect(neededForLine(serai, TODAY, "en")).toBe("Needed for Rendang (today), Soto ayam (tomorrow), Soto ayam (Sat)");
    expect(neededForLine(serai, TODAY, "id")).toBe("Perlu untuk Rendang (hari ini), Soto ayam (besok), Soto ayam (Sab)");
    const many = { ...serai, dishes: [...serai.dishes, { dishId: "d4", title: "Sop", day: "2026-11-22" }] };
    expect(neededForLine(many, TODAY, "en")).toMatch(/ and 1 more$/);
    expect(neededForLine(many, TODAY, "id")).toMatch(/ dan 1 lainnya$/);
  });

  it("offers Add only for what isn't on the shopping list yet, and the dishes for Add all", () => {
    expect(needs.filter(canAddNeed).map((n) => n.name)).toEqual(["Serai"]);
    expect(dishesWithAddable(needs).map((d) => d.dishId)).toEqual(["d1", "d2", "d3"]);
  });
});

describe("a name two items share", () => {
  it("is never offered as not on the list", () => {
    const twins = [item({ id: "c1", name: "Cabai" }), item({ id: "c2", name: "Cabai", scope: "pet" } as Partial<InventoryItem>)];
    const sambal = recipe("sambal", "Sambal", [line({ name: "Cabai" })]);
    expect(menuNeeds({ ...base, items: twins, recipes: [sambal], dishes: [dish("d", TODAY, "sambal", "Sambal")] })).toEqual([]);
  });
});

describe("a name already noted on the shopping list", () => {
  it("isn't offered again (Add missing files unlisted names as notes)", () => {
    const needs = menuNeeds({ ...base, notes: ["serai "], dishes: [dish("d", TODAY, "soto", "Soto ayam")] });
    expect(needs.map((n) => n.name)).toEqual(["Bihun"]);
  });
});

describe("a counted item short only for the week together (Codex, PR #195)", () => {
  it("is a need, with what to buy, for every dish that uses it", () => {
    const counted = item({ id: "ayam", name: "Ayam", track_amount: true, quantity: 1, unit: "kg" });
    const opor = recipe("opor", "Opor", [line({ item_id: "ayam", name: "Ayam", amount: 600, unit: "g" })]);
    const needs = menuNeeds({
      ...base,
      items: [counted],
      recipes: [opor],
      amounts: true,
      dishes: [dish("d1", TODAY, "opor", "Opor"), dish("d2", "2026-11-20", "opor", "Opor")],
    });
    expect(needs).toEqual([
      expect.objectContaining({ name: "Ayam", kind: "short", buy: 0.2, dishes: [expect.objectContaining({ dishId: "d1" }), expect.objectContaining({ dishId: "d2" })] }),
    ]);
  });
});
