import { addDays, type KakakHousehold, type KakakLocale } from "./household";
import type { KakakSuggestion, MenuDishSuggestion } from "./suggestions";

/**
 * Her answer when she gave none (paid run 44705966410, 20 Nov): six of 28
 * "can we cook it?" turns came back with the card and no line at all, and
 * one line was too long for the guard, so the owner read "Here's what I'll
 * add:" with no answer to the question asked. The app's own check already
 * holds the answer (Fable S0), so the app says it, in the words her
 * instructions model, in the owner's language. Never an amount: the check
 * has none. A typed dish (no saved recipe) has no check, so no line.
 */
export function dishAnswerLine(items: KakakSuggestion[], locale: KakakLocale): string {
  const dishes = items.filter((item): item is MenuDishSuggestion => item.kind === "menu_dish" && !!item.check);
  return dishes
    .slice(0, 2)
    .map((dish) => oneDish(dish, locale))
    .filter(Boolean)
    .join(" ");
}

function oneDish(dish: MenuDishSuggestion, locale: KakakLocale): string {
  const check = dish.check!;
  const title = dish.title;
  const later = dish.relative !== "today";
  if (check.state === "ready") {
    if (locale === "id") return later ? `Bahan ${title} lengkap saat ini.` : `Bahan ${title} lengkap.`;
    return later ? `You have everything for ${title} right now.` : `You have everything for ${title}.`;
  }
  if (check.state === "unknown") {
    return locale === "id"
      ? `Bahan ${title} belum bisa Kakak cek; belum ada di daftar.`
      : `I couldn't check ${title}; its ingredients aren't on your list.`;
  }
  const names = list(check.missing.map((m) => m.name), locale);
  const listed = check.missing.filter((m) => m.listed).map((m) => m.name);
  const first = locale === "id" ? `Untuk ${title}, semua ada kecuali ${names}.` : `For ${title}, you have everything but ${names}.`;
  if (listed.length === 0) return first;
  const onList =
    locale === "id"
      ? `${list(listed, locale)} sudah ada di daftar belanja.`
      : `${list(listed, locale)} ${listed.length === 1 ? "is" : "are"} already on the shopping list.`;
  return `${first} ${onList}`;
}

/** "Santan", "Santan and Serai", "Santan, Serai and 2 more". */
function list(names: string[], locale: KakakLocale): string {
  const and = locale === "id" ? "dan" : "and";
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} ${and} ${names[2]}`;
  return `${names[0]}, ${names[1]} ${and} ${names.length - 2} ${locale === "id" ? "lainnya" : "more"}`;
}

/**
 * The same answer from the household block alone, for the paid test run
 * (tests/kakak/run-core.ts), which has the block but not the server's refs.
 * Only for a plan_dish at the recipe's own servings: the block is checked
 * at those, so another number has no line here (the run is then stricter
 * than the app, which checks again at the number asked for).
 */
export function dishAnswerFromBlock(
  household: KakakHousehold,
  calls: { name: string; input: unknown }[],
): string {
  const dishes: MenuDishSuggestion[] = [];
  for (const call of calls) {
    if (call.name !== "plan_dish") continue;
    const input = (call.input ?? {}) as Record<string, unknown>;
    const recipe = (household.recipes ?? []).find((r) => r.ref === input.recipe);
    if (!recipe || (input.servings !== 0 && input.servings !== undefined)) continue;
    const day = typeof input.day === "string" ? input.day : "";
    const listed = new Set(recipe.onList ?? []);
    dishes.push({
      kind: "menu_dish",
      recipeId: recipe.ref,
      title: recipe.name,
      day,
      meal: "dinner",
      servings: null,
      relative: day === household.today ? "today" : day === addDays(household.today, 1) ? "tomorrow" : null,
      check: { state: recipe.state, missing: recipe.missing.map((name) => ({ name, listed: listed.has(name) })), unchecked: recipe.unchecked },
      missing: [],
    });
  }
  return dishAnswerLine(dishes, household.ownerLocale);
}
