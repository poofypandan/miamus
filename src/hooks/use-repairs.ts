"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useHousehold } from "@/context/household-context";
import {
  EMPTY,
  currentHousehold,
  getSnapshot,
  loadRepairs,
  overlayRepairsOutbox,
  subscribeRepairs,
} from "@/lib/repairs-store";
import { hydrateOutbox, outboxItems, outboxVersion, subscribeOutbox } from "@/lib/offline-queue";
import type { HouseholdTask, Repair, RepairNote, RepairSupervision, RepairWalkIn } from "@/types/database";

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
  /** Walk-ins (Phase 174), saves still on this phone laid over. */
  walkIns: RepairWalkIn[];
  supervision: RepairSupervision[];
  /** Walk-ins and repairs still waiting to send from this phone. */
  pendingIds: ReadonlySet<string>;
  loaded: boolean;
  failed: boolean;
  reload: () => Promise<void>;
} {
  const state = useSyncExternalStore(subscribeRepairs, getSnapshot, () => EMPTY);
  const outbox = useSyncExternalStore(subscribeOutbox, outboxVersion, () => 0);
  useEffect(() => {
    void hydrateOutbox();
  }, []);
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

  const mine = state.household === household;
  const overlay = useMemo(
    () =>
      overlayRepairsOutbox(
        mine ? state : { repairs: [], walkIns: [], supervision: [] },
        outboxItems(),
        household
      ),
    // `outbox` is the queue's version: a new value whenever it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, mine, household, outbox]
  );

  const reload = useCallback(() => loadRepairs(true), []);
  return {
    repairs: overlay.repairs,
    visits: mine ? visits : [],
    notes: mine ? state.notes : [],
    walkIns: overlay.walkIns,
    supervision: overlay.supervision,
    pendingIds: overlay.pendingIds,
    loaded: mine && state.loaded,
    failed: mine && state.failed,
    reload,
  };
}
