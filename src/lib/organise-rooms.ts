import { isSetUp, parseRoomName } from "@/lib/rooms-view";
import type { HouseholdLocation, HouseholdTask, OrganiseRoomsMoved, OrganiseRoomsPlan } from "@/types/database";

/**
 * "Sort your rooms into floors" (Phase 158 PR B, plan screen 4): turns the
 * names a household already uses ("LT2 Lounge") into stored floors and rooms,
 * in one step the owner previews first, with an exact Undo.
 *
 *   - Floors from the names' prefixes ("LT2"); a room named just "LT2"
 *     becomes that floor, so its chores become whole-floor chores (D1).
 *   - Rooms keep their names without the floor ("Lounge" on LT2) (D5: floor
 *     names stay as typed).
 *   - Optional (D6): rooms on one floor that are really parts of one room —
 *     "GB2 Bathroom Toilet", "GB2 Bathroom Wastafel" — become one room,
 *     "GB2 Bathroom", with those parts as spots on their chores. Only when the
 *     last word is a known part (toilet, sink, shower…) and what's left is at
 *     least two words or already a room, so "Master Bedroom" and "Master
 *     Lounge" are never merged into "Master".
 *   - Optional (D4): set-up chores with no room whose title starts with a
 *     room's name ("LT2 Lounge - Vacuum") are linked to it, and the room
 *     trimmed from the title. Finished history is left as it is.
 *
 * Pure: the caller sends `plan` to organise_rooms, then finishes `undo` with
 * what the database reports it moved (withMoved) for the toast's Undo.
 * Merges move every chore of a part in the database, history included, so
 * none loses its room; only the database knows them all.
 */

/** Words that name a part of a room, in the ways households write them. */
const SPOT_WORDS = new Set([
  "toilet", "wc", "kloset", "closet", "wastafel", "sink", "shower", "bathtub", "bathub", "bak",
  "cermin", "mirror", "kitchenette", "pantry", "balcony", "balkon",
]);

export interface SortPreview {
  /** "LT2 Lounge" → floor "LT2", room "Lounge" (null for a room that becomes the floor). */
  moves: { from: string; floor: string; room: string | null }[];
  /** Parts of one room merged into it, with the spot each part becomes. */
  merges: { floor: string; room: string; parts: { from: string; spot: string }[] }[];
  /** Older chores linked to their room. */
  linked: number;
}

export interface SortPlan {
  plan: OrganiseRoomsPlan;
  undo: OrganiseRoomsPlan;
  preview: SortPreview;
}

/**
 * Can "Sort your rooms into floors" help? At least two rooms named
 * floor-first, no floors yet, and no room already inside another (Phase
 * 168): the sorter moves rooms straight onto floors, which would flatten a
 * bedroom and its bathroom, and its Undo couldn't put them back (Codex, #74).
 */
export function canSortIntoFloors(locations: HouseholdLocation[]): boolean {
  if (locations.some((l) => l.kind === "floor" || l.parent_id)) return false;
  return locations.filter((l) => parseRoomName(l.name).floor !== null).length >= 2;
}

function splitPart(name: string): { base: string; spot: string } | null {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return null;
  const last = words[words.length - 1];
  if (!SPOT_WORDS.has(last.toLowerCase())) return null;
  return { base: words.slice(0, -1).join(" "), spot: last };
}

const key = (name: string) => name.trim().toLowerCase();

