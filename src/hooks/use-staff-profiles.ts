"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dataProvider } from "@/lib/data";
import type { StaffProfile } from "@/types/database";

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
  const [profiles, setProfiles] = useState<StaffProfile[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      setProfiles(await dataProvider.listStaffProfiles());
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
