// Checks a tool call the way the Kakak route will before anything reaches
// the phone (docs/phase-156-step2-kakak-plan.md, section 4, "What comes back
// to the phone"). Strict tool schemas guarantee the shape; this checks what
// they can't: lengths, HH:mm, real dates in range, and references that exist
// in this household.

import { ownerAlertTimeAllowed, reminderTimeAllowed } from "@/lib/routine-alerts";
import { ROUTINE_NOTE_MAX, routineKindInfo } from "@/lib/pet-routine-kinds";
import type { RoutineKind } from "@/types/database";
import { addDays, householdRefs, type KakakHousehold } from "./household";
import { PET_ROUTINE_TOOL_KINDS, TOOL_WEEKDAYS, type KakakToolName, type PetRoutineToolKind } from "./tools";

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTime(value: unknown): value is string {
  return typeof value === "string" && TIME.test(value);
}

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function text(
  errors: string[],
  field: string,
  value: unknown,
  { max, required }: { max: number; required: boolean },
) {
  if (value === null || value === undefined) {
    if (required) errors.push(`${field} is required`);
    return;
  }
  if (typeof value !== "string") {
    errors.push(`${field} must be text`);
    return;
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) errors.push(`${field} is empty`);
  if (trimmed.length > max) errors.push(`${field} is longer than ${max} characters`);
}

function ref(errors: string[], field: string, value: unknown, allowed: Set<string>, nullable: boolean) {
  if (value === null || value === undefined) {
    if (!nullable) errors.push(`${field} is required`);
    return;
  }
  if (typeof value !== "string" || !allowed.has(value)) {
    errors.push(`${field} ${JSON.stringify(value)} is not a reference in this household`);
  }
}

function dayInRange(errors: string[], field: string, value: unknown, from: string, to: string) {
  if (!isDay(value)) {
    errors.push(`${field} must be a real date, YYYY-MM-DD`);
    return;
  }
  if (value < from || value > to) errors.push(`${field} ${value} is outside ${from} to ${to}`);
}

/** "Remind me" (migrations/137): on the day, or 1, 3 or 7 days before. */
export const REMIND_DAYS = new Set([0, 1, 3, 7]);

