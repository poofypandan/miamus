// Builds the household block Kakak reads, and the map from its short
// references (S1, P1, R1, I1, M1) back to database ids
// (docs/phase-156-step2-kakak-plan.md, section 4, "What is sent to Claude").
//
// Pure: the route reads the rows with the owner's own session (RLS decides
// what can be read) and hands them here. Only first names as the household
// typed them, pet names, room names and shopping item names go into the
// block; database ids stay in the map and never reach Anthropic.
//
// References are numbered in a fixed order (creation time, then id) so the
// same household gives the same references on every call of a conversation.

import { cookCheck } from "@/lib/can-cook";
import { ROUTINE_KINDS } from "@/lib/pet-routine-kinds";
import type { RecipeWithLines } from "@/lib/recipes";
import { isIngredient, isStockUnit } from "@/lib/kitchen-units";
import { hiddenAreasOf } from "@/lib/staff-areas";
import type { FoodPlace, InventoryCategory, InventoryItem, InventoryUnit, MenuMeal, RoutineKind } from "@/types/database";
import { addDays, type KakakHousehold, type KakakLocale } from "./household";
import { FOOD_PLACES } from "./tools";

const ROUTINE_KIND_SET = new Set<string>(ROUTINE_KINDS.map((k) => k.kind));
const PLACES = new Set<string>(FOOD_PLACES);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface ContextStaffRow {
  id: string;
  name: string;
  created_at: string;
  user_id?: string | null;
  archived_at?: string | null;
  /** migrations/165; absent before it (or on an older read), which reads as nothing hidden. */
  hidden_areas?: string[] | null;
}

export interface ContextPetRow {
  id: string;
  name: string;
  created_at: string;
  entity_type: string;
  metadata: Record<string, unknown> | null;
}

export interface ContextScheduleRow {
  entity_id: string;
  title: string;
  frequency_type: string;
  fixed_times: string[] | null;
  is_active: boolean;
  expires_at: string | null;
  /** migrations/144; absent before it, which reads as an old row (no kind). */
  kind?: string | null;
  /** migrations/144: ISO weekdays, or null for every day. */
  days_of_week?: number[] | null;
  /** The routine's first day (a one-off's is its day). */
  created_at?: string | null;
}

export interface ContextRoomRow {
  id: string;
  name: string;
  created_at: string;
  /** migrations/129; absent before it, which reads as a room with no floor. */
  kind?: "room" | "floor" | null;
  parent_id?: string | null;
}

export interface ContextItemRow {
  id: string;
  name: string;
  /** "Brown" in "Rice (Brown)": only in what the recipe check names (Codex, PR #156). */
  variant?: string | null;
  scope: string;
  created_at: string;
  /** Phase 176: which shelf; Fresh Food and Pantry are ingredients. Absent on an older read. */
  category?: string | null;
  /** migrations/154; absent before it, which reads as nobody has said. */
  kept_in?: string | null;
  /** migrations/154; absent before it, which reads as no date. */
  expires_on?: string | null;
  /** Enough, Running low or Out: an Out item keeps no date (migrations/154's trigger). */
  stock_status?: string | null;
  /** migrations/148: whether its amount is counted, in which unit, and how much is left. */
  track_amount?: boolean | null;
  unit?: string | null;
  quantity?: number | string | null;
}

/** A saved recipe with its lines (migrations/151), as the route reads it. */
export interface ContextRecipeRow {
  id: string;
  name: string;
  name_id: string | null;
  servings: number;
  written_in: "en" | "id";
  created_at: string;
  ingredients: { id: string; item_id: string | null; name: string; name_id: string | null; amount: number | null; unit: string | null; position: number }[];
}

/** A planned dish (migrations/153), as the route reads it. */
export interface ContextDishRow {
  day: string;
  meal: string;
  title: string;
  recipe_id: string | null;
  position: number;
  cooked_at: string | null;
}

