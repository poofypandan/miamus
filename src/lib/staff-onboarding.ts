/**
 * Adding a staff member in one go (staff onboarding plan, step 2;
 * docs/private/staff-onboarding-plan.md, section 2a). Pure: the Add staff
 * sheet (components/dashboard/add-staff-sheet.tsx) draws from it, and
 * Kakak's add_staff card will fill the same sheet (step 5).
 *
 *   1. A name, the only thing typed.
 *   2. What they do: chips that ARE the staff areas (lib/staff-areas.ts), in
 *      plain words. What isn't picked is switched off, so a new person no
 *      longer starts out seeing everything. No job title (owner decision 8).
 *   3. With Kitchen picked, the kitchen's usual chores from the setup
 *      templates, given to them by name, so they show even to someone who
 *      only sees Kitchen (staff areas rule 1). Chores for anyone already
 *      reach whoever has Chores on (rule 2), so Chores needs no list.
 *   4. One all-or-nothing save through apply_household_setup
 *      (migrations/147): the person and their new chores together.
 */
import { CHORES, firstDue, nameKey, repeatOf, type ApplyPayload } from "@/lib/setup-templates";
import { isSetUp } from "@/lib/rooms-view";
import { AREAS, ownAreas, type StaffArea } from "@/lib/staff-areas";
import type { ChoreRecurrence, HouseholdLocation, HouseholdTask, HouseholdTaskCategory, StaffProfile } from "@/types/database";

/** The chips, in the order the sheet shows them. */
export const STAFF_JOBS: readonly StaffArea[] = ["kitchen", "home", "pets", "repairs"];

/** Each chip in plain words (English, Bahasa Indonesia). */
export const STAFF_JOB_LABELS: Record<StaffArea, readonly [en: string, id: string]> = {
  kitchen: ["Kitchen", "Dapur"],
  home: ["Chores", "Tugas rumah"],
  pets: ["Pets", "Hewan"],
  repairs: ["Repairs", "Perbaikan"],
};

/** What the new person won't see: every area that wasn't picked, in AREAS order. */
export function hiddenAreasFor(chosen: Iterable<StaffArea>): StaffArea[] {
  const on = new Set(chosen);
  return AREAS.filter((area) => !on.has(area));
}

/** The draft key of the new person in the apply payload. */
export const NEW_STAFF_KEY = "s:new";

/** The longest name the roster takes (migrations/147 checks 1 to 40). */
export const STAFF_NAME_MAX = 40;

/** A name as it is saved: trimmed, inner spaces folded (as apply_household_setup does). */
export function cleanStaffName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/**
 * Someone on the staff list now with this name (case and spaces ignored).
 * apply_household_setup would take that person rather than add a second
 * one, so the sheet says so instead.
 */
export function staffWithName(name: string, roster: readonly StaffProfile[]): StaffProfile | null {
  const key = nameKey(cleanStaffName(name));
  if (!key) return null;
  return roster.find((p) => !p.user_id && !p.archived_at && nameKey(p.name) === key) ?? null;
}

export interface StarterChore {
  key: string;
  /** As saved and as staff read it. */
  title: string;
  /** The meaning, for an English-speaking owner. */
  en: string;
  recurrence: ChoreRecurrence;
  interval: number;
  weekday: number | null;
  dueDate: string;
  category: HouseholdTaskCategory;
  /** The household's own room, or null (the whole house). */
  placeId: string | null;
  /** Ticked when the sheet opens. */
  ticked: boolean;
  /**
   * The household already has it, still going: ticking it moves that chore to
   * the new person instead of adding a second one. Unticked by default.
   */
  existing: { id: string; assignedTo: string | null } | null;
}

const KITCHEN_NAMES = new Set(["dapur", "kitchen", "dapur bersih"]);
const WET_KITCHEN_NAMES = new Set(["dapur kotor", "wet kitchen"]);

function roomNamed(locations: readonly HouseholdLocation[], names: ReadonlySet<string>): HouseholdLocation | null {
  return locations.find((l) => (l.kind ?? "room") === "room" && names.has(nameKey(l.name))) ?? null;
}

/**
 * The kitchen's usual chores for a new person: washing up, the kitchen and
 * stove, the fridge, and the wet kitchen when the home has one, ticked;
 * three more (owner decision 6) unticked. Each goes in the household's own
 * kitchen when it has one. One the household already has, still going, is
 * offered as a move, unticked.
 */
export function kitchenStarters({
  locations,
  chores,
  today,
}: {
  locations: readonly HouseholdLocation[];
  chores: readonly HouseholdTask[];
  today: string;
}): StarterChore[] {
  const kitchen = roomNamed(locations, KITCHEN_NAMES);
  const wet = roomNamed(locations, WET_KITCHEN_NAMES);
  const going = chores.filter((c) => isSetUp(c, today));
  const list: { chore: (typeof CHORES)[keyof typeof CHORES]; place: HouseholdLocation | null; ticked: boolean }[] = [
    { chore: CHORES.dishes, place: kitchen, ticked: true },
    { chore: CHORES.kitchen, place: kitchen, ticked: true },
    { chore: CHORES.fridge, place: kitchen, ticked: true },
    ...(wet ? [{ chore: CHORES.wetKitchen, place: wet, ticked: true }] : []),
    { chore: CHORES.prepTomorrow, place: kitchen, ticked: false },
    { chore: CHORES.kitchenTrash, place: kitchen, ticked: false },
    { chore: CHORES.freezer, place: kitchen, ticked: false },
  ];
  return list.map(({ chore, place, ticked }) => {
    const repeat = repeatOf(chore.cadence);
    const same = going.find((c) => nameKey(c.title) === nameKey(chore.title.id));
    return {
      key: chore.key,
      title: chore.title.id,
      en: chore.title.en,
      recurrence: repeat.recurrence,
      interval: repeat.interval,
      weekday: repeat.weekday,
      dueDate: firstDue(chore.cadence, today),
      category: chore.category,
      placeId: place?.id ?? null,
      ticked: same ? false : ticked,
      existing: same ? { id: same.id, assignedTo: same.assigned_to ?? null } : null,
    };
  });
}

