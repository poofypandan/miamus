"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { dataProvider } from "@/lib/data";
import type { RepairPushPrefs } from "@/types/database";

/**
 * The signed-in owner's two walk-in repair pushes (Phase 174 PR B,
 * migrations/152): when a repair person arrives, and when the work is
 * finished. Both on by default. One read per page load, as
 * useNotificationPrefs; owners only, a staff phone never asks.
 */

interface State {
  prefs: RepairPushPrefs;
  loaded: boolean;
  failed: boolean;
}

const DEFAULTS: RepairPushPrefs = { repair_arrival_pushes: true, repair_done_pushes: true };
const INITIAL: State = { prefs: DEFAULTS, loaded: false, failed: false };
let state: State = INITIAL;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function load(): Promise<void> {
  // A failed load is tried again on the next mount.
  if ((state.loaded && !state.failed) || inflight) return inflight ?? Promise.resolve();
  inflight = dataProvider
    .getRepairPushPrefs()
    .then((prefs) => emit({ prefs, loaded: true, failed: false }))
    .catch((err) => {
      // A database before migrations/152: the defaults, and the switches stay disabled.
      console.warn("Repair push switches not loaded", err);
      emit({ ...state, loaded: true, failed: true });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useRepairPushPrefs(enabled = true): {
  prefs: RepairPushPrefs;
  loaded: boolean;
  failed: boolean;
  save: (next: RepairPushPrefs) => Promise<void>;
} {
  const current = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled]);
  const save = useCallback(async (next: RepairPushPrefs) => {
    const previous = state;
    // Shown at once; put back if the server refuses.
    emit({ ...state, prefs: next });
    try {
      const saved = await dataProvider.setRepairPushPrefs(next);
      emit({ prefs: saved, loaded: true, failed: false });
    } catch (err) {
      emit(previous);
      throw err;
    }
  }, []);
  return { ...current, save };
}
