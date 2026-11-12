import { stockItemName } from "@/lib/inventory";
import { clean, convertAmount, friendlyAmount, isTracked } from "@/lib/kitchen-units";

export { friendlyAmount, toBuyAmountLabel } from "@/lib/kitchen-units";
import { lineItem, lineName, scaleAmount, staffText, type RecipeLang, type RecipeWithLines } from "@/lib/recipes";
import type { CookedUse, InventoryItem, InventoryUnit, MenuDish, MenuMeal, RecipeUnit } from "@/types/database";

/**
 * The weekly menu and cooking from stock (Phase 170 PR C,
 * docs/phase-170-kitchen-plan.md D9, D10; migrations/153).
 *
 * Owners plan dishes per day and meal (a recipe with servings, or just a
 * name); every staff phone sees Menu hari ini. "Sudah dimasak" takes the
 * recipe's tracked lines off stock after one confirm (cook_menu_dish), and
 * Undo puts back exactly what was taken. "Add missing to Shopping" adds up
 * the rest of the week against what's there and shows a review first.
 *
 * Everything here is worked out on the phone from what's already stored.
 * No prices, anywhere: staff never see prices.
 */

export const MEALS: readonly MenuMeal[] = ["breakfast", "lunch", "dinner"];

export const MEAL_LABELS: Record<RecipeLang, Record<MenuMeal, string>> = {
  en: { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" },
  id: { breakfast: "Sarapan", lunch: "Makan siang", dinner: "Makan malam" },
};

/** The staff card's short words (glossary: Pagi · Siang · Malam). */
export const STAFF_MEAL_LABELS: Record<MenuMeal, string> = { breakfast: "Pagi", lunch: "Siang", dinner: "Malam" };

/** Limits, mirroring the checks in migrations/153. */
export const MENU_LIMITS = { title: 80, notes: 200, kitchenNotes: 300, minServings: 1, maxServings: 50, dishesPerMeal: 20 } as const;

// --- Days ---------------------------------------------------------------------------

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-11-11" plus n days, on the phone's calendar. */
export function addDays(day: string, n: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + n);
  return formatDay(date);
}

/** The Monday of the week holding `day` (Senin first, as Indonesian calendars print). */
export function weekStart(day: string): string {
  const date = parseDay(day);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return formatDay(date);
}

/** The seven days from a Monday. */
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const LOCALES: Record<RecipeLang, string> = { en: "en-GB", id: "id-ID" };

/** "Wed" / "Rab". */
export function weekdayShort(day: string, lang: RecipeLang): string {
  return parseDay(day).toLocaleDateString(LOCALES[lang], { weekday: "short" }).replace(".", "");
}

/** "Wednesday" / "Rabu". */
export function weekdayLong(day: string, lang: RecipeLang): string {
  return parseDay(day).toLocaleDateString(LOCALES[lang], { weekday: "long" });
}

/** "11 Nov" / "11 Nov". */
export function dayMonth(day: string, lang: RecipeLang): string {
  return parseDay(day).toLocaleDateString(LOCALES[lang], { day: "numeric", month: "short" }).replace(".", "");
}

