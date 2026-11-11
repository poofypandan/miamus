/**
 * Starter templates (Phase 172 PR A2; docs/phase-172-first-ten-minutes-plan.md,
 * section 2 and Appendix A). The kind of home picked at sign-up sets a
 * starting SHAPE (floors, bedrooms, bathrooms, what's outside); a pure
 * builder turns a shape into a draft of rooms by floor, the usual chores
 * with sensible repeats, and the usual bills (Phase 164's checklist). The
 * owner unticks what doesn't apply; nothing is typed.
 *
 * Phase 171 PR A draws the question ("What kind of home?", after Create
 * household); 172 owns these keys and everything after the answer. The
 * answer is stored in household_setup.home_type (migrations/142).
 *
 * Code constants, not a table (D4): the content changes with the app and is
 * reviewed like code. Chore and room names are saved in Indonesian, because
 * staff read them; English owners see the meaning beside each one.
 * Every Indonesian word follows docs/indonesian-glossary.md.
 */
import type { OwnerLocale } from "@/lib/owner-locale";
import { repeatLabel } from "@/lib/chore-recurrence";
import { isSetUp } from "@/lib/rooms-view";
import { QUICK_ITEMS, alreadyAdded, defaultFirstDue, savedTitle, type QuickChore, type QuickKey } from "@/lib/bills-upkeep";
import type { ChoreRecurrence, HouseholdLocation, HouseholdTask, HouseholdTaskCategory } from "@/types/database";

export const HOME_TYPES = ["garden", "multi_floor", "apartment", "other"] as const;
export type HomeType = (typeof HOME_TYPES)[number];

export function isHomeType(value: unknown): value is HomeType {
  return typeof value === "string" && (HOME_TYPES as readonly string[]).includes(value);
}

/**
 * Whether sign-up asks "What kind of home?": on now that the template
 * review it opens exists (Phase 172 PR A2).
 */
export const SETUP_TEMPLATES_READY = true;

/** Where the answer goes: the review, with that home's shape (Skip: none). */
export function setupHref(home: HomeType | null): string {
  return home ? `/setup?home=${home}` : "/setup";
}

// --- The shape ------------------------------------------------------------------------

export interface Shape {
  floors: number;
  bedrooms: number;
  bathrooms: number;
  garden: boolean;
  pool: boolean;
  carport: boolean;
  rooftop: boolean;
  staffRoom: boolean;
  laundryRoom: boolean;
}

export const SHAPE_LIMITS = { floors: [1, 5], bedrooms: [1, 8], bathrooms: [1, 8] } as const;

/** The plan's starting shapes (D3). Skip opens on "other". */
export const SHAPES: Record<HomeType, Shape> = {
  garden: { floors: 2, bedrooms: 4, bathrooms: 3, garden: true, pool: true, carport: true, rooftop: false, staffRoom: true, laundryRoom: false },
  multi_floor: { floors: 3, bedrooms: 5, bathrooms: 5, garden: true, pool: false, carport: true, rooftop: true, staffRoom: true, laundryRoom: true },
  apartment: { floors: 1, bedrooms: 3, bathrooms: 2, garden: false, pool: false, carport: false, rooftop: false, staffRoom: true, laundryRoom: false },
  other: { floors: 1, bedrooms: 2, bathrooms: 1, garden: false, pool: false, carport: false, rooftop: false, staffRoom: false, laundryRoom: false },
};

export function shapeFor(home: HomeType | null): Shape {
  return { ...SHAPES[home ?? "other"] };
}

/** A shape with every number inside its limits (a stepper can't go past them). */
export function clampShape(shape: Shape): Shape {
  const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(n)));
  return {
    ...shape,
    floors: clamp(shape.floors, SHAPE_LIMITS.floors),
    bedrooms: clamp(shape.bedrooms, SHAPE_LIMITS.bedrooms),
    bathrooms: clamp(shape.bathrooms, SHAPE_LIMITS.bathrooms),
  };
}

// --- Jobs (D6): an optional chip per staff member ------------------------------------

export const SETUP_JOBS = ["cleaning", "kitchen", "laundry", "garden", "driver", "pool"] as const;
export type SetupJob = (typeof SETUP_JOBS)[number];

export const SETUP_JOB_LABELS: Record<OwnerLocale, Record<SetupJob, string>> = {
  en: { cleaning: "Cleaning", kitchen: "Kitchen", laundry: "Laundry", garden: "Garden", driver: "Driver", pool: "Pool" },
  id: { cleaning: "Bersih-bersih", kitchen: "Dapur", laundry: "Cuci dan setrika", garden: "Kebun", driver: "Sopir", pool: "Kolam" },
};