export interface ContextRows {
  staff: ContextStaffRow[];
  pets: ContextPetRow[];
  schedules: ContextScheduleRow[];
  rooms: ContextRoomRow[];
  items: ContextItemRow[];
  /** households.has_pets (migrations/133); only an explicit false switches pets off. */
  hasPets?: boolean | null;
  /** household_features (migrations/145): only an explicit false switches Food at home off. */
  foodOn?: boolean | null;
  /** household_features 'kitchen' (migrations/148): only an explicit true switches Kitchen amounts on. */
  kitchenOn?: boolean | null;
  /** household_features 'repairs' and 'bills' (migrations/145): only an explicit false switches one off. */
  repairsOn?: boolean | null;
  billsOn?: boolean | null;
  /** The features were read at all: without it Kakak is told nothing about what is off. */
  featuresRead?: boolean;
  /** Saved recipes (Can we cook it?, 20 Nov); absent on an older read, which reads as none. */
  recipes?: ContextRecipeRow[];
  /** The menu from today (Phase 170 PR C); absent or failed reads as none. */
  menu?: ContextDishRow[];
}

/**
 * A recipe as the server knows it for plan_dish's card: its id, and what it
 * is missing (each item's id, name and the shopping status it goes on the
 * list with). Never sent to Anthropic.
 */
export interface RecipeMissing {
  itemId: string;
  name: string;
  /** The status it goes on the list with. */
  status: "low" | "out";
  /** Already on the shopping list (Running low or Out). */
  listed: boolean;
}

/** The app's own check of one recipe, as the card shows it (Fable S0). */
export interface RecipeCheck {
  state: "ready" | "missing" | "unknown";
  missing: RecipeMissing[];
  unchecked: string[];
}

export interface RecipeRef extends RecipeCheck {
  id: string;
  name: string;
  /**
   * The same check at another number of servings (Codex, PR #156): with
   * Kitchen amounts on, 8 servings may need more than the recipe's 4.
   * Server only; absent on refs built elsewhere (the eval).
   */
  checkFor?: (servings: number) => RecipeCheck;
}

/**
 * How an ingredient's amount is kept (migrations/148), for turning "2 kg" in
 * a suggestion into the right write. Stays on the server: amounts and units
 * are never in the household block, so they never reach Anthropic.
 */
export interface ItemStock {
  tracked: boolean;
  unit: InventoryUnit;
  quantity: number;
}

export interface RefMap {
  /** S1… → staff profile id. M1 is the owner: their roster id, or null if they have none yet. */
  people: Record<string, string | null>;
  pets: Record<string, string>;
  rooms: Record<string, string>;
  items: Record<string, string>;
  /** I1… → how its amount is kept; only for items whose row carried it. */
  stock?: Record<string, ItemStock>;
  /** D1… → the recipe and what it is missing (Can we cook it?). */
  recipes?: Record<string, RecipeRef>;
}

/** Shown on the card next to each reference, in the household's own words. */
export interface RefNames {
  people: Record<string, string>;
  pets: Record<string, string>;
  rooms: Record<string, string>;
  items: Record<string, string>;
}

export interface BuiltContext {
  household: KakakHousehold;
  refs: RefMap;
  names: RefNames;
}

/** The pet title written for potty breaks (lib/schedule-categories.ts). */
const POTTY_TITLE = "Pipis & Pup";
const NON_MEAL_PREFIXES = ["Grooming: ", "Medication: ", "Vet: "];

