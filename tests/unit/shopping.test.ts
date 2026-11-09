import { describe, expect, it } from "vitest";
import { buildShoppingList, isLowStock, isOutOfStock, stockStatus } from "@/lib/inventory";
import type { InventoryAlert, InventoryItem, StockStatus } from "@/types/database";

function item(name: string, scope: "pet" | "home", status?: StockStatus): InventoryItem {
  return {
    id: name,
    household_id: "h",
    scope,
    name,
    category: scope === "pet" ? "dog_supplies" : "household_supplies",
    quantity: 0,
    unit: "pcs",
    min_threshold: 2,
    photo_url: null,
    created_at: "2026-11-07T00:00:00Z",
    variant: null,
    audit_frequency_days: 30,
    last_audited_at: null,
    notes: null,
    stock_status: status,
  };
}

const note: InventoryAlert = {
  id: "a",
  household_id: "h",
  pet_id: null,
  item_type: "other",
  note: "Kantong sampah",
  resolved: false,
  status: "pending",
  created_at: "2026-11-07T00:00:00Z",
};

// Phase 154: the shopping list goes by what someone said, never by a count.
describe("shopping list", () => {
  it("an item with no status (an older build's row) counts as enough", () => {
    expect(stockStatus(item("Pee pad", "pet"))).toBe("ok");
    expect(isLowStock(item("Pee pad", "pet"))).toBe(false);
  });

  it("a zero count no longer puts anything on the list", () => {
    expect(isLowStock(item("Beras", "home", "ok"))).toBe(false);
  });

  it("running low and out are on the list; only out is out", () => {
    expect(isLowStock(item("A", "pet", "low"))).toBe(true);
    expect(isLowStock(item("B", "pet", "out"))).toBe(true);
    expect(isOutOfStock(item("A", "pet", "low"))).toBe(false);
    expect(isOutOfStock(item("B", "pet", "out"))).toBe(true);
  });

  it("is empty when nothing needs buying", () => {
    expect(buildShoppingList([item("Beras", "home", "ok")], [], "id")).toBeNull();
  });

  it("lists items by Pets / Home, out first, then the staff's notes", () => {
    const text = buildShoppingList(
      [item("Sabun", "home", "low"), item("Pee pad", "pet", "low"), item("Makanan", "pet", "out")],
      [{ alert: note, petName: null }],
      "id"
    );
    expect(text).toBe(
      "*Daftar belanja*\n\n" +
        "*Hewan*\n- Makanan (habis)\n- Pee pad (hampir habis)\n\n" +
        "*Rumah*\n- Sabun (hampir habis)\n\n" +
        "*Lainnya*\n- Kantong sampah"
    );
  });

  it("a note about a pet's thing keeps its label", () => {
    const text = buildShoppingList([], [{ alert: { ...note, item_type: "food", note: "sisa 1 hari" }, petName: "Mochi" }], "id");
    expect(text).toBe("*Daftar belanja*\n\n*Lainnya*\n- Makanan Mochi: sisa 1 hari");
  });

  it("speaks English for an owner who chose it", () => {
    expect(buildShoppingList([item("Pee pad", "pet", "out")], [], "en")).toBe(
      "*Shopping list*\n\n*Pets*\n- Pee pad (out)"
    );
  });
});
