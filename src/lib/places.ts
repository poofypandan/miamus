import type { HouseholdLocation } from "@/types/database";

/**
 * Where a place is (Phase 168, docs/phase-168-suites-plan.md): floor → room →
 * room inside, never deeper. The database allows a room inside a top-level
 * room only (migration "rooms inside rooms"); these helpers read that shape
 * and build the one path every screen shows: "LT2 · GB1 · Bathroom".
 *
 * Pure, so the paths and the groupings are tested without a browser.
 */

export type PlaceMap = ReadonlyMap<string, HouseholdLocation>;

export function placeMap(locations: readonly HouseholdLocation[]): PlaceMap {
  return new Map(locations.map((place) => [place.id, place]));
}

export function isFloor(place: HouseholdLocation): boolean {
  return place.kind === "floor";
}

/** Floors and rooms in the order the Rooms page keeps: its arrows, then name. */
export function byPlaceOrder(a: HouseholdLocation, b: HouseholdLocation): number {
  return (
    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );
}

/** The room this room sits inside, or null (on a floor, on no floor, or its room is gone). */
export function outerRoomOf(place: HouseholdLocation, byId: PlaceMap): HouseholdLocation | null {
  if (isFloor(place) || !place.parent_id) return null;
  const parent = byId.get(place.parent_id);
  return parent && !isFloor(parent) ? parent : null;
}

/** The floor a room is on, through its outer room for a room inside; null for none. */
export function floorOf(place: HouseholdLocation, byId: PlaceMap): HouseholdLocation | null {
  if (isFloor(place) || !place.parent_id) return null;
  const parent = byId.get(place.parent_id);
  if (!parent) return null;
  if (isFloor(parent)) return parent;
  const grand = parent.parent_id ? byId.get(parent.parent_id) : undefined;
  return grand && isFloor(grand) ? grand : null;
}

/** The names from the top: ["LT2", "GB1", "Bathroom"], ["LT2", "Lounge"], ["Teras"]. */
export function placePath(place: HouseholdLocation, byId: PlaceMap): string[] {
  const outer = outerRoomOf(place, byId);
  const floor = floorOf(place, byId);
  return [floor?.name, outer?.name, place.name].filter((name): name is string => !!name);
}

/** The path as people read it: "LT2 · GB1 · Bathroom". */
export function placeLabel(place: HouseholdLocation, byId: PlaceMap): string {
  return placePath(place, byId).join(" · ");
}

/** A room's rooms inside, in the Rooms page's order. */
export function roomsInside(locations: readonly HouseholdLocation[], roomId: string): HouseholdLocation[] {
  return locations.filter((place) => !isFloor(place) && place.parent_id === roomId).sort(byPlaceOrder);
}

/** A room on a floor or on no floor (not inside another room): the only kind that can hold rooms. */
export function isTopLevelRoom(place: HouseholdLocation, byId: PlaceMap): boolean {
  return !isFloor(place) && !outerRoomOf(place, byId);
}

/**
 * The rooms a room could go inside, on this floor (null: rooms with no
 * floor): top-level rooms there, never the room itself. None at all when
 * the room holds rooms of its own, since only one level is allowed.
 */
export function insideChoices(
  locations: readonly HouseholdLocation[],
  room: HouseholdLocation | null,
  floorId: string | null
): HouseholdLocation[] {
  if (room && roomsInside(locations, room.id).length > 0) return [];
  const byId = placeMap(locations);
  const floorIds = new Set(locations.filter(isFloor).map((floor) => floor.id));
  return locations
    .filter((place) => {
      if (isFloor(place) || place.id === room?.id) return false;
      if (!isTopLevelRoom(place, byId)) return false;
      const onFloor = place.parent_id && floorIds.has(place.parent_id) ? place.parent_id : null;
      return onFloor === floorId;
    })
    .sort(byPlaceOrder);
}

/** A room and then its rooms inside, for lists that indent them. */
export interface PlaceRow {
  place: HouseholdLocation;
  /** 0 for a room on its floor (or on no floor), 1 for a room inside. */
  depth: 0 | 1;
}

/**
 * Top-level rooms in order, each followed by its rooms inside. `rooms` is the
 * top-level rooms of one floor (or of no floor); rooms inside are found in
 * `locations`.
 */
export function withRoomsInside(
  rooms: readonly HouseholdLocation[],
  locations: readonly HouseholdLocation[]
): PlaceRow[] {
  return [...rooms]
    .sort(byPlaceOrder)
    .flatMap((room) => [
      { place: room, depth: 0 as const },
      ...roomsInside(locations, room.id).map((inner) => ({ place: inner, depth: 1 as const })),
    ]);
}

/**
 * The top-level rooms of each floor and of no floor. A room whose floor is
 * gone (deleted on another phone) counts as having none; a room inside a
 * room that is gone counts as a top-level room with no floor, so nothing
 * vanishes from a list.
 */
export function topLevelRooms(locations: readonly HouseholdLocation[]): {
  floors: HouseholdLocation[];
  onFloor: (floorId: string) => HouseholdLocation[];
  loose: HouseholdLocation[];
} {
  const byId = placeMap(locations);
  const floors = locations.filter(isFloor).sort(byPlaceOrder);
  const floorIds = new Set(floors.map((floor) => floor.id));
  const top = locations.filter((place) => isTopLevelRoom(place, byId));
  return {
    floors,
    onFloor: (floorId) => top.filter((room) => room.parent_id === floorId).sort(byPlaceOrder),
    loose: top.filter((room) => !(room.parent_id && floorIds.has(room.parent_id))).sort(byPlaceOrder),
  };
}

/**
 * The name a room inside takes when it comes out of its room by hand:
 * "Bathroom" out of GB1 → "GB1 Bathroom", as deleting GB1 would name it.
 * Within the 60 characters the database allows.
 */
export function nameOutside(outer: HouseholdLocation, room: HouseholdLocation): string {
  return `${outer.name.trim()} ${room.name.trim()}`.slice(0, 60).trim();
}
