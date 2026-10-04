"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dataProvider } from "@/lib/data";
import { useTransitionHold } from "@/lib/tab-transition";
import { getActiveHouseholdId } from "@/lib/tenant";
import type { StaffProfile } from "@/types/database";

/**
 * The last roster loaded, per household — keyed so a device that changes
 * household can never seed one household's names into another's screens.
 * Memory only: it lasts the page session, and a launch starts empty.
 */
const rosterCache = new Map<string, StaffProfile[]>();

/**
 * The staff roster, loaded on demand rather than in HouseholdContext: it is
 * read by the owner's Staff tab, the chore panel and the staff login gate, and
 * nothing else in the app needs it on every page.
 *
 * `profiles` is null until the first load settles — distinct from an empty
 * roster, which is a real (if unlikely) answer, so callers can tell "not yet"
 * from "nobody".
 */
export function useStaffProfiles() {
  // Seeded from the last roster this household loaded (Phase 124), so a tab
  // that mounts again — the Chores tab, every switch — shows names on its
  // first render instead of "Staff" for a network round trip. Still fetched
  // fresh on every mount; the cache only fills the wait.
  const [profiles, setProfiles] = useState<StaffProfile[] | null>(
    () => rosterCache.get(getActiveHouseholdId()) ?? null
  );
  const [failed, setFailed] = useState(false);

  // With nothing cached, names resolve when the fetch lands; a tab cover
  // stays up for it rather than lifting onto "Staff" and swapping to "Ari".
  useTransitionHold(profiles === null && !failed);

  const reload = useCallback(async () => {
    try {
      const fresh = await dataProvider.listStaffProfiles();
      rosterCache.set(getActiveHouseholdId(), fresh);
      setProfiles(fresh);
      setFailed(false);
    } catch (err) {
      console.error(err);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profiles, failed, reload };
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
