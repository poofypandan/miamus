import type { HouseholdLocation, HouseholdTask } from "@/types/database";

/**
 * The chore form's room picker and spot field (Phase 158 PR B2,
 * docs/phase-158-rooms-plan.md "The screens", 3, and "Spots inside a room").
 * Pure, so the grouping and the spot chips are tested without a browser.
 */

/** Up to this many rooms in one go: one chore is made per room. */
export const MAX_ROOMS_AT_ONCE = 12;

/** A spot is short: "Wastafel", "AC". migrations/129 checks 1–40 after trimming. */
export const MAX_SPOT_LENGTH = 40;

/** Floors and rooms in the order the Rooms page keeps: its arrows, then name. */
export function byPlaceOrder(a: HouseholdLocation, b: HouseholdLocation): number {
  return (
    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
}

export interface PlaceGroup {
  /** The floor, or null for rooms with no floor. */
  floor: HouseholdLocation | null;
  /** The floor itself first ("Whole floor"), then its rooms. */
  places: HouseholdLocation[];
}

/**
 * Floors in order, each offering itself (a whole-floor chore) and then its
 * rooms; rooms with no floor last. A household with no floors gets one group
 * with no heading, which reads as the plain list it had before floors.
 */
export function placeGroups(locations: HouseholdLocation[]): PlaceGroup[] {
  const floors = locations.filter((place) => place.kind === "floor").sort(byPlaceOrder);
  const floorIds = new Set(floors.map((floor) => floor.id));
  const groups: PlaceGroup[] = floors.map((floor) => ({
    floor,
    places: [
      floor,
      ...locations
        .filter((place) => place.kind !== "floor" && place.parent_id === floor.id)
        .sort(byPlaceOrder),
    ],
  }));
  // A room whose floor isn't in the list (deleted on another phone) counts as
  // having none, rather than vanishing from the picker.
  const loose = locations
    .filter((place) => place.kind !== "floor" && !(place.parent_id && floorIds.has(place.parent_id)))
    .sort(byPlaceOrder);
  if (loose.length > 0) groups.push({ floor: null, places: loose });
  return groups;
}

/**
 * Narrows the groups to places whose label ("LT2 · Lounge", or "LT2 · Whole
 * floor" in the owner's words) contains every word typed, so "lt2 bed"
 * finds the LT2 bedrooms; places already picked are left out, and empty
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
