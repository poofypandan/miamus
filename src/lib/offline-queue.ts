import { get, update } from "idb-keyval";
import type { CreateBatchLogInput, FoodItemInput } from "@/lib/data";
import type { FoodItem, HouseholdTask, TaskLog } from "@/types/database";
import { dataProvider } from "@/lib/data";
import { isConnectionError } from "@/lib/network-errors";
import { ensureUploaded, PhotoNotUploadedError } from "@/lib/photo-queue";
import { getActiveHouseholdId } from "@/lib/tenant";

/**
 * Saves that wait on the phone until they reach the server (Phase 161, R10;
 * the log-only queue before it was Phase B11).
 *
 * WHY. Staff work where the signal is worst — the garden, the garage, the far
 * end of the house — and a phone on one bar of Wi-Fi still says it is online.
 * The old queue was used only when `navigator.onLine` was false, so a save
 * that timed out on a weak connection was simply lost, with a red toast.
 *
 * HOW. A staff save goes into this queue *first* (IndexedDB), then is sent.
 *
 *   tap Simpan -> queue (IndexedDB) -> send -> answered: done, removed
 *                                           -> no answer: stays, retried
 *                                           -> server says no: removed, error shown
 *
 * So a tab killed mid-request, a request that times out, a reply lost on the
 * way back — all leave the save in the queue, and useOfflineSync sends it
 * again: when the connection returns, when the app comes back to the
 * front, and on a timer while anything is waiting.
 *
 * NOTHING SAVED TWICE. A request that timed out may still have landed. So
 * every new row is given its id here, on the phone, before the first try,
 * and every retry sends the same id. The second insert of the same id is
 * refused by the primary key (23505), which this reads as "already saved".
 * A chore's completion is an update (the same answer however often it is
 * sent), and the row it may first have to create has its own unique index
 * (migrations/097). No migration was needed.
 *
 * PHOTOS. A save's photos go through lib/photo-queue.ts: kept on the phone
 * and uploaded first. A save is never sent while its photo is still on the
 * phone (the owner would see a broken image). If storage refuses a photo
 * outright (an unreadable file), a log or a food entry is sent without it —
 * the work still counts — and a chore, which the database will not complete
 * without both photos, goes back to its draft to have the photo retaken.
 */

const QUEUE_KEY = "b11-sync-queue";

/** A chore finished on this phone; the photos are already in its draft. */
export interface ChoreFinishJob {
  kind: "chore";
  templateId: string;
  date: string;
  /** Null while the day is still virtual (see materialiseChoreOccurrence). */
  rowId: string | null;
  assignedTo: string | null;
  before: string;
  after: string;
  completedBy: string | null;
  /** When it was finished, not when the signal came back. */
  completedAt: string;
  title: string;
}

export type OutboxJob =
  | {
      kind: "logs";
      payload: CreateBatchLogInput;
      /** One per entry, made on the phone. Absent on items queued before Phase 161. */
      ids?: string[];
    }
  | ChoreFinishJob
  | { kind: "food"; id: string; input: FoodItemInput; addedBy: string | null };

export interface OfflineQueueItem {
  id: string;
  job: OutboxJob;
  /** The household it was saved for; null on items queued before Phase 161. */
  householdId: string | null;
  timestamp: number;
}

/** Items queued before Phase 161 were `{ id, table, payload, timestamp }`. */
export function normalizeQueueItem(raw: unknown): OfflineQueueItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<OfflineQueueItem> & { payload?: CreateBatchLogInput };
  if (typeof item.id !== "string") return null;
  if (item.job && typeof item.job === "object" && "kind" in item.job) {
    return {
      id: item.id,
      job: item.job,
      householdId: item.householdId ?? null,
      timestamp: item.timestamp ?? Date.now(),
    };
  }
  if (item.payload && Array.isArray(item.payload.entries)) {
    return {
      id: item.id,
      job: { kind: "logs", payload: item.payload },
      householdId: null,
      timestamp: item.timestamp ?? Date.now(),
    };
  }
  return null;
}

