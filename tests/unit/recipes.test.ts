// Recipes (Phase 170 PR B, migrations/151): scaling, labels, what staff
// phones read, the Indonesian-version note, the editor's draft, and the
// units agreeing with the database's check.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RECIPE_UNITS,
  STAFF_STEPS_MISSING,
  amountLabel,
  draftFrom,
  emptyDraft,
  lineForItem,
  lineForName,
  lineName,
  missingIndonesian,
  payloadFrom,
  scaleAmount,
  servingsLabel,
  sortRecipes,
  splitSteps,
  staffText,
  withLines,
  type RecipeWithLines,
} from "@/lib/recipes";
import { FEATURE_DEFAULTS, kitchenViewFor, kitchenViews } from "@/lib/features";
import type { InventoryItem, RecipeIngredient } from "@/types/database";

const rice = { id: "item-rice", name: "Rice", variant: null, unit: "kg", category: "pantry", track_amount: true } as unknown as InventoryItem;

function line(patch: Partial<RecipeIngredient>): RecipeIngredient {
  return {
    id: "l1",
    household_id: "h1",
    recipe_id: "r1",
    item_id: null,
    name: "Salt",
    name_id: null,
    amount: null,
    unit: null,
    position: 0,
    ...patch,
  };
}

function recipe(patch: Partial<RecipeWithLines> = {}): RecipeWithLines {
  return {
    id: "r1",
    household_id: "h1",
    name: "Chicken soto",
    servings: 4,
    steps: "Boil the chicken.\nAdd the spices.",
    written_in: "en",
    name_id: null,
    steps_id: null,
    created_by: null,
    created_at: "2026-11-11T00:00:00Z",
    updated_at: "2026-11-11T00:00:00Z",
    ingredients: [],
    ...patch,
  };
}

describe("scaling (stored amounts never change)", () => {
  it("returns the stored amount when the servings are the recipe's", () => {
    expect(scaleAmount(0.5, "bungkus", 4, 4)).toBe(0.5);
    expect(scaleAmount(1.25, "kg", 4, 4)).toBe(1.25);
  });

  it("rounds sensibly per unit: whole pieces, 1 decimal kg/L, nearest 5 g/ml, half spoons", () => {
    expect(scaleAmount(3, "butir", 4, 6)).toBe(5); // 4.5 → 5
    expect(scaleAmount(1, "kg", 4, 6)).toBe(1.5);
    expect(scaleAmount(1, "kg", 3, 4)).toBe(1.3); // 1.333 → 1.3
    expect(scaleAmount(250, "g", 4, 6)).toBe(375);
    expect(scaleAmount(100, "ml", 3, 4)).toBe(135); // 133.3 → 135
    expect(scaleAmount(2, "sdm", 4, 6)).toBe(3);
    expect(scaleAmount(1, "sdt", 4, 6)).toBe(1.5);
    expect(scaleAmount(3, "lembar", 4, 2)).toBe(2); // 1.5 → 2
  });

  it("never rounds down to nothing", () => {
    expect(scaleAmount(1, "butir", 4, 1)).toBe(1);
    expect(scaleAmount(1, "sdt", 4, 1)).toBe(0.5);
    expect(scaleAmount(5, "g", 4, 1)).toBe(1);
    expect(scaleAmount(0.1, "kg", 4, 1)).toBe(0.1);
  });

  it("a plain count without a unit: whole from 1 up", () => {
    expect(scaleAmount(2, null, 4, 6)).toBe(3);
    expect(scaleAmount(1, null, 4, 2)).toBe(0.5);
  });
});

describe("labels", () => {
  it("amounts with the comma in Indonesian, and to taste", () => {
    expect(amountLabel(1.5, "kg", "id")).toBe("1,5 kg");
    expect(amountLabel(1.5, "kg", "en")).toBe("1.5 kg");
    expect(amountLabel(2, "sdm", "en")).toBe("2 sdm");
    expect(amountLabel(3, null, "id")).toBe("3");
    expect(amountLabel(null, null, "id")).toBe("secukupnya");
    expect(amountLabel(null, null, "en")).toBe("to taste");
  });

  it("servings", () => {
    expect(servingsLabel(4, "id")).toBe("4 porsi");
    expect(servingsLabel(1, "en")).toBe("1 serving");
    expect(servingsLabel(6, "en")).toBe("6 servings");
  });
});

