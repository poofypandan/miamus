import { dataProvider } from "@/lib/data";
import { getActiveHouseholdId } from "@/lib/tenant";
import type { HouseholdTask, Repair } from "@/types/database";

/**
 * The repairs cache behind useRepairs (Phase 159), outside React so the
 * household's own refresh — the app coming back to the foreground, pull to
 * refresh — can reload it too (refreshRepairs). One cache per household.
 */

export interface Snapshot {
  household: string | null;
  repairs: Repair[];
  visits: HouseholdTask[];
  loaded: boolean;
  failed: boolean;
}

export const EMPTY: Snapshot = { household: null, repairs: [], visits: [], loaded: false, failed: false };
let snapshot: Snapshot = EMPTY;

export function getSnapshot(): Snapshot {
  return snapshot;
}
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function currentHousehold(): string | null {
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
export async function loadRepairs(force = false): Promise<void> {
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

export function subscribeRepairs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reload, if any screen shows repairs. Called by HouseholdProvider's
 * refresh: a staff phone's normal report sends no push (D6), so the owners'
 * Today line and Repairs list must catch up whenever the app does (Codex,
 * PR #37).
 */
export function refreshRepairs(): void {
  if (listeners.size > 0) void loadRepairs(true);
}
