import { stockStatus } from "@/lib/inventory";
import { clean, isTracked } from "@/lib/kitchen-units";
import { lineInItemUnit } from "@/lib/menu";
import { lineItem, lineName, type RecipeLang, type RecipeWithLines } from "@/lib/recipes";
import type { InventoryItem } from "@/types/database";

/**
 * Can we cook it? (docs/phase-170-kitchen-plan.md D18; the owner's 20 Nov
 * decision on docs/private/trailer-reset/27-kakak-magic.md). Worked out on
 * the phone from what is already stored: no AI, no new data, no prices.
 *
 * For a recipe at a number of servings, each ingredient line is:
 *
 *   - linked to an item, Kitchen amounts on, the item tracked and the
 *     line's unit converting: there when the amount at home covers the
 *     scaled amount (the lines of one item added up);
 *   - linked to an item otherwise (amounts off, untracked, sdm or sdt, to
 *     taste): there when its status is Enough. Running low and Out are
 *     missing;
 *   - a free name that is exactly one item's name (Add missing's rule,
 *     menuShortfall): that item, by its status;
 *   - a free name Miamus has no item for, or a deleted item: not checked.
 *
 * Per dish, against what is there now: a dish later in the week does not
 * take off what an earlier one will use (Add missing to Shopping adds up the
 * week). Kakak reads the same result (Phase B); she never works it out.
 */

export type CookState = "ready" | "missing" | "unknown";

export interface CookCheck {
  /** ready: nothing missing and something checked; unknown: nothing could be checked. */
  state: CookState;
  /** Each missing item once, in the recipe's order, named as this phone reads it. */
  missing: { itemId: string; name: string }[];
  /** Lines that could not be checked, by name, once each. */
  unchecked: string[];
}

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** Item name → the one item with it (two items with one name match neither). */
function itemsByName(items: readonly InventoryItem[]): Map<string, InventoryItem | null> {
  const byName = new Map<string, InventoryItem | null>();
  for (const item of items) {
    const key = norm(item.name);
    if (key) byName.set(key, byName.has(key) ? null : item);
  }
  return byName;
}

export function cookCheck(
  recipe: RecipeWithLines,
  servings: number | null,
  items: readonly InventoryItem[],
  { amounts, forStaff }: { amounts: boolean; forStaff: boolean }
): CookCheck {
  const target = servings ?? recipe.servings;
  const byName = itemsByName(items);
  // Per item, in the recipe's order: the name to show, the amount the
  // counted lines need, and whether any line of it is checked by status.
  const perItem = new Map<string, { item: InventoryItem; name: string; need: number; byStatus: boolean }>();
  const unchecked: string[] = [];
  const seenUnchecked = new Set<string>();

  for (const line of recipe.ingredients) {
    const linked = lineItem(line, items);
    const item = linked ?? (line.item_id ? null : (byName.get(norm(line.name)) ?? null));
    if (!item) {
      const name = lineName(line, items, forStaff, recipe.written_in).trim();
      const key = norm(name);
      if (key && !seenUnchecked.has(key)) {
        seenUnchecked.add(key);
        unchecked.push(name);
      }
      continue;
    }
    const entry = perItem.get(item.id) ?? {
      item,
      name: lineName(line, items, forStaff, recipe.written_in).trim(),
      need: 0,
      byStatus: false,
    };
    const amount = amounts && linked && isTracked(item) ? lineInItemUnit(line, item, recipe.servings, target) : null;
    if (amount !== null) entry.need = clean(entry.need + amount);
    else entry.byStatus = true;
    perItem.set(item.id, entry);
  }

  const missing: CookCheck["missing"] = [];
  for (const { item, name, need, byStatus } of perItem.values()) {
    // A line counted by status needs Enough. Counted amounts need the amount
    // at home; a tracked item with enough that a person marked Running low
    // is there for this dish (the amount says so, D18).
    const short = byStatus ? stockStatus(item) !== "ok" : Math.max(0, item.quantity) < need;
    if (short) missing.push({ itemId: item.id, name });
  }

  const state: CookState = missing.length > 0 ? "missing" : perItem.size > 0 ? "ready" : "unknown";
  return { state, missing, unchecked };
}

/**
 * The line on a recipe or a dish: "Ready to cook" / "Bahan lengkap", or
 * "Missing 2: Santan, Serai" / "Kurang 2: Santan, Serai". On a day after
 * today the ready line says "now", so nobody takes it as a promise for
 * Friday. Null when nothing could be checked.
 */
export function cookLine(check: CookCheck, lang: RecipeLang, { later = false }: { later?: boolean } = {}): string | null {
  if (check.state === "unknown") return null;
  if (check.state === "ready") {
    if (lang === "id") return later ? "Bahan lengkap saat ini" : "Bahan lengkap";
    return later ? "Ready to cook now" : "Ready to cook";
  }
  const names = check.missing.map((m) => m.name).join(", ");
  return `${lang === "id" ? "Kurang" : "Missing"} ${check.missing.length}: ${names}`;
}

/** "Not checked: Serai" / "Belum dicek: Serai", or null. */
export function uncheckedLine(check: CookCheck, lang: RecipeLang): string | null {
  if (check.unchecked.length === 0) return null;
  return `${lang === "id" ? "Belum dicek" : "Not checked"}: ${check.unchecked.join(", ")}`;
}

/**
 * The Recipes pill's "Ready to cook now" (D18): the recipes with nothing
 * missing first, then by fewest missing; recipes nothing could be checked
 * for last. Stable within each, so the alphabetical order holds.
 */
export function readyFirst<T>(recipes: readonly T[], checkOf: (recipe: T) => CookCheck): T[] {
  const rank = (c: CookCheck) => (c.state === "ready" ? 0 : c.state === "missing" ? c.missing.length : Number.MAX_SAFE_INTEGER);
  return recipes
    .map((recipe, index) => ({ recipe, index, rank: rank(checkOf(recipe)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.recipe);
}
