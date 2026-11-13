// What cooking took off stock and changing it the same day (Phase 177,
// migrations/156): the twins of cook_menu_dish, uncook_menu_dish and
// change_cooked_uses that the demo data and the browser tests' stub run.
// The same cases as supabase/tests/156_cooking_corrections.sql.
import { describe, expect, it } from "vitest";
import {
  CookingRuleError,
  applyCook,
  applyUncook,
  applyUsesChange,
  cookingRefusal,
  saidOf,
  wasUsed,
} from "@/lib/cooked-uses";
import type { CookedUse, InventoryItem, MenuDish } from "@/types/database";

const NOW = new Date("2026-11-13T12:00:00Z");

function item(patch: Partial<InventoryItem>): InventoryItem {
  return {
    id: "i",
    household_id: "h1",
    scope: "home",
    name: "Item",
    variant: null,
    category: "fresh_food",
    quantity: 0,
    unit: "g",
    min_threshold: 0,
    photo_url: null,
    stock_status: "ok",
    track_amount: true,
    to_buy_amount: null,
    expires_on: null,
    amount_set_by: null,
    created_at: "2026-10-01T00:00:00Z",
    ...patch,
  } as unknown as InventoryItem;
}

function dish(patch: Partial<MenuDish> = {}): MenuDish {
  return {
    id: "rendang",
    household_id: "h1",
    day: "2026-11-13",
    meal: "dinner",
    recipe_id: "r1",
    title: "Rendang",
    servings: 4,
    notes: null,
    position: 0,
    cooked_at: null,
    cooked_by: null,
    cooked_uses: null,
    created_by: null,
    created_at: "2026-11-12T00:00:00Z",
    updated_at: "2026-11-12T00:00:00Z",
    ...patch,
  };
}

/** A tiny household: apply each answer's items, as the providers do. */
class Kitchen {
  items: InventoryItem[];
  dish: MenuDish;
  constructor(items: InventoryItem[], d: MenuDish = dish()) {
    this.items = items;
    this.dish = d;
  }
  private take(result: { dish: MenuDish; items: InventoryItem[] }) {
    this.dish = result.dish;
    for (const it of result.items) this.items = this.items.map((i) => (i.id === it.id ? it : i));
    return result;
  }
  cook(uses: CookedUse[], staff: string | null = "sari") {
    return this.take(applyCook(this.dish, uses, this.items, staff, NOW));
  }
  change(uses: CookedUse[], staff: string | null = "budi", was: CookedUse[] | null | undefined = this.dish.cooked_uses) {
    return this.take(applyUsesChange(this.dish, uses, this.items, staff, NOW, was));
  }
  uncook() {
    return this.take(applyUncook(this.dish, this.items, NOW));
  }
  qty(id: string) {
    return this.items.find((i) => i.id === id)!.quantity;
  }
  get(id: string) {
    return this.items.find((i) => i.id === id)!;
  }
  entry(id: string) {
    return this.dish.cooked_uses?.find((u) => u.item_id === id);
  }
  buy(id: string, quantity: number) {
    this.items = this.items.map((i) => (i.id === id ? { ...i, quantity } : i));
  }
}

const beef = (q = 300) => item({ id: "beef", name: "Daging sapi", quantity: q, unit: "g" });
const santan = (q = 1000) => item({ id: "santan", name: "Santan", quantity: q, unit: "ml", category: "pantry" });
const shallot = () => item({ id: "shallot", name: "Bawang merah", quantity: 1000, unit: "g", expires_on: "2026-12-01" });
const g = (id: string, amount: number, planned?: number): CookedUse =>
  planned === undefined ? { item_id: id, amount, unit: "g" } : { item_id: id, amount, unit: "g", planned };
const ml = (id: string, amount: number): CookedUse => ({ item_id: id, amount, unit: "ml" });