// --- The catalogue (Appendix A) -------------------------------------------------------

type Words = { id: string; en: string };

/** A repeat the chore engine supports: daily, weekly on a day, monthly on a day, every N months. */
export type Cadence =
  | { kind: "daily" }
  | { kind: "weekly"; weekday: number; every?: number }
  | { kind: "monthly"; day: number }
  | { kind: "months"; every: number };

interface CatalogueChore {
  key: string;
  title: Words;
  cadence: Cadence;
  category: HouseholdTaskCategory;
  job: SetupJob;
}

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5, SAT = 6, SUN = 0;

/** Every chore a template can hold, by key. Titles are what staff read. */
export const CHORES = {
  sweepMop: { key: "sweep-mop", title: { id: "Sapu dan pel lantai", en: "Sweep and mop the floor" }, cadence: { kind: "daily" }, category: "cleaning", job: "cleaning" },
  dust: { key: "dust", title: { id: "Lap debu meja dan rak", en: "Dust tables and shelves" }, cadence: { kind: "weekly", weekday: MON }, category: "cleaning", job: "cleaning" },
  vacuumSofa: { key: "vacuum-sofa", title: { id: "Vakum sofa dan karpet", en: "Vacuum the sofa and rugs" }, cadence: { kind: "weekly", weekday: WED }, category: "cleaning", job: "cleaning" },
  windows: { key: "windows", title: { id: "Lap kaca jendela", en: "Clean the windows" }, cadence: { kind: "weekly", weekday: FRI }, category: "cleaning", job: "cleaning" },
  tidyBed: { key: "tidy-bed", title: { id: "Rapikan kamar dan tempat tidur", en: "Tidy the room and make the bed" }, cadence: { kind: "daily" }, category: "cleaning", job: "cleaning" },
  sheets: { key: "sheets", title: { id: "Ganti seprai dan sarung bantal", en: "Change the sheets and pillowcases" }, cadence: { kind: "weekly", weekday: SAT }, category: "cleaning", job: "laundry" },
  towels: { key: "towels", title: { id: "Ganti handuk", en: "Change the towels" }, cadence: { kind: "weekly", weekday: WED }, category: "cleaning", job: "laundry" },
  scrubBath: { key: "scrub-bath", title: { id: "Sikat kamar mandi dan toilet", en: "Scrub the bathroom and toilet" }, cadence: { kind: "weekly", weekday: TUE }, category: "cleaning", job: "cleaning" },
  drainBak: { key: "drain-bak", title: { id: "Kuras bak mandi", en: "Drain and scrub the bath tub (bak)" }, cadence: { kind: "weekly", weekday: THU }, category: "cleaning", job: "cleaning" },
  trash: { key: "trash", title: { id: "Buang sampah", en: "Take out the trash" }, cadence: { kind: "daily" }, category: "cleaning", job: "cleaning" },
  dishes: { key: "dishes", title: { id: "Cuci piring", en: "Wash the dishes" }, cadence: { kind: "daily" }, category: "cleaning", job: "kitchen" },
  kitchen: { key: "kitchen", title: { id: "Bersihkan dapur dan kompor", en: "Clean the kitchen and stove" }, cadence: { kind: "daily" }, category: "cleaning", job: "kitchen" },
  fridge: { key: "fridge", title: { id: "Bersihkan kulkas", en: "Clean out the fridge" }, cadence: { kind: "monthly", day: 1 }, category: "cleaning", job: "kitchen" },
  wetKitchen: { key: "wet-kitchen", title: { id: "Bersihkan dapur kotor", en: "Clean the wet kitchen" }, cadence: { kind: "daily" }, category: "cleaning", job: "kitchen" },
  wash: { key: "wash", title: { id: "Cuci dan jemur baju", en: "Wash and hang the laundry" }, cadence: { kind: "daily" }, category: "cleaning", job: "laundry" },
  iron: { key: "iron", title: { id: "Setrika dan lipat baju", en: "Iron and fold clothes" }, cadence: { kind: "daily" }, category: "cleaning", job: "laundry" },
  store: { key: "store", title: { id: "Rapikan gudang", en: "Tidy the store room" }, cadence: { kind: "monthly", day: 15 }, category: "cleaning", job: "cleaning" },
  staffRoom: { key: "staff-room", title: { id: "Bersihkan kamar staf", en: "Clean the staff room" }, cadence: { kind: "weekly", weekday: SUN }, category: "cleaning", job: "cleaning" },
  terrace: { key: "terrace", title: { id: "Sapu teras dan halaman", en: "Sweep the terrace and yard" }, cadence: { kind: "daily" }, category: "cleaning", job: "garden" },
  plants: { key: "plants", title: { id: "Siram tanaman", en: "Water the plants" }, cadence: { kind: "daily" }, category: "cleaning", job: "garden" },
  mow: { key: "mow", title: { id: "Potong rumput", en: "Mow the lawn" }, cadence: { kind: "weekly", weekday: SAT, every: 2 }, category: "maintenance", job: "garden" },
  trim: { key: "trim", title: { id: "Pangkas tanaman", en: "Trim the plants" }, cadence: { kind: "monthly", day: 1 }, category: "maintenance", job: "garden" },
  poolSkim: { key: "pool-skim", title: { id: "Jaring daun dan sikat kolam", en: "Skim leaves and brush the pool" }, cadence: { kind: "weekly", weekday: MON }, category: "cleaning", job: "pool" },
  chlorine: { key: "chlorine", title: { id: "Cek kaporit kolam", en: "Check the pool chlorine" }, cadence: { kind: "weekly", weekday: THU }, category: "maintenance", job: "pool" },
  carWash: { key: "car-wash", title: { id: "Cuci mobil", en: "Wash the car" }, cadence: { kind: "weekly", weekday: SAT }, category: "cleaning", job: "driver" },
  carport: { key: "carport", title: { id: "Bersihkan carport", en: "Clean the carport" }, cadence: { kind: "weekly", weekday: SUN }, category: "cleaning", job: "driver" },
  gutters: { key: "gutters", title: { id: "Bersihkan talang air", en: "Clear the gutters" }, cadence: { kind: "months", every: 6 }, category: "maintenance", job: "garden" },
  fans: { key: "fans", title: { id: "Lap kipas angin", en: "Wipe the fans" }, cadence: { kind: "monthly", day: 15 }, category: "cleaning", job: "cleaning" },
} as const satisfies Record<string, CatalogueChore>;

