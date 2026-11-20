// Can we cook it? (D18, owner 20 Nov): the per-line rules, the lines shown
// and the Recipes pill's order.
import { describe, expect, it } from "vitest";
import { cookCheck, cookLine, readyFirst, uncheckedLine } from "@/lib/can-cook";
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
    expect(cookCheck(r, null, [ayam], off)).toEqual({ state: "ready", missing: [], unchecked: [] });
  });

  it("lists Out and Running low as missing, once each, in the recipe's order", () => {
    const r = recipe([
      line({ item_id: "serai", name: "Serai" }),
      line({ item_id: "ayam", name: "Ayam" }),
      line({ item_id: "santan", name: "Santan", amount: 400, unit: "ml" }),
      line({ item_id: "serai", name: "Serai lagi" }),
    ]);
    const check = cookCheck(r, null, [ayam, santanOut, seraiLow], off);
    expect(check.state).toBe("missing");
    expect(check.missing).toEqual([
      { itemId: "serai", name: "Serai" },
      { itemId: "santan", name: "Santan" },
    ]);
  });

  it("ignores amounts while Kitchen amounts is off, even on a tracked item", () => {
    const tracked = item({ id: "ayam", name: "Ayam", track_amount: true, quantity: 0.2, stock_status: "ok" });
    const r = recipe([line({ item_id: "ayam", name: "Ayam", amount: 1, unit: "kg" })]);
    expect(cookCheck(r, null, [tracked], off).state).toBe("ready");
  });

  it("checks a free name that is exactly one item's name, by that item's status", () => {
    const r = recipe([line({ name: "  santan " })]);
    expect(cookCheck(r, null, [santanOut], off).missing).toEqual([{ itemId: "santan", name: "santan" }]);
  });

  it("leaves a free name with no item, or two items of that name, not checked", () => {
    const twice = [item({ id: "a", name: "Daun salam" }), item({ id: "b", name: "Daun salam" })];
    const r = recipe([line({ name: "Lengkuas" }), line({ name: "Daun salam" }), line({ name: "lengkuas" }), line({ item_id: "ayam", name: "Ayam" })]);
    const check = cookCheck(r, null, [ayam, ...twice], off);
    expect(check).toEqual({ state: "ready", missing: [], unchecked: ["Lengkuas", "Daun salam"] });
  });

  it("is unknown with no lines, or only lines it cannot check", () => {
    expect(cookCheck(recipe([]), null, [ayam], off).state).toBe("unknown");
    expect(cookCheck(recipe([line({ name: "Lengkuas" })]), null, [ayam], off).state).toBe("unknown");
  });

  it("reads a linked line whose item was deleted (item_id kept but gone) as not checked", () => {
    const r = recipe([line({ item_id: "gone", name: "Kemiri" })]);
    expect(cookCheck(r, null, [ayam], off)).toEqual({ state: "unknown", missing: [], unchecked: ["Kemiri"] });
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
    expect(cookCheck(opor, 8, [ayamTracked], on).missing).toEqual([{ itemId: "ayam", name: "Ayam" }]);
    expect(cookCheck(opor, 2, [ayamTracked], on).state).toBe("ready");
  });

  it("falls back to the status for sdm and to taste, even on a tracked item", () => {
    const outTracked = item({ id: "ayam", name: "Ayam", track_amount: true, quantity: 5, unit: "kg", stock_status: "out" });
    const r = recipe([line({ item_id: "ayam", name: "Ayam", amount: 600, unit: "g" }), line({ item_id: "ayam", name: "Kaldu", amount: 2, unit: "sdm" })]);
    expect(cookCheck(r, null, [outTracked], on).state).toBe("missing");
    const tasteOnly = recipe([line({ item_id: "santan", name: "Santan" })]);
    expect(cookCheck(tasteOnly, null, [santanOut], on).state).toBe("missing");
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
    expect(cookCheck(r, null, [coconut], { amounts: false, forStaff: true })).toEqual({
      state: "missing",
      missing: [{ itemId: "santan", name: "Santan kara" }],
      unchecked: ["Serai"],
    });
    expect(cookCheck(r, null, [coconut], off).missing[0].name).toBe("Coconut milk");
  });
});

describe("the lines", () => {
  const ready = { state: "ready" as const, missing: [], unchecked: [] };
  const missing = {
    state: "missing" as const,
    missing: [
      { itemId: "a", name: "Santan" },
      { itemId: "b", name: "Serai" },
    ],
    unchecked: ["Lengkuas"],
  };
  it("reads in both languages, with 'now' for a later day", () => {
    expect(cookLine(ready, "en")).toBe("Ready to cook");
    expect(cookLine(ready, "id")).toBe("Bahan lengkap");
    expect(cookLine(ready, "en", { later: true })).toBe("Ready to cook now");
    expect(cookLine(ready, "id", { later: true })).toBe("Bahan lengkap saat ini");
    expect(cookLine(missing, "en")).toBe("Missing 2: Santan, Serai");
    expect(cookLine(missing, "id", { later: true })).toBe("Kurang 2: Santan, Serai");
    expect(cookLine({ state: "unknown", missing: [], unchecked: [] }, "en")).toBeNull();
  });
  it("names what it couldn't check", () => {
    expect(uncheckedLine(missing, "en")).toBe("Not checked: Lengkuas");
    expect(uncheckedLine(missing, "id")).toBe("Belum dicek: Lengkuas");
    expect(uncheckedLine(ready, "id")).toBeNull();
  });
});

describe("readyFirst", () => {
  it("puts ready first, then fewest missing, unknown last, keeping the order within each", () => {
    const checks: Record<string, Parameters<typeof cookLine>[0]> = {
      a: { state: "missing", missing: [{ itemId: "1", name: "x" }, { itemId: "2", name: "y" }], unchecked: [] },
      b: { state: "unknown", missing: [], unchecked: [] },
      c: { state: "ready", missing: [], unchecked: [] },
      d: { state: "missing", missing: [{ itemId: "1", name: "x" }], unchecked: [] },
      e: { state: "ready", missing: [], unchecked: [] },
    };
    expect(readyFirst(["a", "b", "c", "d", "e"], (k) => checks[k])).toEqual(["c", "e", "d", "a", "b"]);
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
