import { addDays, startOfDay } from "date-fns";
import {
  Apple,
  Bone,
  Dog,
  Pill,
  SprayCan,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type {
  InventoryCategory,
  InventoryItem,
  InventoryScope,
  InventoryUnit,
  ItemType,
} from "@/types/database";

/**
 * The threshold inventory engine (Phase 110, migrations/099).
 *
 * One number per item — `quantity`, in a named unit — and one rule: at or
 * below `min_threshold`, it is low. The Phase 83 box/loose ledger this
 * replaces asked for two counts and a pack size to answer "how many are
 * there?", which nobody standing at a shelf wants to work out.
 */

export const INVENTORY_SCOPES: InventoryScope[] = ["pet", "home"];

/**
 * Each scope's shelves, in the order lists walk them. Named for where things
 * are kept, the way the household already thinks about them (Phase 110.1) —
 * the Phase 83 shelves, with dog food split out of dog supplies because
 * running out of a renal diet is a vet problem and running out of pee pads
 * is not.
 */
export const SCOPE_CATEGORIES: Record<InventoryScope, InventoryCategory[]> = {
  pet: ["dog_food", "dog_supplies", "medicine"],
  home: ["fresh_food", "pantry", "household_supplies"],
};

export const INVENTORY_UNITS: InventoryUnit[] = [
  "pcs",
  "pack",
  "box",
  "bottle",
  "roll",
  "tube",
  "kg",
  "g",
  "L",
  "ml",
];

// Owner-facing, so English per the Phase 46 language boundary.
export const SCOPE_LABELS_EN: Record<InventoryScope, string> = { pet: "Pets", home: "Home" };
// Staff-facing, so Bahasa Indonesia.
export const SCOPE_LABELS_ID: Record<InventoryScope, string> = { pet: "Hewan", home: "Rumah" };

export const CATEGORY_LABELS_EN: Record<InventoryCategory, string> = {
  dog_food: "Dog Food",
  dog_supplies: "Dog Supplies",
  medicine: "Medicine",
  fresh_food: "Fresh Food",
  pantry: "Pantry",
  household_supplies: "Household Supplies",
};

// The Indonesian names the Phase 83 shelves already had, so staff see the
// words they are used to.
export const CATEGORY_LABELS_ID: Record<InventoryCategory, string> = {
  dog_food: "Makanan Anjing",
  dog_supplies: "Perlengkapan Anjing",
  medicine: "Obat",
  fresh_food: "Makanan Segar",
  pantry: "Bahan Pokok",
  household_supplies: "Perlengkapan Rumah",
};

export const CATEGORY_ICONS: Record<InventoryCategory, LucideIcon> = {
  dog_food: Bone,
  dog_supplies: Dog,
  medicine: Pill,
  fresh_food: Apple,
  pantry: Wheat,
  household_supplies: SprayCan,
};

export function categoryScope(category: InventoryCategory): InventoryScope {
  return (SCOPE_CATEGORIES.pet as InventoryCategory[]).includes(category) ? "pet" : "home";
}

/** "Millo Zz Food (Beef)" — the variant is what tells three rows apart. */
export function stockItemName(item: InventoryItem): string {
  return item.variant ? `${item.name} (${item.variant})` : item.name;
}

/**
 * At or below the minimum. The minimum is the point to buy at: an owner who
 * says "keep at least 2" means two left is time to restock, not one.
 */
export function isLowStock(item: InventoryItem): boolean {
  return item.quantity <= item.min_threshold;
}

/** Nothing left at all — the stronger of the two warnings. */
export function isOutOfStock(item: InventoryItem): boolean {
  return item.quantity <= 0;
}

/**
 * How far one tap of the stepper moves the count. A unit of one for anything
 * counted whole or by the kilo/litre; a hundred for grams and millilitres,
 * where a tap of one would be a hundred taps per cup.
 */
export function stepFor(unit: InventoryUnit): number {
  return unit === "g" || unit === "ml" ? 100 : 1;
}

/** 2, 2.5, 0.25 — never 2.50000001 from float arithmetic. */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

/**
 * List order within a scope: low items first (they are the reason anyone
 * opens this screen), out-of-stock ahead of merely low, then shelf order,
 * then name.
 */
export function compareForList(a: InventoryItem, b: InventoryItem): number {
  const urgency = (item: InventoryItem) => (isOutOfStock(item) ? 2 : isLowStock(item) ? 1 : 0);
  return (
    urgency(b) - urgency(a) ||
    SCOPE_CATEGORIES[a.scope].indexOf(a.category) - SCOPE_CATEGORIES[b.scope].indexOf(b.category) ||
    stockItemName(a).localeCompare(stockItemName(b))
  );
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
 * The staff checklist: items due for a count, pets first, then by shelf and
 * name. Shared by the checklist and the due-count badge on the staff view's
 * "Stok" pill, so the two can never disagree.
 */
export function dueStockItems(items: InventoryItem[], now: Date = new Date()): InventoryItem[] {
  return items
    .filter((item) => isAuditDue(item, now))
    .sort(
      (a, b) =>
        INVENTORY_SCOPES.indexOf(a.scope) - INVENTORY_SCOPES.indexOf(b.scope) ||
        SCOPE_CATEGORIES[a.scope].indexOf(a.category) -
          SCOPE_CATEGORIES[b.scope].indexOf(b.category) ||
        stockItemName(a).localeCompare(stockItemName(b))
    );
}

/**
 * The staff low-stock report still speaks ItemType, so picking an item there
 * has to land on the nearest one rather than an unknown value.
 */
export function alertTypeForItem(item: InventoryItem): ItemType {
  switch (item.category) {
    case "dog_food":
      return "food";
    case "medicine":
      return "medicine";
    case "dog_supplies":
      if (/pee ?pad/i.test(item.name)) return "pee_pad";
      if (/shampoo/i.test(item.name)) return "shampoo";
      return "other";
    default:
      return "other";
  }
}

/**
 * The owner's WhatsApp-ready shopping list: every low item, grouped by scope
 * and shelf, with what is left against the minimum. Asterisks are WhatsApp
 * bold. Null when nothing is low, so the caller can say so instead of
 * copying an empty list.
 */
export function buildShoppingList(items: InventoryItem[]): string | null {
  const sections = INVENTORY_SCOPES.flatMap((scope) =>
    SCOPE_CATEGORIES[scope].flatMap((category) => {
      const lines = items
        .filter((item) => item.scope === scope && item.category === category && isLowStock(item))
        .sort((a, b) => stockItemName(a).localeCompare(stockItemName(b)))
        .map(
          (item) =>
            `- ${stockItemName(item)} (${formatQuantity(item.quantity)} ${item.unit} left, min ${formatQuantity(item.min_threshold)})`
        );
      return lines.length > 0
        ? [`*${SCOPE_LABELS_EN[scope]} · ${CATEGORY_LABELS_EN[category]}:*\n${lines.join("\n")}`]
        : [];
    })
  );
  if (sections.length === 0) return null;
  return `*🛒 MIAMUS SHOPPING LIST*\n\n${sections.join("\n\n")}`;
}
