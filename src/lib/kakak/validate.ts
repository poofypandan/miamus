// Checks a tool call the way the Kakak route will before anything reaches
// the phone (docs/phase-156-step2-kakak-plan.md, section 4, "What comes back
// to the phone"). Strict tool schemas guarantee the shape; this checks what
// they can't: lengths, HH:mm, real dates in range, and references that exist
// in this household.

import { addDays, householdRefs, type KakakHousehold } from "./household";
import type { KakakToolName } from "./tools";

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
      ref(errors, "pet", input.pet, refs.pets, false);
      const times = Array.isArray(input.times) ? (input.times as unknown[]) : [];
      if (times.length < 1 || times.length > 12) errors.push("times must have 1 to 12 entries");
      if (!times.every(isTime)) errors.push("every time must be HH:mm");
      if (new Set(times).size !== times.length) errors.push("times repeat");
      text(errors, "label", input.label, { max: 40, required: false });
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

/**
 * The route drops a time the pet already has (and the card says so). Returns
 * the times that are new, in order.
 */
export function newPetTimes(household: KakakHousehold, petRef: string, kind: string, times: string[]): string[] {
  const pet = household.pets.find((p) => p.ref === petRef);
  if (!pet) return times;
  const existing = new Set(kind === "meal" ? pet.meals : kind === "potty" ? pet.potty : []);
  return times.filter((time) => !existing.has(time));
}
