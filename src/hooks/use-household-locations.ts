"use client";

import { useMemo } from "react";
import { dataProvider } from "@/lib/data";
import { createResource } from "@/lib/resource";
import type { HouseholdLocation } from "@/types/database";

const useRooms = createResource(() => dataProvider.listHouseholdLocations());

/**
 * The household's rooms (Phase 135), cached the way the staff roster is
 * (useStaffProfiles): the first read suspends inside the tab transition, so
 * a chore card never draws without its room and then with it; later reads
 * come from the per-household cache and refresh in the background.
 *
 * `locations` is null only on the server or after a failed first load. A
 * failure costs the room badges and nothing else — chores still render.
 */
export function useHouseholdLocations() {
  const { data, failed, reload } = useRooms();
  return { locations: data, failed, reload };
}

/**
 * A chore's place as people read it, or null for none (or one deleted):
 * "Teras", "LT2 · Lounge" for a room on a floor (migrations/129), and the
 * spot after it when the chore has one: "LT2 · GB2 Bathroom · Wastafel".
 */
export function useLocationName(): (id: string | null | undefined, spot?: string | null) => string | null {
  const { locations } = useHouseholdLocations();
  return useMemo(() => {
    const byId = new Map((locations ?? []).map((room: HouseholdLocation) => [room.id, room]));
    const label = (room: HouseholdLocation) => {
      const floor = room.parent_id ? byId.get(room.parent_id) : undefined;
      return floor ? `${floor.name} · ${room.name}` : room.name;
    };
    return (id, spot) => {
      const room = id ? byId.get(id) : undefined;
      if (!room) return null;
      const spotText = spot?.trim();
      return spotText ? `${label(room)} · ${spotText}` : label(room);
    };
  }, [locations]);
}
