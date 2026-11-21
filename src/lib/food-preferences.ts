// The household's food preferences (PR C2, owner 20 Nov, D2 and D4;
// migrations/176). One optional household setting, never per person: a
// closed set of choices, any number of them, and "no rules" is an answer
// too. There is no free text, so nothing is typed here and an allergy can't
// end up in it by accident (allergies stay in Kitchen notes, which are never
// sent to Kakak).
//
// null means nobody has answered yet: Kakak asks once, the first time ideas
// come up, with the app's own question card (ask_food_preferences). [] means
// "no rules". Shared by the screens, the Kakak route and the eval, so it
// imports nothing server-only.

export const FOOD_RULES = ["halal", "no_alcohol", "no_beef", "vegetarian"] as const;
export type FoodRule = (typeof FOOD_RULES)[number];

/** The chips' and the staff line's words, per the glossary (docs/indonesian-glossary.md). */
const LABELS: Record<FoodRule, { en: string; id: string }> = {
  halal: { en: "Halal", id: "Halal" },
  no_alcohol: { en: "No alcohol", id: "Tanpa alkohol" },
  no_beef: { en: "No beef", id: "Tanpa daging sapi" },
  vegetarian: { en: "Vegetarian", id: "Vegetarian" },
};

/** What each rule means, for the chips' help line and Kakak's block. */
const MEANS: Record<FoodRule, string> = {
  halal: "halal (no pork or lard)",
  no_alcohol: "no alcohol (no ang ciu, arak, mirin, rum or wine in cooking)",
  no_beef: "no beef",
  vegetarian: "vegetarian (no meat or fish)",
};

export function isFoodRule(value: unknown): value is FoodRule {
  return typeof value === "string" && (FOOD_RULES as readonly string[]).includes(value);
}

/** The rules in the app's own order, each once; anything else is dropped. */
export function normalizeFoodRules(value: readonly unknown[]): FoodRule[] {
  const set = new Set(value.filter(isFoodRule));
  return FOOD_RULES.filter((rule) => set.has(rule));
}

/** What the database returns: a list (possibly empty), or null for not asked yet. */
export function foodRulesFromRow(value: unknown): FoodRule[] | null {
  return Array.isArray(value) ? normalizeFoodRules(value) : null;
}

export function foodRuleLabel(rule: FoodRule, locale: "en" | "id"): string {
  return LABELS[rule][locale];
}

/** "Halal · Tanpa alkohol", or "No rules" / "Tidak ada aturan" for []. */
export function foodRulesLabel(rules: readonly FoodRule[], locale: "en" | "id"): string {
  if (rules.length === 0) return locale === "id" ? "Tidak ada aturan" : "No rules";
  return normalizeFoodRules(rules)
    .map((rule) => foodRuleLabel(rule, locale))
    .join(" · ");
}

/** Kakak's household block: "halal (no pork or lard), no alcohol (…)", "none", or "not asked yet". */
export function foodRulesForKakak(rules: readonly FoodRule[] | null): string {
  if (rules === null) return "not asked yet";
  if (rules.length === 0) return "none";
  return normalizeFoodRules(rules)
    .map((rule) => MEANS[rule])
    .join(", ");
}

/**
 * The app's own question (D2): the same words for every household, so the
 * card never depends on how Kakak phrased it. "More" opens the four chips.
 */
export const FOOD_RULES_PRESETS: { key: string; rules: FoodRule[]; en: string; id: string }[] = [
  { key: "halal", rules: ["halal"], en: "Halal", id: "Halal" },
  { key: "halal_no_alcohol", rules: ["halal", "no_alcohol"], en: "Halal, no alcohol", id: "Halal, tanpa alkohol" },
  { key: "none", rules: [], en: "No rules", id: "Tidak ada" },
];

export function foodRulesQuestion(locale: "en" | "id"): string {
  return locale === "id" ? "Ada aturan makanan untuk ide masak?" : "Any food rules for recipe ideas?";
}

/**
 * The owner's answer as Kakak reads it, in the owner's language, with
 * whether it was saved. Saved, the household block says so from the next
 * conversation on; in this one, this line is how she knows.
 */
export function foodRulesReply(rules: readonly FoodRule[], saved: boolean, locale: "en" | "id"): string {
  const label = rules.length === 0 ? (locale === "id" ? "Tidak ada aturan makanan" : "No food rules") : foodRulesLabel(rules, locale);
  if (locale === "id") return saved ? `${label}. (Disimpan untuk berikutnya.)` : `${label}. (Hanya untuk percakapan ini.)`;
  return saved ? `${label}. (Saved for next time.)` : `${label}. (Just for this conversation.)`;
}
