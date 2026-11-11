import { differenceInCalendarDays } from "date-fns";
import type { InventoryItem, InventoryUnit, StockStatus } from "@/types/database";

/**
 * Kitchen amounts (Phase 170 PR A, docs/phase-170-kitchen-plan.md D1–D4,
 * D14; migrations/148).
 *
 * An owner opts an item in ("Track amount"); its `quantity` is then the
 * amount left, in `unit`, and moves only with work that already happens:
 * buying adds, a glance in the cupboard is minus, plus or Set amount.
 * Never a scheduled count, never a reminder to count (D2). Everything else
 * stays Enough · Running low · Out.
 *
 * The database derives a tracked item's status (148's amount rules
 * trigger); deriveStatus() mirrors it so the screen can update at once.
 */

/** The unit groups (D4). Only units in the same group convert, and only exactly. */
export type UnitGroup = "weight" | "volume" | "pieces" | "kitchen" | "packs";

export const UNIT_GROUPS: Record<UnitGroup, InventoryUnit[]> = {
  weight: ["g", "kg"],
  volume: ["ml", "L"],
  // A piece is a piece: pcs, buah and butir are 1 : 1 with each other.
  pieces: ["pcs", "buah", "butir"],
  // Kitchen counts: only with the same unit.
  kitchen: ["ikat", "siung", "lembar", "batang", "bungkus", "sachet"],
  packs: ["pack", "box", "bottle", "roll", "tube"],
};

/** Every stock unit, in picker order. Mirrors inventory_items_unit_check (148). */
export const STOCK_UNITS: InventoryUnit[] = [
  ...UNIT_GROUPS.weight,
  ...UNIT_GROUPS.volume,
  ...UNIT_GROUPS.pieces,
  ...UNIT_GROUPS.kitchen,
  ...UNIT_GROUPS.packs,
];

export function isStockUnit(value: unknown): value is InventoryUnit {
  return typeof value === "string" && (STOCK_UNITS as string[]).includes(value);
}

export function unitGroup(unit: InventoryUnit): UnitGroup {
  for (const group of Object.keys(UNIT_GROUPS) as UnitGroup[]) {
    if (UNIT_GROUPS[group].includes(unit)) return group;
  }
  return "packs";
}

/**
 * How each unit reads. The kitchen words are the same in both languages
 * (glossary: "the words Indonesian kitchens use, kept in English too");
 * the English picker adds UNIT_HINTS_EN as a small second line. "pcs" stays
 * "pcs" in Indonesian, as every shop and receipt writes it.
 */
export const UNIT_LABELS: Record<"en" | "id", Record<InventoryUnit, string>> = {
  en: {
    g: "g", kg: "kg", ml: "ml", L: "L",
    pcs: "pcs", buah: "buah", butir: "butir",
    ikat: "ikat", siung: "siung", lembar: "lembar", batang: "batang", bungkus: "bungkus", sachet: "sachet",
    pack: "pack", box: "box", bottle: "bottle", roll: "roll", tube: "tube",
  },
  id: {
    g: "g", kg: "kg", ml: "ml", L: "L",
    pcs: "pcs", buah: "buah", butir: "butir",
    ikat: "ikat", siung: "siung", lembar: "lembar", batang: "batang", bungkus: "bungkus", sachet: "sachet",
    pack: "pak", box: "kotak", bottle: "botol", roll: "rol", tube: "tube",
  },
};

/** The English picker's second line under an Indonesian kitchen word. */
export const UNIT_HINTS_EN: Partial<Record<InventoryUnit, string>> = {
  buah: "piece",
  butir: "egg",
  ikat: "bunch",
  siung: "clove",
  lembar: "leaf",
  batang: "stalk",
  bungkus: "packet",
  sachet: "sachet",
};

export function unitLabel(unit: InventoryUnit, lang: "en" | "id"): string {
  return UNIT_LABELS[lang][unit] ?? unit;
}

/** Exact factors to the group's base unit (g, ml, piece). */
const TO_BASE: Partial<Record<InventoryUnit, number>> = {
  g: 1, kg: 1000, ml: 1, L: 1000, pcs: 1, buah: 1, butir: 1,
};

