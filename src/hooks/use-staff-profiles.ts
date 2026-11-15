"use client";

import { useMemo } from "react";
import { dataProvider } from "@/lib/data";
import { createResource } from "@/lib/resource";
import type { StaffProfile } from "@/types/database";

const useRoster = createResource(() => dataProvider.listStaffProfiles());

/** Re-reads the roster after a change made outside a roster screen (Kakak's staff-areas card). */
export const reloadStaffProfiles = useRoster.reload;

/**
 * The household's roster — everyone a chore can be assigned to, admins
 * included since Phase 139 (migrations/106) — loaded on demand rather than in HouseholdContext: it is
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
  // Archived people (migrations/109) drop out of `profiles`, which is what
  // every forward-looking surface reads: the sign-in screen, assignee
  // pickers, the workload strip. They stay in `allProfiles`, which is what
  // name lookups read, so the mopping they did in March still has their name
  // on it rather than reading "Someone".
  const profiles = useMemo(
    () => (data === null ? null : data.filter((p) => !p.archived_at)),
    [data]
  );
  return { profiles, allProfiles: data, failed, reload };
}

/**
 * Resolves a staff id to a display name.
 *
 * Rows filed before Phase 71, and anything the owner did themselves, carry no
 * id — those get `fallback` rather than being attributed to a guess.
 */
export function useStaffNameLookup(
  profiles: StaffProfile[] | null,
  fallback = "Someone"
): (id: string | null | undefined) => string {
  return useMemo(() => {
    const byId = new Map((profiles ?? []).map((p) => [p.id, p.name]));
    return (id: string | null | undefined) => (id ? (byId.get(id) ?? fallback) : fallback);
  }, [profiles, fallback]);
}
