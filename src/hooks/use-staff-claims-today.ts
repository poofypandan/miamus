"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/context/household-context";

/**
 * Who picked their name and made a PIN today (Phase 172 PR A2, D10;
 * migrations/146 staff_claims_today), for Today's quiet line "Sari's phone
 * is linked". Owners only; read again whenever the household refreshes. A
 * failed read shows nothing.
 */
export function useStaffClaimsToday(): string[] {
  const { activeHouseholdId, tenantReady, userRole, householdTasks } = useHousehold();
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!tenantReady || userRole !== "owner") return;
    let live = true;
    void (async () => {
      const { supabase } = await import("@/lib/supabase/client");
      if (!supabase) return;
      const { data, error } = await supabase.rpc("staff_claims_today", { p_household: activeHouseholdId });
      if (!live) return;
      if (error) {
        console.error("Could not read today's linked phones", error);
        return;
      }
      setNames(((data ?? []) as { name: string }[]).map((row) => row.name).filter(Boolean));
    })();
    return () => {
      live = false;
    };
    // householdTasks: a refresh (pull, foreground) reads it again.
  }, [activeHouseholdId, tenantReady, userRole, householdTasks]);
  return names;
}