export function validateToolCall(
  household: KakakHousehold,
  name: string,
  input: Record<string, unknown>,
): ValidationResult {
  const refs = householdRefs(household);
  const errors: string[] = [];
  const today = household.today;
  const inAYear = addDays(today, 366);

  switch (name as KakakToolName) {
    case "create_chore": {
      text(errors, "title", input.title, { max: 80, required: true });
      text(errors, "title_en", input.title_en, { max: 80, required: false });
      ref(errors, "assignee", input.assignee, refs.people, true);
      dayInRange(errors, "due_date", input.due_date, today, inAYear);
      if (input.due_time !== null && !isTime(input.due_time)) errors.push("due_time must be HH:mm or null");
      if (input.recurrence_until !== null) {
        dayInRange(errors, "recurrence_until", input.recurrence_until, today, addDays(today, 3 * 366));
        if (typeof input.due_date === "string" && typeof input.recurrence_until === "string" && input.recurrence_until < input.due_date) {
          errors.push("recurrence_until is before due_date");
        }
        if (input.recurrence === "none") errors.push("recurrence_until is set on a chore that doesn't repeat");
      }
      ref(errors, "room", input.room, refs.rooms, true);
      text(errors, "new_room_name", input.new_room_name, { max: 60, required: false });
      if (input.room !== null && input.new_room_name !== null) errors.push("room and new_room_name are both set");
      ref(errors, "new_room_floor", input.new_room_floor, refs.floors, true);
      if (input.new_room_floor != null && input.new_room_name == null) errors.push("new_room_floor without new_room_name");
      text(errors, "notes", input.notes, { max: 200, required: false });
      // Optional, so a call from before migrations/137 (no field) still passes.
      if (input.remind_days_before != null && !REMIND_DAYS.has(input.remind_days_before as number)) {
        errors.push("remind_days_before must be 0, 1, 3, 7 or null");
      }
      break;
    }
    case "add_to_shopping_list": {
      const items = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
      if (items.length < 1 || items.length > 10) errors.push("items must have 1 to 10 entries");
      items.forEach((item, index) => {
        ref(errors, `items[${index}].item`, item.item, refs.items, true);
        if (item.item === null) text(errors, `items[${index}].note`, item.note, { max: 120, required: true });
        else text(errors, `items[${index}].note`, item.note, { max: 120, required: false });
        ref(errors, `items[${index}].pet`, item.pet, refs.pets, true);
      });
      break;
    }
    case "add_pet_routine": {
      const pets = Array.isArray(input.pets) ? (input.pets as unknown[]) : [];
      if (pets.length < 1 || pets.length > 8) errors.push("pets must have 1 to 8 entries");
      pets.forEach((pet, index) => ref(errors, `pets[${index}]`, pet, refs.pets, false));
      if (new Set(pets).size !== pets.length) errors.push("pets repeat");
      const kind = input.kind as PetRoutineToolKind;
      if (!(PET_ROUTINE_TOOL_KINDS as readonly string[]).includes(kind)) errors.push("kind is not a routine kind");
      const times = Array.isArray(input.times) ? (input.times as unknown[]) : [];
      if (times.length < 1 || times.length > 12) errors.push("times must have 1 to 12 entries");
      if (!times.every(isTime)) errors.push("every time must be HH:mm");
      if (new Set(times).size !== times.length) errors.push("times repeat");
      if (input.days != null) {
        const days = Array.isArray(input.days) ? (input.days as unknown[]) : [];
        if (days.length < 1 || days.length > 7) errors.push("days must be null (every day) or 1 to 7 weekdays");
        if (!days.every((d) => (TOOL_WEEKDAYS as readonly unknown[]).includes(d))) errors.push("days must be mon … sun");
        if (new Set(days).size !== days.length) errors.push("days repeat");
      }
      if (input.until != null) dayInRange(errors, "until", input.until, today, addDays(today, 3 * 366));
      text(errors, "title", input.title, { max: kind === "meal" ? 40 : 60, required: kind === "other" });
      text(errors, "title_en", input.title_en, { max: 60, required: false });
      // A routine's person is someone on staff (migrations/144's trigger); the owner isn't a choice.
      ref(errors, "staff", input.staff, staffRefs(refs.people), true);
      text(errors, "note", input.note, { max: ROUTINE_NOTE_MAX, required: false });
      if (kind === "meal" || kind === "potty") {
        // Meals and potty breaks are made as before: every day, for anyone.
        const extras: string[] = ["days", "until", "staff", "note"].filter((field) => input[field] != null);
        if (input.remind_staff === true) extras.push("remind_staff");
        if (input.alert_owners === true) extras.push("alert_owners");
        if (extras.length) {
          errors.push(`${extras.join(", ")} can't be set on ${kind}: meals and potty breaks are every day, for anyone`);
        }
      } else {
        const valid = times.filter(isTime);
        if (input.remind_staff === true && valid.length && !valid.some(reminderTimeAllowed)) {
          errors.push("remind_staff: a reminder can only ring from 06:00 to 21:59; set it false and tell the owner");
        }
        if (input.alert_owners === true && valid.length && !valid.some(ownerAlertTimeAllowed)) {
          errors.push("alert_owners: only for a routine from 05:30 to 22:00; set it false and tell the owner");
        }
      }
      break;
    }
    case "add_food": {
      text(errors, "name", input.name, { max: 80, required: true });
      if (input.expires_on !== null) {
        // A label may already be past (food found at the back of the cupboard).
        dayInRange(errors, "expires_on", input.expires_on, addDays(today, -366), addDays(today, 3 * 366));
      }
      if (input.expiry_unknown === true && input.expires_on !== null) errors.push("expiry_unknown with a date");
      if (input.expiry_is_guess === true && input.expires_on === null) errors.push("expiry_is_guess without a date");
      if (input.expiry_unknown === false && input.expires_on === null) {
        errors.push("no date: either a date or expiry_unknown");
      }
      text(errors, "from_whom", input.from_whom, { max: 60, required: false });
      text(errors, "notes", input.notes, { max: 200, required: false });
      break;
    }
    case "ask_question": {
      text(errors, "question", input.question, { max: 100, required: true });
      const answers = Array.isArray(input.answers) ? (input.answers as unknown[]) : [];
      if (answers.length < 2 || answers.length > 4) errors.push("answers must have 2 to 4 entries");
      answers.forEach((answer, index) => text(errors, `answers[${index}]`, answer, { max: 24, required: true }));
      break;
    }
    default:
      errors.push(`unknown tool ${name}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/** Staff references only (S1, …): the owner (M1) can't be a routine's person. */
function staffRefs(people: Set<string>): Set<string> {
  return new Set([...people].filter((ref) => ref !== "M1"));
}

/**
 * The title a routine is saved under: the owner's for Other (or a meal's
 * label), the kind's own Indonesian name otherwise (lib/pet-routine-kinds).
 * Null for meals and potty, whose titles are per time.
 */
export function routineTitle(kind: string, title: unknown): string | null {
  if (kind === "meal" || kind === "potty") return null;
  const typed = typeof title === "string" && title.trim() ? title.trim() : null;
  return typed ?? routineKindInfo(kind as RoutineKind)?.title ?? null;
}

/**
 * The route drops a time the pet already has (and the card says so). Returns
 * the times that are new, in order. Meals and potty compare with the pet's
 * meal or potty times; another kind with a routine of the same kind (Other:
 * the same title) at that time, so "Jalan pagi 06:30" counts as a walk.
 */
export function newPetTimes(
  household: KakakHousehold,
  petRef: string,
  kind: string,
  times: string[],
  title: string | null = null,
): string[] {
  const pet = household.pets.find((p) => p.ref === petRef);
  if (!pet) return times;
  let existing: Set<string>;
  if (kind === "meal") existing = new Set(pet.meals);
  else if (kind === "potty") existing = new Set(pet.potty);
  else {
    const same = (pet.routines ?? []).filter((r) => (kind !== "other" && r.kind === kind) || (title !== null && r.title === title));
    existing = new Set(same.flatMap((r) => r.times));
  }
  return times.filter((time) => !existing.has(time));
}
