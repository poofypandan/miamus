"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useHousehold } from "@/context/household-context";
import type { ModuleFlags } from "@/lib/dashboard-modules";

/**
 * "Who lives here?" (Phase 162, migrations/133): does the household have pets.
 *
 * `households.has_pets` is true or false once someone answered, and null
 * before that, which counts as ON so no household loses its Pets tab on
 * deploy. Built like useHouseholdName (one read per household per page
 * session, every reader shares it) and kept out of household-context on
 * purpose: the context is the save path, and this is a setting.
 *
 * Cached on the device, so a household without pets opens on four tabs
 * rather than flashing five first.
 */
export type HasPets = boolean | null;

interface ProfileEntry {
  hasPets: HasPets;
  ready: boolean;
  fetched: boolean;
}

const CACHE_PREFIX = "miamus_household_has_pets:";
const entries = new Map<string, ProfileEntry>();
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT: ProfileEntry = { hasPets: null, ready: false, fetched: false };

/** Null (never answered) counts as on: today's behaviour. */
export function petsOnFrom(hasPets: HasPets): boolean {
  return hasPets !== false;
}

/** The tab bar's switches, from the answer. */
export function moduleFlagsFrom(hasPets: HasPets): ModuleFlags {
  return { pets: petsOnFrom(hasPets) };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function parseCached(value: string | null): HasPets | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  return undefined;
}

function readCached(householdId: string): HasPets | undefined {
  try {
    return parseCached(window.localStorage.getItem(CACHE_PREFIX + householdId));
  } catch {
    return undefined;
  }
}

function writeCached(householdId: string, value: HasPets) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + householdId, String(value));
  } catch {
    // Blocked storage: still right, just fetched each launch.
  }
}

function entryFor(householdId: string): ProfileEntry {
  let entry = entries.get(householdId);
  if (!entry) {
    const cached = readCached(householdId);
    entry = { hasPets: cached ?? null, ready: cached !== undefined, fetched: false };
    entries.set(householdId, entry);
  }
  return entry;
}

function store(householdId: string, hasPets: HasPets) {
  entries.set(householdId, { hasPets, ready: true, fetched: true });
  writeCached(householdId, hasPets);
  notify();
}

async function fetchProfile(householdId: string) {
  const entry = entryFor(householdId);
  if (entry.fetched) return;
  entry.fetched = true;

  try {
    const { supabase } = await import("@/lib/supabase/client");
    // No session yet: the read would go out with only the public key and be
    // refused. Go on with what the device knows (as after a failed read) and
    // read once a session arrives.
    const { readSessionState, waitForSession } = await import("@/lib/auth/device-session");
    if (supabase && (await readSessionState()) === "none") {
      entries.set(householdId, { ...entryFor(householdId), ready: true, fetched: false });
      notify();
      void waitForSession().then(() => fetchProfile(householdId));
      return;
    }
    if (supabase) {
      const { data, error } = await supabase
        .from("households")
        .select("has_pets")
        .eq("id", householdId)
        .maybeSingle();
      if (!error && data) {
        store(householdId, (data as { has_pets: HasPets }).has_pets ?? null);
        return;
      }
      if (error) console.error("Could not load who lives here", error);
    }
  } catch (err) {
    console.error("Could not load who lives here", err);
  }
  // A failed read keeps what the device knew; mock mode has no households
  // table, so pets stay on there.
  entries.set(householdId, { ...entryFor(householdId), ready: true, fetched: true });
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type SetHasPetsResult = { ok: true } | { ok: false; reason: "has_live_pets" | "failed" };

export interface HouseholdProfile {
  /** The stored answer: true, false, or null (not answered yet). */
  hasPets: HasPets;
  /** Whether pet screens show: everything except an explicit "no". */
  petsOn: boolean;
  /** True once there is a real answer (cached, fetched, or a read that failed). */
  ready: boolean;
  /** Owners only (migrations/133 checks); updates every reader in place. */
  setHasPets: (on: boolean) => Promise<SetHasPetsResult>;
}

export function useHouseholdProfile(): HouseholdProfile {
  const { activeHouseholdId, tenantReady } = useHousehold();
  const entry = useSyncExternalStore(
    subscribe,
    () => (tenantReady ? entryFor(activeHouseholdId) : SERVER_SNAPSHOT),
    () => SERVER_SNAPSHOT
  );

  useEffect(() => {
    if (tenantReady) void fetchProfile(activeHouseholdId);
  }, [activeHouseholdId, tenantReady]);

  const setHasPets = useCallback(
    async (on: boolean): Promise<SetHasPetsResult> => {
      const { supabase } = await import("@/lib/supabase/client");
      if (!supabase) {
        // Mock mode: nothing to save to, but the screens should still follow.
        store(activeHouseholdId, on);
        return { ok: true };
      }
      const { error } = await supabase.rpc("set_household_has_pets", {
        p_household: activeHouseholdId,
        p_on: on,
      });
      if (error) {
        console.error("Could not save who lives here", error);
        return { ok: false, reason: error.message?.includes("has_live_pets") ? "has_live_pets" : "failed" };
      }
      store(activeHouseholdId, on);
      return { ok: true };
    },
    [activeHouseholdId]
  );

  return { hasPets: entry.hasPets, petsOn: petsOnFrom(entry.hasPets), ready: entry.ready, setHasPets };
}

/** For tests: forget everything read this page session. */
export function resetHouseholdProfileCache() {
  entries.clear();
}
