import { stockItemName } from "@/lib/inventory";
import { STOCK_UNITS, UNIT_HINTS_EN, clean, parseAmount, unitLabel } from "@/lib/kitchen-units";
import type { InventoryItem, Recipe, RecipeIngredient, RecipeUnit } from "@/types/database";

/**
 * Recipes (Phase 170 PR B, docs/phase-170-kitchen-plan.md D8 and the
 * household's answer 4; migrations/151).
 *
 * Owners write recipes; every staff phone reads them, in Indonesian only.
 * A recipe is written in English or Indonesian; an English one can carry
 * an Indonesian version for staff (its name, its steps and each free-name
 * line), and the owner sees a quiet note while it's missing. Lines linked
 * to an item read as the item does on the shopping list, on every phone.
 *
 * Scaling (the servings stepper) changes what's shown, never what's stored.
 * Nothing here holds a price: staff never see prices.
 */

export type RecipeLang = "en" | "id";

export interface RecipeWithLines extends Recipe {
  ingredients: RecipeIngredient[];
}

/** Limits, mirroring the checks in migrations/151. */
export const RECIPE_LIMITS = {
  name: 80,
  steps: 4000,
  lineName: 80,
  lines: 200,
  minServings: 1,
  maxServings: 50,
} as const;

export const DEFAULT_SERVINGS = 4;

/** Recipe-only units: never a stock unit, never taken off stock (D4). */
export const SPOON_UNITS = ["sdm", "sdt"] as const;

/** Every unit a line may use, in picker order: spoons first (they're what recipes use most). */
export const RECIPE_UNITS: RecipeUnit[] = [...SPOON_UNITS, ...STOCK_UNITS];

export function isRecipeUnit(value: unknown): value is RecipeUnit {
  return typeof value === "string" && (RECIPE_UNITS as string[]).includes(value);
}

function isSpoon(unit: RecipeUnit): unit is "sdm" | "sdt" {
  return unit === "sdm" || unit === "sdt";
}

/** "sdm" in both languages (as every Indonesian recipe writes it); the English picker adds "tbsp". */
export function recipeUnitLabel(unit: RecipeUnit, lang: RecipeLang): string {
  return isSpoon(unit) ? unit : unitLabel(unit, lang);
}

export function recipeUnitHint(unit: RecipeUnit, lang: RecipeLang): string | undefined {
  if (lang !== "en") return undefined;
  if (unit === "sdm") return "tbsp";
  if (unit === "sdt") return "tsp";
  return UNIT_HINTS_EN[unit];
}

/**
 * An amount for `servings` portions of a recipe written for `base`
 * (plan, Scaling): whole for pieces, kitchen counts and packs; one decimal
 * for kg and L; the nearest 5 for g and ml; the nearest half for sdm and
 * sdt. Never rounds down to nothing. Unscaled amounts come back as stored.
 */
export function scaleAmount(amount: number, unit: RecipeUnit | null, base: number, servings: number): number {
  if (!(base > 0) || servings === base) return amount;
  const raw = (amount * servings) / base;
  const round = (step: number) => Math.max(step, Math.round(raw / step) * step);
  if (unit === null) return raw >= 1 ? Math.round(raw) : clean(round(0.1));
  if (isSpoon(unit)) return round(0.5);
  if (unit === "g" || unit === "ml") return raw < 5 ? round(1) : round(5);
  if (unit === "kg" || unit === "L") return clean(round(0.1));
  return round(1);
}

function formatNumber(value: number, lang: RecipeLang): string {
  return new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", { maximumFractionDigits: 2 }).format(clean(value));
}

/** "2 sdm", "1,5 kg", "3"; "secukupnya" / "to taste" when there's no amount. */
export function amountLabel(amount: number | null, unit: RecipeUnit | null, lang: RecipeLang): string {
  if (amount === null) return lang === "id" ? "secukupnya" : "to taste";
  const number = formatNumber(amount, lang);
  return unit ? `${number} ${recipeUnitLabel(unit, lang)}` : number;
}

/** "untuk 4 porsi" / "for 4 servings". */
export function servingsLabel(servings: number, lang: RecipeLang): string {
  if (lang === "id") return `${servings} porsi`;
  return servings === 1 ? "1 serving" : `${servings} servings`;
}

