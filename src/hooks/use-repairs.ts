"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useHousehold } from "@/context/household-context";
import { EMPTY, currentHousehold, getSnapshot, loadRepairs, subscribeRepairs } from "@/lib/repairs-store";
import type { HouseholdTask, Repair, RepairNote } from "@/types/database";

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

export function useRepairs(): {
  repairs: Repair[];
  visits: HouseholdTask[];
  notes: RepairNote[];
  loaded: boolean;
  failed: boolean;
  reload: () => Promise<void>;
} {
  const state = useSyncExternalStore(subscribeRepairs, getSnapshot, () => EMPTY);
  const { householdTasks } = useHousehold();
  const household = currentHousehold();

  useEffect(() => {
    void loadRepairs();
  }, [household]);

  const visits = useMemo(() => {
    const byId = new Map(state.visits.map((v) => [v.id, v]));
    for (const task of householdTasks) if (task.repair_id) byId.set(task.id, task);
    return [...byId.values()];
  }, [state.visits, householdTasks]);

  const reload = useCallback(() => loadRepairs(true), []);
  const mine = state.household === household;
  return {
    repairs: mine ? state.repairs : [],
    visits: mine ? visits : [],
    notes: mine ? state.notes : [],
    loaded: mine && state.loaded,
    failed: mine && state.failed,
    reload,
  };
}
