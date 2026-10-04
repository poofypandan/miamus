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

/** A chore's room name by id, or null — for one with none, or one deleted. */
export function useLocationName(): (id: string | null | undefined) => string | null {
  const { locations } = useHouseholdLocations();
  return useMemo(() => {
    const byId = new Map((locations ?? []).map((room: HouseholdLocation) => [room.id, room.name]));
    return (id) => (id ? (byId.get(id) ?? null) : null);
  }, [locations]);
}
