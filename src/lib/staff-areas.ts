import type { LeaveRequest, StaffProfile } from "@/types/database";
import { leaveCovering } from "./leave";

/**
 * What each staff member sees (Phase 178, step 1; migrations/165;
 * docs/phase-178-staff-areas-plan.md).
 *
 * An owner switches parts of the staff app off per person. This file works
 * out, for the person signed in on a phone and the day being viewed, which
 * parts show. It HIDES; it does not lock: the rows still reach the phone, as
 * they always have (step 2, migration 166, closes that for Kitchen and
 * Repairs on the server).
 *
 * The four areas:
 *   home     chores for Anyone (a chore given to someone by name always shows)
 *   pets     pet routines for nobody in particular; the "at the vet" lines
 *   kitchen  the Dapur pill, Menu hari ini, kitchen tips
 *   repairs  the Perbaikan pill, the supervising strip, repair tips
 *
 * The rules (plan, section 3):
 *   1. What you give someone by name always shows (showsChore, showsRoutine).
 *   2. Work for Anyone goes to the people with that area on.
 *   3. Nothing is hidden from everybody: when no staff member working that
 *      day has home (or pets) on, that unassigned work shows to all staff.
 *      Not for kitchen or repairs: nothing in them is owed by a time.
 *   4. Covering someone on leave (the leave's "Give to") brings their areas
 *      for those days only.
 *   5. A shared phone follows whoever is signed in: everything here is worked
 *      out from the person passed in, never from the phone.
 *   6. Owners are never limited: an owner's roster row sees everything.
 *   7. Lapor (reporting to the owner) stays whole for everyone.
 */

export const AREAS = ["home", "pets", "kitchen", "repairs"] as const;
export type StaffArea = (typeof AREAS)[number];

/** The areas where rule 3 applies: work in them is owed by a time. */
const NEVER_HIDDEN_FROM_EVERYBODY: readonly StaffArea[] = ["home", "pets"];

type Person = Pick<StaffProfile, "id"> &
  Partial<Pick<StaffProfile, "user_id" | "archived_at" | "hidden_areas">>;

/** Each area's name, as the owner's switches say it (English, Bahasa Indonesia). */
export const AREA_LABELS: Record<StaffArea, readonly [en: string, id: string]> = {
  home: ["Chores for anyone", "Tugas untuk siapa saja"],
  pets: ["Pet routines", "Rutinitas hewan"],
  kitchen: ["Kitchen", "Dapur"],
  repairs: ["Repairs", "Perbaikan"],
};

export function isStaffArea(value: unknown): value is StaffArea {
  return typeof value === "string" && (AREAS as readonly string[]).includes(value);
}

/** An owner's roster row (migrations/106): never limited (rule 6). */
function isOwnerRow(person: Person): boolean {
  return Boolean(person.user_id);
}

/**
 * What an owner switched off for this person, in AREAS order. A row without
 * the column (an older build's cache, or before 165) hides nothing; an
 * unknown value is ignored. An owner's row hides nothing.
 */
export function hiddenAreasOf(person: Person | null | undefined): StaffArea[] {
  if (!person || isOwnerRow(person)) return [];
  const hidden = new Set(person.hidden_areas ?? []);
  return AREAS.filter((area) => hidden.has(area));
}

/** The person's own areas, without covering anyone. */
export function ownAreas(person: Person | null | undefined): Set<StaffArea> {
  const hidden = new Set(hiddenAreasOf(person));
  return new Set(AREAS.filter((area) => !hidden.has(area)));
}

/**
 * The person's areas on `day` (YYYY-MM-DD): their own, plus those of anyone
 * whose approved leave that day gives their work to this person (rule 4).
 * An owner's roster row: all four. Nobody signed in: all four, as the staff
 * app has always shown (the page asks for a name before showing any list).
 */