// --- Telling failures apart ---------------------------------------------------

/**
 * The insert of an id that is already there: an earlier try landed and only
 * its reply was lost. Only the primary key counts — any other unique index
 * refusing is a real refusal.
 */
export function isAlreadySaved(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return code === "23505" && typeof message === "string" && /_pkey/.test(message);
}

/** HTTP answers that mean "not now", not "no". */
const RETRY_STATUSES = new Set([401, 408, 425, 429, 502, 503, 504, 520, 521, 522, 523, 524]);

/**
 * True when trying again later can work: no answer at all (a timeout, a
 * dropped connection — lib/network-errors.ts), a gateway that is briefly
 * down, or a sign-in still being renewed.
 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof PhotoNotUploadedError) return err.reason === "pending";
  if (isConnectionError(err)) return true;
  if (!err || typeof err !== "object") return false;
  const { code, message, status } = err as { code?: unknown; message?: unknown; status?: unknown };
  if (typeof status === "number" && RETRY_STATUSES.has(status)) return true;
  // PostgREST: the access token ran out and has not been renewed yet.
  if (code === "PGRST301" || code === "PGRST303") return true;
  if (typeof message === "string" && /JWT expired/i.test(message)) return true;
  // A reply that is not PostgREST's at all (a proxy's HTML error page):
  // postgrest-js passes it on as `{ message: body }`, with no code. Our own
  // thrown errors are Error instances, and the database always sends a code.
  return !(err instanceof Error) && code === undefined && typeof message === "string";
}

/** Seconds between retries while something waits: 5, 10, 20, 40, then every 60. */
export function retryDelayMs(failures: number): number {
  return Math.min(60_000, 5_000 * 2 ** Math.max(0, failures));
}

// --- What the screen subscribes to --------------------------------------------

let items: OfflineQueueItem[] = [];
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version++;
  listeners.forEach((listener) => listener());
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function outboxVersion(): number {
  return version;
}

/** What is waiting, as this page last read it. */
export function outboxItems(): readonly OfflineQueueItem[] {
  return items;
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

async function readAll(): Promise<OfflineQueueItem[]> {
  const raw = (await get<unknown[]>(QUEUE_KEY)) ?? [];
  return raw.map(normalizeQueueItem).filter((item): item is OfflineQueueItem => item !== null);
}

/**
 * Read-modify-write in one IndexedDB transaction (idb-keyval's update), so a
 * save added while a drain removes another — in this tab or another one, with
 * or without Web Locks — is never overwritten by the removal (Codex, PR #41).
 */
async function mutate(change: (current: OfflineQueueItem[]) => OfflineQueueItem[]): Promise<void> {
  let next: OfflineQueueItem[] = [];
  await update<unknown[]>(QUEUE_KEY, (raw = []) => {
    next = change(raw.map(normalizeQueueItem).filter((item): item is OfflineQueueItem => item !== null));
    return next;
  });
  items = next;
  emit();
}

/** Reads what an earlier visit left behind, once per page load. */
export function hydrateOutbox(): Promise<void> {
  if (!available()) {
    hydrated = true;
    return Promise.resolve();
  }
  hydrating ??= (async () => {
    try {
      items = await readAll();
    } catch (err) {
      console.error("Could not read the save queue", err);
    } finally {
      hydrated = true;
      emit();
    }
  })();
  return hydrating;
}

export function outboxReady(): boolean {
  return hydrated;
}

/** For the sign-out check: anything not yet on the server. */
export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  if (!available()) return [];
  return readAll();
}

/** Keeps a save on the phone. False when the phone has nowhere to keep it. */
export async function addToOutbox(item: OfflineQueueItem): Promise<boolean> {
  if (!available()) return false;
  try {
    await mutate((current) => [...current.filter((i) => i.id !== item.id), item]);
    return true;
  } catch (err) {
    console.error("Could not keep the save on the phone", err);
    return false;
  }
}