/** Rounds away float noise (0.1 + 0.2), never a real decimal. */
export function clean(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * The same amount in another unit, or null when the two don't convert
 * exactly (D4: g ↔ kg, ml ↔ L, pieces 1 : 1; no "1 egg ≈ 60 g").
 */
export function convertAmount(value: number, from: InventoryUnit, to: InventoryUnit): number | null {
  if (from === to) return value;
  if (unitGroup(from) !== unitGroup(to)) return null;
  const a = TO_BASE[from];
  const b = TO_BASE[to];
  if (a === undefined || b === undefined) return null;
  return clean((value * a) / b);
}

/** One tap of minus or plus: 100 for g and ml, 0.5 for kg and L, 1 for whole units (plan). */
export function amountStep(unit: InventoryUnit): number {
  if (unit === "g" || unit === "ml") return 100;
  if (unit === "kg" || unit === "L") return 0.5;
  return 1;
}

/** The largest amount the database takes in one purchase (record_purchase, 148). */
export const MAX_AMOUNT = 100_000;

/**
 * "1,5" or "1.5" → 1.5; null for anything that isn't a number ≥ 0.
 * People type the decimal mark their keyboard gives them.
 */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim().replace(/\s/g, "");
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) && value <= MAX_AMOUNT ? value : null;
}

/** "1,2 kg" / "1.2 kg", "8 butir". Decimals with a comma in Indonesian. */
export function formatAmount(value: number, unit: InventoryUnit, lang: "en" | "id"): string {
  const number = new Intl.NumberFormat(lang === "id" ? "id-ID" : "en-US", { maximumFractionDigits: 2 }).format(
    clean(value)
  );
  return `${number} ${unitLabel(unit, lang)}`;
}

/** The number alone, for an input's starting value: "1,5" in Indonesian. */
export function amountInputValue(value: number, lang: "en" | "id"): string {
  const text = String(clean(value));
  return lang === "id" ? text.replace(".", ",") : text;
}

/**
 * A tracked item's status from its amount (mirrors 148's trigger): nothing
 * left → out; at or below "Running low at" (when set) → running low; else enough.
 */
export function deriveStatus(quantity: number, lowAt: number): StockStatus {
  if (quantity <= 0) return "out";
  if (lowAt > 0 && quantity <= lowAt) return "low";
  return "ok";
}

/** An amount untouched this long reads "about … · 3 weeks ago", in grey, never red (D2). */
export const STALE_AFTER_DAYS = 14;

export function isTracked(item: Pick<InventoryItem, "track_amount">): boolean {
  return item.track_amount === true;
}

export function isStaleAmount(setAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!setAt) return false;
  return differenceInCalendarDays(now, new Date(setAt)) >= STALE_AFTER_DAYS;
}

/** "3 weeks ago" / "3 minggu lalu"; weeks up to two months, then months. */
export function agoLabel(setAt: string, lang: "en" | "id", now: Date = new Date()): string {
  const days = Math.max(0, differenceInCalendarDays(now, new Date(setAt)));
  const id = lang === "id";
  if (days < 7) {
    if (days === 0) return id ? "hari ini" : "today";
    return id ? `${days} hari lalu` : days === 1 ? "1 day ago" : `${days} days ago`;
  }
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    return id ? `${weeks} minggu lalu` : weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  }
  const months = Math.floor(days / 30);
  return id ? `${months} bulan lalu` : `${months} months ago`;
}

/**
 * The amount line for a tracked item: "1,2 kg left" / "Sisa 1,2 kg", or,
 * when untouched for 14 days, "about 1,2 kg · 3 weeks ago" / "sekitar
 * 1,2 kg · 3 minggu lalu". `stale` says which, for the grey.
 */
export function amountLine(
  item: Pick<InventoryItem, "quantity" | "unit" | "amount_set_at">,
  lang: "en" | "id",
  now: Date = new Date()
): { text: string; stale: boolean } {
  const amount = formatAmount(item.quantity, item.unit, lang);
  if (item.amount_set_at && isStaleAmount(item.amount_set_at, now)) {
    const ago = agoLabel(item.amount_set_at, lang, now);
    return { text: lang === "id" ? `sekitar ${amount} · ${ago}` : `about ${amount} · ${ago}`, stale: true };
  }
  return { text: lang === "id" ? `Sisa ${amount}` : `${amount} left`, stale: false };
}

/**
 * D14: a Phase 110 count is never used silently. Shown only as a hint when
 * an owner switches tracking on for an item that was never tracked: "Old
 * count: 2 kg on 3 Oct, not used". Null when there's nothing to show.
 */
