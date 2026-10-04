"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useHousehold } from "@/context/household-context";

/** Shown wherever a household's own name is not known (yet, or at all). */
export const APP_NAME = "Miamus";

const CACHE_PREFIX = "miamus_household_name:";

/**
 * Each household's name, shared by every reader (Phase 125).
 *
 * It was state inside each component that asked, so the header, the Agenda
 * and the staff splash each fetched it, each painted "Miamus" first, and
 * nothing could tell the launch cover when the real name was on screen —
 * the header flickered from the placeholder to the name just after the
 * cover lifted. Now there is one entry per household:
 *   - `name`:  from the device cache at once, then from the database;
 *   - `ready`: true once there is a real answer — a cached name, a fetched
 *              one, or a fetch that came back empty or failed (nothing left
 *              to wait for; APP_NAME stands).
 */
interface NameEntry {
  name: string | null;
  ready: boolean;
  fetched: boolean;
}

const entries = new Map<string, NameEntry>();
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT: NameEntry = { name: null, ready: false, fetched: false };

function notify() {
  listeners.forEach((listener) => listener());
}

function readCached(householdId: string): string | null {
  try {
    return window.localStorage.getItem(CACHE_PREFIX + householdId);
  } catch {
    return null;
  }
}

/** Seeds from the device cache the first time a household is asked about. */
function entryFor(householdId: string): NameEntry {
  let entry = entries.get(householdId);
  if (!entry) {
    const cached = readCached(householdId);
    entry = { name: cached, ready: cached !== null, fetched: false };
    entries.set(householdId, entry);
  }
  return entry;
}

/** One database read per household per page session, however many ask. */
async function fetchName(householdId: string) {
  const entry = entryFor(householdId);
  if (entry.fetched) return;
  entry.fetched = true;

  let fresh: string | null = null;
  try {
    const { supabase } = await import("@/lib/supabase/client");
    if (supabase) {
      const { data } = await supabase
        .from("households")
        .select("name")
        .eq("id", householdId)
        .maybeSingle();
      fresh = data?.name?.trim() || null;
    }
  } catch (err) {
    // Offline, say. Still settles: the launch cover must not wait on a name
    // that is not coming.
    console.error("Could not load the household name", err);
  }
  // A failed or denied read keeps whatever was cached rather than blanking a
  // name the device has legitimately shown before. Mock mode has no
  // households table; APP_NAME is the honest answer there.
  entries.set(householdId, { name: fresh ?? entry.name, ready: true, fetched: true });
  if (fresh) {
    try {
      window.localStorage.setItem(CACHE_PREFIX + householdId, fresh);
    } catch {
      // Blocked storage: the name is still shown, just fetched each launch.
    }
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The active household's name and whether it is settled.
 *
 * Read from `households`, which RLS scopes to the household's own members
 * and bound devices (migrations/098). Nothing is shown for the placeholder
 * tenant: until it is resolved, the default household's id is not this
 * device's household. The server snapshot is "not known yet", so hydration
 * matches the server HTML and the cached name arrives a render later.
 */
export function useHouseholdNameState(): { name: string; ready: boolean } {
  const { activeHouseholdId, tenantReady } = useHousehold();
  const entry = useSyncExternalStore(
    subscribe,
    () => (tenantReady ? entryFor(activeHouseholdId) : SERVER_SNAPSHOT),
    () => SERVER_SNAPSHOT
  );

  useEffect(() => {
    if (tenantReady) void fetchName(activeHouseholdId);
  }, [activeHouseholdId, tenantReady]);

  return { name: entry.name ?? APP_NAME, ready: entry.ready };
}

/** The active household's name, or APP_NAME while it is not known. */
export function useHouseholdName(): string {
  return useHouseholdNameState().name;
}
