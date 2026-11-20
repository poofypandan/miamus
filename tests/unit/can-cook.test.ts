// Can we cook it? (D18, owner 20 Nov): the per-line rules, the lines shown
// and the Recipes pill's order.
import { describe, expect, it } from "vitest";
import { cookCheck, cookLine, cookTone, readySplit, uncheckedLine, type CookCheck } from "@/lib/can-cook";
import type { RecipeWithLines } from "@/lib/recipes";
import type { InventoryItem, RecipeIngredient } from "@/types/database";

function item(patch: Partial<InventoryItem>): InventoryItem {
  return {
    id: "i",
    household_id: "h1",
    scope: "home",
    name: "Item",
    variant: null,
    category: "pantry",
    quantity: 0,
    unit: "kg",
    min_threshold: 0,
    photo_url: null,
    stock_status: "ok",
    track_amount: false,
    created_at: "2026-10-01T00:00:00Z",
    ...patch,
  } as unknown as InventoryItem;
}

let seq = 0;
function line(patch: Partial<RecipeIngredient>): RecipeIngredient {
  seq += 1;
  return {
    id: `l${seq}`,
    household_id: "h1",
    recipe_id: "r",
    item_id: null,
    name: "Garam",
    name_id: null,
    amount: null,
    unit: null,
    position: seq,
    ...patch,
  };
}

function recipe(lines: RecipeIngredient[], patch: Partial<RecipeWithLines> = {}): RecipeWithLines {
  return {
    id: "r",
    household_id: "h1",
    name: "Opor ayam",
    servings: 4,
    steps: null,
    written_in: "id",
    name_id: null,
    steps_id: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ingredients: lines,
    ...patch,
  };
}

const ayam = item({ id: "ayam", name: "Ayam", category: "fresh_food" });
const santanOut = item({ id: "santan", name: "Santan", stock_status: "out" });
const seraiLow = item({ id: "serai", name: "Serai", stock_status: "low" });
const off = { amounts: false, forStaff: false };
const on = { amounts: true, forStaff: false };

describe("cookCheck by status (Kitchen amounts off)", () => {
  it("is ready when every linked item is Enough", () => {
    const r = recipe([line({ item_id: "ayam", name: "Ayam", amount: 1, unit: "kg" })]);
    expect(cookCheck(r, null, [ayam], off)).toEqual({ state: "ready", missing: [], unchecked: [], missingLines: [] });
  });

  it("lists Out and Running low as missing, once each, in the recipe's order", () => {
    const r = recipe([
      line({ id: "a", item_id: "serai", name: "Serai" }),
      line({ id: "b", item_id: "ayam", name: "Ayam" }),
      line({ id: "c", item_id: "santan", name: "Santan", amount: 400, unit: "ml" }),
      line({ id: "d", item_id: "serai", name: "Serai lagi" }),
    ]);
    const check = cookCheck(r, null, [ayam, santanOut, seraiLow], off);
    expect(check.state).toBe("missing");
    expect(check.missing).toEqual([
      { itemId: "serai", name: "Serai", listed: true },
      { itemId: "santan", name: "Santan", listed: true },
    ]);
    // The rows themselves, for marking them in the ingredient list (Fable S4).
    expect(check.missingLines).toEqual(["a", "d", "c"]);
  });

  it("ignores amounts while Kitchen amounts is off, even on a tracked item", () => {
    const tracked = item({ id: "ayam", name: "Ayam", track_amount: true, quantity: 0.2, stock_status: "ok" });
    const r = recipe([line({ item_id: "ayam", name: "Ayam", amount: 1, unit: "kg" })]);
    expect(cookCheck(r, null, [tracked], off).state).toBe("ready");
  });

  it("checks a free name that is exactly one item's name, by that item's status", () => {
    const r = recipe([line({ name: "  santan " })]);
    expect(cookCheck(r, null, [santanOut], off).missing).toEqual([{ itemId: "santan", name: "santan", listed: true }]);
  });

  it("leaves a free name with no item, or two items of that name, not checked", () => {
    const twice = [item({ id: "a", name: "Daun salam" }), item({ id: "b", name: "Daun salam" })];
    const r = recipe([line({ name: "Lengkuas" }), line({ name: "Daun salam" }), line({ name: "lengkuas" }), line({ item_id: "ayam", name: "Ayam" })]);
    const check = cookCheck(r, null, [ayam, ...twice], off);
    expect(check).toMatchObject({ state: "ready", missing: [], unchecked: ["Lengkuas", "Daun salam"] });
  });

  it("is unknown with no lines, or only lines it cannot check", () => {
    expect(cookCheck(recipe([]), null, [ayam], off).state).toBe("unknown");
    expect(cookCheck(recipe([line({ name: "Lengkuas" })]), null, [ayam], off).state).toBe("unknown");
  });

  it("reads a linked line whose item was deleted (item_id kept but gone) as not checked", () => {
    const r = recipe([line({ item_id: "gone", name: "Kemiri" })]);
    expect(cookCheck(r, null, [ayam], off)).toMatchObject({ state: "unknown", missing: [], unchecked: ["Kemiri"] });
  });
});