/** The item a line is linked to, if it still exists. */
export function lineItem(line: Pick<RecipeIngredient, "item_id">, items: readonly InventoryItem[]): InventoryItem | null {
  return line.item_id ? (items.find((item) => item.id === line.item_id) ?? null) : null;
}

/**
 * How a line's name reads. Linked lines read as the item does on the
 * shopping list (the same words staff already know). On a staff phone, an
 * English recipe's line shows its Indonesian name when it has one, and
 * otherwise the name as the owner typed it: household content, like an
 * item's name on the shopping list, not app text.
 */
export function lineName(
  line: Pick<RecipeIngredient, "item_id" | "name" | "name_id">,
  items: readonly InventoryItem[],
  forStaff: boolean,
  writtenIn: RecipeLang
): string {
  if (forStaff && writtenIn === "en" && line.name_id) return line.name_id;
  const item = lineItem(line, items);
  return item ? stockItemName(item) : line.name;
}

/** The one line a staff phone shows in place of steps that have no Indonesian version (glossary: Cara membuat). */
export const STAFF_STEPS_MISSING = "Cara membuat belum ada dalam Bahasa Indonesia.";

/**
 * What a staff phone shows (Codex P1, PR #98; manager decision, 11 Nov).
 * Staff screens are Indonesian only:
 *
 *   - a recipe written in Indonesian is shown as written;
 *   - steps: only ever Indonesian. An English recipe without its Indonesian
 *     steps shows none (`steps` null, `stepsMissing` true), and the screen
 *     says so in one Indonesian line, STAFF_STEPS_MISSING. No English text;
 *   - the name: the Indonesian name when there is one, otherwise the name
 *     as the owner wrote it. That's household content, not app text, the
 *     same as owner-typed task titles and item names everywhere else in the
 *     app (lineName below follows the same rule for free-name ingredients).
 */
export function staffText(recipe: Pick<Recipe, "name" | "steps" | "written_in" | "name_id" | "steps_id">): {
  name: string;
  steps: string | null;
  stepsMissing: boolean;
} {
  if (recipe.written_in === "id") return { name: recipe.name, steps: recipe.steps, stepsMissing: false };
  const steps = recipe.steps_id || null;
  return {
    // Household content: shown as written when there's no Indonesian name, like task titles.
    name: recipe.name_id || recipe.name,
    steps,
    stepsMissing: steps === null && !!recipe.steps,
  };
}

/**
 * An English recipe still missing part of its Indonesian version: the
 * name, the steps (when it has steps), or a free-name line's name. Linked
 * lines read as the item does, so they need nothing. Indonesian recipes
 * never need it.
 */
export function missingIndonesian(recipe: RecipeWithLines, items: readonly InventoryItem[]): boolean {
  if (recipe.written_in !== "en") return false;
  if (!recipe.name_id) return true;
  if (recipe.steps && !recipe.steps_id) return true;
  return recipe.ingredients.some((line) => !line.name_id && lineItem(line, items) === null);
}

/** "Boil the chicken.\n2) Add…" → ["Boil the chicken.", "Add…"]: one step per line, typed numbers dropped. */
export function splitSteps(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^(\d{1,2}\s*[.)]|[-•*])\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/** Alphabetical, the household's own words, in the shown language. */
export function sortRecipes<T extends Pick<Recipe, "name">>(recipes: readonly T[], name: (r: T) => string = (r) => r.name): T[] {
  return [...recipes].sort((a, b) => name(a).localeCompare(name(b), undefined, { sensitivity: "base" }));
}

// --- The editor's draft --------------------------------------------------------------

export interface DraftLine {
  /** A key for React, never stored. */
  key: string;
  item_id: string | null;
  name: string;
  name_id: string;
  /** As typed: "1,5", "2", or "" for to taste. */
  amount: string;
  unit: RecipeUnit | null;
}

export interface RecipeDraft {
  id: string | null;
  name: string;
  servings: number;
  steps: string;
  written_in: RecipeLang;
  name_id: string;
  steps_id: string;
  lines: DraftLine[];
}

export function emptyDraft(lang: RecipeLang): RecipeDraft {
  return { id: null, name: "", servings: DEFAULT_SERVINGS, steps: "", written_in: lang, name_id: "", steps_id: "", lines: [] };
}

let keySeq = 0;
export function newLineKey(): string {
  keySeq += 1;
  return `line-${keySeq}`;
}

