import { byPlaceOrder, topLevelRooms, withRoomsInside } from "@/lib/places";
import type { HouseholdLocation, HouseholdTask } from "@/types/database";

export { byPlaceOrder };

/**
 * The chore form's room picker and spot field (Phase 158 PR B2,
 * docs/phase-158-rooms-plan.md "The screens", 3, and "Spots inside a room").
 * Pure, so the grouping and the spot chips are tested without a browser.
 */

/** Up to this many rooms in one go: one chore is made per room. */
export const MAX_ROOMS_AT_ONCE = 12;

/** A spot is short: "Wastafel", "AC". migrations/129 checks 1–40 after trimming. */
export const MAX_SPOT_LENGTH = 40;

export interface PlaceGroup {
  /** The floor, or null for rooms with no floor. */
  floor: HouseholdLocation | null;
  /**
   * The floor itself first ("Whole floor"), then its rooms, each followed by
   * its rooms inside (Phase 168).
   */
  places: HouseholdLocation[];
}

/**
 * Floors in order, each offering itself (a whole-floor chore) and then its
 * rooms, a room's rooms inside straight after it; rooms with no floor last.
 * A household with no floors gets one group with no heading, which reads as
 * the plain list it had before floors.
 */
export function placeGroups(locations: HouseholdLocation[]): PlaceGroup[] {
  const { floors, onFloor, loose } = topLevelRooms(locations);
  const groups: PlaceGroup[] = floors.map((floor) => ({
    floor,
    places: [floor, ...withRoomsInside(onFloor(floor.id), locations).map((row) => row.place)],
  }));
  // A room whose floor isn't in the list (deleted on another phone) counts as
  // having none, rather than vanishing from the picker.
  const looseRows = withRoomsInside(loose, locations).map((row) => row.place);
  if (looseRows.length > 0) groups.push({ floor: null, places: looseRows });
  return groups;
}

/**
 * Narrows the groups to places whose label ("LT2 · Lounge", "LT2 · GB1 ·
 * Bathroom", or "LT2 · Whole floor" in the owner's words) contains every
 * word typed, so "lt2 bed" finds the LT2 bedrooms and "gb1 bath" GB1's
 * bathroom; places already picked are left out, and empty
 * groups go.
 */
export function filterGroups(
  groups: PlaceGroup[],
  query: string,
  label: (place: HouseholdLocation) => string,
  exclude: ReadonlySet<string>
): PlaceGroup[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (place: HouseholdLocation) => {
    const text = label(place).toLowerCase();
    return words.every((word) => text.includes(word));
  };
  return groups
    .map((group) => ({
      floor: group.floor,
      places: group.places.filter((place) => !exclude.has(place.id) && matches(place)),
    }))
    .filter((group) => group.places.length > 0);
}

/** A typed spot as it is saved: spaces tidied, null when blank, clipped to 40. */
export function cleanSpot(text: string): string | null {
  const tidy = text.replace(/\s+/g, " ").trim().slice(0, MAX_SPOT_LENGTH).trim();
  return tidy || null;
}

/**
 * The spots already used in these places, most used first, matched without
 * case so "wastafel" and "Wastafel" are one chip (written the way it was
 * written most often).
 */
export function spotsUsed(tasks: HouseholdTask[], placeIds: readonly string[]): string[] {
  const wanted = new Set(placeIds);
  const byKey = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const task of tasks) {
    if (!task.location_id || !wanted.has(task.location_id)) continue;
    const spot = task.spot ? cleanSpot(task.spot) : null;
    if (!spot) continue;
    const key = spot.toLowerCase();
    const entry = byKey.get(key) ?? { count: 0, spellings: new Map<string, number>() };
    entry.count += 1;
    entry.spellings.set(spot, (entry.spellings.get(spot) ?? 0) + 1);
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .map((entry) => ({
      count: entry.count,
      // The most used spelling; on a tie, the capitalised one ("Wastafel").
      text: [...entry.spellings.entries()].sort(
        (a, b) => b[1] - a[1] || capitalised(b[0]) - capitalised(a[0]) || a[0].localeCompare(b[0])
      )[0][0],
    }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, undefined, { sensitivity: "base" }))
    .map((entry) => entry.text);
}

function capitalised(text: string): number {
  const first = text.charAt(0);
  return first !== first.toLowerCase() ? 1 : 0;
}

/** The same spot whatever its case: picking a chip that matches what's set. */
export function sameSpot(a: string | null, b: string | null): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}
