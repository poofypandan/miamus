import { get, update } from "idb-keyval";
import type {
  CreateBatchLogInput,
  CreateTaskExceptionInput,
  FoodItemInput,
  RepairInput,
  WalkInFinishInput,
  WalkInStartInput,
} from "@/lib/data";
import type { FoodItem, HouseholdTask, RepairSupervision, RepairWalkIn, TaskException, TaskLog } from "@/types/database";
import { dataProvider } from "@/lib/data";
import { isConnectionError } from "@/lib/network-errors";
import { ensureUploaded, PhotoNotUploadedError } from "@/lib/photo-queue";
import { getActiveHouseholdId } from "@/lib/tenant";
import { isChoreAlreadySettled, type ChoreAlreadySettledError } from "@/lib/chore-settled";
import { phoneLinkState, type PhoneLinkState } from "@/lib/phone-link";

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
  /**
   * Both, or (an admin finishing their own chore, Phase 163; migrations/136)
   * neither. Staff saves always carry both.
   */
  before: string | null;
  after: string | null;
  completedBy: string | null;
  /** When it was finished, not when the signal came back. */
  completedAt: string;
  title: string;
  /**
   * Leave cover (Phase 163; Codex, PR #58): the admin covering this day takes
   * the stored row over before completing it photo-free, as its own update
   * (migrations/136's two-step path). In the job, not a separate call, so a
   * weak signal keeps both on the phone together. Safe to repeat.
   */
  takeOverAs?: string | null;
}

export type OutboxJob =
  | {
      kind: "logs";
      payload: CreateBatchLogInput;
      /** One per entry, made on the phone. Absent on items queued before Phase 161. */
      ids?: string[];
    }
  | ChoreFinishJob
  | { kind: "food"; id: string; input: FoodItemInput; addedBy: string | null }
  /**
   * "Tidak bisa dikerjakan" (Phase 165): its id is made on the phone, so a
   * resend is told "already saved" by the primary key.
   */
  | {
      kind: "couldnt";
      input: CreateTaskExceptionInput;
      /**
       * "Masukkan ke daftar belanja" (Phase 165): sent with the record, so
       * it isn't lost on a weak signal (Codex, PR #71). The item marked out
       * (the same answer however often), or a note under an id made here
       * (a resend is "already saved").
       */
      shopping?: { itemId?: string | null; noteId?: string; note?: string } | null;
    }
  /**
   * "Ada tukang datang" (Phase 174): the walk-in, and with "Baru" the repair
   * it is for, both under ids made on the phone, so a resend is "already
   * saved" for each. The before photo goes first.
   */
  | { kind: "walkin_start"; repair: (RepairInput & { id: string }) | null; visit: WalkInStartInput }
  /** Selesai: the database takes the same finish twice as one (migrations/149). */
  | { kind: "walkin_finish"; visitId: string; finish: WalkInFinishInput }
  /** "Ganti yang mengawasi": a new stretch under an id made on the phone. */
  | { kind: "supervision_handover"; input: { id: string; visit_id: string; staff_id: string } };

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
  if (err instanceof Error && err.name === "IdsNotKeptError") return true;
  if (isConnectionError(err)) return true;
  if (!err || typeof err !== "object") return false;
  const { code, message, status } = err as { code?: unknown; message?: unknown; status?: unknown };
  if (typeof status === "number" && RETRY_STATUSES.has(status)) return true;
  if (isTokenNotRenewed(err)) return true;
  // A reply that is not PostgREST's at all (a proxy's HTML error page):
  // postgrest-js passes it on as `{ message: body }`, with no code. Our own
  // thrown errors are Error instances, and the database always sends a code.
  return !(err instanceof Error) && code === undefined && typeof message === "string";
}

/**
 * The server refusing this phone's sign-in rather than the save (audit L4):
 * a 401, an expired or unusable token, or "not allowed" (42501), which is
 * what a phone that was unlinked gets back for every write.
 */
export function isSessionRefusal(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, status } = err as { code?: unknown; status?: unknown };
  return status === 401 || code === "42501" || isTokenNotRenewed(err);
}

/** PostgREST: the access token ran out and has not been renewed yet. */
function isTokenNotRenewed(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code === "PGRST301" || code === "PGRST303") return true;
  return typeof message === "string" && /JWT expired/i.test(message);
}

/**
 * Refusals of the sign-in in a row whose link check had no clear answer;
 * past this many the phone is treated as unlinked (its saves still kept).
 */
export const UNLINKED_AFTER_REFUSALS = 5;

/** Seconds between retries while something waits: 5, 10, 20, 40, then every 60. */
export function retryDelayMs(failures: number): number {
  return Math.min(60_000, 5_000 * 2 ** Math.max(0, failures));
}

// --- What the screen subscribes to --------------------------------------------