/** Rooms, saved in Indonesian (A1). Names are at most 60 characters (the table's check). */
const ROOM = {
  living: { id: "Ruang Tamu", en: "Living room" },
  family: { id: "Ruang Keluarga", en: "Family room" },
  familyUp: { id: "Ruang Keluarga Atas", en: "Upstairs family room" },
  dining: { id: "Ruang Makan", en: "Dining room" },
  kitchen: { id: "Dapur", en: "Kitchen" },
  wetKitchen: { id: "Dapur Kotor", en: "Wet kitchen" },
  master: { id: "Kamar Utama", en: "Master bedroom" },
  staff: { id: "Kamar Staf", en: "Staff room" },
  staffBath: { id: "Kamar Mandi Staf", en: "Staff bathroom" },
  laundry: { id: "Ruang Cuci", en: "Laundry room" },
  store: { id: "Gudang", en: "Store room" },
  balcony: { id: "Balkon", en: "Balcony" },
  rooftop: { id: "Rooftop", en: "Rooftop" },
  terrace: { id: "Teras", en: "Terrace" },
  carport: { id: "Carport", en: "Carport" },
  garden: { id: "Taman", en: "Garden" },
  pool: { id: "Kolam Renang", en: "Swimming pool" },
} as const satisfies Record<string, Words>;

/** Bills and upkeep from Phase 164's checklist, by kind of home (A2). */
const HOUSE_BILLS: QuickKey[] = ["electricity", "water", "internet", "iuran", "bpjs", "pbb", "ac", "toren", "pest"];
const APARTMENT_BILLS: QuickKey[] = ["electricity-token", "water", "internet", "bpjs", "ipl", "ac", "pest"];

// --- The draft --------------------------------------------------------------------------

export interface DraftFloor {
  key: string;
  name: string;
}

export interface DraftRoom {
  key: string;
  name: string;
  en: string;
  /** The floor it is on, or null (outside, or a one-floor home). */
  floor: string | null;
  /** The room it is inside (a bathroom in its bedroom; migrations/140), or null. */
  inside: string | null;
  outside: boolean;
}

export interface DraftChore {
  key: string;
  title: string;
  en: string;
  /** A room key, a floor key (the whole floor), or null (the whole house). */
  place: string | null;
  recurrence: ChoreRecurrence;
  interval: number;
  dueDate: string;
  /** For the review's line ("Every week · Sat"). */
  weekday: number | null;
  category: HouseholdTaskCategory;
  job: SetupJob;
}

