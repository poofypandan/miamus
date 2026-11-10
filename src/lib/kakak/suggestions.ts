// Turns Kakak's checked tool calls into suggestions the phone can show and
// save (docs/phase-156-step2-kakak-plan.md, section 3, the "Mapping" under
// each tool). References become database ids here, on the server; the phone
// gets ready-to-save inputs for the same HouseholdProvider actions used by
// hand, plus the names to show on the card.
//
// Shared by the route (building) and the phone (checking again before
// saving), so it imports nothing server-only.

import type { RefMap, RefNames } from "./context";
import type { KakakHousehold } from "./household";
import { REMIND_DAYS, isDay, isTime, newPetTimes } from "./validate";

export type ChoreCategory = "cleaning" | "maintenance" | "errand" | "groceries";
export type ChoreRecurrence = "none" | "daily" | "weekly" | "monthly";
export type FoodPlace = "fridge" | "freezer" | "pantry" | "counter";
export type FoodSource = "home" | "gift" | "bought";

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

export interface PetRoutineSuggestion {
  kind: "pet_routine";
  petId: string;
  petName: string;
  routine: "meal" | "potty";
  /** New times only, HH:mm, each with the title it will be saved under. */
  times: { time: string; title: string }[];
  /** Times Kakak suggested that the pet already has: shown, not saved. */
  alreadyThere: string[];
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

export type KakakSuggestion = ChoreSuggestion | ShoppingSuggestion | PetRoutineSuggestion | FoodSuggestion;

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
      const pet = String(input.pet);
      const routine = input.kind === "potty" ? "potty" : "meal";
      const asked = (Array.isArray(input.times) ? (input.times as string[]) : []).filter(isTime);
      const fresh = newPetTimes(household, pet, routine, asked).sort();
      const label = str(input.label);
      return {
        kind: "pet_routine",
        petId: refs.pets[pet],
        petName: names.pets[pet],
        routine,
        times: fresh.map((time) => ({
          time,
          title: routine === "potty" ? POTTY_TITLE : (label ?? mealLabelForTime(time)),
        })),
        alreadyThere: asked.filter((time) => !fresh.includes(time)).sort(),
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
    default:
      return null;
  }
}

const CATEGORIES = new Set(["cleaning", "maintenance", "errand", "groceries"]);
const RECURRENCES = new Set(["none", "daily", "weekly", "monthly"]);
const PLACES = new Set(["fridge", "freezer", "pantry", "counter"]);
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
    case "pet_routine":
      return (
        okId(s.petId, false) &&
        (s.routine === "meal" || s.routine === "potty") &&
        Array.isArray(s.times) &&
        s.times.length <= 12 &&
        s.times.every((t: Record<string, unknown>) => isTime(t?.time) && okText(t?.title, 40, false))
      );
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
    default:
      return false;
  }
}
