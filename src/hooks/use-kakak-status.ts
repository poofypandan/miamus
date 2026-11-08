"use client";

import { useCallback, useEffect, useState } from "react";
import { useHousehold } from "@/context/household-context";
import { supabase } from "@/lib/supabase/client";

export interface KakakStatus {
  /** On the family list (set by the platform admin). */
  allowed: boolean;
  /** An owner turned Kakak on for the household. */
  enabled: boolean;
  enabledBy: string | null;
  enabledAt: string | null;
  callsLeft: number;
}

/**
 * Whether Kakak can be used in this household, from kakak_status
 * (migrations/126). Null while loading, for a staff phone (the function
 * refuses anyone who is not an admin of the household), offline, or on a
 * build without Supabase: Kakak's button and settings row stay hidden, and
 * Today looks exactly as it did before.
 */
export function useKakakStatus() {
  const { activeHouseholdId, isHouseholdMember, tenantReady } = useHousehold();
  const [status, setStatus] = useState<KakakStatus | null>(null);

  const reload = useCallback(async () => {
    if (!supabase || !tenantReady || !isHouseholdMember) {
      setStatus(null);
      return;
    }
    const { data, error } = await supabase.rpc("kakak_status", { p_household: activeHouseholdId });
    const row = !error && Array.isArray(data) ? data[0] : undefined;
    setStatus(
      row
        ? {
            allowed: row.allowed,
            enabled: row.enabled,
            enabledBy: row.enabled_by,
            enabledAt: row.enabled_at,
            callsLeft: row.calls_left,
          }
        : null,
    );
  }, [activeHouseholdId, isHouseholdMember, tenantReady]);

  useEffect(() => {
    let cancelled = false;
    void reload().catch(() => {
      if (!cancelled) setStatus(null);
    });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return { status, reload };
}

/** Turns Kakak on or off for the household (admins only, where allowed). */
export async function setKakakEnabled(householdId: string, on: boolean): Promise<void> {
  if (!supabase) throw new Error("No connection to Miamus");
  const { error } = await supabase.rpc("set_kakak_enabled", { p_household: householdId, p_on: on });
  if (error) throw error;
}
