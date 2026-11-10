"use client";

import { useEffect } from "react";
import { useHousehold } from "@/context/household-context";
import { resyncPush } from "@/lib/push";

/**
 * Re-saves this device's push subscription on each dashboard visit
 * (Phase 119), so a browser-rotated subscription or a VAPID key rotation
 * cannot quietly stop the owner's alerts. A no-op on any device where push
 * was never turned on — it never asks for permission.
 *
 * "staff" on staff Today (Phase 166): a staff phone's subscription is kept
 * the same way, under the phone's own session. An admin in staff view is
 * left to the dashboard's own call.
 */
export function usePushResync(who: "owner" | "staff" = "owner") {
  const { activeHouseholdId, tenantReady, isHouseholdMember } = useHousehold();

  useEffect(() => {
    if (!tenantReady || isHouseholdMember !== (who === "owner")) return;
    resyncPush(activeHouseholdId).catch((err) => console.error("Push re-sync failed", err));
  }, [activeHouseholdId, tenantReady, isHouseholdMember, who]);
}
