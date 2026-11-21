import { FOOD_PLACE_LABELS, compareFood, daysLeft, isListed, type FoodLocale } from "@/lib/food";
import { USE_SOON_DAYS, ingredientDaysLeft, placeOf } from "@/lib/ingredients";
import { compareForList, isLowStock, isOutOfStock, stockItemName } from "@/lib/inventory";
import type { FoodItem, FoodPlace, InventoryItem } from "@/types/database";

/**
 * Kitchen → Food as an inventory (21 Nov; Fable's 08-kitchen-inventory.md,
 * section 2, and kitchen-inventory.html): the kitchen's places as shelves,
 * a tile a thing, food and ingredients on the same shelves, "Use soon"
 * first. Pure, so it is unit-tested (tests/unit/kitchen-shelves.test.ts).
 *
 * Nothing here is stored: the place, the date and Enough / Running low /
 * Out are what Miamus already keeps; the symbol is chosen from the name.
 */

export type ShelfThing =
  | { kind: "food"; id: string; name: string; item: FoodItem }
  | { kind: "ingredient"; id: string; name: string; item: InventoryItem };

export type ShelfKey = "soon" | FoodPlace;

/** Top to bottom: Use soon, then the places as the Ingredients list orders them. */
export const SHELVES: readonly ShelfKey[] = ["soon", "fridge", "freezer", "counter", "pantry"];

export const SHELF_LABELS: Record<FoodLocale, Record<ShelfKey, string>> = {
  en: { soon: "Use soon", ...FOOD_PLACE_LABELS.en },
  id: { soon: "Segera dipakai", ...FOOD_PLACE_LABELS.id },
};

/** The three small pills (08, section 1: instant sorting). */
export type ShelfFilter = "all" | "soon" | "buy";
export const SHELF_FILTERS: readonly ShelfFilter[] = ["all", "soon", "buy"];
export const SHELF_FILTER_LABELS: Record<FoodLocale, Record<ShelfFilter, string>> = {
  en: { all: "Everything", soon: "Use soon", buy: "To buy" },
  id: { all: "Semua", soon: "Segera dipakai", buy: "Perlu dibeli" },
};

export function shelfFilterFrom(raw: string | null): ShelfFilter {
  return raw === "soon" || raw === "buy" ? raw : "all";
}

export function thingPlace(thing: ShelfThing): FoodPlace {
  return thing.kind === "food" ? thing.item.kept_in : placeOf(thing.item);
}

/** Days to its date: 0 today, negative once past; null with no date (or Out). */
export function thingDays(thing: ShelfThing, today: string): number | null {
  if (thing.kind === "food") return daysLeft(thing.item, today);
  if (isOutOfStock(thing.item)) return null;
  return ingredientDaysLeft(thing.item, today);
}

/** Food nobody knows the date of: "Check the date", in Use soon. */
function dateUnknown(thing: ShelfThing): boolean {
  return thing.kind === "food" && !thing.item.expires_on && thing.item.expiry_unknown;
}

/**
 * Use soon: a date seven days away or fewer, past dates included (the app's
 * own rule, lib/ingredients), and food whose date nobody knows. Never Out.
 */
export function isUseSoon(thing: ShelfThing, today: string): boolean {
  if (dateUnknown(thing)) return true;
  const days = thingDays(thing, today);
  return days !== null && days <= USE_SOON_DAYS;
}

/** To buy: an ingredient Running low or Out (what goes on the shopping list). */
export function isToBuy(thing: ShelfThing): boolean {
  return thing.kind === "ingredient" && (isLowStock(thing.item) || isOutOfStock(thing.item));
}

/**
 * How a tile looks (08: amber is rationed).
 *   urgent   eat today or tomorrow, or already past: an amber tile, the mark, the word
 *   soon     two or three days away: a plain tile, the word in amber
 *   check    food whose date nobody knows: as urgent, "Check the date"
 *   low      Running low: the mark and the word in amber
 *   out      an outlined empty tile, its name in grey, "Out"
 *   quiet    a day further off, in grey
 *   none     simply there: no word at all
 */
