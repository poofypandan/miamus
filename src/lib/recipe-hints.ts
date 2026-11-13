import { stockItemName } from "@/lib/inventory";
import { clean, isTracked } from "@/lib/kitchen-units";
import { lineInItemUnit } from "@/lib/menu";
import { saidOf } from "@/lib/cooked-uses";
import type { RecipePayload, RecipeWithLines } from "@/lib/recipes";
import type { CookedUse, InventoryItem, MenuDish, RecipeUnit } from "@/types/database";

/**
 * Recipes that learn (Phase 177, docs/phase-177-cooking-corrections-plan.md
 * section 4). Worked out on the owner's phone from the household's cooked
 * dishes; staff phones never run it. Arithmetic, not Kakak: nothing here
 * calls a model, and Miamus never changes a recipe by itself.
 *
 * For one recipe and one of its ingredients, there is a suggestion when:
 *   - the ingredient is a tracked item, linked by exactly one line of the
 *     recipe, with an amount and a unit that converts (a line cooking can
 *     take off);
 *   - the owner hasn't said Keep recipe for it (recipe.hints_off);
 *   - of the dishes cooked from the recipe since it was last saved, newest
 *     first, keeping those where it came off with both numbers on record
 *     (`planned` and `said` > 0), the newest HINT_COOKS were all at least
 *     HINT_MIN_CHANGE more than the recipe asked, or all at least that less.
 *
 * The suggested amount is the recipe's times the middle ratio, rounded so it
 * reads like a recipe, kept inside what a recipe line may hold. Equal to the
 * recipe's after rounding: no suggestion.
 */

/** Dishes in a row it takes (plan, section 13: the owner accepted three). */
export const HINT_COOKS = 3;
/** How far off each must be (10%). */
export const HINT_MIN_CHANGE = 0.1;
/** The largest amount a recipe line holds (save_recipe's limit, as stock's). */
const MAX_LINE_AMOUNT = 100_000;

export type HintDish = Pick<MenuDish, "id" | "recipe_id" | "cooked_at" | "cooked_uses">;

export interface HintLine {
  itemId: string;
  name: string;
  /** The recipe line's own unit. */
  unit: RecipeUnit;
  /** What the recipe says now. */
  recipeAmount: number;
  /** What it was about, rounded: the amount Update recipe saves. */
  suggested: number;
}

export interface RecipeHint {
  recipe: RecipeWithLines;
  lines: HintLine[];
  /** The newest of the dishes it learned from (the Menu shows the most recent first). */
  lastCooked: string;
}

/** One rounding step for an amount in a recipe line's unit (plan 4a's table). */
export function hintStep(value: number, unit: RecipeUnit): number {
  if (unit === "g" || unit === "ml") {
    if (value < 10) return 1;
    if (value < 100) return 5;
    if (value < 1000) return 10;
    return 50;
  }
  if (unit === "kg" || unit === "L") return 0.05;
  return 1;
}

/**
 * Rounded so it reads like a recipe, never below one step of its row (1 g,
 * 0.05 kg, 1 piece) and never above 100,000: an amount save_recipe accepts.
 */
export function roundHint(value: number, unit: RecipeUnit): number {
  const step = hintStep(value, unit);
  const rounded = clean(Math.round(clean(value / step)) * step);
  const smallest = unit === "g" || unit === "ml" ? 1 : unit === "kg" || unit === "L" ? 0.05 : 1;
  return Math.min(MAX_LINE_AMOUNT, Math.max(smallest, rounded));
}

/** said / planned of one dish's entry for an item, or null when it doesn't count. */
function ratioOf(uses: readonly CookedUse[] | null, itemId: string): number | null {
  const entries = (uses ?? []).filter((u) => u.item_id === itemId);
  if (entries.length !== 1) return null;
  const entry = entries[0];
  const said = saidOf(entry);
  if (entry.planned == null || !(entry.planned > 0) || !(said > 0)) return null;
  return said / entry.planned;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function recipeHints(
  recipes: readonly RecipeWithLines[],
  cooked: readonly HintDish[],
  items: readonly InventoryItem[]
): RecipeHint[] {
  const hints: RecipeHint[] = [];
  for (const recipe of recipes) {
    const dishes = cooked
      .filter((d) => d.recipe_id === recipe.id && d.cooked_at && d.cooked_at > recipe.updated_at)
      .sort((a, b) => (b.cooked_at ?? "").localeCompare(a.cooked_at ?? ""));
    if (dishes.length < HINT_COOKS) continue;
    const off = new Set(recipe.hints_off ?? []);
    const lines: HintLine[] = [];
    let lastCooked = "";
    for (const line of recipe.ingredients) {
      if (!line.item_id || off.has(line.item_id) || line.amount === null || line.unit === null) continue;
      if (recipe.ingredients.filter((l) => l.item_id === line.item_id).length !== 1) continue;
      const item = items.find((i) => i.id === line.item_id);
      if (!item || !isTracked(item) || lineInItemUnit(line, item, recipe.servings, recipe.servings) === null) continue;
      const ratios: number[] = [];
      let newest = "";
      for (const dish of dishes) {
        const ratio = ratioOf(dish.cooked_uses, item.id);
        if (ratio === null) continue;
        if (!newest) newest = dish.cooked_at ?? "";
        ratios.push(ratio);
        if (ratios.length === HINT_COOKS) break;
      }
      if (ratios.length < HINT_COOKS) continue;
      const more = ratios.every((r) => clean(r) >= clean(1 + HINT_MIN_CHANGE));
      const less = ratios.every((r) => clean(r) <= clean(1 - HINT_MIN_CHANGE));
      if (!more && !less) continue;
      const suggested = roundHint(line.amount * median(ratios), line.unit);
      if (suggested === clean(line.amount)) continue;
      lines.push({ itemId: item.id, name: stockItemName(item), unit: line.unit, recipeAmount: line.amount, suggested });
      if (newest > lastCooked) lastCooked = newest;
    }
    if (lines.length > 0) hints.push({ recipe, lines, lastCooked });
  }
  return hints.sort((a, b) => b.lastCooked.localeCompare(a.lastCooked));
}

/**
 * save_recipe takes the whole recipe: the payload of a recipe as it is
 * (beside payloadFrom, which builds one from the editor's draft). Only
 * ever from a recipe list that came from the server.
 */
export function payloadOfRecipe(recipe: RecipeWithLines, amounts: ReadonlyMap<string, number> = new Map()): RecipePayload {
  return {
    recipe: {
      id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      steps: recipe.steps,
      written_in: recipe.written_in,
      name_id: recipe.name_id,
      steps_id: recipe.steps_id,
    },
    ingredients: [...recipe.ingredients]
      .sort((a, b) => a.position - b.position)
      .map((line) => ({
        item_id: line.item_id,
        name: line.name,
        name_id: line.name_id,
        amount: line.item_id && amounts.has(line.item_id) ? amounts.get(line.item_id)! : line.amount,
        unit: line.unit,
      })),
  };
}

/** The suggested amounts of a hint, by item, for payloadOfRecipe. */
export function hintAmounts(hint: Pick<RecipeHint, "lines">): Map<string, number> {
  return new Map(hint.lines.map((l) => [l.itemId, l.suggested]));
}