export interface DraftBill {
  key: QuickKey;
  /** The row's name in the owner's language. */
  name: string;
  /** As saved: the owner's language for the owner's own, Indonesian for anyone. */
  title: string;
  category: HouseholdTaskCategory;
  recurrence: ChoreRecurrence;
  interval: number;
  dueDate: string;
  remind: number | null;
  who: "me" | "anyone";
}

/**
 * The draft (section 7's hook): plain, versioned JSON, the same whether it
 * came from a template, from Kakak (PR B) or later from a head staff member.
 */
export interface SetupDraft {
  v: 1;
  homeType: HomeType | null;
  floors: DraftFloor[];
  rooms: DraftRoom[];
  chores: DraftChore[];
  bills: DraftBill[];
}

// --- Dates ------------------------------------------------------------------------------

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The first day a cadence falls on, today or later. */
export function firstDue(cadence: Cadence, today: string): string {
  const now = new Date(`${today}T00:00:00`);
  switch (cadence.kind) {
    case "daily":
      return today;
    case "weekly": {
      const d = new Date(now);
      d.setDate(d.getDate() + ((cadence.weekday - d.getDay() + 7) % 7));
      return dayKey(d);
    }
    case "monthly": {
      const clamped = (y: number, m: number) => new Date(y, m, Math.min(cadence.day, new Date(y, m + 1, 0).getDate()));
      const thisMonth = clamped(now.getFullYear(), now.getMonth());
      return dayKey(dayKey(thisMonth) >= today ? thisMonth : clamped(now.getFullYear(), now.getMonth() + 1));
    }
    case "months": {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      return dayKey(d);
    }
  }
}

function repeatOf(cadence: Cadence): { recurrence: ChoreRecurrence; interval: number; weekday: number | null } {
  switch (cadence.kind) {
    case "daily":
      return { recurrence: "daily", interval: 1, weekday: null };
    case "weekly":
      return { recurrence: "weekly", interval: cadence.every ?? 1, weekday: cadence.weekday };
    case "monthly":
      return { recurrence: "monthly", interval: 1, weekday: null };
    case "months":
      return { recurrence: "monthly", interval: cadence.every, weekday: null };
  }
}

const WEEKDAY_SHORT: Record<OwnerLocale, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
};

/** "Every day", "Every week · Sat", "Every month · 1st", "Every 6 months". */
export function cadenceLabel(chore: Pick<DraftChore, "recurrence" | "interval" | "weekday" | "dueDate">, locale: OwnerLocale): string {
  // The plan's words for the review ("Every day", "Every week"); longer
  // repeats read as everywhere else ("Every 2 weeks", "Every 6 months").
  const simple = locale === "en" && chore.interval === 1;
  const repeat = simple
    ? { none: "Once", daily: "Every day", weekly: "Every week", monthly: "Every month" }[chore.recurrence]
    : repeatLabel(chore.recurrence, chore.interval, locale);
  if (chore.weekday !== null) return `${repeat} · ${WEEKDAY_SHORT[locale][chore.weekday]}`;
  if (chore.recurrence === "monthly" && chore.interval === 1) {
    const n = Number(chore.dueDate.slice(8, 10));
    if (locale === "id") return `${repeat} · tgl ${n}`;
    const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
    return `${repeat} · ${n}${suffix}`;
  }
  return repeat;
}

// --- The builder ------------------------------------------------------------------------

export interface BuildOptions {
  homeType: HomeType | null;
  /** YYYY-MM-DD, this phone's calendar. */
  today: string;
  /** The owner's language: bill names and the owner's own bill titles. */
  locale: OwnerLocale;
  /** Bills and upkeep switched on (Phase 171): bills are added only then. */
  billsOn: boolean;
}

const FLOOR_ROOF = "f:roof";
const floorKey = (n: number) => `f:${n}`;

/**
 * A shape → a draft. Pure: the same shape always gives the same draft, so
 * changing a stepper rebuilds the list instantly with no network.
 */
