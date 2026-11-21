import { describe, expect, it } from "vitest";
import {
  buildShelves,
  isToBuy,
  shelfFilterFrom,
  shelfSymbol,
  shelfThings,
  tileState,
  type ShelfThing,
} from "@/lib/kitchen-shelves";
import type { FoodItem, InventoryItem } from "@/types/database";

const TODAY = "2026-11-21";
const day = (offset: number) => {
  const d = new Date(`${TODAY}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

let n = 0;
const food = (name: string, over: Partial<FoodItem> = {}): FoodItem => ({
  id: `f${++n}`,
  household_id: "h",
  name,
  photo_url: null,
  kept_in: "fridge",
  expires_on: null,
  expiry_unknown: false,
  source: "home",
  from_whom: null,
  return_container: false,
  container_returned_at: null,
  notes: null,
  added_by: null,
  created_by: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  outcome: null,
  finished_at: null,
  finished_by: null,
  ...over,
});
const ingredient = (name: string, over: Partial<InventoryItem> = {}): InventoryItem =>
  ({
    id: `i${++n}`,
    household_id: "h",
    scope: "home",
    name,
    category: "fresh_food",
    quantity: 0,
    unit: "pcs",
    min_threshold: 0,
    photo_url: null,
    created_at: "2026-11-01T00:00:00Z",
    variant: null,
    audit_frequency_days: 7,
    last_audited_at: null,
    notes: null,
    stock_status: "ok",
    kept_in: null,
    expires_on: null,
    ...over,
  }) as InventoryItem;

const asThing = (item: FoodItem | InventoryItem): ShelfThing =>
  "kept_in" in item && "outcome" in item
    ? { kind: "food", id: item.id, name: item.name ?? "", item: item as FoodItem }
    : { kind: "ingredient", id: item.id, name: (item as InventoryItem).name, item: item as InventoryItem };

describe("the kitchen's shelves", () => {
  const sayur = food("Sayur asem", { expires_on: day(1) });
  const opor = food("Opor", { expires_on: day(2) });
  const kue = food("Kue lapis", { expires_on: day(3), kept_in: "counter" });
  const rendang = food("Rendang", { expires_on: day(24), kept_in: "freezer" });
  const eaten = food("Pisang goreng", { outcome: "eaten" });
  const telur = ingredient("Telur");
  const tempe = ingredient("Tempe", { stock_status: "low" });
  const santan = ingredient("Santan", { stock_status: "out", expires_on: day(1) });
  const beras = ingredient("Beras", { category: "pantry" });
  const things = shelfThings([sayur, opor, kue, rendang, eaten], [telur, tempe, santan, beras]);

  it("puts Use soon first, the nearest first, then each place; finished food is gone", () => {
    const shelves = buildShelves(things, TODAY);
    expect(shelves.map((s) => s.key)).toEqual(["soon", "fridge", "freezer", "pantry"]);
    expect(shelves[0].things.map((t) => t.name)).toEqual(["Sayur asem", "Opor", "Kue lapis"]);
    expect(shelves[1].things.map((t) => t.name)).toEqual(["Santan", "Tempe", "Telur"]);
    expect(shelves[2].things.map((t) => t.name)).toEqual(["Rendang"]);
    expect(shelves[3].things.map((t) => t.name)).toEqual(["Beras"]);
    expect(things.some((t) => t.name === "Pisang goreng")).toBe(false);
  });

  it("Use soon alone, and To buy as what is running low or out, on its shelf", () => {
    expect(buildShelves(things, TODAY, "soon").map((s) => s.key)).toEqual(["soon"]);
    const buy = buildShelves(things, TODAY, "buy");
    expect(buy.map((s) => s.key)).toEqual(["fridge"]);
    expect(buy[0].things.map((t) => t.name)).toEqual(["Santan", "Tempe"]);
    expect(isToBuy(asThing(telur))).toBe(false);
  });

  it("rations amber: a tile for today and tomorrow, a word for two or three days, grey beyond", () => {
    expect(tileState(asThing(sayur), TODAY, "en")).toEqual({ tone: "urgent", word: "Tomorrow" });
    expect(tileState(asThing(food("x", { expires_on: TODAY })), TODAY, "id")).toEqual({ tone: "urgent", word: "Hari ini" });
    expect(tileState(asThing(food("x", { expires_on: day(-2) })), TODAY, "en")).toEqual({ tone: "urgent", word: "2 days past" });
    expect(tileState(asThing(opor), TODAY, "en")).toEqual({ tone: "soon", word: "2 days" });
    expect(tileState(asThing(kue), TODAY, "id")).toEqual({ tone: "soon", word: "3 hari lagi" });
    expect(tileState(asThing(rendang), TODAY, "en")).toEqual({ tone: "quiet", word: "24 days" });
  });

  it("says Low and Out in words, and nothing for a thing that is simply there", () => {
    expect(tileState(asThing(tempe), TODAY, "en")).toEqual({ tone: "low", word: "Low" });
    expect(tileState(asThing(tempe), TODAY, "id")).toEqual({ tone: "low", word: "Hampir habis" });
    // Out wins over a date a cached row still carries.
    expect(tileState(asThing(santan), TODAY, "en")).toEqual({ tone: "out", word: "Out" });
    expect(tileState(asThing(telur), TODAY, "en")).toEqual({ tone: "none", word: null });
  });

  it("asks to check the date of food nobody knows, in Use soon", () => {
    const mystery = food("Kiriman tetangga", { expiry_unknown: true });
    expect(tileState(asThing(mystery), TODAY, "en")).toEqual({ tone: "check", word: "Check the date" });
    expect(buildShelves([asThing(mystery), asThing(opor)], TODAY)[0].things.map((t) => t.name)).toEqual([
      "Kiriman tetangga",
      "Opor",
    ]);
  });

  it("reads the pill from the URL", () => {
    expect(shelfFilterFrom(null)).toBe("all");
    expect(shelfFilterFrom("soon")).toBe("soon");
    expect(shelfFilterFrom("buy")).toBe("buy");
    expect(shelfFilterFrom("x")).toBe("all");
  });
});

describe("symbols from names", () => {
  it.each([
    ["Telur ayam kampung", "egg"],
    ["Santan kara", "milk"],
    ["Dada ayam", "drumstick"],
    ["Rendang", "beef"],
    ["Udang", "shrimp"],
    ["Beras", "wheat"],
    ["Kue lapis", "cake"],
    ["Bayam", "leaf"],
    ["Pisang", "banana"],
    ["Tempe", "bean"],
    ["Kecap manis", "jar"],
    ["Eggs", "egg"],
  ] as const)("%s → %s", (name, symbol) => {
    expect(shelfSymbol({ kind: "ingredient", name })).toBe(symbol);
  });

  it("falls back by kind, and matches whole words only", () => {
    // Cooked food is a bowl; a cake is a cake.
    expect(shelfSymbol({ kind: "food", name: "Sayur asem" })).toBe("bowl");
    expect(shelfSymbol({ kind: "food", name: "Rendang" })).toBe("bowl");
    expect(shelfSymbol({ kind: "food", name: "Kue lapis" })).toBe("cake");
    expect(shelfSymbol({ kind: "food", name: "Opor" })).toBe("bowl");
    expect(shelfSymbol({ kind: "ingredient", name: "Sabun" })).toBe("package");
    // "Tahunan" is not "tahu".
    expect(shelfSymbol({ kind: "ingredient", name: "Tahunan" })).toBe("package");
  });
});
