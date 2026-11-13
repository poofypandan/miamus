// Turns Kakak's checked tool calls into suggestions the phone can show and
// save (docs/phase-156-step2-kakak-plan.md, section 3, the "Mapping" under
// each tool). References become database ids here, on the server; the phone
// gets ready-to-save inputs for the same HouseholdProvider actions used by
// hand, plus the names to show on the card.
//
// Shared by the route (building) and the phone (checking again before
// saving), so it imports nothing server-only.

import { effectiveProof, routineKindInfo } from "@/lib/pet-routine-kinds";
import { ownerAlertTimeAllowed, reminderTimeAllowed } from "@/lib/routine-alerts";
import { AREAS, isStaffArea, withAreas, type StaffArea } from "@/lib/staff-areas";
import type { RoutineKind, RoutineProof } from "@/types/database";
import type { RefMap, RefNames } from "./context";
import type { KakakHousehold } from "./household";
import { FOOD_PLACES, INGREDIENT_EXPIRY, PET_ROUTINE_TOOL_KINDS, TOOL_WEEKDAYS, type PetRoutineToolKind } from "./tools";
import { REMIND_DAYS, isDay, isTime, newPetTimes, routineTitle } from "./validate";

export type ChoreCategory = "cleaning" | "maintenance" | "errand" | "groceries";
export type ChoreRecurrence = "none" | "daily" | "weekly" | "monthly";
export type FoodPlace = "fridge" | "freezer" | "pantry" | "counter";
export type FoodSource = "home" | "gift" | "bought";
export type IngredientExpiry = (typeof INGREDIENT_EXPIRY)[number];

export interface ChoreSuggestion {
  kind: "chore";
  title: string;
  titleEn: string | null;
  category: ChoreCategory;
  /** Staff profile id; null is "anyone". */
  assignedTo: string | null;
  /** The owner chose themself (M1) but has no roster row yet: the phone creates it first. */
  assignToSelf: boolean;
  assigneeName: string | null;
  dueDate: string;
  dueTime: string | null;
  recurrence: ChoreRecurrence;
  recurrenceUntil: string | null;
  requiresSupervision: boolean;
  locationId: string | null;
  roomName: string | null;
  /** Created when the card is saved (createHouseholdLocation returns an existing room of that name). */
  newRoomName: string | null;
  /** The floor the new room goes on (migrations/129), or null for none. */
  newRoomFloorId: string | null;
  newRoomFloorName: string | null;
  notes: string | null;
  /** "Remind me" (migrations/137): 0 on the day, 1, 3 or 7 days before, or null for none. */
  remindDaysBefore: number | null;
}

export interface ShoppingSuggestion {
  kind: "shopping";
  entries: (
    | { type: "item"; itemId: string; name: string; status: "low" | "out" }
    | { type: "note"; note: string; petId: string | null; petName: string | null }
  )[];
}

/**
 * One routine for one or more pets (Phase 173 PR B, D8). Meals and potty are
 * saved as before (a row per pet and time, no kind); every other kind as the
 * Add routine sheet saves it: one group, a row per pet and time
 * (lib/routine-groups.ts), so RLS and the database's checks apply the same.
 */
export interface PetRoutineSuggestion {
  kind: "pet_routine";
  routine: PetRoutineToolKind;
  /** What staff read, for a kind other than meal and potty (whose titles are per time). */
  title: string | null;
  /** An English gloss of an Other title, for an English-speaking owner. */
  titleEn: string | null;
  pets: {
    petId: string;
    petName: string;
    /** New times only, HH:mm, each with the title it will be saved under. */
    times: { time: string; title: string }[];
    /** Times Kakak suggested that the pet already has: shown, not saved. */
    alreadyThere: string[];
  }[];
  /** ISO weekdays (1 = Monday), or null for every day. */
  days: number[] | null;
  /** The last day, or null for no end. */
  until: string | null;
  staffId: string | null;
  staffName: string | null;
  note: string | null;
  /** The kind's default (D6, D14): three photos for a walk with one pet, else a photo. Null for meal and potty. */
  proof: RoutineProof | null;
  remindStaff: boolean;
  alertOwners: boolean;
}

