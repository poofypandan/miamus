import type { OwnerLocale } from "@/lib/owner-locale";
import { repeatLabel } from "@/lib/chore-recurrence";
import { isSetUp } from "@/lib/rooms-view";
import type { ChoreRecurrence, HouseholdTask, HouseholdTaskCategory, InventoryItem } from "@/types/database";

/**
 * The "Bills and upkeep" checklist (Phase 164, D2/D6/D7/D8;
 * docs/phase-164-bills-upkeep-plan.md): common things an Indonesian home pays
 * or services on a date. Ticking one makes an ordinary chore with the right
 * repeat, day and reminder; gas and drinking water go to Stok di rumah
 * instead, where staff already say "running low". Nothing here is new data:
 * each item is a chore or a supply like any other, and can be changed later.
 *
 * Regional facts (PLN and PDAM by the 20th, BPJS by the 10th, PBB often
 * 31 August) are suggestions the owner sees and can change before adding.
 */
export type QuickKey =
  | "electricity"
  | "electricity-token"
  | "water"
  | "internet"
  | "iuran"
  | "bpjs"
  | "pbb"
  | "stnk"
  | "ac"
  | "toren"
  | "pest"
  | "gas"
  | "gallon";

export type QuickGroup = "bill" | "upkeep" | "supply";

/** The checklist's icon names; the sheet maps them to lucide-react icons. */
export type QuickIcon =
  | "zap"
  | "droplets"
  | "wifi"
  | "house"
  | "heart-pulse"
  | "landmark"
  | "car"
  | "air-vent"
  | "cylinder"
  | "bug"
  | "flame"
  | "glass-water";

type Words = Record<OwnerLocale, string>;

export interface QuickChore {
  kind: "chore";
  key: QuickKey;
  group: "bill" | "upkeep";
  icon: QuickIcon;
  /** The row's name in the checklist. */
  name: Words;
  /** The chore's title as saved: the owner's language, or Indonesian for staff or anyone. */
  title: Words;
  category: HouseholdTaskCategory;
  recurrence: ChoreRecurrence;
  interval: number;
  /** When it's first due: a day of the month, a fixed date in the year, days from now, or picked by the owner. */
  due: { kind: "day"; day: number } | { kind: "date"; month: number; day: number } | { kind: "in"; days: number } | { kind: "pick" };
  /** Who by default: the owner adding it, or anyone in the house. */
  who: "me" | "anyone";
  remind: number | null;
  /** A note under the row when it's open. */
  hint?: Words;
  /** Words in an existing chore's title that mean it's already set up. */
  matches: RegExp;
  /** Shown instead of another row (electricity: postpaid or token). */
  variantOf?: QuickKey;
}

export interface QuickSupply {
  kind: "supply";
  key: QuickKey;
  group: "supply";
  icon: QuickIcon;
  name: Words;
  /** The supply's name as saved in Stok di rumah (owners and staff read it). */
  itemName: string;
  matches: RegExp;
}

export type QuickItem = QuickChore | QuickSupply;

