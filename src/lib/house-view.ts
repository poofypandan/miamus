import { allRoomRows, type RoomEntry, type RoomsModel } from "@/lib/rooms-view";

/**
 * Home → Rooms drawn as the house (21 Nov; Fable's 07-first-screens-audit.md,
 * "The house view", and 08-kitchen-inventory.md, decision 17): the roof, then
 * one band a floor with the top floor first, as a house stands, each room a
 * tile. Drawn only from the floors and rooms a household has already entered,
 * so there is nothing to set up.
 *
 * Flat, not a floor plan: Miamus knows which floor a room is on, not where it
 * is or how big, so the tiles sit in the order the rooms are listed. A room
 * that needs attention is amber, with its mark and the reason in words under
 * the house; amber is never the only sign.
 */

/** Fewer rooms than this keep the list: a drawing of two tiles is decoration. */
export const HOUSE_MIN_ROOMS = 3;

export interface HouseRoom {
  id: string;
  /** The room without its floor, as the floor's list shows it. */
  label: string;
  /** Where it is, for screen readers: "LT2 · GB1 · Bathroom". */
  fullName: string;
  /** A room inside a room (Phase 168): a quieter tile beside its room. */
  inside: boolean;
  /** An open repair in it, or a chore in it left from an earlier day. */
  attention: boolean;
}

export interface HouseBand {
  /** The floor's key in the rooms model, or "other" for rooms on no floor. */
  key: string;
  /** The floor's name; null for a house with no floors (one band, no name). */
  label: string | null;
  /** Something on the floor as a whole (its "Whole floor" chores or repairs). */
  attention: boolean;
  rooms: HouseRoom[];
}

export interface House {
  /** One band a floor, the top floor first; or one unnamed band of every room. */
  floors: HouseBand[];
  /** Rooms with no floor in a house that has floors: drawn under the house. */
  other: HouseBand | null;
}

/** Whether Rooms is drawn as the house: three rooms or more. */
export function showHouse(model: RoomsModel): boolean {
  return allRoomRows(model).length >= HOUSE_MIN_ROOMS;
}

function tile(entry: RoomEntry, attention: ReadonlySet<string>): HouseRoom {
  return {
    id: entry.id,
    label: entry.label,
    fullName: entry.fullName,
    inside: entry.depth === 1,
    attention: attention.has(entry.id),
  };
}

/**
 * The house from the rooms model. `attention` holds the ids of places that
 * need it: rooms, rooms inside, or a floor itself.
 */
export function buildHouse(model: RoomsModel, attention: ReadonlySet<string>): House {
  if (model.floors.length === 0) {
    return {
      floors: [
        { key: "other", label: null, attention: false, rooms: model.otherRooms.map((r) => tile(r, attention)) },
      ],
      other: null,
    };
  }
  // The model lists floors from the ground up; a house stands top floor first.
  const floors = [...model.floors].reverse().map((floor) => ({
    key: floor.key,
    label: floor.label,
    attention: attention.has(floor.whole?.id ?? floor.key),
    rooms: floor.rooms.map((r) => tile(r, attention)),
  }));
  const other = model.otherRooms.length
    ? { key: "other", label: null, attention: false, rooms: model.otherRooms.map((r) => tile(r, attention)) }
    : null;
  return { floors, other };
}

/** Every place id in the house: rooms, rooms inside, and floors. */
export function housePlaceIds(model: RoomsModel): Set<string> {
  const ids = new Set(allRoomRows(model).map((r) => r.id));
  for (const floor of model.floors) {
    ids.add(floor.key);
    if (floor.whole) ids.add(floor.whole.id);
  }
  return ids;
}