describe("cooking writes said, short, planned and the date it cleared", () => {
  it("an entry for every line, also when nothing was there", () => {
    const k = new Kitchen([beef(300), santan(), shallot(), item({ id: "kemiri", unit: "pcs", quantity: 0 })]);
    k.cook([g("beef", 500, 500), ml("santan", 400), g("shallot", 1000, 800), { item_id: "kemiri", amount: 5, unit: "pcs", planned: 5 }]);
    expect(k.entry("beef")).toEqual({ item_id: "beef", amount: 300, unit: "g", said: 500, short: 200, planned: 500 });
    expect(k.entry("santan")).toEqual({ item_id: "santan", amount: 400, unit: "ml", said: 400 });
    expect(k.entry("shallot")).toEqual({ item_id: "shallot", amount: 1000, unit: "g", said: 1000, planned: 800, cleared_date: "2026-12-01" });
    expect(k.entry("kemiri")).toEqual({ item_id: "kemiri", amount: 0, unit: "pcs", said: 5, short: 5, planned: 5 });
    expect(k.get("shallot")).toMatchObject({ quantity: 0, stock_status: "out", expires_on: null });
    expect(k.qty("beef")).toBe(0);
    expect(k.dish.cooked_by).toBe("sari");
  });

  it("sums lines of one item and converts to its unit; refuses what the server refuses", () => {
    const k = new Kitchen([item({ id: "rice", unit: "kg", quantity: 4 })]);
    k.cook([{ item_id: "rice", amount: 500, unit: "g", planned: 500 }, { item_id: "rice", amount: 250, unit: "g", planned: 250 }]);
    expect(k.entry("rice")).toEqual({ item_id: "rice", amount: 0.75, unit: "kg", said: 0.75, planned: 0.75 });
    expect(() => k.cook([])).toThrow("already_cooked");
    const fresh = () => new Kitchen([beef(), item({ id: "salt", track_amount: false })]);
    expect(() => fresh().cook([g("beef", 0)])).toThrow("bad_amount");
    expect(() => fresh().cook([g("beef", 5, 0)])).toThrow("bad_amount");
    expect(() => fresh().cook([g("salt", 5)])).toThrow("item_not_tracked");
    expect(() => fresh().cook([{ item_id: "beef", amount: 5, unit: "pcs" }])).toThrow("unit_mismatch");
    expect(() => fresh().cook([g("beef", 5), { item_id: "beef", amount: 1, unit: "kg" }])).toThrow("unit_mismatch");
  });
});

describe("un-cook", () => {
  it("puts the date back with the amount, and skips an entry with nothing taken", () => {
    const k = new Kitchen([item({ id: "tahu", unit: "pcs", quantity: 4, expires_on: "2026-11-20" }), item({ id: "kemiri", unit: "pcs", quantity: 0 })]);
    k.cook([{ item_id: "tahu", amount: 4, unit: "pcs" }, { item_id: "kemiri", amount: 3, unit: "pcs" }]);
    expect(k.get("tahu").expires_on).toBeNull();
    const { items } = k.uncook();
    expect(k.get("tahu")).toMatchObject({ quantity: 4, expires_on: "2026-11-20", stock_status: "ok" });
    expect(items.map((i) => i.id)).toEqual(["tahu"]);
    expect(k.dish.cooked_at).toBeNull();
  });

  it("leaves a date someone set meanwhile", () => {
    const k = new Kitchen([item({ id: "tahu", unit: "pcs", quantity: 4, expires_on: "2026-11-20" })]);
    k.cook([{ item_id: "tahu", amount: 4, unit: "pcs" }]);
    k.items = k.items.map((i) => ({ ...i, quantity: 2, expires_on: "2026-11-25", stock_status: "ok" }));
    k.uncook();
    expect(k.get("tahu")).toMatchObject({ quantity: 6, expires_on: "2026-11-25" });
  });

  it("a staff phone only within 10 minutes of cooking; an owner any time (audit D1)", () => {
    const k = new Kitchen([item({ id: "tahu", unit: "pcs", quantity: 4 })]);
    k.cook([{ item_id: "tahu", amount: 1, unit: "pcs" }]);
    const at = (minutes: number) => new Date(new Date(k.dish.cooked_at!).getTime() + minutes * 60_000);
    expect(applyUncook(k.dish, k.items, at(9), false).dish.cooked_at).toBeNull();
    expect(() => applyUncook(k.dish, k.items, at(11), false)).toThrow("too_late");
    expect(applyUncook(k.dish, k.items, at(60 * 24 * 3), true).items[0].quantity).toBe(4);
  });

  it("lists an item whose unit no longer converts instead of giving it a wrong number", () => {
    const k = new Kitchen([beef(1000)]);
    k.cook([g("beef", 200)]);
    k.items = k.items.map((i) => ({ ...i, unit: "pcs" }));
    const { skipped } = applyUncook(k.dish, k.items, NOW);
    expect(skipped).toEqual([{ item_id: "beef", amount: 200, unit: "g" }]);
  });
});

