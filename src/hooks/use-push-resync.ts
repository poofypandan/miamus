"use client";

import { useEffect } from "react";
import { useHousehold } from "@/context/household-context";
import { resyncPush } from "@/lib/push";

/**
 * Re-saves this device's push subscription on each dashboard visit
 * (Phase 119), so a browser-rotated subscription or a VAPID key rotation
 * cannot quietly stop the owner's alerts. A no-op on any device where push
 * was never turned on — it never asks for permission.
 */
export function usePushResync() {
  const { activeHouseholdId, tenantReady, isHouseholdMember } = useHousehold();

  useEffect(() => {
    if (!tenantReady || !isHouseholdMember) return;
    resyncPush(activeHouseholdId).catch((err) => console.error("Push re-sync failed", err));
  }, [activeHouseholdId, tenantReady, isHouseholdMember]);
}