export const QUICK_ITEMS: QuickItem[] = [
  {
    kind: "chore",
    key: "electricity",
    group: "bill",
    icon: "zap",
    name: { en: "Electricity (PLN)", id: "Listrik PLN" },
    title: { en: "Electricity (PLN)", id: "Listrik PLN" },
    category: "bill",
    recurrence: "monthly",
    interval: 1,
    due: { kind: "day", day: 20 },
    who: "me",
    remind: 3,
    matches: /\b(pln|listrik|electricity)\b/i,
  },
  {
    kind: "chore",
    key: "electricity-token",
    group: "bill",
    icon: "zap",
    name: { en: "Electricity (PLN)", id: "Listrik PLN" },
    title: { en: "Electricity token (PLN)", id: "Token listrik PLN" },
    category: "bill",
    recurrence: "monthly",
    interval: 1,
    due: { kind: "day", day: 1 },
    who: "me",
    remind: 0,
    hint: {
      en: "A monthly nudge to check the meter and top up before it runs out.",
      id: "Pengingat bulanan untuk cek meteran dan isi token sebelum habis.",
    },
    matches: /\b(pln|listrik|electricity)\b/i,
    variantOf: "electricity",
  },
  {
    kind: "chore",
    key: "water",
    group: "bill",
    icon: "droplets",
    name: { en: "Water (PDAM)", id: "Air PDAM" },
    title: { en: "Water (PDAM)", id: "Air PDAM" },
    category: "bill",
    recurrence: "monthly",
    interval: 1,
    due: { kind: "day", day: 20 },
    who: "me",
    remind: 3,
    matches: /\b(pdam|water bill)\b/i,
  },
  {
    kind: "chore",
    key: "internet",
    group: "bill",
    icon: "wifi",
    name: { en: "Internet", id: "Internet" },
    title: { en: "Internet", id: "Internet" },
    category: "bill",
    recurrence: "monthly",
    interval: 1,
    due: { kind: "day", day: 20 },
    who: "me",
    remind: 3,
    hint: { en: "Check the due day on your bill.", id: "Cek tanggal jatuh tempo di tagihan Anda." },
    matches: /\b(internet|wifi|wi-fi|indihome)\b/i,
  },
  {
    kind: "chore",
    key: "iuran",
    group: "bill",
    icon: "house",
    name: { en: "Iuran RT/RW", id: "Iuran RT/RW" },
    title: { en: "Iuran RT/RW", id: "Iuran RT/RW" },
    category: "bill",
    recurrence: "monthly",
    interval: 1,
    due: { kind: "day", day: 1 },
    who: "me",
    remind: 0,
    matches: /\biuran\b/i,
  },
  {
    kind: "chore",
    key: "bpjs",
    group: "bill",
    icon: "heart-pulse",
    name: { en: "BPJS Kesehatan", id: "BPJS Kesehatan" },
    title: { en: "BPJS Kesehatan", id: "BPJS Kesehatan" },
    category: "bill",
    recurrence: "monthly",
    interval: 1,
    due: { kind: "day", day: 10 },
    who: "me",
    remind: 3,
    matches: /\bbpjs\b/i,
  },
  {
    kind: "chore",
    key: "pbb",
    group: "bill",
    icon: "landmark",
    name: { en: "PBB (land and building tax)", id: "PBB (pajak bumi dan bangunan)" },
    title: { en: "PBB", id: "PBB" },
    category: "bill",
    recurrence: "monthly",
    interval: 12,
    due: { kind: "date", month: 8, day: 31 },
    who: "me",
    remind: 7,
    hint: { en: "Deadlines differ by region: check your SPPT.", id: "Batas bayar tiap daerah berbeda: cek SPPT Anda." },
    matches: /\bpbb\b/i,
  },
  {
    kind: "chore",
    key: "stnk",
    group: "bill",
    icon: "car",
    name: { en: "Vehicle tax (STNK)", id: "Pajak kendaraan (STNK)" },
    title: { en: "Vehicle tax (STNK)", id: "Pajak kendaraan (STNK)" },
    category: "bill",
    recurrence: "monthly",
    interval: 12,
    due: { kind: "pick" },
    who: "me",
    remind: 7,
    hint: { en: "The date is on the vehicle's STNK.", id: "Tanggalnya ada di STNK kendaraan." },
    matches: /\b(stnk|pajak kendaraan|vehicle tax|car tax)\b/i,
  },
  {
    kind: "chore",
    key: "ac",
    group: "upkeep",
    icon: "air-vent",
    name: { en: "AC service", id: "Servis AC" },
    title: { en: "AC service", id: "Servis AC" },
    category: "maintenance",
    recurrence: "monthly",
    interval: 3,
    due: { kind: "in", days: 7 },
    who: "anyone",
    remind: 1,
    matches: /\b(servis ac|service ac|ac service|cuci ac)\b/i,
  },
  {
    kind: "chore",
    key: "toren",
    group: "upkeep",
    icon: "cylinder",
    name: { en: "Clean the water tank (toren)", id: "Kuras toren" },
    title: { en: "Clean the water tank (toren)", id: "Kuras toren" },
    category: "maintenance",
    recurrence: "monthly",
    interval: 6,
    due: { kind: "in", days: 7 },
    who: "anyone",
    remind: null,
    matches: /\b(toren|tandon|water tank)\b/i,
  },
  {
    kind: "chore",
    key: "pest",
    group: "upkeep",
    icon: "bug",
    // Staff read Indonesian only (AGENTS.md): "Basmi hama" (Codex, PR #60).
    name: { en: "Pest control", id: "Basmi hama" },
    title: { en: "Pest control", id: "Basmi hama" },
    category: "maintenance",
    recurrence: "monthly",
    interval: 3,
    due: { kind: "in", days: 7 },
    who: "me",
    remind: 1,
    matches: /\b(pest control|rayap|fogging|basmi|hama)\b/i,
  },
  {
    kind: "supply",
    key: "gas",
    group: "supply",
    icon: "flame",
    name: { en: "Gas (LPG)", id: "Gas LPG" },
    itemName: "Gas LPG",
    matches: /\b(gas|lpg|elpiji)\b/i,
  },
  {
    kind: "supply",
    key: "gallon",
    group: "supply",
    icon: "glass-water",
    name: { en: "Drinking water (gallon)", id: "Air galon" },
    itemName: "Air galon",
    matches: /\b(galon|gallon)\b/i,
  },
];