describe("change what was used: only the difference (plan 3c)", () => {
  it("more comes off, less goes back; an unchanged line is never written", () => {
    const k = new Kitchen([beef(1000), santan(1000)]);
    k.cook([g("beef", 500), ml("santan", 400)]);
    const { items } = k.change([g("beef", 700), ml("santan", 400)]);
    expect(items.map((i) => i.id)).toEqual(["beef"]);
    expect(k.qty("beef")).toBe(300);
    expect(k.get("beef").amount_set_by).toBe("budi");
    expect(k.get("santan").amount_set_by).toBe("sari");
    k.change([g("beef", 300), ml("santan", 400)]);
    expect(k.qty("beef")).toBe(700);
    expect(k.dish.cooked_by).toBe("sari");
  });

  it("untick puts all back and keeps the entry; a new tick takes off as cooking does", () => {
    const k = new Kitchen([beef(1000), santan(1000)]);
    k.cook([g("beef", 500)]);
    k.change([ml("santan", 100)]);
    expect(k.qty("beef")).toBe(1000);
    expect(k.entry("beef")).toEqual({ item_id: "beef", amount: 0, unit: "g", said: 0 });
    expect(k.qty("santan")).toBe(900);
    expect(k.entry("santan")).toEqual({ item_id: "santan", amount: 100, unit: "ml", said: 100 });
    expect(k.dish.cooked_at).not.toBeNull();
    expect(wasUsed(k.entry("beef")!)).toBe(false);
  });

  it("never below zero: 2 kg said with 1 kg at home takes the 1 kg and it is Out", () => {
    const k = new Kitchen([beef(1500)]);
    k.cook([g("beef", 500)]);
    k.change([g("beef", 2000)]);
    expect(k.get("beef")).toMatchObject({ quantity: 0, stock_status: "out" });
    expect(k.entry("beef")).toEqual({ item_id: "beef", amount: 1500, unit: "g", said: 2000 });
  });

  it("the 300-of-500 case: the missing 200 is never taken from stock bought since", () => {
    const k = new Kitchen([beef(300)]);
    k.cook([g("beef", 500, 500)]);
    const cooked = k.entry("beef");
    k.buy("beef", 1000);
    k.change([g("beef", 600)]);
    expect(k.qty("beef")).toBe(900);
    k.change([g("beef", 400)]);
    expect(k.qty("beef")).toBe(1100);
    k.change([g("beef", 500)]);
    expect(k.qty("beef")).toBe(1000);
    expect(k.entry("beef")).toEqual(cooked);
  });

  it("a change that runs out, then its Undo, returns exactly what it took", () => {
    const k = new Kitchen([santan(800)]);
    k.cook([ml("santan", 300)]);
    const before = k.dish.cooked_uses;
    k.change([ml("santan", 2000)]);
    expect(k.qty("santan")).toBe(0);
    k.change(before!);
    expect(k.qty("santan")).toBe(500);
    expect(k.entry("santan")).toEqual({ item_id: "santan", amount: 300, unit: "ml", said: 300 });
  });

  it("cook 500 with 300 there, buy, untick, then Undo: as before the untick", () => {
    const k = new Kitchen([beef(300)]);
    k.cook([g("beef", 500, 500)]);
    k.buy("beef", 1000);
    const beforeUntick = k.entry("beef");
    k.change([]);
    expect(k.qty("beef")).toBe(1300);
    expect(k.entry("beef")).toEqual({ item_id: "beef", amount: 0, unit: "g", said: 0, short: 200, planned: 500 });
    k.change([g("beef", 500)]);
    expect(k.qty("beef")).toBe(1000);
    expect(k.entry("beef")).toEqual(beforeUntick);
  });

  it("a new tick with too little records the shortfall; planned comes from the phone", () => {
    const k = new Kitchen([beef(100), santan(1000)]);
    k.cook([ml("santan", 100)]);
    k.change([ml("santan", 100), g("beef", 250, 200)]);
    expect(k.entry("beef")).toEqual({ item_id: "beef", amount: 100, unit: "g", said: 250, short: 150, planned: 200 });
  });

  it("putting some back restores the date the cooking cleared", () => {
    const k = new Kitchen([shallot()]);
    k.cook([g("shallot", 1000)]);
    k.change([g("shallot", 600)]);
    expect(k.get("shallot")).toMatchObject({ quantity: 400, expires_on: "2026-12-01", stock_status: "ok" });
    expect(k.entry("shallot")).toEqual({ item_id: "shallot", amount: 600, unit: "g", said: 600 });
    // Taking the rest again empties it, and the entry remembers the date again.
    k.change([g("shallot", 1000)]);
    expect(k.get("shallot").expires_on).toBeNull();
    expect(k.entry("shallot")?.cleared_date).toBe("2026-12-01");
  });

  it("the same list twice changes nothing the second time", () => {
    const k = new Kitchen([beef(1000)]);
    k.cook([g("beef", 500)]);
    k.change([g("beef", 600)]);
    const { items } = k.change([g("beef", 600)]);
    expect(items).toEqual([]);
    expect(k.qty("beef")).toBe(400);
    expect(k.change([g("beef", 600)], "budi", undefined).items).toEqual([]);
  });

  it("an entry it can't read is kept as it is; naming it is refused", () => {
    const k = new Kitchen([beef(1000), item({ id: "tomat", quantity: 1000 }), item({ id: "wortel", quantity: 1000 })]);
    k.cook([g("beef", 100), g("tomat", 200), g("wortel", 100)]);
    const tomat = k.entry("tomat");
    const wortel = k.entry("wortel");
    k.items = k.items.map((i) => (i.id === "tomat" ? { ...i, track_amount: false } : i.id === "wortel" ? { ...i, unit: "pcs" } : i));
    k.change([]);
    expect(k.qty("beef")).toBe(1000);
    expect(k.entry("tomat")).toEqual(tomat);
    expect(k.entry("wortel")).toEqual(wortel);
    expect(() => k.change([g("tomat", 100)])).toThrow("item_not_tracked");
    expect(() => k.change([{ item_id: "wortel", amount: 1, unit: "pcs" }])).toThrow("unit_mismatch");
    k.items = k.items.filter((i) => i.id !== "tomat");
    expect(() => k.change([g("tomat", 100)])).toThrow("item_not_tracked");
  });

  it("refuses by name: not cooked, a day passed, changed on another phone", () => {
    expect(() => applyUsesChange(dish(), [], [], null, NOW)).toThrow("not_cooked");
    const old = dish({ cooked_at: new Date(NOW.getTime() - 31 * 3_600_000).toISOString(), cooked_uses: [] });
    expect(() => applyUsesChange(old, [], [], null, NOW)).toThrow("too_late");
    const recent = dish({ cooked_at: new Date(NOW.getTime() - 29 * 3_600_000).toISOString(), cooked_uses: [] });
    expect(() => applyUsesChange(recent, [], [], null, NOW)).not.toThrow();
    const k = new Kitchen([beef(1000)]);
    k.cook([g("beef", 500)]);
    expect(() => k.change([g("beef", 600)], null, [])).toThrow("changed_elsewhere");
    // Keys in another order are the same list (jsonb equality).
    const reordered = k.dish.cooked_uses!.map((u) => Object.fromEntries(Object.entries(u).reverse()) as CookedUse);
    expect(() => k.change([g("beef", 600)], null, reordered)).not.toThrow();
    try {
      k.change([g("beef", 0)]);
    } catch (err) {
      expect(err).toBeInstanceOf(CookingRuleError);
      expect((err as CookingRuleError).code).toBe("bad_amount");
    }
  });
});

describe("reading entries and server errors", () => {
  it("said falls back to amount; a refusal is found in the server's message", () => {
    expect(saidOf({ item_id: "a", amount: 3 } as CookedUse)).toBe(3);
    expect(saidOf({ item_id: "a", amount: 3, said: 0 } as CookedUse)).toBe(0);
    expect(cookingRefusal("changed_elsewhere")).toBe("changed_elsewhere");
    expect(cookingRefusal("too_late")).toBe("too_late");
    expect(cookingRefusal("permission denied for function")).toBeNull();
    expect(cookingRefusal(undefined)).toBeNull();
  });
});
