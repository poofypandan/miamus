"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useHousehold } from "@/context/household-context";
import { dataProvider } from "@/lib/data";
import { getActiveHouseholdId } from "@/lib/tenant";
import type { HouseholdTask, Repair } from "@/types/database";

/**
 * The household's repairs and their visits (Phase 159), shared by every
 * screen that shows them: the Repairs pill, a room's sheet, the owners'
 * Today line and a staff phone's Lapor sheet.
 *
 * Not through createResource: that suspends on the first read, and the Today
 * screen and the staff list must never wait for repairs to draw. Here the
 * first draw has an empty list and `loaded` false; the data lands with a
 * re-render. One cache per household; `reload()` after any change refreshes
 * every screen at once.
 *
 * Visits come from their own read (any date, so an old visit's photos are in
 * the history), merged with the chores HouseholdProvider holds, which are
 * fresher: a visit finished on this phone shows as done straight away.
 */

interface Snapshot {
  household: string | null;
  repairs: Repair[];
  visits: HouseholdTask[];
  loaded: boolean;
  failed: boolean;
}

const EMPTY: Snapshot = { household: null, repairs: [], visits: [], loaded: false, failed: false };
let snapshot: Snapshot = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function currentHousehold(): string | null {
  try {
    return getActiveHouseholdId();
  } catch {
    return null;
  }
}

let loadedAt = 0;
/** A screen mounting this soon after a load uses that load. */
const FRESH_MS = 5000;

/**
 * `force` after a change: a load already under way may have read before it,
 * so wait for that one and read again. Otherwise screens mounting together
 * share one read.
 */
async function load(force = false): Promise<void> {
  const household = currentHousehold();
  if (!household) return;
  if (inflight) {
    if (!force) return inflight;
    await inflight.catch(() => undefined);
  } else if (!force && snapshot.household === household && snapshot.loaded && Date.now() - loadedAt < FRESH_MS) {
    return;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [repairs, visits] = await Promise.all([dataProvider.listRepairs(), dataProvider.listRepairVisits()]);
      // The household may have changed while this was in flight.
      if (currentHousehold() === household) {
        loadedAt = Date.now();
        emit({ household, repairs, visits, loaded: true, failed: false });
      }
    } catch (err) {
      console.error("Repairs not loaded", err);
      if (currentHousehold() === household) {
        emit({ ...(snapshot.household === household ? snapshot : EMPTY), household, loaded: true, failed: true });
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRepairs(): {
  repairs: Repair[];
  visits: HouseholdTask[];
  loaded: boolean;
  failed: boolean;
  reload: () => Promise<void>;
} {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
  const { householdTasks } = useHousehold();
  const household = currentHousehold();

  useEffect(() => {
    void load();
  }, [household]);

  const visits = useMemo(() => {
    const byId = new Map(state.visits.map((v) => [v.id, v]));
    for (const task of householdTasks) if (task.repair_id) byId.set(task.id, task);
    return [...byId.values()];
  }, [state.visits, householdTasks]);

  const reload = useCallback(() => load(true), []);
  const mine = state.household === household;
  return {
    repairs: mine ? state.repairs : [],
    visits: mine ? visits : [],
    loaded: mine && state.loaded,
    failed: mine && state.failed,
    reload,
  };
}
