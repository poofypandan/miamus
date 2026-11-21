import { cookCheck } from "@/lib/can-cook";
import { stockItemName, stockStatus } from "@/lib/inventory";
import { addDays, dishServings, dishTitle, menuShortfall, recipeOf, weekdayShort } from "@/lib/menu";
import { lineItem, lineName, type RecipeLang, type RecipeWithLines } from "@/lib/recipes";
import type { InventoryItem, MenuDish } from "@/types/database";

/**
 * What the coming menu needs (the owner's wish list, step 1, 21 Nov:
 * "if we wish-list a recipe or menu, the food list shows the items that
 * aren't there yet in a different shade"). Derived on the phone from what is
 * already stored, never saved as items: the dishes planned from today for a
 * week that aren't cooked yet, each checked by the app's own rule
 * (lib/can-cook.ts cookCheck) against what is at home now.
 *
 * Each need is one thing, once, with every dish it is for:
 *
 *   not_there  a recipe line Miamus has no item for: nothing on any list.
 *              Adding it makes it a real item, marked Out, so it is on To
 *              buy, and Bought turns it into stock.
 *   short      a listed item marked Enough whose counted amount is less than
 *              the menu needs (Kitchen amounts on). Adding marks it as Add
 *              missing to Shopping does, with what to buy.
 *   low, out   already on the shopping list: shown with its own look, never
 *              added again.
 *
 * Staples (salt, oil, garlic and the like) are left out unless marked Out.
 * A need goes as soon as its dishes are cooked or their day passes.
 *
 * One helper for every screen that shows it (Shopping now; Fable's
 * inventory later), so the rule lives in one place.
 */

export type MenuNeedKind = "not_there" | "short" | "low" | "out";

export interface MenuNeedDish {
  dishId: string;
  /** As this phone reads it (the Indonesian name on a staff phone). */
  title: string;
  day: string;
}

export interface MenuNeed {
  /** The item's id, or "name:<name>" for one with no item. */
  key: string;
  name: string;
  kind: MenuNeedKind;
  /** The listed item, or null when there is none. */
  item: InventoryItem | null;
  /** For a short item: how much to buy, in its own unit (Add missing's rounding). */
  buy: number | null;
  /**
   * For a thing with no item: the name it is saved under when added, in
   * Bahasa Indonesia (an English recipe's Indonesian line name when it has
   * one), since staff read the list. Null otherwise.
   */
  saveName: string | null;
  /** The dishes it is for, soonest first. */
  dishes: MenuNeedDish[];
}

/** How far ahead the menu is read: today and the next six days. */
export const MENU_NEEDS_DAYS = 7;

/**
 * Things nearly every kitchen keeps, by name (Indonesian and English). They
 * are not worth a reminder unless someone marked them Out.
 */
const STAPLES = new Set([
  "garam", "gula", "gula pasir", "minyak", "minyak goreng", "minyak sayur", "bawang putih", "bawang merah",
  "merica", "lada", "lada bubuk", "merica bubuk", "air", "kecap manis", "penyedap", "kaldu bubuk", "micin", "msg",
  "salt", "sugar", "oil", "cooking oil", "vegetable oil", "garlic", "shallot", "shallots", "pepper", "black pepper",
  "water", "sweet soy sauce", "stock powder",
]);

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export function isStaple(name: string): boolean {
  return STAPLES.has(norm(name));
}

const ORDER: Record<MenuNeedKind, number> = { not_there: 0, short: 1, out: 2, low: 3 };

