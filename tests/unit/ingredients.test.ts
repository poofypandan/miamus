import { describe, expect, it } from "vitest";
import {
  INGREDIENT_GROUPS,
  INGREDIENT_GROUP_LABELS,
  defaultPlace,
  groupIngredients,
  ingredientDaysLeft,
  ingredientExpiryText,
  isUseSoon,
  normalName,
  placeOf,
  sameName,
} from "@/lib/ingredients";
import type { InventoryItem } from "@/types/database";

const TODAY = "2026-11-12";

function item(name: string, over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: name,
    household_id: "h1",
    scope: "home",
    name,
    category: "fresh_food",
    quantity: 0,
    unit: "pcs",
    min_threshold: 0,
    photo_url: null,
    created_at: "2026-10-01T00:00:00Z",
    variant: null,
    audit_frequency_days: 30,
    last_audited_at: null,
    notes: null,
    stock_status: "ok",
    ...over,
  };
}

const names = (items: InventoryItem[]) => items.map((i) => i.name);

describe("the place", () => {
  it("defaults by category: fresh food in the fridge, pantry in the cupboard", () => {
    expect(defaultPlace("fresh_food")).toBe("fridge");
    expect(defaultPlace("pantry")).toBe("pantry");
    expect(defaultPlace("household_supplies")).toBe("pantry");
  });

  it("is the stored place, or the default while nobody has said", () => {
    expect(placeOf(item("Telur"))).toBe("fridge");
    expect(placeOf(item("Beras", { category: "pantry" }))).toBe("pantry");
    expect(placeOf(item("Beras", { category: "pantry", kept_in: null }))).toBe("pantry");
    expect(placeOf(item("Dada Ayam", { kept_in: "freezer" }))).toBe("freezer");
    expect(placeOf(item("Bawang", { category: "pantry", kept_in: "counter" }))).toBe("counter");
  });
});

describe("use soon", () => {
  it("counts days like food, and a row from an older build has no date", () => {
    expect(ingredientDaysLeft(item("A", { expires_on: "2026-11-13" }), TODAY)).toBe(1);
    expect(ingredientDaysLeft(item("A", { expires_on: "2026-11-10" }), TODAY)).toBe(-2);
    expect(ingredientDaysLeft(item("A"), TODAY)).toBeNull();
    expect(ingredientDaysLeft(item("A", { expires_on: null }), TODAY)).toBeNull();
  });

  it("is a date 7 days away or fewer, past dates included", () => {
    expect(isUseSoon(item("A", { expires_on: "2026-11-19" }), TODAY)).toBe(true);
    expect(isUseSoon(item("A", { expires_on: "2026-11-20" }), TODAY)).toBe(false);
    expect(isUseSoon(item("A", { expires_on: TODAY }), TODAY)).toBe(true);
    expect(isUseSoon(item("A", { expires_on: "2026-11-01" }), TODAY)).toBe(true);
    expect(isUseSoon(item("A"), TODAY)).toBe(false);
  });

  it("never holds an item that is Out, even a cached one with a date", () => {
    expect(isUseSoon(item("A", { stock_status: "out", expires_on: "2026-11-13" }), TODAY)).toBe(false);
    expect(isUseSoon(item("A", { stock_status: "low", expires_on: "2026-11-13" }), TODAY)).toBe(true);
  });
});