export function oldCountHint(
  item: Pick<InventoryItem, "quantity" | "unit" | "track_amount" | "amount_set_at" | "last_audited_at">,
  lang: "en" | "id",
  countedAt?: string | null
): string | null {
  if (item.track_amount || item.amount_set_at) return null;
  if (!(item.quantity > 0)) return null;
  const amount = formatAmount(item.quantity, item.unit, lang);
  const when = countedAt ?? item.last_audited_at;
  const day = when
    ? new Date(when).toLocaleDateString(lang === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "short" })
    : null;
  if (lang === "id") return day ? `Hitungan lama: ${amount} pada ${day}, tidak dipakai` : `Hitungan lama: ${amount}, tidak dipakai`;
  return day ? `Old count: ${amount} on ${day}, not used` : `Old count: ${amount}, not used`;
}

/**
 * What tracking starts from when an owner switches it on: the last tracked
 * amount if the item was tracked before (a number someone chose), never a
 * Phase 110 count (D14). Null = the owner types it.
 */
export function startingAmount(item: Pick<InventoryItem, "quantity" | "amount_set_at">): number | null {
  return item.amount_set_at ? item.quantity : null;
}

/**
 * What 148's amount rules trigger does to a write, for the demo data and for
 * screens that update before the server answers. `before` is null for a new
 * item. The server's answer always replaces this.
 *
 *   - amount_set_at is the server's: a client's value is ignored; stamped
 *     when a tracked amount changes or tracking turns on;
 *   - a tracked item's status follows its amount whenever the amount, the
 *     low level or tracking changed (and is then credited to whoever changed
 *     the amount);
 *   - otherwise a tap on Out empties a tracked item, and a tap on Running
 *     low stays until the amount next changes;
 *   - (153) a status back to Enough clears to_buy_amount, and an item with a
 *     shortfall stays Running low while its amount moves above the low level.
 */
export function applyAmountRules(before: InventoryItem | null, after: InventoryItem, now: Date = new Date()): InventoryItem {
  const next: InventoryItem = { ...after, amount_set_at: before?.amount_set_at ?? null };
  const stamp = now.toISOString();
  // (153) A unit change converts the shortfall, or clears it, unless this write set it.
  if (before && next.unit !== before.unit && next.to_buy_amount != null && next.to_buy_amount === before.to_buy_amount) {
    next.to_buy_amount = lastBoughtInUnit(next.to_buy_amount, before.unit, next.unit);
  }
  const tracked = next.track_amount === true;
  const amountChanged = before === null || next.quantity !== before.quantity;
  const trackingOn = tracked && (before === null || before.track_amount !== true);
  const statusBefore = before ? (before.stock_status ?? "ok") : null;

  if (tracked) {
    if (amountChanged || trackingOn) next.amount_set_at = stamp;
    if (amountChanged || trackingOn || next.min_threshold !== before?.min_threshold) {
      let derived = deriveStatus(next.quantity, next.min_threshold);
      // A shortfall from the menu review stays on the list until bought (migrations/153).
      if (derived === "ok" && next.to_buy_amount != null && (statusBefore === "low" || statusBefore === "out")) {
        derived = "low";
      }
      if (derived !== statusBefore) {
        const credited = amountChanged || trackingOn || next.amount_set_by !== before?.amount_set_by;
        next.stock_status_by = credited ? (next.amount_set_by ?? null) : null;
      }
      next.stock_status = derived;
    } else if (next.stock_status === "out" && statusBefore !== "out") {
      next.quantity = 0;
      next.amount_set_at = stamp;
    }
  }
  // Back to Enough clears the shortfall (bought, or someone tapped Enough; migrations/153).
  if ((next.stock_status ?? "ok") === "ok" && next.to_buy_amount != null) next.to_buy_amount = null;
  if (before === null || (next.stock_status ?? "ok") !== statusBefore) next.stock_status_at = stamp;
  return next;
}

/** D6: the shelves that browse under Food → Ingredients (fresh food, pantry). */
export function isIngredient(item: Pick<InventoryItem, "category">): boolean {
  return item.category === "fresh_food" || item.category === "pantry";
}

/**
 * What a Bought's Undo writes back once the amount is taken off again
 * (Codex, PR #93). Built from the item as it stands now, so another
 * phone's change in the meantime survives:
 *
 *   - the status goes back only if it is still what the purchase left
 *     (Enough), never over another phone's later tap, and never Out on a
 *     tracked item that still has some left: on a tracked item Out empties
 *     it (148), which would erase another phone's purchase;
 *   - the pre-fill goes back only if it is still this purchase's amount
 *     (another phone's later purchase keeps its own);
 *   - the menu's shortfall (to_buy_amount, Phase 170 PR C) goes back if the
 *     purchase cleared it and nobody set a new one since, and only while the
 *     item is back on the list (an Enough item can't hold one); converted if
 *     an owner changed the unit meanwhile, dropped if the units no longer
 *     convert (Codex, PR #101);
 *   - null = nothing to write.
 */