describe("cookCheck with Kitchen amounts on", () => {
  const ayamTracked = item({ id: "ayam", name: "Ayam", track_amount: true, quantity: 1, unit: "kg", stock_status: "low" });
  const opor = recipe([
    line({ item_id: "ayam", name: "Ayam", amount: 600, unit: "g" }),
    line({ item_id: "ayam", name: "Ayam untuk kaldu", amount: 300, unit: "g" }),
  ]);

  it("adds up the lines of one item against the amount at home; Running low with enough counts as there", () => {
    expect(cookCheck(opor, null, [ayamTracked], on).state).toBe("ready");
  });

  it("scales to the servings", () => {
    expect(cookCheck(opor, 8, [ayamTracked], on).missing).toEqual([{ itemId: "ayam", name: "Ayam", listed: true }]);
    expect(cookCheck(opor, 2, [ayamTracked], on).state).toBe("ready");
  });

  it("falls back to the status for sdm and to taste, even on a tracked item", () => {
    const outTracked = item({ id: "ayam", name: "Ayam", track_amount: true, quantity: 5, unit: "kg", stock_status: "out" });
    const r = recipe([line({ item_id: "ayam", name: "Ayam", amount: 600, unit: "g" }), line({ item_id: "ayam", name: "Kaldu", amount: 2, unit: "sdm" })]);
    expect(cookCheck(r, null, [outTracked], on).state).toBe("missing");
    const tasteOnly = recipe([line({ item_id: "santan", name: "Santan" })]);
    expect(cookCheck(tasteOnly, null, [santanOut], on).state).toBe("missing");
  });

  it("checks both a counted line and a by-status line of one item (Codex, PR #155)", () => {
    const rice = item({ id: "beras", name: "Beras", track_amount: true, quantity: 0.2, unit: "kg", stock_status: "ok" });
    const r = recipe([line({ item_id: "beras", name: "Beras", amount: 1, unit: "kg" }), line({ name: "Beras" })]);
    expect(cookCheck(r, null, [rice], on).missing).toEqual([{ itemId: "beras", name: "Beras", listed: false }]);
    const plenty = { ...rice, quantity: 5 } as InventoryItem;
    expect(cookCheck(r, null, [plenty], on).state).toBe("ready");
  });

  it("uses the status for an untracked item", () => {
    const r = recipe([line({ item_id: "santan", name: "Santan", amount: 400, unit: "ml" })]);
    expect(cookCheck(r, null, [santanOut], on).state).toBe("missing");
  });
});

describe("names as the phone reads them", () => {
  it("gives staff an English recipe's Indonesian line names", () => {
    const r = recipe([line({ item_id: "santan", name: "Coconut milk", name_id: "Santan kara" }), line({ name: "Lemongrass", name_id: "Serai" })], {
      written_in: "en",
    });
    const coconut = item({ id: "santan", name: "Coconut milk", stock_status: "out" });
    expect(cookCheck(r, null, [coconut], { amounts: false, forStaff: true })).toMatchObject({
      state: "missing",
      missing: [{ itemId: "santan", name: "Santan kara", listed: true }],
      unchecked: ["Serai"],
    });
    expect(cookCheck(r, null, [coconut], off).missing[0].name).toBe("Coconut milk");
  });
});

