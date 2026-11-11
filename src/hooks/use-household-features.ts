"use client";

import { useCallback } from "react";
import { useHousehold } from "@/context/household-context";
import { featuresEntryFor, storeFeatures, useFeatureFlagsFor } from "@/hooks/use-feature-flags";
import type { Feature, FeatureFlags } from "@/lib/features";

/**
 * Household → Features (Phase 171 PR A, migrations/145), for screens: the
 * flags plus the owners' switch. The shared store is use-feature-flags.ts,
 * which the household context reads too (it can't call useHousehold).
 */
export type SetFeatureResult = { ok: true } | { ok: false };

export interface HouseholdFeatures extends FeatureFlags {
  flags: FeatureFlags;
  /** True once there is a real answer (cached, fetched, or a read that failed). */
  ready: boolean;
  /** Owners only (migrations/145 checks); updates every reader in place, no reload. */
  setFeature: (feature: Feature, on: boolean) => Promise<SetFeatureResult>;
}

export function useHouseholdFeatures(): HouseholdFeatures {
  const { activeHouseholdId, tenantReady } = useHousehold();
  const { flags, ready } = useFeatureFlagsFor(activeHouseholdId, tenantReady);

  const setFeature = useCallback(
    async (feature: Feature, on: boolean): Promise<SetFeatureResult> => {
      const next = { ...featuresEntryFor(activeHouseholdId).flags, [feature]: on };
      const { supabase } = await import("@/lib/supabase/client");
      if (!supabase) {
        // Mock mode: nothing to save to, but the screens should still follow.
        storeFeatures(activeHouseholdId, next);
        return { ok: true };
      }
      const { error } = await supabase.rpc("set_household_feature", {
        p_household: activeHouseholdId,
        p_feature: feature,
        p_on: on,
      });
      if (error) {
        console.error("Could not save a feature switch", error);
        return { ok: false };
      }
      storeFeatures(activeHouseholdId, { ...featuresEntryFor(activeHouseholdId).flags, [feature]: on });
      return { ok: true };
    },
    [activeHouseholdId]
  );

  return { ...flags, flags, ready, setFeature };
}