export interface FoodSuggestion {
  kind: "food";
  name: string;
  keptIn: FoodPlace;
  expiresOn: string | null;
  expiryUnknown: boolean;
  /** Labels the date "Kakak's guess — check it"; not saved. */
  expiryIsGuess: boolean;
  source: FoodSource | null;
  fromWhom: string | null;
  returnContainer: boolean;
  notes: string | null;
}

/**
 * Where an ingredient is kept and when it expires (Phase 176): saved
 * through setIngredientPlace and setIngredientExpiry, each sending only its
 * own column, so another phone's amount or status is never overwritten.
 */
export interface IngredientSuggestion {
  kind: "ingredient";
  itemId: string;
  name: string;
  /** Where it goes; null leaves the place as it is. */
  keptIn: FoodPlace | null;
  /** The place stored when Kakak read the household (null: nobody had said), for the card. */
  fromPlace: FoodPlace | null;
  expiry: IngredientExpiry;
  /** YYYY-MM-DD with "set", else null. */
  expiresOn: string | null;
  /** Labels the date "Kakak's guess — check it"; not saved. */
  expiryIsGuess: boolean;
}

/**
 * What one staff member sees (Phase 178 follow-up): saved through
 * setStaffHiddenAreas, the owner's own switches' path, on top of the list
 * as it is when the card is saved, so an area the card doesn't name stays
 * as it is.
 */
export interface StaffAreasSuggestion {
  kind: "staff_areas";
  staffId: string;
  staffName: string;
  /** Areas the card switches on, as Kakak asked. */
  show: StaffArea[];
  /** Areas the card switches off, as Kakak asked. */
  hide: StaffArea[];
  /** What was hidden when Kakak read the household, for the card's "was". */
  before: StaffArea[];
  /** The rows the card shows: the switches this household has, as on the owner's dialog. */
  areas: StaffArea[];
  /**
   * Chores for anyone or pet routines that no staff member would see once
   * this is saved, so every staff member sees them (rule 3). Leave isn't
   * known here, so this can only under-warn.
   */
  nobody: StaffArea[];
}

export type KakakSuggestion =
  | ChoreSuggestion
  | ShoppingSuggestion
  | PetRoutineSuggestion
  | FoodSuggestion
  | IngredientSuggestion
  | StaffAreasSuggestion;

/** The potty title the app writes (lib/schedule-categories.ts). */
export const POTTY_TITLE = "Pipis & Pup";

/** The meal title the schedule editor gives a time when no label is typed. */
export function mealLabelForTime(time: string): string {
  const hour = Number(time.slice(0, 2));
  if (hour < 10) return "Sarapan";
  if (hour < 15) return "Makan Siang";
  if (hour < 19) return "Makan Malam";
  return "Snack Malam";
}

/** "mon" … "sun" → ISO weekdays, sorted; every day (or none) is null. */
export function toIsoDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days = [...new Set(value.map((d) => (TOOL_WEEKDAYS as readonly unknown[]).indexOf(d) + 1).filter((d) => d > 0))].sort(
    (a, b) => a - b,
  );
  return days.length === 0 || days.length === 7 ? null : days;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * One checked tool call → one suggestion. Returns null for ask_question, for
 * a pet routine whose every time is already there, or an unknown tool.
 * Assumes validateToolCall passed: references exist in `refs`.
 */
