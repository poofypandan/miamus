"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/context/household-context";

/** Shown wherever a household's own name is not known (yet, or at all). */
export const APP_NAME = "Miamus";

const CACHE_PREFIX = "miamus_household_name:";

function readCached(householdId: string): string | null {
  try {
    return window.localStorage.getItem(CACHE_PREFIX + householdId);
  } catch {
    return null;
  }
}

/**
 * The active household's own name, for the header and the staff splash
 * (Phase 107).
 *
 * This used to be a constant — one residence's name, shown to every tenant.
 * It is now read from `households`, which RLS scopes to the household's own
 * members and bound devices (migrations/098).
 *
 * Shows APP_NAME until the tenant is resolved, never the default household's
 * name: that placeholder id is not this device's household until proven so.
 * Cached per household so the header paints the right name on the next launch
 * without waiting on the network, matching the snapshot cache's behaviour.
 */
export function useHouseholdName(): string {
  const { activeHouseholdId, tenantReady } = useHousehold();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantReady) return;
    let cancelled = false;
    setName(readCached(activeHouseholdId));

    void (async () => {
      const { supabase } = await import("@/lib/supabase/client");
      // Mock mode has no households table; APP_NAME is the honest answer.
      if (!supabase) return;
      const { data } = await supabase
        .from("households")
        .select("name")
        .eq("id", activeHouseholdId)
        .maybeSingle();
      if (cancelled) return;
      const fresh = data?.name?.trim() || null;
      // A failed or denied read keeps whatever was cached rather than blanking
      // a name the device has legitimately shown before.
      if (!fresh) return;
      setName(fresh);
      try {
        window.localStorage.setItem(CACHE_PREFIX + activeHouseholdId, fresh);
      } catch {
        // Blocked storage: the name is still shown, just fetched each launch.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeHouseholdId, tenantReady]);

  return name ?? APP_NAME;
}
