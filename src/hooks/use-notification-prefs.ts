"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { dataProvider } from "@/lib/data";
import { DEFAULT_SUMMARY_HOUR } from "@/lib/couldnt-do";
import type { NotificationPrefs } from "@/types/database";

/**
 * The signed-in admin's two notification switches (Phase 165,
 * migrations/139): the evening summary's hour (or off) and staff requests.
 * One read per page load, shared by the Notifications settings and Today's
 * quiet "not done today" line. Owners only: a staff phone never asks.
 */

interface State {
  prefs: NotificationPrefs;
  loaded: boolean;
  failed: boolean;
}

const DEFAULTS: NotificationPrefs = { evening_summary_hour: DEFAULT_SUMMARY_HOUR, staff_request_pushes: true };
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
  if (state.loaded || inflight) return inflight ?? Promise.resolve();
  inflight = dataProvider
    .getNotificationPrefs()
    .then((prefs) => emit({ prefs, loaded: true, failed: false }))
    .catch((err) => {
      // A database before migrations/139: the defaults, and the switches say so.
      console.warn("Notification switches not loaded", err);
      emit({ ...state, loaded: true, failed: true });
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useNotificationPrefs(enabled = true): {
  prefs: NotificationPrefs;
  loaded: boolean;
  failed: boolean;
  save: (next: NotificationPrefs) => Promise<void>;
} {
  const current = useSyncExternalStore(subscribe, () => state, () => INITIAL);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled]);
  const save = useCallback(async (next: NotificationPrefs) => {
    const previous = state;
    // Shown at once; put back if the server refuses.
    emit({ ...state, prefs: next });
    try {
      const saved = await dataProvider.setNotificationPrefs(next);
      emit({ prefs: saved, loaded: true, failed: false });
    } catch (err) {
      emit(previous);
      throw err;
    }
  }, []);
  return { ...current, save };
}