export function toSuggestion(
  household: KakakHousehold,
  refs: RefMap,
  names: RefNames,
  name: string,
  input: Record<string, unknown>,
): KakakSuggestion | null {
  switch (name) {
    case "create_chore": {
      const assignee = str(input.assignee);
      const room = str(input.room);
      const newRoomFloor = str(input.new_room_floor);
      const assignedTo = assignee ? (refs.people[assignee] ?? null) : null;
      return {
        kind: "chore",
        title: str(input.title) ?? "",
        titleEn: str(input.title_en),
        category: input.category as ChoreCategory,
        assignedTo,
        assignToSelf: assignee === "M1" && assignedTo === null,
        assigneeName: assignee ? (names.people[assignee] ?? null) : null,
        dueDate: String(input.due_date),
        dueTime: str(input.due_time),
        recurrence: input.recurrence as ChoreRecurrence,
        recurrenceUntil: str(input.recurrence_until),
        requiresSupervision: input.requires_supervision === true,
        locationId: room ? refs.rooms[room] : null,
        roomName: room ? names.rooms[room] : null,
        newRoomName: str(input.new_room_name),
        newRoomFloorId: newRoomFloor ? (refs.rooms[newRoomFloor] ?? null) : null,
        newRoomFloorName: newRoomFloor ? (names.rooms[newRoomFloor] ?? null) : null,
        notes: str(input.notes),
        remindDaysBefore:
          typeof input.remind_days_before === "number" && REMIND_DAYS.has(input.remind_days_before) ? input.remind_days_before : null,
      };
    }
    case "add_to_shopping_list": {
      const items = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
      const entries: ShoppingSuggestion["entries"] = [];
      const seen = new Set<string>();
      for (const entry of items) {
        const item = str(entry.item);
        const status = entry.status === "low" ? "low" : "out";
        if (item) {
          if (seen.has(item)) continue;
          seen.add(item);
          entries.push({ type: "item", itemId: refs.items[item], name: names.items[item], status });
        } else {
          const pet = str(entry.pet);
          entries.push({
            type: "note",
            note: str(entry.note) ?? "",
            petId: pet ? refs.pets[pet] : null,
            petName: pet ? names.pets[pet] : null,
          });
        }
      }
      return entries.length ? { kind: "shopping", entries } : null;
    }
    case "add_pet_routine": {
      const routine = (PET_ROUTINE_TOOL_KINDS as readonly string[]).includes(String(input.kind))
        ? (input.kind as PetRoutineToolKind)
        : "meal";
      const basic = routine === "meal" || routine === "potty";
      const asked = [...new Set((Array.isArray(input.times) ? (input.times as unknown[]) : []).filter(isTime))];
      const title = routineTitle(routine, input.title);
      const label = routine === "meal" ? str(input.title) : null;
      // When the routine happens, so only a time an existing routine really covers is dropped.
      const request = { days: basic ? null : toIsoDays(input.days), until: basic ? null : str(input.until) };
      const petRefs = [...new Set((Array.isArray(input.pets) ? (input.pets as unknown[]) : []).map(String))].filter(
        (ref) => refs.pets[ref],
      );
      const pets = petRefs.map((ref) => {
        const fresh = newPetTimes(household, ref, routine, asked, title, request).sort();
        return {
          petId: refs.pets[ref],
          petName: names.pets[ref],
          times: fresh.map((time) => ({
            time,
            title: routine === "potty" ? POTTY_TITLE : routine === "meal" ? (label ?? mealLabelForTime(time)) : (title ?? ""),
          })),
          alreadyThere: asked.filter((time) => !fresh.includes(time)).sort(),
        };
      });
      if (basic) {
        return {
          kind: "pet_routine",
          routine,
          title: null,
          titleEn: null,
          pets,
          days: null,
          until: null,
          staffId: null,
          staffName: null,
          note: null,
          proof: null,
          remindStaff: false,
          alertOwners: false,
        };
      }
      const days = request.days;
      const staff = str(input.staff);
      const kept = pets.filter((p) => p.times.length > 0);
      const times = [...new Set(kept.flatMap((p) => p.times.map((t) => t.time)))];
      return {
        kind: "pet_routine",
        routine,
        title,
        titleEn: routine === "other" ? str(input.title_en) : null,
        pets,
        days,
        until: str(input.until),
        staffId: staff ? (refs.people[staff] ?? null) : null,
        staffName: staff && refs.people[staff] ? (names.people[staff] ?? null) : null,
        note: str(input.note),
        // 3 photos is for one pet; several share one photo (lib/pet-routine-kinds).
        proof: effectiveProof(routineKindInfo(routine as RoutineKind)?.proof ?? "photo", Math.max(kept.length, 1)),
        // A switch none of its times can use is shown and saved off (lib/routine-alerts).
        remindStaff: input.remind_staff === true && times.some(reminderTimeAllowed),
        alertOwners: input.alert_owners === true && times.some(ownerAlertTimeAllowed),
      };
    }
    case "add_food":
      return {
        kind: "food",
        name: str(input.name) ?? "",
        keptIn: input.kept_in as FoodPlace,
        expiresOn: str(input.expires_on),
        expiryUnknown: input.expiry_unknown === true,
        expiryIsGuess: input.expiry_is_guess === true,
        source: (str(input.source) as FoodSource | null) ?? null,
        fromWhom: input.source === "gift" ? str(input.from_whom) : null,
        returnContainer: input.return_container === true,
        notes: str(input.notes),
      };
    case "put_away_ingredient": {
      const item = str(input.item);
      const listed = item ? household.items.find((i) => i.ref === item) : undefined;
      if (!item || !refs.items[item]) return null;
      const expiry = (INGREDIENT_EXPIRY as readonly unknown[]).includes(input.expiry) ? (input.expiry as IngredientExpiry) : "keep";
      return {
        kind: "ingredient",
        itemId: refs.items[item],
        name: names.items[item],
        keptIn: PLACES.has(String(input.kept_in)) ? (input.kept_in as FoodPlace) : null,
        fromPlace: listed?.keptIn ?? null,
        expiry,
        expiresOn: expiry === "set" ? str(input.expires_on) : null,
        expiryIsGuess: expiry === "set" && input.expiry_is_guess === true,
      };
    }
    case "set_staff_areas": {
      const ref = str(input.staff);
      const person = ref ? household.people.find((p) => p.ref === ref && !p.owner) : undefined;
      const staffId = ref ? refs.people[ref] : null;
      if (!ref || !person || !staffId) return null;
      const show = areasFrom(input.show);
      const hide = areasFrom(input.hide).filter((area) => !show.includes(area));
      const before = person.hidden ?? [];
      const after = withAreas(before, show, hide);
      // Rule 3, for the household as Kakak read it: nobody else on staff
      // with the area on, once this person's change is in.
      const seesAfter = (area: StaffArea) =>
        household.people.some((p) => !p.owner && !(p.ref === ref ? after : (p.hidden ?? [])).includes(area));
      return {
        kind: "staff_areas",
        staffId,
        staffName: names.people[ref] ?? person.name,
        show,
        hide,
        before,
        areas: householdAreas(household),
        nobody: (["home", "pets"] as const).filter(
          (area) => (area !== "pets" || !household.petsOff) && !seesAfter(area),
        ),
      };
    }
    default:
      return null;
  }
}