describe("what staff phones read", () => {
  it("an English recipe with its Indonesian steps: staff read those (Codex P1, PR #98)", () => {
    expect(staffText(recipe({ name_id: "Soto ayam", steps_id: "Rebus ayam." }))).toEqual({
      name: "Soto ayam",
      steps: "Rebus ayam.",
      stepsMissing: false,
    });
  });

  it("an English recipe without Indonesian steps: no steps at all, never the English (Codex P1, PR #98)", () => {
    const text = staffText(recipe({ name_id: "Soto ayam" }));
    expect(text).toEqual({ name: "Soto ayam", steps: null, stepsMissing: true });
    expect(STAFF_STEPS_MISSING).toBe("Cara membuat belum ada dalam Bahasa Indonesia.");
    // No steps written at all: nothing missing to say.
    expect(staffText(recipe({ steps: null })).stepsMissing).toBe(false);
  });

  it("no Indonesian name: the name as written (household content, like task titles)", () => {
    expect(staffText(recipe()).name).toBe("Chicken soto");
  });

  it("an Indonesian recipe is read as written", () => {
    expect(staffText(recipe({ written_in: "id", name: "Soto ayam", name_id: "ignored", steps_id: "x" }))).toEqual({
      name: "Soto ayam",
      steps: "Boil the chicken.\nAdd the spices.",
      stepsMissing: false,
    });
  });

  it("a linked line reads as the item does; a free line in its Indonesian name for staff", () => {
    const linked = line({ item_id: rice.id, name: "rice (old name)" });
    expect(lineName(linked, [rice], false, "en")).toBe("Rice");
    expect(lineName(linked, [rice], true, "en")).toBe("Rice");
    const free = line({ name: "Lime leaves", name_id: "Daun jeruk" });
    expect(lineName(free, [], false, "en")).toBe("Lime leaves");
    expect(lineName(free, [], true, "en")).toBe("Daun jeruk");
    // A deleted item: the line's own name.
    expect(lineName(line({ item_id: "gone", name: "Chicken" }), [rice], true, "id")).toBe("Chicken");
  });
});

describe("the owner's note: no Indonesian version yet", () => {
  it("only for English recipes missing the name, the steps or a free line's name", () => {
    expect(missingIndonesian(recipe({ written_in: "id" }), [])).toBe(false);
    expect(missingIndonesian(recipe(), [])).toBe(true);
    expect(missingIndonesian(recipe({ name_id: "Soto ayam" }), [])).toBe(true); // steps
    expect(missingIndonesian(recipe({ name_id: "Soto ayam", steps_id: "Rebus." }), [])).toBe(false);
    expect(missingIndonesian(recipe({ name_id: "Soto", steps: null }), [])).toBe(false);
    const withFree = recipe({ name_id: "Soto", steps: null, ingredients: [line({ name: "Lime leaves" })] });
    expect(missingIndonesian(withFree, [])).toBe(true);
    const withLinked = recipe({ name_id: "Soto", steps: null, ingredients: [line({ item_id: rice.id, name: "Rice" })] });
    expect(missingIndonesian(withLinked, [rice])).toBe(false);
  });
});

describe("steps", () => {
  it("one per line, typed numbers and bullets dropped, blank lines skipped", () => {
    expect(splitSteps("1. Rebus ayam.\n\n2) Tambah bumbu.\n- Sajikan\n• Selesai")).toEqual([
      "Rebus ayam.",
      "Tambah bumbu.",
      "Sajikan",
      "Selesai",
    ]);
    expect(splitSteps(null)).toEqual([]);
    expect(splitSteps("Masak 2 menit.")).toEqual(["Masak 2 menit."]);
  });
});

