import { FOOD_PLACE_LABELS, daysLeft, type FoodLocale } from "@/lib/food";
import { compareForList, isOutOfStock } from "@/lib/inventory";
import type { FoodPlace, InventoryCategory, InventoryItem } from "@/types/database";

/**
 * Where an ingredient is kept and when it expires (Phase 176,
 * migrations/154; docs/phase-176-kitchen-places-plan.md, section 4). Pure, so
 * it is unit-tested (tests/unit/ingredients.test.ts). Dates are the phone's
 * calendar days (YYYY-MM-DD), as in lib/food.
 */

/** "Use soon": a date this many days away or fewer, past dates included. */
export const USE_SOON_DAYS = 7;

/** The Ingredients list's groups, top to bottom: Use soon, then the places. */
export type IngredientGroup = "soon" | FoodPlace;

export const INGREDIENT_GROUPS: readonly IngredientGroup[] = ["soon", "fridge", "freezer", "counter", "pantry"];

export const INGREDIENT_GROUP_LABELS: Record<FoodLocale, Record<IngredientGroup, string>> = {
  en: { soon: "Use soon", ...FOOD_PLACE_LABELS.en },
  id: { soon: "Segera dipakai", ...FOOD_PLACE_LABELS.id },
};

/**
 * Where an ingredient is until someone says otherwise: Fresh Food in the
 * Fridge, Pantry (and anything else) in the Cupboard. Shown, never stored.
 */
export function defaultPlace(category: InventoryCategory): FoodPlace {
  return category === "fresh_food" ? "fridge" : "pantry";
}

/** The stored place, or the category's default while nobody has said. */
export function placeOf(item: Pick<InventoryItem, "kept_in" | "category">): FoodPlace {
  return item.kept_in ?? defaultPlace(item.category);
}

/** Days from `today` to its date: 0 today, negative once past. Null: no date. */
export function ingredientDaysLeft(item: Pick<InventoryItem, "expires_on">, today: string): number | null {
  return daysLeft({ expires_on: item.expires_on ?? null }, today);
}

/**
 * Use soon: not Out, has a date, and that date is USE_SOON_DAYS or fewer
 * away (past dates included). The server clears an Out item's date anyway;
 * the status check keeps a row cached before that from showing up here.
 */
export function isUseSoon(item: InventoryItem, today: string): boolean {
  if (isOutOfStock(item)) return false;
  const days = ingredientDaysLeft(item, today);
  return days !== null && days <= USE_SOON_DAYS;
}

/**
 * The ingredients in their groups. Each item is in exactly one: Use soon
 * (soonest date first, then name), or its place (as the list orders items
 * today: Out, then Running low, then by shelf and name).
 */
export function groupIngredients(items: readonly InventoryItem[], today: string): Record<IngredientGroup, InventoryItem[]> {
  const groups: Record<IngredientGroup, InventoryItem[]> = { soon: [], fridge: [], freezer: [], counter: [], pantry: [] };
  for (const item of items) {
    groups[isUseSoon(item, today) ? "soon" : placeOf(item)].push(item);
  }
  groups.soon.sort((a, b) => {
    const byDate = (a.expires_on ?? "").localeCompare(b.expires_on ?? "");
    return byDate || compareForList(a, b);
  });
  for (const place of ["fridge", "freezer", "counter", "pantry"] as const) groups[place].sort(compareForList);
  return groups;
}

/**
 * The words under an ingredient's name: "Expires tomorrow", "Expires in 5
 * days", "2 days past date — check first". Null: no date, nothing to say.
 */
export function ingredientExpiryText(days: number | null, locale: FoodLocale): string | null {
  if (days === null) return null;
  const id = locale === "id";
  if (days < 0) {
    const n = -days;
    return id ? `Lewat ${n} hari — cek dulu` : `${n} day${n === 1 ? "" : "s"} past date — check first`;
  }
  if (days === 0) return id ? "Kedaluwarsa hari ini" : "Expires today";
  if (days === 1) return id ? "Kedaluwarsa besok" : "Expires tomorrow";
  return id ? `Kedaluwarsa ${days} hari lagi` : `Expires in ${days} days`;
}

/** A name as the double-entry check compares it: trimmed, lower case, single spaces. */
export function normalName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The same name, for "already in Ingredients" (section 5d). Exact names
 * only: "Ayam" is not "Dada Ayam". Two blank names are never the same.
 */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalName(a);
  return left !== "" && left === normalName(b);
}
