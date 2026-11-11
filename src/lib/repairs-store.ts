import { dataProvider } from "@/lib/data";
import { waitForSession } from "@/lib/auth/device-session";
import { getActiveHouseholdId } from "@/lib/tenant";
import type { OfflineQueueItem } from "@/lib/offline-queue";
import type { HouseholdTask, Repair, RepairNote, RepairSupervision, RepairWalkIn } from "@/types/database";

/**
 * The repairs cache behind useRepairs (Phase 159), outside React so the
 * household's own refresh — the app coming back to the foreground, pull to
 * refresh — can reload it too (refreshRepairs). One cache per household.
 */

export interface Snapshot {
  household: string | null;
  repairs: Repair[];
  visits: HouseholdTask[];
  /** Notes on the household's repairs, oldest first (migrations/131). */
  notes: RepairNote[];
  /** Walk-ins (Phase 174, migrations/149), oldest first. */
  walkIns: RepairWalkIn[];
  /** Supervising stretches of the last 90 days, and any still open. */
  supervision: RepairSupervision[];
  loaded: boolean;
  failed: boolean;
}

export const EMPTY: Snapshot = {
  household: null,
  repairs: [],
  visits: [],
  notes: [],
  walkIns: [],
  supervision: [],
  loaded: false,
  failed: false,
};

/** Stretches are kept 90 days (migrations/149); that is all there is to read. */
export const SUPERVISION_LOOKBACK_DAYS = 90;

/** PostgREST's "no such table" (a database before migrations/149), not a dropped connection. */
function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "PGRST205" || code === "42P01";
}