export type TileTone = "urgent" | "soon" | "check" | "low" | "out" | "quiet" | "none";

export interface TileState {
  tone: TileTone;
  /** The one quiet word, or null for a thing that is simply there. */
  word: string | null;
}

function dayWord(days: number, locale: FoodLocale): string {
  const id = locale === "id";
  if (days < 0) {
    const n = -days;
    return id ? `Lewat ${n} hari` : `${n} day${n === 1 ? "" : "s"} past`;
  }
  if (days === 0) return id ? "Hari ini" : "Today";
  if (days === 1) return id ? "Besok" : "Tomorrow";
  return id ? `${days} hari lagi` : `${days} days`;
}

export function tileState(thing: ShelfThing, today: string, locale: FoodLocale): TileState {
  const id = locale === "id";
  if (thing.kind === "ingredient" && isOutOfStock(thing.item)) return { tone: "out", word: id ? "Habis" : "Out" };
  if (dateUnknown(thing)) return { tone: "check", word: id ? "Cek tanggalnya" : "Check the date" };
  const days = thingDays(thing, today);
  if (days !== null && days <= 1) return { tone: "urgent", word: dayWord(days, locale) };
  if (days !== null && days <= 3) return { tone: "soon", word: dayWord(days, locale) };
  if (thing.kind === "ingredient" && isLowStock(thing.item)) return { tone: "low", word: id ? "Hampir habis" : "Low" };
  if (days !== null) return { tone: "quiet", word: dayWord(days, locale) };
  return { tone: "none", word: null };
}

/** Everything listed in the kitchen: food not yet finished, and the ingredients given. */
export function shelfThings(food: readonly FoodItem[], ingredients: readonly InventoryItem[]): ShelfThing[] {
  return [
    ...food.filter(isListed).map((item): ShelfThing => ({ kind: "food", id: item.id, name: item.name ?? "", item })),
    // With its variant, as the lists name it ("Beras (Merah)"), so two kinds
    // of one thing stay two tiles anyone can tell apart (Codex, PR #189).
    ...ingredients.map((item): ShelfThing => ({ kind: "ingredient", id: item.id, name: stockItemName(item), item })),
  ];
}

function compareThings(a: ShelfThing, b: ShelfThing): number {
  if (a.kind === "food" && b.kind === "food") return compareFood(a.item, b.item);
  if (a.kind === "ingredient" && b.kind === "ingredient") return compareForList(a.item, b.item);
  // Food on a shelf before ingredients: it is what gets eaten.
  return a.kind === "food" ? -1 : 1;
}

/**
 * The shelves for a pill. Each thing is on one shelf only: Use soon (the
 * nearest date first), or its place. A shelf with nothing on it is left out.
 * "Use soon" shows that shelf alone; "To buy" shows only what is Running
 * low or Out, on its place's shelf.
 */
export function buildShelves(
  things: readonly ShelfThing[],
  today: string,
  filter: ShelfFilter = "all"
): { key: ShelfKey; things: ShelfThing[] }[] {
  const shelves: Record<ShelfKey, ShelfThing[]> = { soon: [], fridge: [], freezer: [], counter: [], pantry: [] };
  for (const thing of things) {
    if (filter === "buy") {
      if (isToBuy(thing)) shelves[thingPlace(thing)].push(thing);
      continue;
    }
    if (isUseSoon(thing, today)) shelves.soon.push(thing);
    else if (filter === "all") shelves[thingPlace(thing)].push(thing);
  }
  const soonest = (t: ShelfThing) => (dateUnknown(t) ? -Infinity : (thingDays(t, today) ?? Infinity));
  shelves.soon.sort((a, b) => soonest(a) - soonest(b) || a.name.localeCompare(b.name));
  for (const place of ["fridge", "freezer", "counter", "pantry"] as const) shelves[place].sort(compareThings);
  return SHELVES.filter((key) => shelves[key].length > 0).map((key) => ({ key, things: shelves[key] }));
}

