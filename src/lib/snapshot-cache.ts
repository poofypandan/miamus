"use client";

import type {
  InventoryAlert,
  InventoryAuditWithStaff,
  InventoryItem,
  MasterSchedule,
  MedicalRecord,
  RoutineProposal,
  TaskEntity,
  TaskLog,
} from "@/types/database";

/**
 * The last household payload this device saw, kept so a page load paints real
 * data instead of skeletons (Phase 92).
 *
 * Every screen in this app is a client page behind an async tenant lookup, so
 * moving between /staff and /dashboard meant: resolve the household, fetch
 * eight lists, then finally render. On a phone that is a second or more of
 * skeletons for data the device already had. This is the stale half of
 * stale-while-revalidate — the fetch still runs on every mount, quietly, and
 * replaces what is on screen when it lands.
 *
 * localStorage rather than a library: the payload is a few hundred KB of JSON
 * read once per mount, and SWR or React Query would add a dependency and a
 * cache layer to solve a problem that is really just "paint what we had".
 */

const VERSION = 1;
// Older than this and the wait for fresh data is better than the lie.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Logs are by far the biggest list and the tail is never on screen — the feed
// shows today, the owner's history a few days. Keeping every row would push a
// busy household past localStorage's ~5MB ceiling.
const MAX_CACHED_LOGS = 300;

export interface HouseholdSnapshot {
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  medicalRecords: MedicalRecord[];
  inventoryAlerts: InventoryAlert[];
  routineProposals: RoutineProposal[];
  inventoryItems: InventoryItem[];
  latestInventoryAudits: Record<string, InventoryAuditWithStaff>;
}

// Keyed by household: a device that redeems an invite for another household
// must never paint the previous one's data, not even for a frame.
const keyFor = (householdId: string) => `miamus_snapshot_v${VERSION}:${householdId}`;

export function readSnapshot(householdId: string): HouseholdSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(householdId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HouseholdSnapshot & { savedAt: number };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    // Corrupt or blocked storage: fetching from scratch is always correct.
    return null;
  }
}

// The last payload written in this tab. The foreground refresh runs every 30
// seconds and usually returns exactly what is already cached; without this,
// each one would re-serialise and re-write a few hundred KB for nothing.
let lastWritten: { key: string; body: string } | null = null;

export function writeSnapshot(householdId: string, snapshot: HouseholdSnapshot): void {
  if (typeof window === "undefined") return;
  const key = keyFor(householdId);
  // savedAt is added after the comparison, so an unchanged payload does not
  // look different every time it is considered.
  const body = JSON.stringify({ ...snapshot, logs: snapshot.logs.slice(0, MAX_CACHED_LOGS) });
  if (lastWritten && lastWritten.key === key && lastWritten.body === body) return;

  try {
    window.localStorage.setItem(key, `{"savedAt":${Date.now()},${body.slice(1)}`);
    lastWritten = { key, body };
  } catch {
    // Quota or private browsing. The app is unaffected; it just starts cold
    // next time.
  }
}