describe("the lines", () => {
  const ready: CookCheck = { state: "ready", missing: [], unchecked: [], missingLines: [] };
  const missing: CookCheck = {
    state: "missing",
    missing: [
      { itemId: "a", name: "Santan", listed: false },
      { itemId: "b", name: "Serai", listed: true },
    ],
    unchecked: ["Lengkuas"],
    missingLines: [],
  };
  const listed: CookCheck = { ...missing, missing: missing.missing.map((m) => ({ ...m, listed: true })) };
  it("reads in both languages, with 'now' for a later day", () => {
    expect(cookLine(ready, "en")).toBe("Ready to cook");
    expect(cookLine(ready, "id")).toBe("Bahan lengkap");
    expect(cookLine(ready, "en", { later: true })).toBe("Ready to cook now");
    expect(cookLine(ready, "id", { later: true })).toBe("Bahan lengkap saat ini");
    expect(cookLine(missing, "en")).toBe("Missing 2: Santan, Serai");
    expect(cookLine(missing, "id", { later: true })).toBe("Kurang 2: Santan, Serai");
    expect(cookLine({ ...ready, state: "unknown" }, "en")).toBeNull();
  });
  it("is a calm To buy once everything missing is on the shopping list (Fable S2)", () => {
    expect(cookTone(missing)).toBe("missing");
    expect(cookTone(listed)).toBe("listed");
    expect(cookLine(listed, "en")).toBe("To buy: Santan, Serai");
    expect(cookLine(listed, "id")).toBe("Perlu dibeli: Santan, Serai");
  });
  it("caps the names where space is short (Fable S5)", () => {
    const five: CookCheck = { ...missing, missing: ["A", "B", "C", "D", "E"].map((n) => ({ itemId: n, name: n, listed: false })) };
    expect(cookLine(five, "en", { max: 2 })).toBe("Missing 5: A, B +3");
    expect(cookLine(five, "en")).toBe("Missing 5: A, B, C, D, E");
  });
  it("says what isn't on the list (Fable W1)", () => {
    expect(uncheckedLine(missing, "en")).toBe("Not on your list: Lengkuas");
    expect(uncheckedLine(missing, "id")).toBe("Belum ada di daftar: Lengkuas");
    expect(uncheckedLine(ready, "id")).toBeNull();
  });
});

describe("readySplit (the Recipes pill filters, Fable S3)", () => {
  it("keeps the ready recipes, in order, and counts the ones that need shopping", () => {
    const m = (n: number): CookCheck => ({ state: "missing", missing: Array.from({ length: n }, (_, i) => ({ itemId: String(i), name: "x", listed: true })), unchecked: [], missingLines: [] });
    const checks: Record<string, CookCheck> = {
      a: m(2),
      b: { state: "unknown", missing: [], unchecked: [], missingLines: [] },
      c: { state: "ready", missing: [], unchecked: [], missingLines: [] },
      d: m(1),
      e: { state: "ready", missing: [], unchecked: [], missingLines: [] },
    };
    expect(readySplit(["a", "b", "c", "d", "e"], (k) => checks[k])).toEqual({ ready: ["c", "e"], needShopping: 2 });
  });
});

describe("countedItems (cooking and Add missing with Kitchen amounts off)", () => {
  it("treats every item as untracked while amounts are off, and leaves them alone while on", async () => {
    const { countedItems } = await import("@/lib/features");
    const tracked = item({ id: "beras", name: "Beras", track_amount: true, quantity: 4 });
    expect(countedItems([tracked], true)[0]).toBe(tracked);
    expect(countedItems([tracked], false)[0]).toMatchObject({ id: "beras", track_amount: false, quantity: 4 });
    expect(tracked.track_amount).toBe(true);
  });
});

describe("Ada bahan yang habis? (S2a)", () => {
  it("asks about the linked items cooking didn't take off, once each, never one already Out", async () => {
    const { ranOutCandidates } = await import("@/lib/menu");
    const at = (n: number, status: "ok" | "low" | "out") =>
      ({ id: `i${n}`, name: `Item ${n}`, stock_status: status, track_amount: false, unit: "pcs", quantity: 0 }) as unknown as import("@/types/database").InventoryItem;
    const items = [at(1, "ok"), at(2, "out"), at(3, "low")];
    const recipe = {
      id: "r",
      servings: 4,
      written_in: "id",
      ingredients: [
        { id: "l1", item_id: "i1", name: "Item 1", name_id: null, amount: 1, unit: "kg", position: 1 },
        { id: "l2", item_id: "i2", name: "Item 2", name_id: null, amount: 1, unit: "kg", position: 2 },
        { id: "l3", item_id: "i3", name: "Item 3", name_id: null, amount: 1, unit: "kg", position: 3 },
        { id: "l4", item_id: null, name: "Serai", name_id: null, amount: 1, unit: "batang", position: 4 },
        { id: "l5", item_id: "i1", name: "Item 1 again", name_id: null, amount: 1, unit: "kg", position: 5 },
      ],
    } as unknown as import("@/lib/recipes").RecipeWithLines;
    expect(ranOutCandidates(recipe, items, []).map((i) => i.id)).toEqual(["i1", "i3"]);
    // What cooking took off by amount isn't asked.
    expect(ranOutCandidates(recipe, items, [{ item_id: "i1", amount: 1, unit: "kg" }]).map((i) => i.id)).toEqual(["i3"]);
    expect(ranOutCandidates(null, items, [])).toEqual([]);
  });
});