export function quickItem(key: QuickKey): QuickItem {
  const item = QUICK_ITEMS.find((i) => i.key === key);
  if (!item) throw new Error(`Unknown quick item ${key}`);
  return item;
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

function clampedDay(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, last));
}

/**
 * When a checklist chore is first due, from today: this month's day if it
 * hasn't passed, otherwise next month's; this year's date, otherwise next
 * year's; or a week from now for upkeep. Null when the owner has to pick it
 * (vehicle tax).
 */
export function defaultFirstDue(item: QuickChore, today: string): string | null {
  const now = new Date(`${today}T00:00:00`);
  switch (item.due.kind) {
    case "pick":
      return null;
    case "in": {
      const d = new Date(now);
      d.setDate(d.getDate() + item.due.days);
      return dayKey(d);
    }
    case "day": {
      const thisMonth = clampedDay(now.getFullYear(), now.getMonth(), item.due.day);
      if (dayKey(thisMonth) >= today) return dayKey(thisMonth);
      return dayKey(clampedDay(now.getFullYear(), now.getMonth() + 1, item.due.day));
    }
    case "date": {
      const thisYear = clampedDay(now.getFullYear(), item.due.month - 1, item.due.day);
      if (dayKey(thisYear) >= today) return dayKey(thisYear);
      return dayKey(clampedDay(now.getFullYear() + 1, item.due.month - 1, item.due.day));
    }
  }
}

/** "20th" / "tgl 20" (monthly), "Aug 31" / "31 Agu" (yearly), or the date (otherwise). */
export function dueText(recurrence: ChoreRecurrence, interval: number, first: string, locale: OwnerLocale): string {
  const d = new Date(`${first}T00:00:00`);
  const id = locale === "id";
  if (recurrence === "monthly" && interval === 1) {
    const n = d.getDate();
    if (id) return `tgl ${n}`;
    const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
    return `${n}${suffix}`;
  }
  if (recurrence === "monthly" && interval === 12) {
    return d.toLocaleDateString(id ? "id-ID" : "en-US", { day: "numeric", month: "short" });
  }
  const date = d.toLocaleDateString(id ? "id-ID" : "en-US", { weekday: "short", day: "numeric", month: "short" });
  return id ? `berikutnya ${date}` : `next ${date}`;
}

/** The row's second line: "Every month · 20th", "Every 3 months · next Thu, Nov 19". */
export function quickSubline(item: QuickChore, first: string | null, locale: OwnerLocale): string {
  const repeat = repeatLabel(item.recurrence, item.interval, locale);
  if (!first) return `${repeat} · ${locale === "id" ? "pilih tanggalnya" : "pick the date"}`;
  return `${repeat} · ${dueText(item.recurrence, item.interval, first, locale)}`;
}

/**
 * Already set up: a chore that is still going (a repeat that hasn't ended, a
 * one-off still to come; the Rooms view's rule), or a supply, whose title
 * says so. A bill paid once last week doesn't count (Codex, PR #60).
 */
export function alreadyAdded(
  item: QuickItem,
  chores: HouseholdTask[],
  supplies: InventoryItem[],
  today: string
): boolean {
  if (item.kind === "supply") {
    return supplies.some((s) => s.scope === "home" && item.matches.test(s.name));
  }
  return chores.some((c) => isSetUp(c, today) && item.matches.test(c.title));
}

/**
 * The saved title: in the owner's language when it's an owner's own, in
 * Indonesian when staff or anyone may do it, so staff never read English.
 */
export function savedTitle(item: QuickChore, forOwner: boolean, locale: OwnerLocale): string {
  return forOwner ? item.title[locale] : item.title.id;
}