export function menuNeeds({
  dishes,
  recipes,
  items,
  today,
  amounts,
  forStaff,
  days = MENU_NEEDS_DAYS,
}: {
  dishes: readonly MenuDish[];
  recipes: readonly RecipeWithLines[];
  items: readonly InventoryItem[];
  today: string;
  amounts: boolean;
  forStaff: boolean;
  days?: number;
}): MenuNeed[] {
  const last = addDays(today, days - 1);
  const planned = dishes
    .filter((dish) => !dish.cooked_at && dish.day >= today && dish.day <= last && dish.recipe_id)
    .sort((a, b) => a.day.localeCompare(b.day) || a.position - b.position);
  // What to buy for a counted item, added up over the week (Add missing's rule).
  const buyOf = new Map(
    amounts ? menuShortfall(planned, recipes, items, today, last).toBuy.map((line) => [line.item.id, line.buy] as const) : []
  );
  const needs = new Map<string, MenuNeed>();
  // Item name → the one item with it (two items with one name match neither), as cookCheck reads it.
  const byName = new Map<string, InventoryItem | null>();
  for (const item of items) {
    const key = norm(item.name);
    if (key) byName.set(key, byName.has(key) ? null : item);
  }
  const add = (key: string, base: Omit<MenuNeed, "dishes" | "key">, dish: MenuNeedDish) => {
    const need = needs.get(key) ?? { key, ...base, dishes: [] };
    if (!need.dishes.some((d) => d.dishId === dish.dishId)) need.dishes.push(dish);
    needs.set(key, need);
  };
  for (const dish of planned) {
    const recipe = recipeOf(dish, recipes);
    if (!recipe) continue;
    const check = cookCheck(recipe, dishServings(dish, recipe), items, { amounts, forStaff });
    const forDish: MenuNeedDish = { dishId: dish.id, title: dishTitle(dish, recipe, forStaff), day: dish.day };
    for (const missing of check.missing) {
      const item = items.find((i) => i.id === missing.itemId);
      if (!item) continue;
      const status = stockStatus(item);
      const kind: MenuNeedKind = status === "out" ? "out" : status === "low" ? "low" : "short";
      if (kind !== "out" && isStaple(missing.name)) continue;
      add(item.id, { name: missing.name, kind, item, buy: kind === "short" ? (buyOf.get(item.id) ?? null) : null, saveName: null }, forDish);
    }
    // Lines with no item: cookCheck's own rule (a link, or exactly one
    // item's name), keyed by the Indonesian name so every phone agrees.
    for (const line of recipe.ingredients) {
      if (lineItem(line, items) || (!line.item_id && byName.get(norm(line.name)))) continue;
      const saveName = lineName(line, items, true, recipe.written_in).trim();
      if (!saveName) continue;
      // Added from here before: an English line's item has its Indonesian
      // name, and a line whose item was deleted keeps the old link, so
      // cookCheck doesn't find either. They are that item, by its status.
      const added = byName.get(norm(saveName)) ?? (line.item_id ? byName.get(norm(line.name)) : null);
      if (added) {
        const status = stockStatus(added);
        if (status === "ok" || (status === "low" && isStaple(saveName))) continue;
        add(added.id, { name: stockItemName(added), kind: status, item: added, buy: null, saveName: null }, forDish);
        continue;
      }
      if (isStaple(saveName) || isStaple(line.name)) continue;
      const name = lineName(line, items, forStaff, recipe.written_in).trim();
      add(`name:${norm(saveName)}`, { name, kind: "not_there", item: null, buy: null, saveName }, forDish);
    }
  }
  return [...needs.values()].sort(
    (a, b) => ORDER[a.kind] - ORDER[b.kind] || a.dishes[0].day.localeCompare(b.dishes[0].day) || a.name.localeCompare(b.name)
  );
}

/** Whether "Add" has something to do: a thing with no item, or a counted item that is short. */
export function canAddNeed(need: MenuNeed): boolean {
  return need.kind === "not_there" || need.kind === "short";
}

/** "Rendang (Sat)", "Soto (today)": a dish with its day, as the need's line says it. */
export function dishWithDay(dish: MenuNeedDish, today: string, lang: RecipeLang): string {
  const when =
    dish.day === today
      ? lang === "id"
        ? "hari ini"
        : "today"
      : dish.day === addDays(today, 1)
        ? lang === "id"
          ? "besok"
          : "tomorrow"
        : weekdayShort(dish.day, lang);
  return `${dish.title} (${when})`;
}

/**
 * "Needed for Rendang (Sat), Soto (Sun)" / "Perlu untuk Rendang (Sab), Soto
 * (Min)". The words are the shade's meaning, never the colour alone. Three
 * dishes at most, then "and 2 more" / "dan 2 lainnya".
 */
export function neededForLine(need: MenuNeed, today: string, lang: RecipeLang): string {
  const shown = need.dishes.slice(0, 3).map((dish) => dishWithDay(dish, today, lang));
  const more = need.dishes.length - shown.length;
  const list = shown.join(", ") + (more > 0 ? (lang === "id" ? ` dan ${more} lainnya` : ` and ${more} more`) : "");
  return lang === "id" ? `Perlu untuk ${list}` : `Needed for ${list}`;
}

/** The dishes with something Add can do, soonest first, for "Add all for Rendang". */
export function dishesWithAddable(needs: readonly MenuNeed[]): MenuNeedDish[] {
  const out: MenuNeedDish[] = [];
  for (const need of needs) {
    if (!canAddNeed(need)) continue;
    for (const dish of need.dishes) if (!out.some((d) => d.dishId === dish.dishId)) out.push(dish);
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}
