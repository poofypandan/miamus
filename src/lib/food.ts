import type { FoodItem, FoodOutcome, FoodPlace, FoodSource } from "@/types/database";

/**
 * Food at home (Phase 156, migrations/123): how the list is grouped and the
 * words it uses, in both languages. Pure, so it is unit-tested
 * (tests/unit/food.test.ts). Dates are the phone's calendar days
 * (YYYY-MM-DD), like the rest of the app (formatDateLocal).
 */

export type FoodLocale = "en" | "id";

export const FOOD_PLACES: readonly FoodPlace[] = ["fridge", "freezer", "pantry", "counter"];

export const FOOD_PLACE_LABELS: Record<FoodLocale, Record<FoodPlace, string>> = {
  en: { fridge: "Fridge", freezer: "Freezer", pantry: "Cupboard", counter: "Counter" },
  id: { fridge: "Kulkas", freezer: "Freezer", pantry: "Lemari", counter: "Meja" },
};

export const FOOD_OUTCOMES: readonly FoodOutcome[] = ["eaten", "given_away", "thrown_away"];

export const FOOD_OUTCOME_LABELS: Record<FoodLocale, Record<FoodOutcome, string>> = {
  en: { eaten: "Eaten", given_away: "Given away", thrown_away: "Thrown away" },
  id: { eaten: "Dimakan", given_away: "Diberikan", thrown_away: "Dibuang" },
};

export const FOOD_SOURCES: readonly FoodSource[] = ["home", "gift", "bought"];

/** The add sheet's "Where is it from?" choices. "Cooked at home" is leftovers. */
export const FOOD_SOURCE_LABELS: Record<FoodLocale, Record<FoodSource, string>> = {
  en: { home: "Cooked at home", gift: "From someone", bought: "Bought" },
  id: { home: "Dimasak di rumah", gift: "Dari orang", bought: "Dibeli" },
};

/** How long Finished — Undo stays up; the photo goes when it closes. */
export const FOOD_UNDO_TOAST_MS = 6000;

/** What to call a food: its name, or — logged with just a photo — "Food". */
export function foodName(item: Pick<FoodItem, "name">, locale: FoodLocale): string {
  return item.name?.trim() || (locale === "id" ? "Makanan" : "Food");
}

/** The short word in a row: "home-cooked", "from Tante Rina", "bought". */
export function sourceLabel(item: Pick<FoodItem, "source" | "from_whom">, locale: FoodLocale): string | null {
  const id = locale === "id";
  const who = item.from_whom?.trim();
  if (who) return id ? `dari ${who}` : `from ${who}`;
  if (item.source === "home") return id ? "masakan rumah" : "home-cooked";
  if (item.source === "bought") return id ? "dibeli" : "bought";
  return null;
}

/** "Don't know" for the date, and none set since: an owner should look. */
export function needsDate(item: Pick<FoodItem, "outcome" | "expires_on" | "expiry_unknown">): boolean {
  return item.outcome === null && !item.expires_on && item.expiry_unknown;
}

export function countNeedsDate(items: FoodItem[]): number {
  return items.filter(needsDate).length;
}

export function needsDateLabel(count: number, locale: FoodLocale): string {
  return locale === "id"
    ? `${count} makanan perlu dicek tanggalnya`
    : `${count} food${count === 1 ? " needs" : "s need"} a date`;
}

/** Field limits, matching migrations/123's checks. */
export const FOOD_LIMITS = { name: 80, fromWhom: 60, notes: 200 } as const;

export type FoodGroup = "today" | "week" | "later";