/** Names are the household's own words, but no newlines or angle brackets in the block. */
export function cleanName(name: string, max = 40): string {
  return name.replace(/[\r\n\t<>]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Honorifics households type into the roster ("Bik Nah"); not part of the name. */
const HONORIFICS = new Set(["mbak", "mba", "mas", "bik", "bi", "bibi", "bu", "ibu", "pak", "bapak", "kak", "teh", "ceu", "mang", "om", "tante"]);

/**
 * First name only: "Sari Wulandari" → "Sari", "Bik Nah" → "Nah". The roster
 * is mostly first names already; Kakak's instructions say honorifics are not
 * part of names, so the block shouldn't carry them either.
 */
export function firstName(name: string): string {
  const words = cleanName(name).split(" ").filter(Boolean);
  const rest = words.length > 1 && HONORIFICS.has(words[0].toLowerCase().replace(/\.$/, "")) ? words.slice(1) : words;
  return rest[0] ?? cleanName(name);
}

function byAge<T extends { created_at: string; id: string }>(a: T, b: T): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function hhmm(time: string): string | null {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  return match ? `${match[1]}:${match[2]}` : null;
}

function petKind(meta: Record<string, unknown> | null): "dog" | "cat" | "other" {
  const species = typeof meta?.species === "string" ? meta.species.toLowerCase() : "";
  if (species === "cat" || species === "kucing") return "cat";
  if (species && species !== "dog" && species !== "anjing") return "other";
  // Miamus's pets have been dogs since Phase 1; no species means a dog.
  return "dog";
}

export function buildContext(
  rows: ContextRows,
  { today, now, ownerLocale, callerUserId }: { today: string; now: string; ownerLocale: KakakLocale; callerUserId: string },
): BuiltContext {
  const refs: RefMap = { people: {}, pets: {}, rooms: {}, items: {}, stock: {} };
  const names: RefNames = { people: {}, pets: {}, rooms: {}, items: {} };

  const active = rows.staff.filter((s) => !s.archived_at).sort(byAge);
  const self = active.find((s) => s.user_id === callerUserId) ?? null;
  const ownerName = self ? firstName(self.name) : ownerLocale === "id" ? "Anda" : "you";
  refs.people.M1 = self?.id ?? null;
  names.people.M1 = ownerName;

  const people: KakakHousehold["people"] = [];
  for (const person of active) {
    if (person === self) continue;
    const ref = `S${people.length + 1}`;
    const name = firstName(person.name);
    // What an owner switched off (Phase 178). A co-owner's row is never
    // limited, so it carries nothing, and is marked so Kakak can't limit it.
    const hidden = hiddenAreasOf(person);
    people.push({ ref, name, ...(hidden.length ? { hidden } : {}), ...(person.user_id ? { owner: true as const } : {}) });
    refs.people[ref] = person.id;
    names.people[ref] = name;
  }

  const pets: KakakHousehold["pets"] = [];
  const livePets = rows.pets
    .filter((p) => p.entity_type === "pet" && !(p.metadata && p.metadata.archived))
    .sort(byAge);
  for (const pet of livePets) {
    const ref = `P${pets.length + 1}`;
    const mine = rows.schedules.filter((s) => s.entity_id === pet.id && s.is_active && s.frequency_type === "fixed_time");
    // Meals and potty are old rows (no kind) with no end; a routine with a
    // kind (Phase 173) is never a meal, and counts until its last day.
    const own = mine.filter((s) => !s.kind && !s.expires_at);
    const timesOf = (list: ContextScheduleRow[]) =>
      [...new Set(list.flatMap((s) => (s.fixed_times ?? []).map(hhmm).filter((t): t is string => t !== null)))].sort();
    const potty = timesOf(own.filter((s) => s.title === POTTY_TITLE));
    const meals = timesOf(
      own.filter((s) => s.title !== POTTY_TITLE && !NON_MEAL_PREFIXES.some((prefix) => s.title.startsWith(prefix))),
    );
    const routines: NonNullable<KakakHousehold["pets"][number]["routines"]> = [];
    for (const row of mine) {
      if (!row.kind || !ROUTINE_KIND_SET.has(row.kind) || (row.expires_at && row.expires_at.slice(0, 10) < today)) continue;
      const title = cleanName(row.title, 60);
      // When it happens, so the duplicate check only drops a time this
      // routine really covers (Codex, PR #100). The first day is the Jakarta
      // date of created_at, as the phones read it.
      const days = row.days_of_week && row.days_of_week.length > 0 ? [...new Set(row.days_of_week)].sort((a, b) => a - b) : null;
      const from = row.created_at ? jakartaNow(new Date(row.created_at)).today : today;
      const until = row.expires_at ? row.expires_at.slice(0, 10) : null;
      const same = (r: (typeof routines)[number]) =>
        r.kind === row.kind && r.title === title && r.from === from && r.until === until && String(r.days) === String(days);
      const entry = routines.find(same);
      const times = timesOf([row]);
      if (entry) entry.times = [...new Set([...entry.times, ...times])].sort();
      else routines.push({ kind: row.kind as RoutineKind, title, times, days, from, until });
    }
    const name = cleanName(pet.name);
    pets.push({ ref, name, kind: petKind(pet.metadata), meals, potty, ...(routines.length ? { routines } : {}) });
    refs.pets[ref] = pet.id;
    names.pets[ref] = name;
  }

  // Each place by its own name, with its floor (migrations/129): "LT2 ·
  // Lounge" on the card, so "Service Area" on LT1 and on LT2 are told apart,
  // and a floor offered as a place of its own for whole-floor chores. A room
  // inside a room (Phase 168) carries that room too: "LT2 · GB1 · Bathroom",
  // so the three bedrooms' bathrooms are told apart.
  const rooms: KakakHousehold["rooms"] = [];
  const byId = new Map(rows.rooms.map((room) => [room.id, room]));
  const floorName = (id: string | null | undefined) => {
    const place = id ? byId.get(id) : undefined;
    return place && place.kind === "floor" ? cleanName(place.name) : null;
  };
  for (const room of [...rows.rooms].sort(byAge)) {
    const ref = `R${rooms.length + 1}`;
    const name = cleanName(room.name);
    if (room.kind === "floor") {
      rooms.push({ ref, name, wholeFloor: true });
      names.rooms[ref] = name;
    } else {
      const parent = room.parent_id ? byId.get(room.parent_id) : undefined;
      const outer = parent && parent.kind !== "floor" ? parent : null;
      const floor = outer ? floorName(outer.parent_id) : floorName(room.parent_id);
      const inside = outer ? cleanName(outer.name) : null;
      rooms.push({ ref, name, ...(floor ? { floor } : {}), ...(inside ? { inside } : {}) });
      names.rooms[ref] = [floor, inside, name].filter(Boolean).join(" · ");
    }
    refs.rooms[ref] = room.id;
  }

  // Ingredients have a place and a date on screen only while Kitchen
  // amounts and Food at home are both on (lib/features ingredientsUnderFood;
  // Kitchen amounts starts off, so only an explicit true counts).
  const ingredientsOn = rows.kitchenOn === true && rows.foodOn !== false;
  const items: KakakHousehold["items"] = [];
  for (const item of [...rows.items].sort(byAge)) {
    const ref = `I${items.length + 1}`;
    const name = cleanName(item.name, 60);
    const ingredient = ingredientsOn && isIngredient({ category: item.category as InventoryCategory });
    items.push({
      ref,
      name,
      pet: item.scope === "pet",
      ...(ingredient
        ? {
            ingredient: true,
            ...(item.stock_status === "out" ? { out: true } : {}),
            keptIn: PLACES.has(item.kept_in ?? "") ? (item.kept_in as FoodPlace) : null,
            expiresOn: typeof item.expires_on === "string" && DAY.test(item.expires_on.slice(0, 10)) ? item.expires_on.slice(0, 10) : null,
          }
        : {}),
    });
    refs.items[ref] = item.id;
    names.items[ref] = name;
    // How its amount is kept, when the row says (migrations/148). Server only.
    const quantity = Number(item.quantity);
    if (typeof item.track_amount === "boolean" && isStockUnit(item.unit) && Number.isFinite(quantity)) {
      refs.stock![ref] = { tracked: item.track_amount, unit: item.unit, quantity: Math.max(0, quantity) };
    }
  }

  const { recipes, menu } = kitchenFor(rows, refs, today);

  return {
    household: {
      today,
      now,
      ownerLocale,
      owner: { ref: "M1", name: ownerName },
      people,
      pets,
      rooms,
      items,
      ...(rows.hasPets === false ? { petsOff: true } : {}),
      ...(rows.foodOn === false ? { foodOff: true } : {}),
      ...(ingredientsOn ? { ingredientsOn: true } : {}),
      // Only when the switches were read: a failed read says nothing is off.
      ...(rows.featuresRead && rows.repairsOn === false ? { repairsOff: true } : {}),
      ...(rows.featuresRead && rows.billsOn === false ? { billsOff: true } : {}),
      ...(rows.featuresRead && rows.kitchenOn !== true ? { kitchenOff: true } : {}),
      ...(recipes.length ? { recipes } : {}),
      ...(menu.length ? { menu } : {}),
    },
    refs,
    names,
  };
}

const MEAL_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };

/**
 * Can we cook it? (owner, 20 Nov): each saved recipe checked by the app's
 * own rule (lib/can-cook.ts) against the items as read, with amounts only
 * while Kitchen amounts is on, at the recipe's own servings; and the menu
 * from today for 7 days. Only names go into the block; ids and the
 * shopping status of what is missing stay in refs.recipes.
 */
function kitchenFor(
  rows: ContextRows,
  refs: RefMap,
  today: string,
): { recipes: NonNullable<KakakHousehold["recipes"]>; menu: NonNullable<KakakHousehold["menu"]> } {
  const recipes: NonNullable<KakakHousehold["recipes"]> = [];
  refs.recipes = {};
  // The rows as lib/can-cook reads them. Only the fields it uses are real.
  const items = rows.items.map(
    (item) =>
      ({
        id: item.id,
        name: item.name,
        // "Rice (Brown)", as the recipe screen names it (Codex, PR #156).
        variant: typeof item.variant === "string" && item.variant.trim() ? item.variant : null,
        stock_status: item.stock_status === "low" || item.stock_status === "out" ? item.stock_status : "ok",
        track_amount: item.track_amount === true,
        unit: isStockUnit(item.unit) ? item.unit : "pcs",
        quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0,
      }) as unknown as InventoryItem,
  );
  const amounts = rows.kitchenOn === true;
  const byId = new Map<string, string>();
  for (const row of [...(rows.recipes ?? [])].sort((a, b) => byAge({ ...a }, { ...b }))) {
    const ref = `D${recipes.length + 1}`;
    const recipe = {
      ...row,
      steps: null,
      steps_id: null,
      household_id: "",
      created_by: null,
      updated_at: "",
      ingredients: [...row.ingredients].sort((a, b) => a.position - b.position),
    } as unknown as RecipeWithLines;
    const checkAt = (servings: number | null) => cookCheck(recipe, servings, items, { amounts, forStaff: false });
    const check = checkAt(null);
    const asRef = (found: typeof check): RecipeCheck => ({
      state: found.state,
      missing: found.missing.map((m) => {
        const item = items.find((i) => i.id === m.itemId)!;
        const status: "low" | "out" =
          item.stock_status === "low" || item.stock_status === "out" ? item.stock_status : item.quantity > 0 ? "low" : "out";
        return { itemId: m.itemId, name: cleanName(m.name, 60), status, listed: m.listed };
      }),
      unchecked: found.unchecked.map((n) => cleanName(n, 60)),
    });
    const name = cleanName(row.name, 60);
    const nameId = row.name_id && cleanName(row.name_id, 60) !== name ? cleanName(row.name_id, 60) : null;
    recipes.push({
      ref,
      name,
      ...(nameId ? { nameId } : {}),
      state: check.state,
      missing: check.missing.map((m) => cleanName(m.name, 60)),
      ...(check.missing.some((m) => m.listed) ? { onList: check.missing.filter((m) => m.listed).map((m) => cleanName(m.name, 60)) } : {}),
      unchecked: check.unchecked.map((n) => cleanName(n, 60)),
    });
    refs.recipes[ref] = {
      id: row.id,
      // The dish's title on the card: the whole name (recipes allow 80).
      name: cleanName(row.name, 80),
      ...asRef(check),
      checkFor: (servings) => asRef(checkAt(servings)),
    };
    byId.set(row.id, ref);
  }
  const last = addDays(today, 6);
  const menu = (rows.menu ?? [])
    .filter((dish) => dish.day >= today && dish.day <= last && MEAL_ORDER[dish.meal] !== undefined && !dish.cooked_at)
    .sort((a, b) => a.day.localeCompare(b.day) || MEAL_ORDER[a.meal] - MEAL_ORDER[b.meal] || a.position - b.position)
    .map((dish) => ({
      day: dish.day,
      meal: dish.meal as MenuMeal,
      title: cleanName(dish.title, 80),
      recipe: dish.recipe_id ? (byId.get(dish.recipe_id) ?? null) : null,
    }));
  return { recipes, menu };
}

/** Today and now in Asia/Jakarta (UTC+7, no daylight saving). */
export function jakartaNow(at: Date = new Date()): { today: string; now: string } {
  const shifted = new Date(at.getTime() + 7 * 60 * 60 * 1000).toISOString();
  return { today: shifted.slice(0, 10), now: shifted.slice(11, 16) };
}