export async function clearFromQueue(id: string): Promise<void> {
  try {
    await mutate((current) => current.filter((item) => item.id !== id));
  } catch (err) {
    console.error("Could not remove a sent save from the queue", err);
  }
}

// --- Sending ------------------------------------------------------------------

export type SendResult =
  | { kind: "logs"; logs: TaskLog[] }
  | { kind: "chore"; task: HouseholdTask }
  | { kind: "food"; food: FoodItem | null };

/** Photo URLs a job needs in storage before it is sent. */
export function jobPhotos(job: OutboxJob): string[] {
  switch (job.kind) {
    case "logs":
      return job.payload.photo_url ? [job.payload.photo_url] : [];
    case "food":
      return job.input.photo_url ? [job.input.photo_url] : [];
    case "chore":
      return [job.before, job.after];
  }
}

/**
 * Its photo uploaded, or — refused by storage — dropped, for the kinds of
 * save that can do without one. Throws PhotoNotUploadedError otherwise.
 */
async function settlePhotos(job: OutboxJob): Promise<OutboxJob> {
  const photos = jobPhotos(job);
  if (photos.length === 0) return job;
  try {
    await ensureUploaded(photos);
    return job;
  } catch (err) {
    if (!(err instanceof PhotoNotUploadedError) || err.reason !== "failed") throw err;
    if (job.kind === "logs") return { ...job, payload: { ...job.payload, photo_url: null } };
    if (job.kind === "food" && job.input.name) return { ...job, input: { ...job.input, photo_url: null } };
    throw err;
  }
}

/**
 * One try. Safe to repeat, and safe to run while another try of the same job
 * is still in the air (see the header).
 */
export async function sendJob(job: OutboxJob): Promise<SendResult> {
  const ready = await settlePhotos(job);
  switch (ready.kind) {
    case "logs":
      try {
        return { kind: "logs", logs: await dataProvider.createLogsBatch({ ...ready.payload, ids: ready.ids }) };
      } catch (err) {
        if (ready.ids && isAlreadySaved(err)) return { kind: "logs", logs: [] };
        throw err;
      }
    case "food":
      try {
        return { kind: "food", food: await dataProvider.createFoodItem({ ...ready.input, id: ready.id }, ready.addedBy) };
      } catch (err) {
        if (isAlreadySaved(err)) return { kind: "food", food: null };
        throw err;
      }
    case "chore": {
      const rowId =
        ready.rowId ?? (await dataProvider.materialiseChoreOccurrence(ready.templateId, ready.date, ready.assignedTo)).id;
      const task = await dataProvider.updateHouseholdTaskStatus(rowId, "completed", {
        before_photo_url: ready.before,
        after_photo_url: ready.after,
        photo_url: ready.after,
        completed_by: ready.completedBy,
        completed_at: ready.completedAt,
      });
      return { kind: "chore", task };
    }
  }
}

/** Items being sent right now from this page, so a drain does not double up. */
const inFlight = new Set<string>();

/**
 * The longest a save button spins. A photo upload has no deadline of its own
 * (a big file on a weak signal legitimately takes a while), so past this the
 * screen says "waiting to send" and the try carries on in the background.
 */
export const UI_WAIT_MS = 25_000;

export type SubmitOutcome<T extends SendResult = SendResult> =
  | { status: "sent"; result: T }
  | { status: "waiting" };

type TryResult<T> = { ok: true; result: T } | { ok: false; err: unknown } | { ok: "slow" };

/**
 * Keeps the save on the phone, then tries to send it. "waiting": no answer
 * yet; it stays queued and goes later. A refusal from the server is thrown,
 * and the save leaves the queue (retrying a "no" only gets "no" again).
 *
 * `onSent` runs before the save leaves the queue, so the screen never shows
 * a moment with it in neither place.
 *
 * With nowhere to keep it (a locked-down private window), it is sent
 * directly and any failure is thrown, as before Phase 161.
 */