let items: OfflineQueueItem[] = [];
let unlinked = false;
let sessionRefusals = 0;
let linkCheck: (householdId: string | null) => Promise<PhoneLinkState> = phoneLinkState;
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

/**
 * True once the last drain found this phone no longer linked (audit L4).
 * The saves stay on the phone; they go after the phone is linked again.
 */
export function outboxUnlinked(): boolean {
  return unlinked;
}

function setUnlinked(next: boolean) {
  if (unlinked === next) return;
  unlinked = next;
  emit();
}

/** For tests: how the queue asks whether the phone is still linked. */
export function setLinkCheckForTests(check: ((householdId: string | null) => Promise<PhoneLinkState>) | null): void {
  linkCheck = check ?? phoneLinkState;
  unlinked = false;
  sessionRefusals = 0;
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
  | { kind: "food"; food: FoodItem | null }
  | { kind: "couldnt"; exception: TaskException | null }
  | { kind: "walkin"; walkIn: RepairWalkIn | null }
  | { kind: "supervision"; row: RepairSupervision | null };

/**
 * Thrown when something asks to delete a row that is still waiting in the
 * queue (Codex, PR #41): deleting the server's copy of a save whose reply was
 * lost would be undone by the next retry, which puts it back — with its photo
 * already removed. Wait until it has been sent.
 */
export class SaveStillWaitingError extends Error {
  constructor() {
    super("This save has not been sent yet");
    this.name = "SaveStillWaitingError";
  }
}

/** Photo URLs a job needs in storage before it is sent. */
export function jobPhotos(job: OutboxJob): string[] {
  switch (job.kind) {
    case "logs":
      return job.payload.photo_url ? [job.payload.photo_url] : [];
    case "food":
      return job.input.photo_url ? [job.input.photo_url] : [];
    case "chore":
      return [job.before, job.after].filter((url): url is string => !!url);
    case "couldnt":
      return job.input.photo_url ? [job.input.photo_url] : [];
    case "walkin_start":
      return [job.repair?.photo_url, job.visit.before_photo_url].filter((url): url is string => !!url);
    case "walkin_finish":
      return [job.finish.after_photo_url];
    case "supervision_handover":
      return [];
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
    // The reason still counts without its picture.
    if (job.kind === "couldnt") return { ...job, input: { ...job.input, photo_url: null } };
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
    case "couldnt": {
      let exception: TaskException | null = null;
      try {
        exception = await dataProvider.createTaskException(ready.input);
      } catch (err) {
        if (!isAlreadySaved(err)) throw err;
      }
      // Then the shopping list. A failure here leaves the job queued, and the
      // resend finds the record "already saved" and tries only this again.
      const shopping = ready.shopping;
      if (shopping?.itemId) {
        await dataProvider.setInventoryStatus(shopping.itemId, "out", ready.input.staff_id ?? null);
      } else if (shopping?.note && shopping.noteId) {
        try {
          await dataProvider.createInventoryAlert({
            id: shopping.noteId,
            pet_id: null,
            item_type: "other",
            note: shopping.note,
            staff_id: ready.input.staff_id ?? null,
          });
        } catch (err) {
          if (!isAlreadySaved(err)) throw err;
        }
      }
      return { kind: "couldnt", exception };
    }
    case "walkin_start": {
      // The repair first ("Baru"), then the walk-in on it. A resend finds
      // either already there and goes on.
      if (ready.repair) {
        try {
          await dataProvider.createRepair(ready.repair);
        } catch (err) {
          if (!isAlreadySaved(err)) throw err;
        }
      }
      try {
        return { kind: "walkin", walkIn: await dataProvider.createRepairWalkIn(ready.visit) };
      } catch (err) {
        if (isAlreadySaved(err)) return { kind: "walkin", walkIn: null };
        throw err;
      }
    }
    case "walkin_finish":
      return { kind: "walkin", walkIn: await dataProvider.finishRepairWalkIn(ready.visitId, ready.finish) };
    case "supervision_handover":
      try {
        return { kind: "supervision", row: await dataProvider.handOverSupervision(ready.input) };
      } catch (err) {
        if (isAlreadySaved(err)) return { kind: "supervision", row: null };
        throw err;
      }
    case "chore": {
      const rowId =
        ready.rowId ?? (await dataProvider.materialiseChoreOccurrence(ready.templateId, ready.date, ready.assignedTo)).id;
      if (ready.takeOverAs) await dataProvider.updateHouseholdTask(rowId, { assigned_to: ready.takeOverAs });
      try {
        const task = await dataProvider.updateHouseholdTaskStatus(rowId, "completed", {
          // Never over a newer state (audit M4): a chore someone else
          // finished, or an admin cancelled, while this waited stays so.
          onlyIfPending: true,
          before_photo_url: ready.before,
          after_photo_url: ready.after,
          photo_url: ready.after,
          completed_by: ready.completedBy,
          completed_at: ready.completedAt,
        });
        return { kind: "chore", task };
      } catch (err) {
        if (isChoreAlreadySettled(err)) {
          // This phone's photos stay out of it. Best effort: the phone may
          // delete its own fresh uploads; anything older is the clean-up's.
          for (const url of [ready.before, ready.after]) {
            if (url) void dataProvider.deletePhoto(url).catch(() => undefined);
          }
        }
        throw err;
      }
    }
  }
}

/** Items being sent right now from this page, so a drain does not double up. */
const inFlight = new Set<string>();

/** True while this page is sending that queued item (it may land any moment). */
export function isSending(itemId: string): boolean {
  return inFlight.has(itemId);
}

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

/** The ids could not be kept on the device: try again later. */
class IdsNotKeptError extends Error {
  constructor() {
    super("Row ids for a queued save could not be kept");
    this.name = "IdsNotKeptError";
  }
}

/**
 * A log queued before Phase 161 has no row ids, so a resend (after a reload
 * that failed, say) would save it again under new ones. Give it ids and keep
 * them in the queue before its first send, so every later send is the same
 * rows (Codex, PR #41).
 */
async function withStableIds(item: OfflineQueueItem): Promise<OutboxJob> {
  const { job } = item;
  if (job.kind !== "logs" || job.ids) return job;
  const ids = job.payload.entries.map(() => crypto.randomUUID());
  let kept: OutboxJob | null = null;
  // Kept only if they reached the device: ids that might not survive a
  // reload would not make the next send safe, so then it waits.
  try {
    await mutate((current) =>
      current.map((i) => {
        if (i.id !== item.id || i.job.kind !== "logs") return i;
        kept = { ...i.job, ids: i.job.ids ?? ids };
        return { ...i, job: kept };
      })
    );
  } catch (err) {
    // A full device, say: the entry stays as it was, and waits (Codex, PR #41).
    console.error("Could not keep row ids for a queued save", err);
    throw new IdsNotKeptError();
  }
  if (!kept) throw new IdsNotKeptError();
  return kept;
}

export interface DrainReport {
  sent: OfflineQueueItem[];
  /** Refused by the server and removed (including `settled`). */
  refused: OfflineQueueItem[];
  /**
   * Chores finished elsewhere or cancelled while this waited (audit M4):
   * removed like a refusal, told apart so the screen can say why.
   */
  settled: { item: OfflineQueueItem; state: ChoreAlreadySettledError["state"] }[];
  /**
   * True when the server refused this phone's sign-in itself several times
   * in a row (audit L4): it is probably no longer linked. The saves stay.
   */
  unlinked: boolean;
  /** Still waiting after this pass. */
  waiting: number;
  /**
   * False when the reload after sending failed: the sent saves then stay in
   * the queue — and on screen — and the next pass confirms them (resending
   * the same ids, told "already saved") (Codex, PR #41).
   */
  confirmed: boolean;
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
  const report: DrainReport = { sent: [], refused: [], settled: [], unlinked: false, waiting: 0, confirmed: true };
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
      await sendJob(await withStableIds(item));
      report.sent.push(item);
      sessionRefusals = 0;
      setUnlinked(false);
    } catch (err) {
      // The sign-in refused, not the save (audit L4): is the phone still
      // linked? If not, everything stays for a re-link instead of being
      // retried forever (a 401) or thrown away (a 42501).
      const link = isSessionRefusal(err) ? await linkCheck(household) : null;
      if (link === "unknown") sessionRefusals++;
      else if (link === "linked") sessionRefusals = 0;
      if (link === "unlinked" || (link === "unknown" && sessionRefusals >= UNLINKED_AFTER_REFUSALS)) {
        setUnlinked(true);
        report.unlinked = true;
        stalled = true;
        report.waiting++;
      } else if (link === "unknown" || link === "no_answer" || isRetryable(err)) {
        stalled = true;
        report.waiting++;
      } else {
        console.error("A queued save was refused", item.id, err);
        report.refused.push(item);
        if (isChoreAlreadySettled(err)) report.settled.push({ item, state: err.state });
      }
    } finally {
      inFlight.delete(item.id);
    }
  }
  if (report.sent.length > 0 || report.refused.length > 0) {
    try {
      await beforeClear?.(report);
    } catch (err) {
      // Removing them now would take them off the screen until some later
      // reload works — long enough for someone to log the same thing again.
      console.error("Reload after sending the queue failed; keeping the sent saves until it works", err);
      report.confirmed = false;
    }
    const done = new Set([...(report.confirmed ? report.sent : []), ...report.refused].map((item) => item.id));
    await mutate((current) => current.filter((item) => !done.has(item.id))).catch((err) =>
      console.error("Could not remove sent saves from the queue", err)
    );
  }
  return report;
}