describe("the editor's draft", () => {
  it("needs only a name", () => {
    expect(payloadFrom(emptyDraft("id"))).toEqual({ ok: false, problem: "name" });
    const result = payloadFrom({ ...emptyDraft("id"), name: " Nasi goreng " });
    expect(result).toMatchObject({ ok: true, payload: { recipe: { name: "Nasi goreng", servings: 4, steps: null }, ingredients: [] } });
  });

  it("drops nameless lines, keeps to taste, reads either decimal mark, refuses a bad amount", () => {
    const draft = {
      ...emptyDraft("id"),
      name: "Soto",
      lines: [
        { ...lineForItem(rice), amount: "1,5" },
        { ...lineForName("Garam"), amount: "", unit: "sdt" as const },
        { ...lineForName("  "), amount: "2" },
      ],
    };
    const result = payloadFrom(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.ingredients).toEqual([
      { item_id: rice.id, name: "Rice", name_id: null, amount: 1.5, unit: "kg" },
      // No amount is to taste: the unit goes too (the database requires it).
      { item_id: null, name: "Garam", name_id: null, amount: null, unit: null },
    ]);
    const bad = { ...draft, lines: [{ ...lineForName("Gula"), amount: "dua" }] };
    expect(payloadFrom(bad)).toMatchObject({ ok: false, problem: "amount", lineKey: bad.lines[0].key });
    expect(payloadFrom({ ...draft, lines: [{ ...lineForName("Gula"), amount: "0" }] })).toMatchObject({ ok: false, problem: "amount" });
  });

  it("keeps the Indonesian version for English recipes only", () => {
    const english = { ...emptyDraft("en"), name: "Soto", name_id: "Soto ayam", steps: "Boil.", steps_id: "Rebus.", lines: [{ ...lineForName("Lime leaves"), name_id: "Daun jeruk" }] };
    const en = payloadFrom(english);
    expect(en).toMatchObject({ ok: true, payload: { recipe: { name_id: "Soto ayam", steps_id: "Rebus." }, ingredients: [{ name_id: "Daun jeruk" }] } });
    const id = payloadFrom({ ...english, written_in: "id" });
    expect(id).toMatchObject({ ok: true, payload: { recipe: { name_id: null, steps_id: null }, ingredients: [{ name_id: null }] } });
  });

  it("round-trips a saved recipe, amounts in the owner's decimal mark", () => {
    const saved = recipe({ ingredients: [line({ item_id: rice.id, name: "Rice", amount: 1.5, unit: "kg" })] });
    const draft = draftFrom(saved, "id");
    expect(draft.lines[0]).toMatchObject({ item_id: rice.id, amount: "1,5", unit: "kg" });
    const back = payloadFrom(draft);
    expect(back).toMatchObject({ ok: true, payload: { recipe: { id: "r1", servings: 4 }, ingredients: [{ amount: 1.5, unit: "kg" }] } });
  });
});

describe("rows into recipes", () => {
  it("joins lines to their recipe, in order", () => {
    const [r] = withLines([recipe()], [line({ id: "b", position: 1 }), line({ id: "a", position: 0 }), line({ id: "x", recipe_id: "other" })]);
    expect(r.ingredients.map((l) => l.id)).toEqual(["a", "b"]);
  });

  it("sorts by name, ignoring case", () => {
    expect(sortRecipes([{ name: "soto" }, { name: "Ayam goreng" }, { name: "Rendang" }]).map((r) => r.name)).toEqual([
      "Ayam goreng",
      "Rendang",
      "soto",
    ]);
  });
});

describe("units agree with migrations/151", () => {
  it("every recipe unit is in recipe_ingredients_unit_check, and the other way round", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/151_kitchen_recipes.sql"), "utf8");
    const check = sql.slice(sql.indexOf("recipe_ingredients_unit_check"), sql.indexOf("recipe_ingredients_unit_needs_amount"));
    const listed = [...check.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...RECIPE_UNITS].sort());
    expect(RECIPE_UNITS).toContain("sdm");
    expect(RECIPE_UNITS).toContain("sdt");
  });
});

describe("the Kitchen pills (D5)", () => {
  it("Food · Menu · Shopping, Menu only with the Kitchen switch on; Shopping first without Food", () => {
    expect(kitchenViews({ ...FEATURE_DEFAULTS, kitchen: true })).toEqual(["food", "menu", "buy"]);
    expect(kitchenViews(FEATURE_DEFAULTS)).toEqual(["food", "buy"]);
    expect(kitchenViews({ ...FEATURE_DEFAULTS, food: false, kitchen: true })).toEqual(["buy", "menu"]);
    expect(kitchenViews({ ...FEATURE_DEFAULTS, food: false })).toEqual(["buy"]);
  });

  it("a Menu link with the switch off opens the first pill there", () => {
    expect(kitchenViewFor("menu", { ...FEATURE_DEFAULTS, kitchen: true })).toBe("menu");
    expect(kitchenViewFor("menu", FEATURE_DEFAULTS)).toBe("food");
    expect(kitchenViewFor("menu", { ...FEATURE_DEFAULTS, food: false })).toBe("buy");
  });
});