/**
 * The line symbol for a thing, chosen from its name by a small table (08,
 * decision 4: no field, nothing stored). Words in Indonesian and English;
 * whole words only. A name not in the table gets its kind's default.
 */
export type ShelfSymbol =
  | "egg"
  | "milk"
  | "drumstick"
  | "beef"
  | "fish"
  | "shrimp"
  | "wheat"
  | "bread"
  | "cake"
  | "cookie"
  | "carrot"
  | "leaf"
  | "apple"
  | "citrus"
  | "banana"
  | "coffee"
  | "bean"
  | "jar"
  | "bowl"
  | "package";

const SYMBOL_WORDS: [ShelfSymbol, string[]][] = [
  ["egg", ["telur", "telor", "egg", "eggs"]],
  ["milk", ["susu", "santan", "milk", "yoghurt", "yogurt", "cream", "krim"]],
  ["drumstick", ["ayam", "chicken", "bebek", "duck"]],
  ["beef", ["daging", "sapi", "beef", "kambing", "mutton", "rendang", "sosis", "sausage"]],
  ["shrimp", ["udang", "shrimp", "prawn", "prawns", "cumi", "squid"]],
  ["fish", ["ikan", "fish", "salmon", "tuna", "lele", "teri"]],
  ["wheat", ["beras", "rice", "tepung", "flour", "gandum", "oat", "oats", "mie", "mi", "noodles", "pasta", "bihun"]],
  ["bread", ["roti", "bread", "croissant"]],
  ["cake", ["kue", "cake", "bolu", "brownies", "lapis"]],
  ["cookie", ["biskuit", "biscuit", "biscuits", "cookie", "cookies", "kerupuk", "keripik"]],
  ["carrot", ["wortel", "carrot", "carrots", "kentang", "potato", "potatoes", "ubi"]],
  [
    "leaf",
    ["sayur", "bayam", "kangkung", "sawi", "selada", "lettuce", "spinach", "kol", "kubis", "cabbage", "brokoli", "broccoli", "daun", "herbs", "kemangi", "seledri"],
  ],
  ["apple", ["apel", "apple", "apples", "buah", "fruit", "pir", "pear", "tomat", "tomato", "tomatoes", "mangga", "mango"]],
  ["citrus", ["jeruk", "lemon", "lime", "nipis"]],
  ["banana", ["pisang", "banana", "bananas"]],
  ["coffee", ["kopi", "coffee", "teh", "tea"]],
  ["bean", ["kacang", "bean", "beans", "tempe", "tahu", "tofu", "kedelai", "nut", "nuts"]],
  [
    "jar",
    ["minyak", "oil", "kecap", "saus", "sauce", "sambal", "madu", "honey", "selai", "jam", "mentega", "butter", "garam", "salt", "gula", "sugar", "merica", "lada", "pepper", "cuka", "vinegar", "bumbu", "keju", "cheese", "mayones", "mayonnaise"],
  ],
];

const SYMBOL_BY_WORD = new Map<string, ShelfSymbol>(
  SYMBOL_WORDS.flatMap(([symbol, words]) => words.map((word) => [word, symbol] as const))
);

/**
 * Food on the shelf is mostly cooked dishes (Sayur asem, opor, rendang): a
 * bowl, as drawn, unless the name says it is a cake, bread, biscuits or fruit.
 */
const FOOD_SYMBOLS = new Set<ShelfSymbol>(["cake", "bread", "cookie", "apple", "citrus", "banana"]);

export function shelfSymbol(thing: Pick<ShelfThing, "kind" | "name">): ShelfSymbol {
  const words = thing.name.toLocaleLowerCase("id").split(/[^\p{L}]+/u).filter(Boolean);
  for (const word of words) {
    const found = SYMBOL_BY_WORD.get(word);
    if (found && (thing.kind === "ingredient" || FOOD_SYMBOLS.has(found))) return found;
  }
  return thing.kind === "food" ? "bowl" : "package";
}