export async function submitJob<T extends SendResult>(
  job: OutboxJob,
  onSent?: (result: T) => void
): Promise<SubmitOutcome<T>> {
  const id = crypto.randomUUID();
  const item: OfflineQueueItem = { id, job, householdId: getActiveHouseholdId(), timestamp: Date.now() };
  if (!(await addToOutbox(item))) {
    const result = (await sendJob(job)) as T;
    onSent?.(result);
    return { status: "sent", result };
  }

  inFlight.add(id);
  const attempt: Promise<TryResult<T>> = sendJob(job).then(
    (result) => ({ ok: true as const, result: result as T }),
    (err: unknown) => ({ ok: false as const, err })
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<TryResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: "slow" }), UI_WAIT_MS);
  });
  const first = await Promise.race([attempt, slow]);
  clearTimeout(timer);

  if (first.ok === "slow") {
    // Still trying. Whatever it ends in, the queue is the record: a
    // success is confirmed (and the screen refreshed) by the next drain,
    // which resends the same ids and is told "already saved".
    void attempt.then((late) => {
      inFlight.delete(id);
      if (late.ok === true) notifyWaiting();
      else if (late.ok === false && !isRetryable(late.err)) console.error("A slow save was refused; the next sync drops it", late.err);
    });
    notifyWaiting();
    return { status: "waiting" };
  }

  inFlight.delete(id);
  if (first.ok === true) {
    onSent?.(first.result);
    await clearFromQueue(id);
    return { status: "sent", result: first.result };
  }
  if (isRetryable(first.err)) {
    notifyWaiting();
    return { status: "waiting" };
  }
  await clearFromQueue(id);
  throw first.err;
}

// Something new is waiting (or a slow try just landed): the sync loop runs
// again soon rather than on its usual wait.
const waitingListeners = new Set<() => void>();
function notifyWaiting() {
  waitingListeners.forEach((listener) => listener());
}
export function onNewWaiting(listener: () => void): () => void {
  waitingListeners.add(listener);
  return () => waitingListeners.delete(listener);
}

export interface DrainReport {
  sent: OfflineQueueItem[];
  /** Refused by the server and removed. */
  refused: OfflineQueueItem[];
  /** Still waiting after this pass. */
  waiting: number;
}

/**
 * Sends everything waiting for the active household, oldest first. Stops at
 * the first "no answer": the connection is still bad, and the rest would
 * only time out one after another.
 *
 * `beforeClear` runs once the sends are done and before the sent items leave
 * the queue — the place to reload the household, so what was sent is never
 * missing from the screen in between.
 */
export async function drainOutbox(
  beforeClear?: (report: DrainReport) => Promise<void>
): Promise<DrainReport> {
  const report: DrainReport = { sent: [], refused: [], waiting: 0 };
  if (!available()) return report;
  const household = getActiveHouseholdId();
  const queue = await readAll();
  items = queue;
  emit();
  let stalled = false;
  for (const item of queue) {
    // Saved for another household (a phone that switched): it waits for that one.
    if (item.householdId && item.householdId !== household) continue;
    if (stalled || inFlight.has(item.id)) {
      report.waiting++;
      continue;
    }
    inFlight.add(item.id);
    try {
      await sendJob(item.job);
      report.sent.push(item);
    } catch (err) {
      if (isRetryable(err)) {
        stalled = true;
        report.waiting++;
      } else {
        console.error("A queued save was refused", item.id, err);
        report.refused.push(item);
      }
    } finally {
      inFlight.delete(item.id);
    }
  }
  if (report.sent.length > 0 || report.refused.length > 0) {
    try {
      await beforeClear?.(report);
    } catch (err) {
      console.error("Reload after sending the queue failed", err);
    }
    const done = new Set([...report.sent, ...report.refused].map((item) => item.id));
    await mutate((current) => current.filter((item) => !done.has(item.id))).catch((err) =>
      console.error("Could not remove sent saves from the queue", err)
    );
  }
  return report;
}