/** A number for an amount input: "1,5" in Indonesian. */
function amountText(value: number | null, lang: RecipeLang): string {
  if (value === null) return "";
  const text = String(clean(value));
  return lang === "id" ? text.replace(".", ",") : text;
}

export function draftFrom(recipe: RecipeWithLines, lang: RecipeLang): RecipeDraft {
  return {
    id: recipe.id,
    name: recipe.name,
    servings: recipe.servings,
    steps: recipe.steps ?? "",
    written_in: recipe.written_in,
    name_id: recipe.name_id ?? "",
    steps_id: recipe.steps_id ?? "",
    lines: recipe.ingredients.map((line) => ({
      key: newLineKey(),
      item_id: line.item_id,
      name: line.name,
      name_id: line.name_id ?? "",
      amount: amountText(line.amount, lang),
      unit: line.unit,
    })),
  };
}

/** A line for an item picked from the list: its name and unit to start from. */
export function lineForItem(item: InventoryItem): DraftLine {
  return { key: newLineKey(), item_id: item.id, name: stockItemName(item), name_id: "", amount: "", unit: item.unit };
}

export function lineForName(name: string): DraftLine {
  return { key: newLineKey(), item_id: null, name: name.trim(), name_id: "", amount: "", unit: null };
}

/** What save_recipe takes (migrations/151). */
export interface RecipePayload {
  recipe: {
    id: string | null;
    name: string;
    servings: number;
    steps: string | null;
    written_in: RecipeLang;
    name_id: string | null;
    steps_id: string | null;
  };
  ingredients: {
    item_id: string | null;
    name: string;
    name_id: string | null;
    amount: number | null;
    unit: RecipeUnit | null;
  }[];
}

export type DraftProblem = "name" | "amount";

/**
 * The draft as save_recipe takes it, or what's wrong. Only the name is
 * required (no new required fields): lines without a name are dropped, a
 * line without an amount is "to taste", and an amount without a unit is a
 * plain count. The Indonesian version is kept only for English recipes.
 */
export function payloadFrom(draft: RecipeDraft): { ok: true; payload: RecipePayload } | { ok: false; problem: DraftProblem; lineKey?: string } {
  const name = draft.name.trim();
  if (name.length === 0 || name.length > RECIPE_LIMITS.name) return { ok: false, problem: "name" };
  const english = draft.written_in === "en";
  const ingredients: RecipePayload["ingredients"] = [];
  for (const line of draft.lines) {
    const lineName = line.name.trim().slice(0, RECIPE_LIMITS.lineName);
    if (!lineName) continue;
    let amount: number | null = null;
    if (line.amount.trim() !== "") {
      amount = parseAmount(line.amount);
      if (amount === null || amount <= 0) return { ok: false, problem: "amount", lineKey: line.key };
    }
    ingredients.push({
      item_id: line.item_id,
      name: lineName,
      name_id: english ? line.name_id.trim().slice(0, RECIPE_LIMITS.lineName) || null : null,
      amount,
      unit: amount === null ? null : line.unit,
    });
  }
  const steps = draft.steps.trim().slice(0, RECIPE_LIMITS.steps) || null;
  return {
    ok: true,
    payload: {
      recipe: {
        id: draft.id,
        name,
        servings: Math.min(RECIPE_LIMITS.maxServings, Math.max(RECIPE_LIMITS.minServings, Math.round(draft.servings))),
        steps,
        written_in: draft.written_in,
        name_id: english ? draft.name_id.trim().slice(0, RECIPE_LIMITS.name) || null : null,
        steps_id: english ? draft.steps_id.trim().slice(0, RECIPE_LIMITS.steps) || null : null,
      },
      ingredients: ingredients.slice(0, RECIPE_LIMITS.lines),
    },
  };
}


/** Recipes with their lines, in order, from the two tables' rows. */
export function withLines(recipes: readonly Recipe[], lines: readonly RecipeIngredient[]): RecipeWithLines[] {
  const byRecipe = new Map<string, RecipeIngredient[]>();
  for (const line of lines) {
    const list = byRecipe.get(line.recipe_id) ?? [];
    list.push(line);
    byRecipe.set(line.recipe_id, list);
  }
  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: (byRecipe.get(recipe.id) ?? []).sort((a, b) => a.position - b.position),
  }));
}