/** "9–15 Nov" or "30 Nov – 6 Dec". */
export function weekRangeLabel(start: string, lang: RecipeLang): string {
  const a = parseDay(start);
  const b = parseDay(addDays(start, 6));
  const month = (d: Date) => d.toLocaleDateString(LOCALES[lang], { month: "short" }).replace(".", "");
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${month(b)}`;
  return `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`;
}

// --- Dishes -------------------------------------------------------------------------

const MEAL_ORDER: Record<MenuMeal, number> = { breakfast: 0, lunch: 1, dinner: 2 };

/** Breakfast, lunch, dinner; then the order they were added. */
export function compareDishes(a: MenuDish, b: MenuDish): number {
  return (
    a.day.localeCompare(b.day) ||
    MEAL_ORDER[a.meal] - MEAL_ORDER[b.meal] ||
    a.position - b.position ||
    a.created_at.localeCompare(b.created_at)
  );
}

/** One day's dishes, in order. */
export function dishesOn(dishes: readonly MenuDish[], day: string): MenuDish[] {
  return dishes.filter((dish) => dish.day === day).sort(compareDishes);
}

/** One day's dishes grouped by meal, only the meals that have any. */
export function mealsOf(dishes: readonly MenuDish[]): { meal: MenuMeal; dishes: MenuDish[] }[] {
  return MEALS.map((meal) => ({ meal, dishes: dishes.filter((d) => d.meal === meal).sort(compareDishes) })).filter(
    (group) => group.dishes.length > 0
  );
}

export function recipeOf(dish: Pick<MenuDish, "recipe_id">, recipes: readonly RecipeWithLines[]): RecipeWithLines | null {
  return dish.recipe_id ? (recipes.find((r) => r.id === dish.recipe_id) ?? null) : null;
}

/** The servings a dish cooks for: its own, else its recipe's. */
export function dishServings(dish: Pick<MenuDish, "servings">, recipe: RecipeWithLines | null): number | null {
  return dish.servings ?? recipe?.servings ?? null;
}

/**
 * How a dish's name reads. Owners see the title they planned. A staff phone
 * sees a recipe's Indonesian name when it has one (staffText), else the
 * title: household content, like a task title.
 */
export function dishTitle(dish: Pick<MenuDish, "title">, recipe: RecipeWithLines | null, forStaff: boolean): string {
  if (forStaff && recipe) return staffText(recipe).name;
  return dish.title;
}

/** "Menu today: Soto ayam, Rendang" / "Menu hari ini: …", or null with nothing planned. */
export function todayMenuLine(dishes: readonly MenuDish[], today: string, lang: RecipeLang): string | null {
  const names = dishesOn(dishes, today).map((d) => d.title);
  if (names.length === 0) return null;
  return `${lang === "id" ? "Menu hari ini" : "Menu today"}: ${names.join(", ")}`;
}

/** What add/edit saves (the rest is the server's). */
export interface MenuDishInput {
  day: string;
  meal: MenuMeal;
  recipe_id: string | null;
  title: string;
  servings: number | null;
  notes: string | null;
  position: number;
}

/**
 * The recipe a dish is linked to in the editor: its id and the name to show
 * (Codex, PR #101). Held by id, so a dish opened before the recipes load
 * keeps its link: the name falls back to the dish's title until they arrive.
 * Only the owner's own "Not this recipe" removes it.
 */
export interface DishLink {
  id: string;
  name: string;
}

export function initialDishLink(
  editing: Pick<MenuDish, "recipe_id" | "title"> | null,
  recipes: readonly RecipeWithLines[],
  picked: RecipeWithLines | null = null
): DishLink | null {
  if (editing) {
    if (!editing.recipe_id) return null;
    const recipe = recipes.find((r) => r.id === editing.recipe_id);
    return { id: editing.recipe_id, name: recipe?.name ?? editing.title };
  }
  return picked ? { id: picked.id, name: picked.name } : null;
}

/**
 * What the editor saves. recipe_id and servings come from the link as held:
 * never null just because the recipes haven't loaded (Codex, PR #101).
 */
export function dishSaveFields(form: {
  day: string;
  meal: MenuMeal;
  link: DishLink | null;
  title: string;
  servings: number | null;
  notes: string;
}): Omit<MenuDishInput, "position"> {
  return {
    day: form.day,
    meal: form.meal,
    recipe_id: form.link?.id ?? null,
    title: form.title.trim().slice(0, MENU_LIMITS.title),
    servings: form.link ? form.servings : null,
    notes: form.notes.trim().slice(0, MENU_LIMITS.notes) || null,
  };
}

/** The next position in a day's meal. */
export function nextPosition(dishes: readonly MenuDish[], day: string, meal: MenuMeal): number {
  const taken = dishes.filter((d) => d.day === day && d.meal === meal).map((d) => d.position);
  return Math.min(99, taken.length === 0 ? 0 : Math.max(...taken) + 1);
}

/**
 * Copy last week (plan, D9): every day of the week that has nothing planned
 * gets the same weekday's dishes from the week before, uncooked. Days that
 * already have a dish are left alone.
 */
export function copyLastWeek(dishes: readonly MenuDish[], start: string): MenuDishInput[] {
  const out: MenuDishInput[] = [];
  for (const day of weekDays(start)) {
    if (dishes.some((d) => d.day === day)) continue;
    for (const dish of dishesOn(dishes, addDays(day, -7))) {
      out.push({
        day,
        meal: dish.meal,
        recipe_id: dish.recipe_id,
        title: dish.title,
        servings: dish.servings,
        notes: dish.notes,
        position: dish.position,
      });
    }
  }
  return out;
}

/**
 * Copy last week may run only once both weeks came from the server (Codex,
 * PR #101): the phone's copy may not know a dish already planned this week,
 * and copying over it would plan it twice.
 */
export function canCopyLastWeek(loadedWeeks: readonly string[], start: string, toCopy: readonly MenuDishInput[]): boolean {
  return toCopy.length > 0 && loadedWeeks.includes(start) && loadedWeeks.includes(addDays(start, -7));
}

// --- Cooking ------------------------------------------------------------------------

function isSpoon(unit: RecipeUnit | null): boolean {
  return unit === "sdm" || unit === "sdt";
}

/**
 * A line's amount for `servings`, in its linked item's unit, when it can
 * come off stock: the item is tracked, the line has an amount and a unit,
 * and the unit converts exactly (D4: g ↔ kg, ml ↔ L, pieces 1 : 1; never
 * sdm, sdt or to taste). Null otherwise.
 */
export function lineInItemUnit(
  line: { amount: number | null; unit: RecipeUnit | null },
  item: InventoryItem | null,
  base: number,
  servings: number
): number | null {
  if (!item || !isTracked(item) || line.amount === null || line.unit === null || isSpoon(line.unit)) return null;
  const scaled = scaleAmount(line.amount, line.unit, base, servings);
  const converted = convertAmount(scaled, line.unit as InventoryUnit, item.unit);
  return converted === null || !(converted > 0) ? null : clean(converted);
}

export interface CountedLine {
  itemId: string;
  name: string;
  /** In the item's unit, scaled to the dish's servings, lines of one item summed. */
  amount: number;
  unit: InventoryUnit;
  /** What's there now (the item's tracked amount). */
  have: number;
}

export interface UncountedLine {
  key: string;
  name: string;
  amount: number | null;
  unit: RecipeUnit | null;
}

/**
 * The confirm sheet's two lists (plan, Cooking): "Bahan yang dipakai", the
 * recipe's tracked lines whose unit converts, scaled to the dish's servings
 * and summed per item; and "Tidak dihitung", the rest (to taste, sdm/sdt,
 * untracked, free names), for information.
 */
export function cookLines(
  recipe: RecipeWithLines | null,
  servings: number | null,
  items: readonly InventoryItem[],
  forStaff: boolean
): { counted: CountedLine[]; uncounted: UncountedLine[] } {
  if (!recipe) return { counted: [], uncounted: [] };
  const target = servings ?? recipe.servings;
  const counted = new Map<string, CountedLine>();
  const uncounted: UncountedLine[] = [];
  for (const line of recipe.ingredients) {
    const item = lineItem(line, items);
    const amount = lineInItemUnit(line, item, recipe.servings, target);
    if (item && amount !== null) {
      const existing = counted.get(item.id);
      if (existing) existing.amount = clean(existing.amount + amount);
      else counted.set(item.id, { itemId: item.id, name: stockItemName(item), amount, unit: item.unit, have: item.quantity });
    } else {
      uncounted.push({
        key: line.id,
        name: lineName(line, items, forStaff, recipe.written_in),
        amount: line.amount === null ? null : scaleAmount(line.amount, line.unit, recipe.servings, target),
        unit: line.unit,
      });
    }
  }
  return { counted: [...counted.values()], uncounted };
}

/**
 * Whether Sudah dimasak may run yet (Codex, PR #101). Cooking takes off what
 * the recipe says, from the items as the server holds them, so a recipe dish
 * waits for both to come from the server in this session: the phone's last
 * copy may miss a new recipe or a newly tracked item, and a dish marked
 * cooked with nothing taken off stays that way.
 *
 *   - a dish without a recipe needs nothing: ready;
 *   - its recipe isn't in a fresh list: deleted, so nothing to take off
 *     (ready); in a list not fresh yet: loading, or failed if the read failed;
 *   - a recipe with lines linked to items also needs the household's lists
 *     fresh (loading, or failed when the household's read failed).
 */
export type CookReadiness = "ready" | "loading" | "failed";

export function cookReadiness(
  dish: Pick<MenuDish, "recipe_id">,
  state: {
    recipes: readonly RecipeWithLines[];
    recipesFresh: boolean;
    recipesErrored: boolean;
    listsFresh: boolean;
    listsFailed: boolean;
  }
): CookReadiness {
  if (!dish.recipe_id) return "ready";
  if (!state.recipesFresh) return state.recipesErrored ? "failed" : "loading";
  const recipe = recipeOf(dish, state.recipes);
  if (!recipe) return "ready";
  if (!recipe.ingredients.some((line) => line.item_id)) return "ready";
  if (!state.listsFresh) return state.listsFailed ? "failed" : "loading";
  return "ready";
}

/**
 * Whether Add missing to Shopping may add things up yet (Codex, PR #101):
 * the review is a snapshot, so it waits until the week's dishes, the recipes
 * and the household's items all came from the server in this session. The
 * phone's copy alone could freeze "Nothing to add" or miss a shortfall.
 * Failed, when any of the three reads failed and hasn't come in since.
 */
export function shortfallReadiness(state: {
  weekLoaded: boolean;
  weekFailed: boolean;
  recipesFresh: boolean;
  recipesErrored: boolean;
  listsFresh: boolean;
  listsFailed: boolean;
}): CookReadiness {
  if (
    (!state.weekLoaded && state.weekFailed) ||
    (!state.recipesFresh && state.recipesErrored) ||
    (!state.listsFresh && state.listsFailed)
  ) {
    return "failed";
  }
  if (!state.weekLoaded || !state.recipesFresh || !state.listsFresh) return "loading";
  return "ready";
}

/**
 * What cook_menu_dish takes: the ticked lines, each > 0, at most 100,000,
 * with the unit the phone saw, so the server converts (or refuses) if an
 * owner changed the item's unit meanwhile (Codex, PR #101).
 */
export function usesFrom(lines: readonly { itemId: string; amount: number; unit: InventoryUnit; on: boolean }[]): CookedUse[] {
  return lines
    .filter((line) => line.on && line.amount > 0)
    .map((line) => ({ item_id: line.itemId, amount: Math.min(100_000, clean(line.amount)), unit: line.unit }));
}

// --- Add missing to Shopping --------------------------------------------------------

/** A shortfall, rounded up so the shopper buys enough: 5 g, 0.1 kg, whole otherwise. */
export function roundUpBuy(value: number, unit: InventoryUnit): number {
  const up = (step: number) => clean(Math.ceil(clean(value / step)) * step);
  if (unit === "g" || unit === "ml") return value < 5 ? up(1) : up(5);
  if (unit === "kg" || unit === "L") return up(0.1);
  return up(1);
}

/** "Need 1.5 kg · have 1 kg · buy 500 g" / "Perlu 1,5 kg · ada 1 kg · beli 500 g". */
export function shortfallLine(need: number, have: number, buy: number, unit: InventoryUnit, lang: RecipeLang): string {
  const f = (v: number) => friendlyAmount(v, unit, lang);
  return lang === "id" ? `Perlu ${f(need)} · ada ${f(have)} · beli ${f(buy)}` : `Need ${f(need)} · have ${f(have)} · buy ${f(buy)}`;
}

export interface ToBuyLine {
  item: InventoryItem;
  need: number;
  have: number;
  buy: number;
}

export interface MenuShortfall {
  /** Tracked items where the week needs more than what's there. Ticked by default. */
  toBuy: ToBuyLine[];
  /** Tracked items with enough: shown, not added. */
  enough: { item: InventoryItem; need: number; have: number }[];
  /**
   * Items she keeps but the amounts can't count: linked lines whose item
   * isn't tracked (or whose unit doesn't convert), and free-name lines whose
   * name is exactly one item's. Unticked.
   */
  check: InventoryItem[];
  /** Free-name ingredients Miamus has no item for (or a deleted item's). Ticked; added as notes. */
  unlisted: string[];
}

/**
 * Add missing to Shopping (D10): the dishes from `from` on that aren't
 * cooked yet, every recipe line scaled to its dish's servings and added up
 * per item, against what's there now.
 */
export function menuShortfall(
  dishes: readonly MenuDish[],
  recipes: readonly RecipeWithLines[],
  items: readonly InventoryItem[],
  from: string,
  to: string
): MenuShortfall {
  const need = new Map<string, number>();
  const check = new Map<string, InventoryItem>();
  const unlisted = new Map<string, string>();
  // A free name that is exactly one item's name ("Garam" once Garam is in
  // Ingredients) is that item to check, not unlisted. Trimmed, lower-cased,
  // inner spaces collapsed; two items with the name match neither. It never
  // counts towards To buy or Enough, and lineItem (cooking) is unchanged.
  const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  const byItemName = new Map<string, InventoryItem | null>();
  for (const item of items) {
    const key = norm(item.name);
    if (key) byItemName.set(key, byItemName.has(key) ? null : item);
  }
  for (const dish of dishes) {
    if (dish.day < from || dish.day > to || dish.cooked_at) continue;
    const recipe = recipeOf(dish, recipes);
    if (!recipe) continue;
    const servings = dishServings(dish, recipe) ?? recipe.servings;
    for (const line of recipe.ingredients) {
      const item = lineItem(line, items);
      if (!item) {
        const match = line.item_id ? null : byItemName.get(norm(line.name));
        if (match) {
          check.set(match.id, match);
          continue;
        }
        const key = line.name.trim().toLowerCase();
        if (key && !unlisted.has(key)) unlisted.set(key, line.name.trim());
        continue;
      }
      const amount = lineInItemUnit(line, item, recipe.servings, servings);
      if (amount === null) check.set(item.id, item);
      else need.set(item.id, clean((need.get(item.id) ?? 0) + amount));
    }
  }
  const toBuy: ToBuyLine[] = [];
  const enough: MenuShortfall["enough"] = [];
  for (const [id, amount] of need) {
    const item = items.find((i) => i.id === id)!;
    check.delete(id);
    const have = Math.max(0, item.quantity);
    if (amount > have) toBuy.push({ item, need: amount, have, buy: roundUpBuy(amount - have, item.unit) });
    else enough.push({ item, need: amount, have });
  }
  const byName = (a: { item: InventoryItem }, b: { item: InventoryItem }) =>
    stockItemName(a.item).localeCompare(stockItemName(b.item));
  return {
    toBuy: toBuy.sort(byName),
    enough: enough.sort(byName),
    check: [...check.values()].sort((a, b) => stockItemName(a).localeCompare(stockItemName(b))),
    unlisted: [...unlisted.values()].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * What a ticked To buy line writes (owners; ordinary updates): Running low,
 * or Out when there's none left, with the shortfall stored.
 */
export function toBuyPatch(line: Pick<ToBuyLine, "item" | "buy">): { stock_status: "low" | "out"; to_buy_amount: number } {
  return { stock_status: line.item.quantity > 0 ? "low" : "out", to_buy_amount: Math.min(100_000, line.buy) };
}
