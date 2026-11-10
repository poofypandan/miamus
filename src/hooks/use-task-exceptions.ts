"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { outboxItems, subscribeOutbox, type OfflineQueueItem } from "@/lib/offline-queue";
import {
  EMPTY,
  currentHousehold,
  getSnapshot,
  loadTaskExceptions,
  pendingException,
  subscribeTaskExceptions,
} from "@/lib/task-exceptions-store";
import type { TaskException } from "@/types/database";

const NO_QUEUE: readonly OfflineQueueItem[] = [];

/**
 * The household's couldn't-do records (Phase 165), shared by the staff list,
 * the owner's Today, My tasks and the evening summary. Saves still waiting on
 * this phone are laid over the server's copy under the id they will have, so
 * a card turns amber the moment Kirim is tapped, signal or not.
 */
export function useTaskExceptions(): {
  exceptions: TaskException[];
  /** Ids still waiting on this phone to be sent. */
  pendingIds: ReadonlySet<string>;
  loaded: boolean;
} {
  const state = useSyncExternalStore(subscribeTaskExceptions, getSnapshot, () => EMPTY);
  const queued = useSyncExternalStore(subscribeOutbox, outboxItems, () => NO_QUEUE);
  const household = currentHousehold();

  useEffect(() => {
    void loadTaskExceptions();
  }, [household]);

  return useMemo(() => {
    const mine = state.household === household ? state.rows : [];
    if (!household) return { exceptions: mine, pendingIds: new Set<string>(), loaded: false };
    const waiting = queued
      .map((item) => pendingException(item, household))
      .filter((row): row is TaskException => row !== null);
    if (waiting.length === 0) {
      return { exceptions: mine, pendingIds: new Set<string>(), loaded: state.loaded && state.household === household };
    }
    const ids = new Set(waiting.map((row) => row.id));
    return {
      exceptions: [...mine.filter((row) => !ids.has(row.id)), ...waiting],
      pendingIds: ids,
      loaded: state.loaded && state.household === household,
    };
  }, [state, queued, household]);
}