describe("groupIngredients", () => {
  const items = [
    item("Tomat"),
    item("Telur", { stock_status: "low" }),
    item("Daging sapi", { kept_in: "freezer", expires_on: "2026-12-22" }),
    item("Dada Ayam", { kept_in: "fridge", expires_on: "2026-11-13" }),
    item("Santan", { category: "pantry", expires_on: "2026-11-10" }),
    item("Beras", { category: "pantry", stock_status: "low" }),
    item("Minyak goreng", { category: "pantry" }),
    item("Bawang merah", { category: "pantry", kept_in: "counter" }),
    item("Kecap", { category: "pantry", stock_status: "out", expires_on: "2026-11-13" }),
    item("Udang", { kept_in: "freezer", expires_on: "2026-11-15" }),
  ];
  const groups = groupIngredients(items, TODAY);

  it("puts each item in exactly one group", () => {
    const all = INGREDIENT_GROUPS.flatMap((g) => names(groups[g]));
    expect(all).toHaveLength(items.length);
    expect(new Set(all)).toEqual(new Set(names(items)));
  });

  it("lists Use soon soonest first, past dates on top, whatever the place", () => {
    expect(names(groups.soon)).toEqual(["Santan", "Dada Ayam", "Udang"]);
  });

  it("keeps an Out item in its place, never in Use soon", () => {
    expect(names(groups.pantry)).toContain("Kecap");
    expect(names(groups.soon)).not.toContain("Kecap");
  });

  it("orders each place as the list does today: Out, Running low, then name", () => {
    expect(names(groups.fridge)).toEqual(["Telur", "Tomat"]);
    expect(names(groups.freezer)).toEqual(["Daging sapi"]);
    expect(names(groups.counter)).toEqual(["Bawang merah"]);
    expect(names(groups.pantry)).toEqual(["Kecap", "Beras", "Minyak goreng"]);
  });

  it("puts items with no place stored under their category's default", () => {
    expect(names(groups.fridge)).toContain("Tomat");
    expect(names(groups.pantry)).toContain("Minyak goreng");
  });

  it("returns every group, empty ones included, in the list's order", () => {
    expect(INGREDIENT_GROUPS).toEqual(["soon", "fridge", "freezer", "counter", "pantry"]);
    const empty = groupIngredients([], TODAY);
    expect(INGREDIENT_GROUPS.every((g) => empty[g].length === 0)).toBe(true);
  });

  it("doesn't reorder the caller's array", () => {
    const before = names(items);
    groupIngredients(items, TODAY);
    expect(names(items)).toEqual(before);
  });
});

describe("words", () => {
  it("names the groups in both languages", () => {
    expect(INGREDIENT_GROUP_LABELS.en).toEqual({
      soon: "Use soon",
      fridge: "Fridge",
      freezer: "Freezer",
      counter: "Counter",
      pantry: "Cupboard",
    });
    expect(INGREDIENT_GROUP_LABELS.id).toEqual({
      soon: "Segera dipakai",
      fridge: "Kulkas",
      freezer: "Freezer",
      counter: "Meja",
      pantry: "Lemari",
    });
  });

  it("says when it expires, in English", () => {
    expect(ingredientExpiryText(null, "en")).toBeNull();
    expect(ingredientExpiryText(0, "en")).toBe("Expires today");
    expect(ingredientExpiryText(1, "en")).toBe("Expires tomorrow");
    expect(ingredientExpiryText(5, "en")).toBe("Expires in 5 days");
    expect(ingredientExpiryText(-1, "en")).toBe("1 day past date — check first");
    expect(ingredientExpiryText(-2, "en")).toBe("2 days past date — check first");
  });

  it("... and in Bahasa Indonesia (glossary, Phase 176)", () => {
    expect(ingredientExpiryText(null, "id")).toBeNull();
    expect(ingredientExpiryText(0, "id")).toBe("Kedaluwarsa hari ini");
    expect(ingredientExpiryText(1, "id")).toBe("Kedaluwarsa besok");
    expect(ingredientExpiryText(5, "id")).toBe("Kedaluwarsa 5 hari lagi");
    expect(ingredientExpiryText(-2, "id")).toBe("Lewat 2 hari — cek dulu");
  });
});

describe("sameName", () => {
  it("ignores case, outer spaces and doubled inner spaces", () => {
    expect(sameName("Dada Ayam", "  dada   ayam ")).toBe(true);
    expect(sameName("DADA AYAM", "Dada\tAyam")).toBe(true);
    expect(normalName("  Dada   Ayam ")).toBe("dada ayam");
  });

  it("matches exact names only: a near match says nothing", () => {
    expect(sameName("Ayam", "Dada Ayam")).toBe(false);
    expect(sameName("Dada Ayam", "Dada Ayam Fillet")).toBe(false);
  });

  it("never matches blank names (food logged with just a photo)", () => {
    expect(sameName("", "")).toBe(false);
    expect(sameName(null, null)).toBe(false);
    expect(sameName("  ", undefined)).toBe(false);
  });
});