export function buildSetupDraft(input: Shape, options: BuildOptions): SetupDraft {
  const shape = clampShape(input);
  const apartment = options.homeType === "apartment";
  const multi = shape.floors >= 2;
  const floors: DraftFloor[] = [];
  const rooms: DraftRoom[] = [];
  const chores: DraftChore[] = [];

  // Floors: LT1… only when there is more than one; a one-floor home keeps
  // its rooms at the top level, and "whole floor" chores cover the house.
  if (multi) for (let n = 1; n <= shape.floors; n++) floors.push({ key: floorKey(n), name: `LT${n}` });
  if (shape.rooftop) floors.push({ key: FLOOR_ROOF, name: "Rooftop" });
  const ground = multi ? floorKey(1) : null;
  const top = multi ? floorKey(shape.floors) : null;

  const room = (key: string, words: Words, floor: string | null, extra: Partial<DraftRoom> = {}) => {
    rooms.push({ key, name: words.id, en: words.en, floor, inside: null, outside: false, ...extra });
  };
  const has = (key: string) => rooms.some((r) => r.key === key);

  // Downstairs: living (not in an apartment: its family room is the living
  // room), family, dining, kitchen, and the big house's wet kitchen.
  if (!apartment) room("r:living", ROOM.living, ground);
  room("r:family", ROOM.family, ground);
  room("r:dining", ROOM.dining, ground);
  room("r:kitchen", ROOM.kitchen, ground);
  if (!apartment && options.homeType !== "other" && options.homeType !== null) room("r:wet-kitchen", ROOM.wetKitchen, ground);

  // Bedrooms upstairs first (round the upper floors), Kamar Utama first.
  const bedroomFloor = (i: number) => (multi ? floorKey(2 + (i % (shape.floors - 1))) : null);
  for (let i = 0; i < shape.bedrooms; i++) {
    if (i === 0) room("r:bed1", ROOM.master, bedroomFloor(0));
    else room(`r:bed${i + 1}`, { id: `Kamar Tidur ${i + 1}`, en: `Bedroom ${i + 1}` }, bedroomFloor(i));
  }
  // The first bathroom is inside Kamar Utama; the rest round every floor,
  // starting downstairs (a guest bathroom).
  for (let i = 0; i < shape.bathrooms; i++) {
    if (i === 0) {
      room("r:bath1", { id: "Kamar Mandi", en: "Bathroom" }, bedroomFloor(0), { inside: "r:bed1" });
    } else {
      room(`r:bath${i + 1}`, { id: `Kamar Mandi ${i + 1}`, en: `Bathroom ${i + 1}` }, multi ? floorKey(1 + ((i - 1) % shape.floors)) : null);
    }
  }
  if (options.homeType === "multi_floor" && multi) room("r:family-up", ROOM.familyUp, floorKey(2));
  if (shape.staffRoom) {
    room("r:staff", ROOM.staff, ground);
    room("r:staff-bath", ROOM.staffBath, ground, { inside: "r:staff" });
  }
  if (shape.laundryRoom) room("r:laundry", ROOM.laundry, ground);
  if (!apartment && (options.homeType === "garden" || options.homeType === "multi_floor")) room("r:store", ROOM.store, ground);
  if (apartment) room("r:balcony", ROOM.balcony, null);
  else if (options.homeType === "multi_floor" && multi) room("r:balcony", ROOM.balcony, top);
  if (shape.rooftop) room("r:rooftop", ROOM.rooftop, FLOOR_ROOF);
  if (!apartment) room("r:terrace", ROOM.terrace, null, { outside: true });
  if (shape.carport) room("r:carport", ROOM.carport, null, { outside: true });
  if (shape.garden) room("r:garden", ROOM.garden, null, { outside: true });
  if (shape.pool) room("r:pool", ROOM.pool, null, { outside: true });

  const chore = (c: CatalogueChore, place: string | null) => {
    const repeat = repeatOf(c.cadence);
    chores.push({
      key: `${c.key}@${place ?? "house"}`,
      title: c.title.id,
      en: c.title.en,
      place,
      ...repeat,
      dueDate: firstDue(c.cadence, options.today),
      category: c.category,
      job: c.job,
    });
  };

  // Per floor (not the rooftop), or once for a one-floor home.
  const floorPlaces = multi ? floors.filter((f) => f.key !== FLOOR_ROOF).map((f) => f.key) : [null];
  for (const place of floorPlaces) {
    chore(CHORES.sweepMop, place);
    chore(CHORES.dust, place);
    chore(CHORES.windows, place);
  }
  chore(CHORES.vacuumSofa, "r:family");
  for (const r of rooms.filter((r) => /^r:bed\d+$/.test(r.key))) {
    chore(CHORES.tidyBed, r.key);
    chore(CHORES.sheets, r.key);
  }
  for (const r of rooms.filter((r) => /^r:bath\d+$/.test(r.key))) {
    chore(CHORES.towels, r.key);
    chore(CHORES.scrubBath, r.key);
    if (!apartment) chore(CHORES.drainBak, r.key);
  }
  chore(CHORES.trash, null);
  chore(CHORES.dishes, "r:kitchen");
  chore(CHORES.kitchen, "r:kitchen");
  chore(CHORES.fridge, "r:kitchen");
  if (has("r:wet-kitchen")) chore(CHORES.wetKitchen, "r:wet-kitchen");
  chore(CHORES.wash, has("r:laundry") ? "r:laundry" : null);
  chore(CHORES.iron, has("r:laundry") ? "r:laundry" : null);
  if (has("r:store")) chore(CHORES.store, "r:store");
  if (has("r:staff")) chore(CHORES.staffRoom, "r:staff");
  if (has("r:terrace")) chore(CHORES.terrace, "r:terrace");
  if (has("r:garden")) chore(CHORES.plants, "r:garden");
  else if (has("r:balcony")) chore(CHORES.plants, "r:balcony");
  if (has("r:garden")) {
    chore(CHORES.mow, "r:garden");
    chore(CHORES.trim, "r:garden");
  }
  if (has("r:pool")) {
    chore(CHORES.poolSkim, "r:pool");
    chore(CHORES.chlorine, "r:pool");
  }
  if (has("r:carport")) {
    chore(CHORES.carWash, "r:carport");
    chore(CHORES.carport, "r:carport");
  }
  if (!apartment) chore(CHORES.gutters, null);
  chore(CHORES.fans, null);

  const bills: DraftBill[] = options.billsOn
    ? (apartment ? APARTMENT_BILLS : HOUSE_BILLS).map((key) => {
        const item = QUICK_ITEMS.find((i): i is QuickChore => i.kind === "chore" && i.key === key)!;
        return {
          key,
          name: item.name[options.locale],
          title: savedTitle(item, item.who === "me", options.locale),
          category: item.category,
          recurrence: item.recurrence,
          interval: item.interval,
          // Every template bill has a default day (vehicle tax, which needs
          // its STNK date, stays in the checklist).
          dueDate: defaultFirstDue(item, options.today) ?? options.today,
          remind: item.remind,
          who: item.who,
        };
      })
    : [];

  return { v: 1, homeType: options.homeType, floors, rooms, chores, bills };
}

