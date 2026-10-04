"use client";

import { useMemo } from "react";
import { dataProvider } from "@/lib/data";
import { createResource } from "@/lib/resource";
import type { StaffProfile } from "@/types/database";

const useRoster = createResource(() => dataProvider.listStaffProfiles());

/**
 * The staff roster, loaded on demand rather than in HouseholdContext: it is
 * read by the owner's Agenda, Chores and Access tabs, the chore editor and
 * the staff view, and nothing else needs it.
 *
 * A Suspense resource since Phase 125 (lib/resource): the first read
 * suspends, so a tab switching in during a transition waits for the names
 * off screen instead of drawing "Staff" and then "Ari"; after that it is
 * served from a per-household cache and refreshed in the background.
 *
 * `profiles` is null only on the server or after a failed first load —
 * distinct from an empty roster, which is a real (if unlikely) answer.
 */
export function useStaffProfiles() {
  const { data, failed, reload } = useRoster();
  return { profiles: data, failed, reload };
}

/**
 * Resolves a staff id to a display name.
 *
 * Rows filed before Phase 71, and anything the owner did themselves, carry no
 * id — those get `fallback` rather than being attributed to a guess.
 */
export function useStaffNameLookup(
  profiles: StaffProfile[] | null,
  fallback = "Staff"
): (id: string | null | undefined) => string {
  return useMemo(() => {
    const byId = new Map((profiles ?? []).map((p) => [p.id, p.name]));
    return (id: string | null | undefined) => (id ? (byId.get(id) ?? fallback) : fallback);
  }, [profiles, fallback]);
}
