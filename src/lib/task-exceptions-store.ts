import { addDays } from "date-fns";
import { dataProvider, type CreateTaskExceptionInput } from "@/lib/data";
import { waitForSession } from "@/lib/auth/device-session";
import { getActiveHouseholdId } from "@/lib/tenant";
import { formatDateLocal } from "@/lib/scheduleEngine";
import {
  SaveStillWaitingError,
  clearFromQueue,
  isSending,
  outboxItems,
  submitJob,
  type OfflineQueueItem,
  type SendResult,
  type SubmitOutcome,
} from "@/lib/offline-queue";
import { discardPhoto } from "@/lib/photo-queue";
import { canWithdraw } from "@/lib/couldnt-do";
import type { TaskException } from "@/types/database";

/**
 * The couldn't-do records behind useTaskExceptions (Phase 165,
 * migrations/139), outside React like the repairs cache, so the household's
 * own refresh (the app back in front, pull to refresh, the save queue
 * draining) reloads it too. One cache per household; the last 8 days, which
 * covers everything staff may still file for (7 days back) and Today's
 * "From earlier".
 */

/** How far back records are read: the guard's 7 days, plus today. */
export const EXCEPTION_LOOKBACK_DAYS = 7;

export interface Snapshot {
  household: string | null;
  rows: TaskException[];
  loaded: boolean;
  failed: boolean;
}

export const EMPTY: Snapshot = { household: null, rows: [], loaded: false, failed: false };
let snapshot: Snapshot = EMPTY;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function getSnapshot(): Snapshot {
  return snapshot;
}

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

export function subscribeTaskExceptions(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function exceptionSince(today = new Date()): string {
  return formatDateLocal(addDays(today, -EXCEPTION_LOOKBACK_DAYS));
}

export async function loadTaskExceptions(force = false): Promise<void> {
  const household = currentHousehold();
  if (!household) return;
  if (inflight) {
    if (!force) return inflight;
    await inflight.catch(() => undefined);
  } else if (!force && snapshot.household === household && snapshot.loaded && !snapshot.failed) {
    return;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await waitForSession();
      // A database before migrations/139 has no table: nothing to show, not
      // a failure. Anything else (a weak signal) goes to the catch below,
      // which keeps what was already on screen (Codex, PR #71).
      const rows = await dataProvider.listTaskExceptions(exceptionSince()).catch((err) => {
        if (!isMissingTable(err)) throw err;
        console.warn("task_exceptions unavailable — run migrations/139", err);
        return [] as TaskException[];
      });
      if (currentHousehold() === household) emit({ household, rows, loaded: true, failed: false });
    } catch (err) {
      console.error("Couldn't-do records not loaded", err);
      if (currentHousehold() === household) {
        emit({ ...(snapshot.household === household ? snapshot : EMPTY), household, loaded: true, failed: true });
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** PostgREST's "no such table" (before migrations/139), not a dropped connection. */
export function isMissingTable(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "PGRST205" || code === "42P01";
}

/**
 * True when another saved or waiting record still points at this photo: one
 * report about several pets files one record per pet, sharing the photo
 * (Codex, PR #71). The file goes only with the last of them.
 */
export function photoStillUsed(url: string, withdrawnId: string): boolean {
  if (snapshot.rows.some((r) => r.id !== withdrawnId && r.photo_url === url)) return true;
  return outboxItems().some(
    (item) => item.job.kind === "couldnt" && item.job.input.id !== withdrawnId && item.job.input.photo_url === url
  );
}

/**
 * A reload that must land: after the save queue sends a couldn't-do record,
 * its local copy leaves the queue only once the server's copy is on screen
 * (Codex, PR #71). Throws if the reload failed, so the queue keeps it.
 */
export async function confirmTaskExceptions(): Promise<void> {
  await loadTaskExceptions(true);
  if (snapshot.failed) throw new Error("Couldn't-do records not reloaded");
}

/** Reload, if any screen shows them. Called by HouseholdProvider's refresh. */
export function refreshTaskExceptions(): void {
  if (listeners.size > 0) void loadTaskExceptions(true);
}

function keep(row: TaskException) {
  const household = currentHousehold();
  if (!household || row.household_id !== household) return;
  const base = snapshot.household === household ? snapshot : { ...EMPTY, household, loaded: true };
  emit({ ...base, rows: [...base.rows.filter((r) => r.id !== row.id), row] });
}

function forget(id: string) {
  if (!snapshot.rows.some((r) => r.id === id)) return;
  emit({ ...snapshot, rows: snapshot.rows.filter((r) => r.id !== id) });
}

/** A queued save as the record it will be once sent. */
export function pendingException(item: OfflineQueueItem, household: string): TaskException | null {
  if (item.job.kind !== "couldnt") return null;
  if (item.householdId && item.householdId !== household) return null;
  const input = item.job.input;
  return {
    chore_id: null,
    schedule_id: null,
    entity_id: null,
    slot_time: null,
    note: null,
    photo_url: null,
    inventory_item_id: null,
    staff_id: null,
    ...input,
    household_id: household,
    created_at: new Date(item.timestamp).toISOString(),
  };
}

/**
 * Files a record through the save queue: kept on the phone first, then sent.
 * "waiting": no answer yet, it goes by itself; the screen shows it meanwhile.
 * A refusal from the server is thrown (another phone already said so, say).
 */
export async function fileTaskException(input: CreateTaskExceptionInput): Promise<SubmitOutcome> {
  return submitJob<SendResult>({ kind: "couldnt", input }, (result) => {
    if (result.kind !== "couldnt") return;
    if (result.exception) keep(result.exception);
    else void loadTaskExceptions(true);
  });
}

/**
 * Batalkan (D3): still on the phone, it leaves the queue; on the server, it
 * is deleted (within 5 minutes; migrations/139). False when the server kept
 * it (the 5 minutes are over). Throws SaveStillWaitingError while it is
 * being sent, so a send landing a moment later can't bring it back.
 */
export async function withdrawTaskException(id: string): Promise<boolean> {
  const queued = outboxItems().find((item) => item.job.kind === "couldnt" && item.job.input.id === id);
  if (queued) {
    if (isSending(queued.id)) throw new SaveStillWaitingError();
    // An earlier try may have landed with its reply lost: that copy goes
    // first. No answer (a weak signal) throws, and the save stays queued, so
    // nothing is dropped that the server may still hold (Codex, PR #71).
    const removed = await dataProvider.deleteTaskException(id);
    // Nothing removed: it never landed, or it landed over 5 minutes ago and
    // stays. Inside the window (counted from when it was queued, which is
    // before the server's clock) it can only be the first.
    if (!removed && !canWithdraw({ created_at: new Date(queued.timestamp).toISOString() })) return false;
    await clearFromQueue(queued.id);
    const photo = queued.job.kind === "couldnt" ? queued.job.input.photo_url : null;
    forget(id);
    if (photo && !photoStillUsed(photo, id)) {
      // Off the phone, and out of storage if it had already gone up.
      void discardPhoto(photo);
      void dataProvider.deletePhoto(photo).catch(() => undefined);
    }
    return true;
  }
  const photo = snapshot.rows.find((r) => r.id === id)?.photo_url ?? null;
  const removed = await dataProvider.deleteTaskException(id);
  if (removed) {
    forget(id);
    // Nothing points at it any more, and nothing else would ever delete it.
    if (photo && !photoStillUsed(photo, id)) {
      void dataProvider.deletePhoto(photo).catch((err) => console.error("Withdrawn photo not removed", err));
    }
  }
  return removed;
}