// --- What a household already has (D7) --------------------------------------------------

/**
 * One rule for "the same name", the same as the database's setup_name_key
 * (migrations/147), so what the review marks Added is exactly what the apply
 * skips (Codex, PR #90): collapse runs of spaces, tabs, line breaks and
 * non-breaking spaces to one space, trim, ignore case. The same explicit set
 * on both sides: JavaScript's \s knows more Unicode spaces than Postgres.
 * Case folding can differ for a few non-ASCII letters (Turkish dotted I);
 * room and chore names here are Indonesian, so ASCII.
 */
export function nameKey(name: string | null | undefined): string {
  return (name ?? "").replace(/[ \t\n\r\f\v\u00a0]+/g, " ").replace(/^ | $/g, "").toLowerCase();
}
const norm = nameKey;

export interface Existing {
  locations: Pick<HouseholdLocation, "id" | "name" | "kind" | "parent_id">[];
  chores: HouseholdTask[];
  today: string;
}

/** Draft place key → the household's own location id, matched by name under the same parent. */
export function matchPlaces(draft: SetupDraft, existing: Existing): Map<string, string> {
  const found = new Map<string, string>();
  const find = (name: string, kind: "room" | "floor", parentId: string | null) =>
    existing.locations.find(
      (l) => norm(l.name) === norm(name) && (l.kind ?? "room") === kind && (l.parent_id ?? null) === parentId
    )?.id;
  // An older household's room named like a floor ("LT2", before floors
  // existed) stands in for it, as apply_household_setup does: whole-floor
  // chores go to it, and that floor's rooms are at the top level.
  const roomFloors = new Set<string>();
  for (const floor of draft.floors) {
    const id = find(floor.name, "floor", null);
    const room = id ? undefined : find(floor.name, "room", null);
    if (id) found.set(floor.key, id);
    else if (room) {
      found.set(floor.key, room);
      roomFloors.add(floor.key);
    }
  }
  // Rooms on floors (and top-level rooms) before the rooms inside them.
  for (const pass of [false, true]) {
    for (const r of draft.rooms) {
      if (!!r.inside !== pass) continue;
      const parentKey = r.inside ?? (r.floor && roomFloors.has(r.floor) ? null : r.floor);
      const parentId = parentKey ? (found.get(parentKey) ?? null) : null;
      if (parentKey && !parentId) continue;
      const id = find(r.name, "room", parentId);
      if (id) found.set(r.key, id);
    }
  }
  return found;
}

