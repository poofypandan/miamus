"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/context/household-context";

/**
 * Who picked their name and made a PIN today (Phase 172 PR A2, D10;
 * migrations/147 staff_claims_today), for Today's quiet line "Sari's phone
 * is linked". Owners only. A failed read shows nothing.
 */
export type LinkedToday = { staffId: string; name: string };

export function useStaffClaimsToday(): LinkedToday[] {
  const { activeHouseholdId, tenantReady, userRole } = useHousehold();
  const [linked, setLinked] = useState<LinkedToday[]>([]);
  const [attempt, setAttempt] = useState(0);
  // Read again when the app comes back to the front, not on every chore
  // change (code review, PR #90): it changes a few times a day at most.
  useEffect(() => {
    const again = () => document.visibilityState === "visible" && setAttempt((n) => n + 1);
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, []);
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
      setLinked(
        ((data ?? []) as { staff_id: string; name: string }[])
          .filter((row) => row.name)
          .map((row) => ({ staffId: row.staff_id, name: row.name }))
      );
    })();
    return () => {
      live = false;
    };
  }, [activeHouseholdId, tenantReady, userRole, attempt]);
  return linked;
}