/** A list of areas from a tool call, each once, in AREAS order; anything else dropped. */
function areasFrom(value: unknown): StaffArea[] {
  const list = Array.isArray(value) ? value.filter(isStaffArea) : [];
  return AREAS.filter((area) => list.includes(area));
}

/** The switches a household has, as the owner's dialog shows them: Pet routines only with pets, Repairs only while on. */
export function householdAreas(household: Pick<KakakHousehold, "petsOff" | "repairsOff">): StaffArea[] {
  return AREAS.filter((area) => !(area === "pets" && household.petsOff) && !(area === "repairs" && household.repairsOff));
}

const CATEGORIES = new Set(["cleaning", "maintenance", "errand", "groceries"]);
const RECURRENCES = new Set(["none", "daily", "weekly", "monthly"]);
const PLACES = new Set<string>(FOOD_PLACES);
const SOURCES = new Set(["home", "gift", "bought"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function okText(value: unknown, max: number, nullable: boolean): boolean {
  if (value === null) return nullable;
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function okId(value: unknown, nullable: boolean): boolean {
  if (value === null) return nullable;
  return typeof value === "string" && UUID.test(value);
}

/**
 * The phone's own check before saving: the shape the route promised, with
 * the same limits. Anything else is refused rather than half-saved. RLS and
 * the database's own checks still decide in the end.
 */
export function isSaveableSuggestion(value: unknown): value is KakakSuggestion {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  switch (s.kind) {
    case "chore":
      return (
        okText(s.title, 80, false) &&
        typeof s.category === "string" && CATEGORIES.has(s.category) &&
        okId(s.assignedTo, true) &&
        typeof s.assignToSelf === "boolean" &&
        isDay(s.dueDate) &&
        (s.dueTime === null || isTime(s.dueTime)) &&
        typeof s.recurrence === "string" && RECURRENCES.has(s.recurrence) &&
        (s.recurrenceUntil === null || isDay(s.recurrenceUntil)) &&
        typeof s.requiresSupervision === "boolean" &&
        okId(s.locationId, true) &&
        okText(s.newRoomName, 60, true) &&
        !(s.locationId !== null && s.newRoomName !== null) &&
        okId(s.newRoomFloorId ?? null, true) &&
        !((s.newRoomFloorId ?? null) !== null && s.newRoomName === null) &&
        okText(s.notes, 200, true) &&
        ((s.remindDaysBefore ?? null) === null || REMIND_DAYS.has(s.remindDaysBefore as number))
      );
    case "shopping":
      return (
        Array.isArray(s.entries) &&
        s.entries.length >= 1 &&
        s.entries.length <= 10 &&
        s.entries.every((e: Record<string, unknown>) =>
          e?.type === "item"
            ? okId(e.itemId, false) && (e.status === "low" || e.status === "out")
            : e?.type === "note" && okText(e.note, 120, false) && okId(e.petId, true),
        )
      );
    case "pet_routine": {
      if (typeof s.routine !== "string" || !(PET_ROUTINE_TOOL_KINDS as readonly string[]).includes(s.routine)) return false;
      const basic = s.routine === "meal" || s.routine === "potty";
      const pets = Array.isArray(s.pets) ? (s.pets as Record<string, unknown>[]) : null;
      const days = s.days;
      return (
        !!pets &&
        pets.length >= 1 &&
        pets.length <= 8 &&
        new Set(pets.map((p) => p?.petId)).size === pets.length &&
        pets.every(
          (p) =>
            okId(p?.petId, false) &&
            Array.isArray(p.times) &&
            p.times.length <= 12 &&
            p.times.every((t: Record<string, unknown>) => isTime(t?.time) && okText(t?.title, 60, false)),
        ) &&
        (basic ? s.title === null : okText(s.title, 60, false)) &&
        okText(s.titleEn ?? null, 60, true) &&
        (days === null ||
          (Array.isArray(days) && days.length >= 1 && days.length < 7 && days.every((d) => Number.isInteger(d) && d >= 1 && d <= 7))) &&
        (s.until === null || isDay(s.until)) &&
        okId(s.staffId, true) &&
        okText(s.note, 120, true) &&
        (basic ? s.proof === null : s.proof === "photo" || s.proof === "tick" || s.proof === "three") &&
        typeof s.remindStaff === "boolean" &&
        typeof s.alertOwners === "boolean" &&
        // Meals and potty are saved as before: every day, for anyone, no switches.
        (!basic || (days === null && s.until === null && s.staffId === null && s.note === null && !s.remindStaff && !s.alertOwners))
      );
    }
    case "food":
      return (
        okText(s.name, 80, false) &&
        typeof s.keptIn === "string" && PLACES.has(s.keptIn) &&
        (s.expiresOn === null || isDay(s.expiresOn)) &&
        typeof s.expiryUnknown === "boolean" &&
        !(s.expiryUnknown && s.expiresOn !== null) &&
        (s.source === null || (typeof s.source === "string" && SOURCES.has(s.source))) &&
        okText(s.fromWhom, 60, true) &&
        typeof s.returnContainer === "boolean" &&
        okText(s.notes, 200, true)
      );
    case "ingredient":
      return (
        okId(s.itemId, false) &&
        okText(s.name, 60, false) &&
        (s.keptIn === null || (typeof s.keptIn === "string" && PLACES.has(s.keptIn))) &&
        (s.fromPlace === null || (typeof s.fromPlace === "string" && PLACES.has(s.fromPlace))) &&
        (s.expiry === "set" ? isDay(s.expiresOn) : (s.expiry === "clear" || s.expiry === "keep") && s.expiresOn === null) &&
        typeof s.expiryIsGuess === "boolean" &&
        !(s.expiryIsGuess && s.expiry !== "set") &&
        // A card that changes nothing is never saved.
        !(s.keptIn === null && s.expiry === "keep")
      );
    case "staff_areas": {
      const lists = [s.show, s.hide, s.before, s.areas, s.nobody];
      if (!lists.every((list) => Array.isArray(list) && list.every(isStaffArea) && new Set(list).size === list.length)) {
        return false;
      }
      const show = s.show as StaffArea[];
      const hide = s.hide as StaffArea[];
      return (
        okId(s.staffId, false) &&
        okText(s.staffName, 40, false) &&
        show.length + hide.length > 0 &&
        !show.some((area) => hide.includes(area)) &&
        (s.nobody as StaffArea[]).every((area) => area === "home" || area === "pets")
      );
    }
    default:
      return false;
  }
}