function orNothing<T>(promise: Promise<T[]>): Promise<T[]> {
  return promise.catch((err) => {
    if (isMissingTable(err)) return [] as T[];
    throw err;
  });
}
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
      // Not before there is a session: with only the public key RLS refuses
      // all three reads. Screens keep showing "loading" until one arrives.
      await waitForSession();
      const since = new Date(Date.now() - SUPERVISION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const [repairs, visits, notes, walkIns, supervision] = await Promise.all([
        dataProvider.listRepairs(),
        dataProvider.listRepairVisits(),
        // A database before migrations/131 has no notes: an empty thread, not a failure.
        dataProvider.listRepairNotes().catch(() => [] as RepairNote[]),
        // Before migrations/149: no walk-ins yet, not a failure.
        orNothing(dataProvider.listRepairWalkIns()),
        orNothing(dataProvider.listRepairSupervision(since)),
      ]);
      // The household may have changed while this was in flight.
      if (currentHousehold() === household) {
        loadedAt = Date.now();
        emit({ household, repairs, visits, notes, walkIns, supervision, loaded: true, failed: false });
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

/**
 * A chore was deleted: drop it (and the days of it, if it was a repeat) from
 * the cached visits at once, then reload. Otherwise a deleted visit would
 * still read as scheduled until the next refresh (Codex, PR #37).
 */
export function forgetDeletedChore(id: string): void {
  if (snapshot.visits.some((v) => v.id === id || v.parent_task_id === id)) {
    emit({ ...snapshot, visits: snapshot.visits.filter((v) => v.id !== id && v.parent_task_id !== id) });
  }
  refreshRepairs();
}

/**
 * A reload that must land: after the save queue sends a walk-in, its local
 * copy leaves the queue only once the server's copy is on screen (as
 * confirmTaskExceptions). Throws if the reload failed, so the queue keeps it.
 */
export async function confirmRepairs(): Promise<void> {
  await loadRepairs(true);
  if (snapshot.failed) throw new Error("Repairs not reloaded");
}

/** A walk-in the server just answered with, on screen before the reload. */
export function keepWalkIn(row: RepairWalkIn): void {
  if (snapshot.household !== row.household_id) return;
  emit({ ...snapshot, walkIns: [...snapshot.walkIns.filter((v) => v.id !== row.id), row] });
}

/** A walk-in taken back: off the screen at once (its stretches went with it). */
export function forgetWalkIn(id: string): void {
  if (!snapshot.walkIns.some((v) => v.id === id)) return;
  emit({
    ...snapshot,
    walkIns: snapshot.walkIns.filter((v) => v.id !== id),
    supervision: snapshot.supervision.filter((s) => s.visit_id !== id),
  });
}

export interface RepairsOverlay {
  repairs: Repair[];
  walkIns: RepairWalkIn[];
  supervision: RepairSupervision[];
  /** Walk-ins (and their repairs) still on this phone: "menunggu dikirim". */
  pendingIds: ReadonlySet<string>;
}

/**
 * The server's copy with the walk-in saves still waiting on this phone laid
 * over it (as lib/outbox-view does for logs and chores): a walk-in logged
 * with no signal shows at once, with its stretch, and a Selesai waiting to
 * send closes it on screen. The triggers of migrations/149 are copied here
 * in miniature, with the phone's times until the server's arrive.
 */
export function overlayRepairsOutbox(
  base: Pick<Snapshot, "repairs" | "walkIns" | "supervision">,
  items: readonly OfflineQueueItem[],
  household: string | null
): RepairsOverlay {
  const relevant = items.filter(
    (item) =>
      (!item.householdId || item.householdId === household) &&
      (item.job.kind === "walkin_start" || item.job.kind === "walkin_finish" || item.job.kind === "supervision_handover")
  );
  if (relevant.length === 0) return { ...base, pendingIds: new Set() };
  const repairs = new Map(base.repairs.map((r) => [r.id, r]));
  const walkIns = new Map(base.walkIns.map((v) => [v.id, v]));
  let supervision = [...base.supervision];
  const pendingIds = new Set<string>();
  for (const item of relevant) {
    const at = new Date(item.timestamp).toISOString();
    const job = item.job;
    if (job.kind === "walkin_start") {
      if (job.repair && !repairs.has(job.repair.id) && household) {
        pendingIds.add(job.repair.id);
        repairs.set(job.repair.id, {
          id: job.repair.id,
          household_id: household,
          location_id: job.repair.location_id ?? null,
          spot: job.repair.spot ?? null,
          title: job.repair.title,
          details: job.repair.details ?? null,
          photo_url: job.repair.photo_url ?? null,
          urgent: job.repair.urgent ?? false,
          status: job.repair.status,
          reported_by_staff: job.repair.reported_by_staff ?? null,
          created_by: null,
          created_at: at,
          updated_at: at,
          decided_by: null,
          decided_at: null,
          dismiss_reason: null,
          fixed_by_name: null,
          closed_at: null,
        });
      }
      if (!walkIns.has(job.visit.id) && household) {
        pendingIds.add(job.visit.id);
        walkIns.set(job.visit.id, {
          ...job.visit,
          household_id: household,
          created_by: null,
          arrived_at: job.visit.arrived_phone_at,
          left_at: null,
          left_phone_at: null,
          after_photo_url: null,
          outcome: null,
          note: null,
        });
        if (job.visit.logged_by_staff && !supervision.some((s) => s.visit_id === job.visit.id)) {
          supervision.push({
            id: `pending:${item.id}`,
            household_id: household,
            visit_id: job.visit.id,
            staff_id: job.visit.logged_by_staff,
            user_id: null,
            started_at: job.visit.arrived_phone_at,
            ended_at: null,
          });
        }
      }
    } else if (job.kind === "walkin_finish") {
      const visit = walkIns.get(job.visitId);
      if (visit && !visit.left_at) {
        pendingIds.add(visit.id);
        walkIns.set(visit.id, { ...visit, ...job.finish });
        supervision = supervision.map((s) =>
          s.visit_id === visit.id && !s.ended_at ? { ...s, ended_at: job.finish.left_phone_at } : s
        );
      }
    } else if (job.kind === "supervision_handover" && household) {
      if (supervision.some((s) => s.id === job.input.id)) continue;
      supervision = supervision.map((s) => (s.visit_id === job.input.visit_id && !s.ended_at ? { ...s, ended_at: at } : s));
      supervision.push({
        id: job.input.id,
        household_id: household,
        visit_id: job.input.visit_id,
        staff_id: job.input.staff_id,
        user_id: null,
        started_at: at,
        ended_at: null,
      });
    }
  }
  return { repairs: [...repairs.values()], walkIns: [...walkIns.values()], supervision, pendingIds };
}