/**
 * The keys of what the household already has, shown as Added with no
 * checkbox: a room with the same name under the same parent; a chore with
 * the same title (case and spaces ignored) in the same place and the same
 * repeat, still going; a bill as Phase 164's checklist reads it.
 */
export function alreadyInHousehold(draft: SetupDraft, existing: Existing): Set<string> {
  const places = matchPlaces(draft, existing);
  const added = new Set<string>();
  for (const r of draft.rooms) if (places.has(r.key)) added.add(r.key);
  const going = existing.chores.filter((c) => isSetUp(c, existing.today));
  for (const c of draft.chores) {
    if (c.place && !places.has(c.place)) continue;
    const locationId = c.place ? places.get(c.place)! : null;
    const same = going.some(
      (t) =>
        norm(t.title) === norm(c.title) &&
        (t.location_id ?? null) === locationId &&
        (t.recurrence ?? "none") === c.recurrence &&
        Math.max(1, t.recurrence_interval ?? 1) === c.interval
    );
    if (same) added.add(c.key);
  }
  for (const b of draft.bills) {
    const item = QUICK_ITEMS.find((i) => i.key === b.key);
    if (item && alreadyAdded(item, existing.chores, [], existing.today)) added.add(`bill:${b.key}`);
  }
  return added;
}

// --- Ticking ----------------------------------------------------------------------------

/**
 * Unticking a room unticks the rooms inside it and every chore in them;
 * unticking a chore removes only it. Returns the keys left out.
 */
export function leftOut(draft: SetupDraft, unticked: ReadonlySet<string>): Set<string> {
  const out = new Set<string>(unticked);
  for (const r of draft.rooms) if (r.inside && out.has(r.inside)) out.add(r.key);
  for (const c of draft.chores) if (c.place && out.has(c.place)) out.add(c.key);
  return out;
}

export interface SetupCounts {
  rooms: number;
  chores: number;
  bills: number;
  total: number;
}

/** What Add will add: ticked and not already there. */
export function countsFor(draft: SetupDraft, unticked: ReadonlySet<string>, added: ReadonlySet<string>): SetupCounts {
  const out = leftOut(draft, unticked);
  const rooms = draft.rooms.filter((r) => !out.has(r.key) && !added.has(r.key)).length;
  const chores = draft.chores.filter((c) => !out.has(c.key) && !added.has(c.key)).length;
  const bills = draft.bills.filter((b) => !out.has(`bill:${b.key}`) && !added.has(`bill:${b.key}`)).length;
  return { rooms, chores, bills, total: rooms + chores + bills };
}

// --- Staff and the call ----------------------------------------------------------------

export interface DraftStaff {
  key: string;
  name: string;
  job: SetupJob | null;
}

/**
 * Who a chore goes to (D6): the one person with its job; Anyone when nobody
 * has it, or when two people share it (the chips are a hint, not a lock).
 */
export function assigneeFor(job: SetupJob, staff: DraftStaff[]): string | null {
  const withJob = staff.filter((s) => s.job === job && s.name.trim());
  return withJob.length === 1 ? withJob[0].key : null;
}

/** A draft person, the caller themself (resolved by the database), or Anyone. */
export type ApplyAssignee = { staff: string } | { me: true } | null;

/** What apply_household_setup (migrations/147) takes. */
export interface ApplyPayload {
  v: 1;
  floors: { key: string; name: string }[];
  rooms: { key: string; name: string; parent: string | null }[];
  staff: { key: string; name: string }[];
  chores: {
    title: string;
    place: string | null;
    recurrence: ChoreRecurrence;
    interval: number;
    due_date: string;
    category: HouseholdTaskCategory;
    assignee: ApplyAssignee;
    remind: number | null;
    /** From the Bills and upkeep list (upkeep is a maintenance chore, still counted as a bill). */
    from_bills?: true;
  }[];
}

/**
 * The draft, as ticked, into one all-or-nothing call. Already-added chores
 * and bills are left out; rooms are sent by name (the database maps them to
 * the household's own), so a chore can still point at an existing room.
 * Bills for "me" go to the owner's own roster entry, which the database
 * looks up for the caller.
 */
