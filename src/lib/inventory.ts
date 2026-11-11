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
import { ITEM_TYPE_LABELS } from "@/lib/item-types";
import { STOCK_UNITS, UNIT_LABELS, amountStep, toBuyAmountLabel, unitLabel } from "@/lib/kitchen-units";
import type {
  InventoryAlert,
  StockStatus,
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

/** Every stock unit (Phase 170 PR A adds the kitchen words); lib/kitchen-units holds the rules. */
export const INVENTORY_UNITS: InventoryUnit[] = STOCK_UNITS;
export { UNIT_LABELS, unitLabel };

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

/** The item's place on the shopping list; a row from an older build reads as enough. */
export function stockStatus(item: InventoryItem): StockStatus {
  return item.stock_status ?? "ok";
}

export const STOCK_STATUSES: StockStatus[] = ["ok", "low", "out"];

/** Plain words in each language (Phase 154; glossary). */
export const STOCK_STATUS_LABELS: Record<"en" | "id", Record<StockStatus, string>> = {
  en: { ok: "Enough", low: "Running low", out: "Out" },
  id: { ok: "Masih ada", low: "Hampir habis", out: "Habis" },
};

/**
 * On the shopping list: someone said it is running low or out (Phase 154).
 * Replaced the count-against-a-minimum rule, whose counts went stale.
 */
export function isLowStock(item: InventoryItem): boolean {
  return stockStatus(item) !== "ok";
}

/** Nothing left at all — the stronger of the two. */
export function isOutOfStock(item: InventoryItem): boolean {
  return stockStatus(item) === "out";
}

/** How far one tap of minus or plus moves an amount (lib/kitchen-units). */
export function stepFor(unit: InventoryUnit): number {
  return amountStep(unit);
}

/**
 * 2, 2.5, 0.25 — never 2.50000001 from float arithmetic. In Bahasa Indonesia
 * the decimal mark is a comma: 2,5 (Phase 149).
 */
export function formatQuantity(value: number, lang: "en" | "id" = "en"): string {
  return new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", { maximumFractionDigits: 2 }).format(value);
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
 * What a staff note ("something else we need") is about: "Mochi's Food",
 * or "Food (Home)" for a household one. In the given language.
 */
export function alertSubject(alert: InventoryAlert, petName: string | null, lang: "en" | "id"): string {
  // Something written down as it is ("Kantong sampah", "Eggs"): the words
  // are the thing to buy (Phase 154's quick add, and the staff's "Lainnya").
  if (alert.item_type === "other" && !petName && alert.note) return alert.note;
  const label = ITEM_TYPE_LABELS[lang][alert.item_type];
  if (petName) return lang === "id" ? `${label} ${petName}` : `${petName}'s ${label}`;
  return lang === "id" ? `${label} (Rumah)` : `${label} (Home)`;
}

/**
 * The WhatsApp-ready shopping list (Phase 154): every item running low or
 * out, grouped Pets / Home, then the staff's other notes. Asterisks are
 * WhatsApp bold. Null when there is nothing to buy. In the owner's language;
 * it is usually sent to whoever does the shopping.
 */
export function buildShoppingList(
  items: InventoryItem[],
  notes: { alert: InventoryAlert; petName: string | null }[],
  lang: "en" | "id" = "en"
): string | null {
  const id = lang === "id";
  const scopes = id ? SCOPE_LABELS_ID : SCOPE_LABELS_EN;
  const status = STOCK_STATUS_LABELS[lang];
  const sections = INVENTORY_SCOPES.flatMap((scope) => {
    const lines = items
      .filter((item) => item.scope === scope && isLowStock(item))
      .sort(compareForList)
      // The menu's shortfall when there is one (Phase 170 PR C): "- Ayam 500 g".
      .map((item) => {
        const buy = toBuyAmountLabel(item, lang);
        return buy ? `- ${stockItemName(item)} ${buy}` : `- ${stockItemName(item)} (${status[stockStatus(item)].toLowerCase()})`;
      });
    return lines.length > 0 ? [`*${scopes[scope]}*\n${lines.join("\n")}`] : [];
  });
  const noteLines = notes.map(({ alert, petName }) => {
    const subject = alertSubject(alert, petName, lang);
    return `- ${subject}${alert.note && alert.note !== subject ? `: ${alert.note}` : ""}`;
  });
  if (noteLines.length > 0) sections.push(`*${id ? "Lainnya" : "Also"}*\n${noteLines.join("\n")}`);
  if (sections.length === 0) return null;
  return `*${id ? "Daftar belanja" : "Shopping list"}*\n\n${sections.join("\n\n")}`;
}
