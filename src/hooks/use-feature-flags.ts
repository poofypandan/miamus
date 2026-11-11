"use client";

import { useEffect, useSyncExternalStore } from "react";
import { FEATURE_DEFAULTS, featureFlagsFrom, isFeature, type FeatureFlags } from "@/lib/features";

/**
 * Household → Features (Phase 171 PR A, migrations/145): which modules are
 * switched on. Built like useHouseholdProfile: one read per household per
 * page session, shared by every reader, cached on the device so a household
 * with Repairs off opens without flashing the pill first. Staff phones read
 * it too (to hide their buttons); only owners write it.
 */
interface FeaturesEntry {
  flags: FeatureFlags;
  ready: boolean;
  fetched: boolean;
}

const CACHE_PREFIX = "miamus.features.";
const entries = new Map<string, FeaturesEntry>();
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT: FeaturesEntry = { flags: FEATURE_DEFAULTS, ready: false, fetched: false };

function notify() {
  listeners.forEach((listener) => listener());
}

function readCached(householdId: string): FeatureFlags | undefined {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + householdId);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const rows = Object.entries(parsed as Record<string, unknown>)
      .filter(([key, value]) => isFeature(key) && typeof value === "boolean")
      .map(([feature, enabled]) => ({ feature, enabled: enabled as boolean }));
    return featureFlagsFrom(rows);
  } catch {
    return undefined;
  }
}

function writeCached(householdId: string, flags: FeatureFlags) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + householdId, JSON.stringify(flags));
  } catch {
    // Blocked storage: still right, just read each launch.
  }
}

export function featuresEntryFor(householdId: string): FeaturesEntry {
  let entry = entries.get(householdId);
  if (!entry) {
    const cached = readCached(householdId);
    entry = { flags: cached ?? FEATURE_DEFAULTS, ready: cached !== undefined, fetched: false };
    entries.set(householdId, entry);
  }
  return entry;
}

export function storeFeatures(householdId: string, flags: FeatureFlags) {
  entries.set(householdId, { flags, ready: true, fetched: true });
  writeCached(householdId, flags);
  notify();
}

async function fetchFeatures(householdId: string) {
  const entry = featuresEntryFor(householdId);
  if (entry.fetched) return;
  entry.fetched = true;

  try {
    const { supabase } = await import("@/lib/supabase/client");
    const { readSessionState, waitForSession } = await import("@/lib/auth/device-session");
    // No session yet: the read would be refused. Go on with what the device
    // knows and read once a session arrives (as useHouseholdProfile does).
    if (supabase && (await readSessionState()) === "none") {
      entries.set(householdId, { ...featuresEntryFor(householdId), ready: true, fetched: false });
      notify();
      void waitForSession().then(() => fetchFeatures(householdId));
      return;
    }
    if (supabase) {
      const { data, error } = await supabase
        .from("household_features")
        .select("feature, enabled")
        .eq("household_id", householdId);
      if (!error) {
        storeFeatures(householdId, featureFlagsFrom((data ?? []) as { feature: string; enabled: boolean }[]));
        return;
      }
      console.error("Could not load features", error);
    }
  } catch (err) {
    console.error("Could not load features", err);
  }
  // A failed read (or mock mode, or a database without migrations/145)
  // keeps what the device knew: everything on, as before this phase.
  entries.set(householdId, { ...featuresEntryFor(householdId), ready: true, fetched: true });
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The flags for one household, for the household context itself (which
 * can't call useHousehold) and for useHouseholdFeatures below.
 */
export function useFeatureFlagsFor(householdId: string, tenantReady: boolean): { flags: FeatureFlags; ready: boolean } {
  const entry = useSyncExternalStore(
    subscribe,
    () => (tenantReady && householdId ? featuresEntryFor(householdId) : SERVER_SNAPSHOT),
    () => SERVER_SNAPSHOT
  );
  useEffect(() => {
    if (tenantReady && householdId) void fetchFeatures(householdId);
  }, [householdId, tenantReady]);
  return { flags: entry.flags, ready: entry.ready };
}

/** For tests: forget everything read this page session. */
export function resetHouseholdFeaturesCache() {
  entries.clear();
}