export function undoPurchasePatch(
  before: Pick<InventoryItem, "stock_status" | "last_bought_amount" | "track_amount"> &
    Partial<Pick<InventoryItem, "to_buy_amount" | "unit">>,
  now: Pick<InventoryItem, "quantity" | "stock_status" | "last_bought_amount"> &
    Partial<Pick<InventoryItem, "to_buy_amount" | "unit">>,
  amount: number | null
): { stock_status?: StockStatus; last_bought_amount?: number | null; to_buy_amount?: number } | null {
  const patch: { stock_status?: StockStatus; last_bought_amount?: number | null; to_buy_amount?: number } = {};
  const target = before.stock_status ?? "ok";
  const current = now.stock_status ?? "ok";
  const tookAmountBack = before.track_amount === true && amount !== null;
  // Untracked, or no amount: the purchase left Enough. Anything else now is
  // another phone's change since, and stays (code review).
  // With an amount taken back: the status already follows the amount again;
  // only a Running low tap (made above the low level) needs putting back.
  const restore = tookAmountBack ? target === "low" && current === "ok" : current === "ok";
  const erases = before.track_amount === true && target === "out" && now.quantity > 0;
  if (restore && !erases && target !== current) patch.stock_status = target;
  const ours = before.track_amount === true && amount !== null && now.last_bought_amount === amount;
  if (ours && (before.last_bought_amount ?? null) !== amount) patch.last_bought_amount = before.last_bought_amount ?? null;
  const listed = (patch.stock_status ?? current) !== "ok";
  if (before.to_buy_amount != null && now.to_buy_amount == null && listed) {
    const from = before.unit;
    const to = now.unit ?? from;
    const back = from && to ? lastBoughtInUnit(before.to_buy_amount, from, to) : before.to_buy_amount;
    if (back !== null) patch.to_buy_amount = back;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * The "How much did you buy?" pre-fill when an owner changes a tracked
 * item's unit (Codex, PR #93): converted exactly (5 kg → 5000 g), or
 * dropped when the units don't convert or the result falls outside what a
 * purchase may be (0 < x ≤ 100,000), rather than read in the wrong unit.
 */
export function lastBoughtInUnit(
  amount: number | null | undefined,
  from: InventoryUnit,
  to: InventoryUnit
): number | null {
  if (amount === null || amount === undefined) return null;
  const converted = convertAmount(amount, from, to);
  return converted !== null && converted > 0 && converted <= MAX_AMOUNT ? converted : null;
}

/** "500 g" for 0.5 kg, "250 ml" for 0.25 L; otherwise the item's own unit. */
export function friendlyAmount(value: number, unit: InventoryUnit, lang: "en" | "id"): string {
  if (unit === "kg" && value < 1) return formatAmount(clean(value * 1000), "g", lang);
  if (unit === "L" && value < 1) return formatAmount(clean(value * 1000), "ml", lang);
  return formatAmount(value, unit, lang);
}

/** On To buy and in the WhatsApp text: "500 g", or null without a shortfall. */
export function toBuyAmountLabel(item: Pick<InventoryItem, "to_buy_amount" | "unit">, lang: "en" | "id"): string | null {
  return item.to_buy_amount ? friendlyAmount(item.to_buy_amount, item.unit, lang) : null;
}

/**
 * What a unit change also writes (Codex, PR #93 and PR #101): the "How much
 * did you buy?" pre-fill and the menu's shortfall, each converted exactly
 * (5 kg → 5000 g) or dropped when the units don't convert, never read in
 * the wrong unit. Empty when the unit stays.
 */
export function unitChangePatch(
  item: Pick<InventoryItem, "unit" | "last_bought_amount" | "to_buy_amount">,
  unit: InventoryUnit
): { last_bought_amount?: number | null; to_buy_amount?: number | null } {
  if (item.unit === unit) return {};
  return {
    last_bought_amount: lastBoughtInUnit(item.last_bought_amount, item.unit, unit),
    ...(item.to_buy_amount != null ? { to_buy_amount: lastBoughtInUnit(item.to_buy_amount, item.unit, unit) } : {}),
  };
}