/**
 * The household's own places for these ids, as apply_household_setup takes
 * them: by name under the same parent, so it finds the same rows again and
 * adds nothing. A place whose chain can't be followed to the top is left
 * out (its chore then goes to the whole house rather than a new room).
 */
function placesFor(ids: Iterable<string>, locations: readonly HouseholdLocation[]) {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const keyOf = new Map<string, string>();
  const floors: ApplyPayload["floors"] = [];
  const rooms: (ApplyPayload["rooms"][number] & { depth: number })[] = [];
  for (const id of ids) {
    const chain: HouseholdLocation[] = [];
    let at = byId.get(id);
    let broken = false;
    while (at) {
      chain.unshift(at);
      if (!at.parent_id) break;
      const up = byId.get(at.parent_id);
      if (!up || chain.length >= 10) {
        broken = true;
        break;
      }
      at = up;
    }
    if (chain.length === 0 || broken) continue;
    chain.forEach((place, depth) => {
      if (keyOf.has(place.id)) return;
      if (depth === 0 && place.kind === "floor") {
        keyOf.set(place.id, `f:${place.id.slice(0, 26)}`);
        floors.push({ key: keyOf.get(place.id)!, name: place.name });
      } else {
        keyOf.set(place.id, `r:${place.id.slice(0, 26)}`);
        rooms.push({ key: keyOf.get(place.id)!, name: place.name, parent: depth === 0 ? null : keyOf.get(chain[depth - 1].id)!, depth });
      }
    });
  }
  rooms.sort((a, b) => a.depth - b.depth);
  return { keyOf, floors, rooms: rooms.map(({ key, name, parent }) => ({ key, name, parent })) };
}

/** What Add sends: the person and their new chores, in one call. Moves are separate. */
export function addStaffPayload({
  name,
  starters,
  ticked,
  locations,
}: {
  name: string;
  starters: readonly StarterChore[];
  ticked: ReadonlySet<string>;
  locations: readonly HouseholdLocation[];
}): ApplyPayload {
  const fresh = starters.filter((s) => ticked.has(s.key) && !s.existing);
  const places = placesFor(
    fresh.flatMap((s) => (s.placeId ? [s.placeId] : [])),
    locations
  );
  return {
    v: 1,
    floors: places.floors,
    rooms: places.rooms,
    staff: [{ key: NEW_STAFF_KEY, name: cleanStaffName(name) }],
    chores: fresh.map((s) => ({
      title: s.title,
      place: s.placeId ? (places.keyOf.get(s.placeId) ?? null) : null,
      recurrence: s.recurrence,
      interval: s.interval,
      due_date: s.dueDate,
      category: s.category,
      assignee: { staff: NEW_STAFF_KEY },
      remind: null,
    })),
  };
}

/** The household's chores to move to the new person: ticked and already there. */
export function choresToMove(starters: readonly StarterChore[], ticked: ReadonlySet<string>): string[] {
  return starters.filter((s) => ticked.has(s.key) && s.existing).map((s) => s.existing!.id);
}

// --- Step 4: when someone leaves ---------------------------------------------------------

/** On the staff list now: not an owner's row, not archived. */
function onStaff(p: Pick<StaffProfile, "user_id" | "archived_at">): boolean {
  return !p.user_id && !p.archived_at;
}

/**
 * Who should take a leaving person's work (owner decision 7): the one other
 * staff member who shares their area, Kitchen first, then Pets, Chores and
 * Repairs; null (Anyone) when nobody does, or when two could. The owner
 * changes it with one tap either way.
 */
export function suggestGiveTo(leaving: StaffProfile, roster: readonly StaffProfile[]): string | null {
  const others = roster.filter((p) => onStaff(p) && p.id !== leaving.id);
  const mine = ownAreas(leaving);
  for (const area of ["kitchen", "pets", "home", "repairs"] as const) {
    if (!mine.has(area)) continue;
    const withIt = others.filter((p) => ownAreas(p).has(area));
    if (withIt.length === 1) return withIt[0].id;
    if (withIt.length > 1) return null;
  }
  return null;
}

/** Who can take the work: everyone else on the staff list. */
export function giveToChoices(leaving: StaffProfile, roster: readonly StaffProfile[]): StaffProfile[] {
  return roster.filter((p) => onStaff(p) && p.id !== leaving.id);
}

/**
 * Added, or brought back, less than 7 days ago: the welcome link can still
 * claim the name (migrations/147, 180).
 */
export function isClaimable(person: Pick<StaffProfile, "created_at" | "claimable_from">, now = Date.now()): boolean {
  const from = person.claimable_from ?? person.created_at;
  if (!from) return false;
  const at = new Date(from).getTime();
  return Number.isFinite(at) && now - at < 7 * 24 * 60 * 60 * 1000;
}

/** Someone who left, with the name still kept (not yet "Former staff"), matched by name. */
export function formerStaffWithName(name: string, roster: readonly StaffProfile[]): StaffProfile | null {
  const key = nameKey(cleanStaffName(name));
  if (!key) return null;
  return roster.find((p) => !p.user_id && p.archived_at && !p.forgotten_at && nameKey(p.name) === key) ?? null;
}
