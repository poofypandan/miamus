import { addDays, startOfDay } from "date-fns";
import { Apple, Dog, SprayCan, Wheat, type LucideIcon } from "lucide-react";
import type { InventoryItem, ItemType, StockCategory } from "@/types/database";

/**
 * The stock ledger's shelves, in the order both views walk them. Dog supplies
 * lead because PRD 02 marks them high priority: running out of Mocha's renal
 * food is a vet problem, running out of kale is not.
 */
export const STOCK_CATEGORIES: StockCategory[] = [
  "dog_supplies",
  "fresh_food",
  "pantry",
  "household_supplies",
];

// Owner-facing, so English per the Phase 46 language boundary.
export const STOCK_CATEGORY_LABELS_EN: Record<StockCategory, string> = {
  dog_supplies: "Dog Supplies",
  fresh_food: "Fresh Food",
  pantry: "Pantry Staples",
  household_supplies: "Household Supplies",
};

// Staff-facing, so Bahasa Indonesia.
export const STOCK_CATEGORY_LABELS_ID: Record<StockCategory, string> = {
  dog_supplies: "Perlengkapan Anjing",
  fresh_food: "Makanan Segar",
  pantry: "Bahan Pokok",
  household_supplies: "Perlengkapan Rumah",
};

export const STOCK_CATEGORY_ICONS: Record<StockCategory, LucideIcon> = {
  dog_supplies: Dog,
  fresh_food: Apple,
  pantry: Wheat,
  household_supplies: SprayCan,
};

/**
 * Whether a row belongs to the stock ledger rather than the Phase 60
 * catalogue. Both share inventory_items, and a catalogue row carries the
 * column defaults (30-day cadence, zero stock) that would otherwise put it on
 * the staff checklist and the owner's restock list with numbers nobody set.
 */
export function isStockItem(
  item: InventoryItem
): item is InventoryItem & { category: StockCategory } {
  return (STOCK_CATEGORIES as string[]).includes(item.category);
}

/** "Millo Zz Food (Beef)" — the variant is what tells three rows apart. */
export function stockItemName(item: InventoryItem): string {
  return item.variant ? `${item.name} (${item.variant})` : item.name;
}

/** Everything on the shelf, in single units. */
export function totalUnits(item: InventoryItem): number {
  return item.boxes_count * item.units_per_box + item.loose_units_count;
}

/** At or below threshold: at the threshold is already the moment to reorder. */
export function needsRestock(item: InventoryItem): boolean {
  return totalUnits(item) <= item.min_threshold;
}

/**
 * Due when never checked, or when the check's calendar day plus the cadence
 * has arrived. Compared by day, not by the hour: an item checked at 5pm on a
 * 3-day cadence is due on the morning of the third day, not at 5pm — staff
 * work through the list in one sitting, not item by item around the clock.
 */
export function isAuditDue(item: InventoryItem, now: Date = new Date()): boolean {
  if (!item.last_audited_at) return true;
  const dueOn = addDays(startOfDay(new Date(item.last_audited_at)), item.audit_frequency_days);
  return dueOn <= startOfDay(now);
}

/**
 * The staff checklist: stock items due for a count, dog supplies first (see
 * STOCK_CATEGORIES), then by name. Shared by the checklist and the due-count
 * badge on the staff view's "Cek Stok" pill, so the two can never disagree.
 */
export function dueStockItems(
  items: InventoryItem[],
  now: Date = new Date()
): (InventoryItem & { category: StockCategory })[] {
  return items
    .filter(isStockItem)
    .filter((item) => isAuditDue(item, now))
    .sort(
      (a, b) =>
        STOCK_CATEGORIES.indexOf(a.category) - STOCK_CATEGORIES.indexOf(b.category) ||
        stockItemName(a).localeCompare(stockItemName(b))
    );
}

/**
 * The staff low-stock report still speaks ItemType, so picking a stock item
 * there has to land on the nearest one rather than an unknown value.
 */
export function alertTypeForItem(item: InventoryItem): ItemType {
  if (!isStockItem(item)) return item.category as ItemType;
  if (item.category !== "dog_supplies") return "other";
  if (/pee ?pad/i.test(item.name)) return "pee_pad";
  if (/food/i.test(item.name)) return "food";
  return "other";
}

/**
 * How much to buy to clear the Restock flag. The flag is "total <= threshold",
 * so the target is one past the threshold — buying only up to it would bring
 * the groceries home and leave the item still red.
 */
export function unitsNeeded(item: InventoryItem): number {
  return Math.max(1, Math.floor(item.min_threshold - totalUnits(item)) + 1);
}

/**
 * The owner's WhatsApp-ready shopping list: every stock item at or below its
 * threshold, grouped by shelf. Asterisks are WhatsApp bold. Null when nothing
 * needs buying, so the caller can say so instead of copying an empty list.
 */
export function buildShoppingList(items: InventoryItem[]): string | null {
  const sections = STOCK_CATEGORIES.flatMap((category) => {
    const lines = items
      .filter(isStockItem)
      .filter((item) => item.category === category && needsRestock(item))
      .sort((a, b) => stockItemName(a).localeCompare(stockItemName(b)))
      .map((item) => `- ${stockItemName(item)} (Needs: ${unitsNeeded(item)} ${item.unit_type})`);
    return lines.length > 0 ? [`*${STOCK_CATEGORY_LABELS_EN[category]}:*\n${lines.join("\n")}`] : [];
  });
  if (sections.length === 0) return null;
  return `*🛒 MIAMUS SHOPPING LIST*\n\n${sections.join("\n\n")}`;
}