export function toApplyPayload(
  draft: SetupDraft,
  unticked: ReadonlySet<string>,
  added: ReadonlySet<string>,
  staff: DraftStaff[]
): ApplyPayload {
  const out = leftOut(draft, unticked);
  const people = staff.filter((s) => s.name.trim()).map((s) => ({ ...s, name: s.name.trim().replace(/\s+/g, " ") }));
  const chores: ApplyPayload["chores"] = draft.chores
    .filter((c) => !out.has(c.key) && !added.has(c.key))
    .map((c) => {
      const who = assigneeFor(c.job, people);
      return {
        title: c.title,
        place: c.place,
        recurrence: c.recurrence,
        interval: c.interval,
        due_date: c.dueDate,
        category: c.category,
        assignee: who ? { staff: who } : null,
        remind: null,
      };
    });
  for (const b of draft.bills) {
    if (out.has(`bill:${b.key}`) || added.has(`bill:${b.key}`)) continue;
    chores.push({
      title: b.title,
      place: null,
      recurrence: b.recurrence,
      interval: b.interval,
      due_date: b.dueDate,
      category: b.category,
      // "For you": the database finds the owner's own roster entry, so a
      // bill titled in the owner's language never lands on staff screens.
      assignee: b.who === "me" ? { me: true } : null,
      remind: b.remind,
      from_bills: true,
    });
  }
  // Only the places something still needs: a ticked room, or a chore's place.
  const neededRooms = new Set<string>();
  for (const r of draft.rooms) if (!out.has(r.key)) neededRooms.add(r.key);
  for (const c of chores) if (c.place && c.place.startsWith("r:")) neededRooms.add(c.place);
  // A room inside another needs its parent too.
  for (const r of draft.rooms) if (neededRooms.has(r.key) && r.inside) neededRooms.add(r.inside);
  const rooms = draft.rooms
    .filter((r) => neededRooms.has(r.key))
    .sort((a, b) => Number(!!a.inside) - Number(!!b.inside))
    .map((r) => ({ key: r.key, name: r.name, parent: r.inside ?? r.floor }));
  const neededFloors = new Set<string>();
  for (const r of rooms) if (r.parent?.startsWith("f:")) neededFloors.add(r.parent);
  for (const c of chores) if (c.place?.startsWith("f:")) neededFloors.add(c.place);
  return {
    v: 1,
    floors: draft.floors.filter((f) => neededFloors.has(f.key)),
    rooms,
    staff: people.map((s) => ({ key: s.key, name: s.name })),
    chores,
  };
}

/** What apply_household_setup returns. */
export interface ApplyResult {
  rooms_added: number;
  chores_added: number;
  bills_added: number;
  staff_added: number;
  skipped: number;
}

// --- Existing households: the Starter list (D7) ----------------------------------------

/**
 * A starting shape from the rooms a household already has, so the Starter
 * list opens close to their home (the owner adjusts it with taps anyway).
 */
export function shapeFromHousehold(
  locations: Pick<HouseholdLocation, "name" | "kind">[]
): { homeType: HomeType; shape: Shape } {
  const rooms = locations.filter((l) => (l.kind ?? "room") === "room").map((l) => l.name.toLowerCase());
  const floors = locations.filter((l) => l.kind === "floor" && !/rooftop/i.test(l.name)).length;
  const count = (re: RegExp) => rooms.filter((n) => re.test(n)).length;
  const any = (re: RegExp) => rooms.some((n) => re.test(n));
  const garden = any(/\b(taman|garden|kebun)\b/);
  const homeType: HomeType = floors >= 3 ? "multi_floor" : garden ? "garden" : "other";
  const base = shapeFor(homeType);
  return {
    homeType,
    shape: clampShape({
      floors: floors >= 2 ? floors : 1,
      bedrooms: count(/\b(kamar tidur|kamar utama|bedroom)\b|\bkamar (anak|tamu)\b/) || base.bedrooms,
      bathrooms: count(/\b(kamar mandi|bathroom|toilet|wc)\b/) || base.bathrooms,
      garden,
      pool: any(/\b(kolam renang|pool)\b/),
      carport: any(/\b(carport|garasi|garage)\b/),
      rooftop: any(/\b(rooftop|roof|jemuran)\b/) || locations.some((l) => l.kind === "floor" && /rooftop/i.test(l.name)),
      staffRoom: any(/\b(kamar staf|staff room|kamar art)\b/),
      laundryRoom: any(/\b(ruang cuci|laundry)\b/),
    }),
  };
}
