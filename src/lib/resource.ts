import { use, useEffect, useSyncExternalStore } from "react";
import { getActiveHouseholdId } from "@/lib/tenant";

/**
 * Data a tab loads for itself, read through Suspense (Phase 125).
 *
 * WHY. Almost everything a tab shows comes from HouseholdProvider, loaded
 * once. The exceptions — the staff roster, the member list — used to load in
 * a mount effect: the tab drew with a placeholder ("Staff", a skeleton), then
 * redrew when the data landed. That second draw is the jitter Phases 122–124
 * hid behind full-screen covers.
 *
 * HOW. The first read of a resource suspends. Tab switches run inside a
 * React transition (see useTabNavigation), and a component that suspends
 * during a transition does not blank the screen: React keeps the tab you are
 * leaving on screen, and commits the new one only once it can be drawn
 * complete — in one frame. Every later read returns the cached value at once
 * and refreshes it quietly in the background, so a tab you come back to is
 * never waiting on the network.
 *
 * Why not SWR / React Query: two small reads do not justify a second data
 * layer beside HouseholdProvider and its snapshot cache. This is the part of
 * them this app needs — a per-household cache, Suspense on first read,
 * stale-while-revalidate after — in one file.
 *
 * Errors do not throw (there is no error boundary to catch them); a failed
 * first load comes back as `failed`, and a failed refresh keeps the last good
 * value.
 */

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

interface Entry<T> {
  settled?: Settled<T>;
  settledAt?: number;
  inflight?: Promise<Settled<T>>;
}

/** A refresh this soon after a load would only fetch the same answer again. */
const FRESH_MS = 5000;

export interface ResourceState<T> {
  /** null only after a failed first load. */
  data: T | null;
  failed: boolean;
  /** Re-fetches now (after a change the caller just made); resolves when done. */
  reload: () => Promise<void>;
}

export function createResource<T>(load: () => Promise<T>) {
  // Keyed by household, so a device that changes household can never be
  // shown the previous one's data.
  const entries = new Map<string, Entry<T>>();
  const listeners = new Set<() => void>();
  let version = 0;

  function entryFor(key: string): Entry<T> {
    let entry = entries.get(key);
    if (!entry) {
      entry = {};
      entries.set(key, entry);
    }
    return entry;
  }

  function refresh(key: string): Promise<Settled<T>> {
    const entry = entryFor(key);
    if (entry.inflight) return entry.inflight;
    const promise: Promise<Settled<T>> = load().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => {
        console.error(error);
        return { ok: false as const, error };
      }
    ).then((result) => {
      entry.inflight = undefined;
      // A failed refresh never replaces data that was good.
      if (result.ok || !entry.settled?.ok) {
        entry.settled = result;
        entry.settledAt = Date.now();
      }
      version++;
      listeners.forEach((listener) => listener());
      return result;
    });
    entry.inflight = promise;
    return promise;
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return function useResource(): ResourceState<T> {
    const key = getActiveHouseholdId();
    // Re-render when any refresh lands.
    useSyncExternalStore(
      subscribe,
      () => version,
      () => version
    );
    const entry = entryFor(key);

    // The first read suspends — but never on the server, where there is no
    // session to load with and nothing would ever resolve.
    if (!entry.settled && typeof window !== "undefined") {
      use(refresh(key));
    }

    useEffect(() => {
      const current = entryFor(key);
      if (current.settledAt && Date.now() - current.settledAt < FRESH_MS) return;
      void refresh(key);
    }, [key]);

    const settled = entry.settled;
    return {
      data: settled?.ok ? settled.value : null,
      failed: settled ? !settled.ok : false,
      reload: async () => {
        // After the caller's own change: a fetch already in flight may have
        // started before it, so let that finish and then ask again.
        const current = entryFor(key);
        if (current.inflight) await current.inflight;
        await refresh(key);
      },
    };
  };
}