export const FOOD_GROUP_LABELS: Record<FoodLocale, Record<FoodGroup, string>> = {
  en: { today: "Eat today", week: "This week", later: "Later" },
  id: { today: "Makan hari ini", week: "Minggu ini", later: "Nanti" },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** `date` plus `days`, as YYYY-MM-DD. */
export function addDaysTo(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `today` to the expiry: 0 today, negative once past. Null: no date. */
export function daysLeft(item: Pick<FoodItem, "expires_on">, today: string): number | null {
  if (!item.expires_on) return null;
  return dayNumber(item.expires_on) - dayNumber(today);
}

export function isListed(item: Pick<FoodItem, "outcome">): boolean {
  return item.outcome === null;
}

/** Finished food whose container still has to go back. */
export function containerToReturn(
  item: Pick<FoodItem, "outcome" | "return_container" | "container_returned_at">
): boolean {
  return item.outcome !== null && item.return_container && !item.container_returned_at;
}

/** Past its date, or expiring today: the group at the top. */
export function foodGroup(item: Pick<FoodItem, "expires_on" | "expiry_unknown">, today: string): FoodGroup {
  // Nobody knows the date: on top, where someone will look at it.
  if (!item.expires_on && item.expiry_unknown) return "today";
  const days = daysLeft(item, today);
  if (days === null) return "later";
  if (days <= 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

/** The Today line (Phase 156): listed food past its date, or expiring today or tomorrow. */
export function isEatSoon(item: Pick<FoodItem, "outcome" | "expires_on">, today: string): boolean {
  if (!isListed(item)) return false;
  const days = daysLeft(item, today);
  return days !== null && days <= 1;
}

export function countEatSoon(items: FoodItem[], today: string): number {
  return items.filter((item) => isEatSoon(item, today)).length;
}

/** Soonest first; no date last; then by name. */
export function compareFood(a: FoodItem, b: FoodItem): number {
  if (a.expires_on !== b.expires_on) {
    if (!a.expires_on) return 1;
    if (!b.expires_on) return -1;
    return a.expires_on < b.expires_on ? -1 : 1;
  }
  return (a.name ?? "").localeCompare(b.name ?? "");
}

/** The listed food in its three groups, each sorted soonest first. */
export function groupFood(items: FoodItem[], today: string): Record<FoodGroup, FoodItem[]> {
  const groups: Record<FoodGroup, FoodItem[]> = { today: [], week: [], later: [] };
  for (const item of items) {
    if (isListed(item)) groups[foodGroup(item, today)].push(item);
  }
  for (const group of Object.values(groups)) group.sort(compareFood);
  return groups;
}

/** The words beside a food: "Tomorrow", "4 days", "2 days past date — check first". */
export function expiryLabel(days: number | null, locale: FoodLocale, unknown = false): string {
  const id = locale === "id";
  if (days === null && unknown) return id ? "Cek tanggalnya" : "Check the date";
  if (days === null) return id ? "Tanpa tanggal" : "No date";
  if (days < 0) {
    const n = -days;
    return id ? `Lewat ${n} hari — cek dulu` : `${n} day${n === 1 ? "" : "s"} past date — check first`;
  }
  if (days === 0) return id ? "Hari ini" : "Today";
  if (days === 1) return id ? "Besok" : "Tomorrow";
  return id ? `${days} hari` : `${days} days`;
}

/** The one-tap expiry choices on the add sheet, in days from today. */
export const EXPIRY_CHOICES: readonly { days: number; label: Record<FoodLocale, string> }[] = [
  { days: 0, label: { en: "Today", id: "Hari ini" } },
  { days: 1, label: { en: "Tomorrow", id: "Besok" } },
  { days: 3, label: { en: "3 days", id: "3 hari" } },
  { days: 7, label: { en: "1 week", id: "1 minggu" } },
];

export function containerLabel(fromWhom: string | null, locale: FoodLocale): string {
  const who = fromWhom?.trim();
  if (locale === "id") return who ? `Kembalikan wadah ke ${who}` : "Kembalikan wadahnya";
  return who ? `Return container to ${who}` : "Return the container";
}

export function eatSoonLabel(count: number, locale: FoodLocale): string {
  return locale === "id"
    ? `${count} makanan perlu segera dimakan`
    : `${count} food${count === 1 ? "" : "s"} to eat soon`;
}

/** "3 portions" / "3 porsi" (Phase 170 PR A, D7). */
export function portionsLabel(portions: number, locale: FoodLocale): string {
  if (locale === "id") return `${portions} porsi`;
  return portions === 1 ? "1 portion" : `${portions} portions`;
}

/** Portions a person can set on a food: none, or 1 to 99 (migrations/148). */
export const MAX_PORTIONS = 99;