export function buildSortPlan(
  householdId: string,
  locations: HouseholdLocation[],
  tasks: HouseholdTask[],
  today: string,
  options: { mergeParts: boolean; linkChores: boolean },
  newId: () => string = () => crypto.randomUUID()
): SortPlan {
  const preview: SortPreview = { moves: [], merges: [], linked: 0 };
  const plan: OrganiseRoomsPlan = { household_id: householdId, places: [], merges: [], chores: [], delete: [] };
  const undo: OrganiseRoomsPlan = { household_id: householdId, places: [], chores: [], delete: [] };

  // Floors, from the prefixes, in floor order.
  type Floor = { id: string; label: string; number: number; fromRoom: HouseholdLocation | null };
  const floors = new Map<number, Floor>();
  const parsed = locations.map((location) => ({ location, ...parseRoomName(location.name) }));
  for (const p of parsed) {
    if (p.floor === null || p.floorLabel === null) continue;
    const floor = floors.get(p.floor) ?? { id: "", label: p.floorLabel, number: p.floor, fromRoom: null };
    if (p.room === null && !floor.fromRoom) {
      floor.fromRoom = p.location;
      floor.label = p.location.name.trim();
    }
    floors.set(p.floor, floor);
  }
  for (const floor of floors.values()) floor.id = floor.fromRoom?.id ?? newId();
  const floorList = [...floors.values()].sort((a, b) => a.number - b.number);

  // Rooms on each floor, by their new name; a second room that would take a
  // name already used on that floor keeps its old name and no floor.
  type Room = { location: HouseholdLocation; floor: Floor; name: string };
  const rooms: Room[] = [];
  const taken = new Map<string, Set<string>>();
  for (const p of parsed) {
    if (p.floor === null || p.room === null) continue;
    const floor = floors.get(p.floor)!;
    if (floor.fromRoom?.id === p.location.id) continue;
    const names = taken.get(floor.id) ?? new Set<string>();
    if (names.has(key(p.room))) continue;
    names.add(key(p.room));
    taken.set(floor.id, names);
    rooms.push({ location: p.location, floor, name: p.room });
  }

  // D6: parts of one room on one floor.
  const mergedInto = new Map<string, { roomId: string; spot: string }>(); // old room id → kept room + spot
  const renamedTo = new Map<string, string>(); // kept room id → its new (base) name
  if (options.mergeParts) {
    for (const floor of floorList) {
      const onFloor = rooms.filter((r) => r.floor.id === floor.id);
      const groups = new Map<string, Room[]>();
      for (const room of onFloor) {
        const part = splitPart(room.name);
        if (!part) continue;
        const list = groups.get(key(part.base)) ?? [];
        list.push(room);
        groups.set(key(part.base), list);
      }
      // A room that receives a merge is never merged away itself: with
      // "GB2 Bathroom", "… Shower" and "… Shower Cermin", Cermin joins Shower
      // and Shower stays, rather than Cermin's chores following a room that
      // is then deleted (Codex, #34).
      const receivers = new Set<string>();
      for (const [baseKey] of groups) {
        const existing = onFloor.find((r) => key(r.name) === baseKey);
        if (existing) receivers.add(existing.location.id);
      }
      for (const [baseKey, allParts] of groups) {
        const existing = onFloor.find((r) => key(r.name) === baseKey);
        const parts = allParts.filter((p) => !receivers.has(p.location.id));
        if (parts.length === 0) continue;
        const base = splitPart(parts[0].name)!.base;
        if (!existing && (parts.length < 2 || base.split(/\s+/).length < 2)) continue;
        const kept = existing ?? parts[0];
        if (!existing) renamedTo.set(kept.location.id, base);
        for (const part of parts) {
          mergedInto.set(part.location.id, { roomId: kept.location.id, spot: splitPart(part.name)!.spot });
        }
        preview.merges.push({
          floor: floor.label,
          room: existing ? existing.name : base,
          parts: parts.map((p) => ({ from: p.location.name, spot: splitPart(p.name)!.spot })),
        });
      }
    }
  }

  // The places, floors first, then rooms.
  for (const floor of floorList) {
    const sortOrder = floor.number;
    plan.places.push({ id: floor.id, name: floor.label, kind: "floor", parent_id: null, sort_order: sortOrder });
    if (floor.fromRoom) {
      preview.moves.push({ from: floor.fromRoom.name, floor: floor.label, room: null });
    } else {
      undo.delete.push(floor.id);
    }
  }
  const deleted: HouseholdLocation[] = [];
  for (const room of rooms) {
    const merge = mergedInto.get(room.location.id);
    if (merge && merge.roomId !== room.location.id) {
      deleted.push(room.location);
      continue;
    }
    const name = renamedTo.get(room.location.id) ?? room.name;
    plan.places.push({ id: room.location.id, name, parent_id: room.floor.id });
    undo.places.push({ id: room.location.id, name: room.location.name, parent_id: null });
    if (!merge) preview.moves.push({ from: room.location.name, floor: room.floor.label, room: name });
  }
  for (const room of deleted) {
    plan.delete.push(room.id);
    undo.places.push({ id: room.id, name: room.name, kind: "room", parent_id: null, sort_order: room.sort_order ?? 0 });
  }
  // Undo turns rooms-that-became-floors back last, once their rooms are off them.
  for (const floor of floorList) {
    if (floor.fromRoom) {
      undo.places.push({
        id: floor.fromRoom.id,
        name: floor.fromRoom.name,
        kind: "room",
        parent_id: null,
        sort_order: floor.fromRoom.sort_order ?? 0,
      });
    }
  }

  // Every chore of a merged part moves into the kept room with its spot, in
  // the database (history too); Undo gets them back from withMoved().
  for (const [from, merge] of mergedInto) {
    plan.merges!.push({ from, into: merge.roomId, spot: merge.spot });
  }

  // D4: set-up chores with no room whose title starts with a room's name.
  if (options.linkChores) {
    const byName = [...locations].sort((a, b) => b.name.length - a.name.length);
    for (const task of tasks) {
      if (task.location_id || !isSetUp(task, today)) continue;
      const title = task.title.trim();
      const match = byName.find((l) => {
        const n = l.name.trim();
        return title.toLowerCase().startsWith(n.toLowerCase()) && /^[\s\-–—:·,.]/.test(title.slice(n.length));
      });
      if (!match) continue;
      const rest = title.slice(match.name.trim().length).replace(/^[\s\-–—:·,.]+/, "").trim();
      if (!rest) continue;
      const merge = mergedInto.get(match.id);
      plan.chores.push({
        id: task.id,
        location_id: merge ? merge.roomId : match.id,
        ...(merge ? { spot: merge.spot } : {}),
        title: rest.slice(0, 200),
      });
      undo.chores.push({ id: task.id, location_id: null, ...(merge ? { spot: null } : {}), title: task.title });
      preview.linked += 1;
    }
  }

  return { plan, undo, preview };
}

/**
 * Undo, finished with what organise_rooms reported moving: each merged chore
 * back to its room and spot. Merged chores go first, so a linked chore's own
 * entry (if it was both) is applied last.
 */
export function withMoved(undo: OrganiseRoomsPlan, moved: OrganiseRoomsMoved[]): OrganiseRoomsPlan {
  return {
    ...undo,
    chores: [...moved.map((m) => ({ id: m.id, location_id: m.location_id, spot: m.spot })), ...undo.chores],
  };
}