export function effectiveAreas(
  person: Person | null | undefined,
  staff: readonly Person[],
  leave: readonly LeaveRequest[],
  day: string
): Set<StaffArea> {
  const areas = ownAreas(person);
  if (!person || areas.size === AREAS.length) return areas;
  for (const absent of staff) {
    if (absent.id === person.id || absent.archived_at) continue;
    const covering = leaveCovering(leave as LeaveRequest[], absent.id, day);
    if (!covering) continue;
    if (covering.fallback_action !== "reassign" || covering.fallback_assignee_id !== person.id) continue;
    for (const area of ownAreas(absent)) areas.add(area);
  }
  return areas;
}

/**
 * Rule 3: true when, on `day`, no staff member who is working (on the
 * roster, not on leave that day, not an owner's row) has `area` on, counting
 * the areas they bring by covering someone. Always false for kitchen and
 * repairs.
 */
export function areaHasNobody(
  area: StaffArea,
  staff: readonly Person[],
  leave: readonly LeaveRequest[],
  day: string
): boolean {
  if (!NEVER_HIDDEN_FROM_EVERYBODY.includes(area)) return false;
  return !staff.some(
    (person) =>
      !isOwnerRow(person) &&
      !person.archived_at &&
      !leaveCovering(leave as LeaveRequest[], person.id, day) &&
      effectiveAreas(person, staff, leave, day).has(area)
  );
}

/** Whether `area` shows for `person` on `day` (rules 2 to 6). */
export function sees(
  area: StaffArea,
  person: Person | null | undefined,
  staff: readonly Person[],
  leave: readonly LeaveRequest[],
  day: string
): boolean {
  if (effectiveAreas(person, staff, leave, day).has(area)) return true;
  return areaHasNobody(area, staff, leave, day);
}

/** Everything the staff page needs to know, worked out once per render. */
export interface StaffVisibility {
  home: boolean;
  pets: boolean;
  kitchen: boolean;
  repairs: boolean;
  /** Rule 7: the Lapor button keeps all its reports, whatever is off. */
  lapor: true;
}

export function staffVisibility(
  person: Person | null | undefined,
  staff: readonly Person[],
  leave: readonly LeaveRequest[],
  day: string
): StaffVisibility {
  const areas = effectiveAreas(person, staff, leave, day);
  const shows = (area: StaffArea) => areas.has(area) || areaHasNobody(area, staff, leave, day);
  return { home: shows("home"), pets: shows("pets"), kitchen: shows("kitchen"), repairs: shows("repairs"), lapor: true };
}

/**
 * Rules 1 and 2 for a chore: one assigned to this person always shows; one
 * assigned to someone else never does (as before); one for Anyone shows with
 * `home`.
 */
export function showsChore(
  assignedTo: string | null | undefined,
  personId: string | null | undefined,
  visibility: Pick<StaffVisibility, "home">
): boolean {
  if (assignedTo) return assignedTo === personId;
  return visibility.home;
}

/**
 * Rules 1 and 2 for a pet routine: one set for this person
 * (master_schedules.staff_id) always shows; any other shows with `pets`.
 */
export function showsRoutine(
  routineStaffId: string | null | undefined,
  personId: string | null | undefined,
  visibility: Pick<StaffVisibility, "pets">
): boolean {
  if (routineStaffId && routineStaffId === personId) return true;
  return visibility.pets;
}

/**
 * The stored list after an owner flips one switch: what is hidden, in AREAS
 * order, unknown values dropped.
 */
export function withArea(hidden: readonly string[] | null | undefined, area: StaffArea, on: boolean): StaffArea[] {
  const next = new Set((hidden ?? []).filter(isStaffArea));
  if (on) next.delete(area);
  else next.add(area);
  return AREAS.filter((a) => next.has(a));
}

/**
 * The stored list after several areas change at once (Kakak's card, Phase
 * 178 follow-up): `show` taken off what is hidden, `hide` added, in AREAS
 * order, unknown values dropped. Worked out on top of the latest list, so an
 * area the change doesn't name stays as it is.
 */
export function withAreas(
  hidden: readonly string[] | null | undefined,
  show: readonly StaffArea[],
  hide: readonly StaffArea[]
): StaffArea[] {
  const next = new Set((hidden ?? []).filter(isStaffArea));
  for (const area of show) next.delete(area);
  for (const area of hide) next.add(area);
  return AREAS.filter((a) => next.has(a));
}
