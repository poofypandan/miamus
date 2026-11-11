import { dataProvider, type RepairInput, type WalkInFinishInput, type WalkInStartInput } from "@/lib/data";
import {
  clearFromQueue,
  isSending,
  outboxItems,
  SaveStillWaitingError,
  submitJob,
  type SendResult,
  type SubmitOutcome,
} from "@/lib/offline-queue";
import { discardPhoto } from "@/lib/photo-queue";
import { forgetWalkIn, keepWalkIn, loadRepairs } from "@/lib/repairs-store";

/**
 * Walk-in saves (Phase 174), each through the save queue (Phase 161): kept
 * on the phone first, its photo uploaded first, then sent; a weak signal
 * never loses one. The ids are made here, so a resend is "already saved".
 */

function landed(result: SendResult) {
  if (result.kind === "walkin" && result.walkIn) keepWalkIn(result.walkIn);
  void loadRepairs(true);
}

/** "Ada tukang datang": the walk-in, and with "Baru" its repair first. */
export function startWalkIn(
  visit: WalkInStartInput,
  repair: (RepairInput & { id: string }) | null
): Promise<SubmitOutcome> {
  return submitJob<SendResult>({ kind: "walkin_start", repair, visit }, landed);
}

/**
 * Selesai. `releases` is whoever supervises the visit now: a walk-in that
 * person logs next waits behind this save (offline-queue jobKeys).
 */
export function finishWalkIn(
  visitId: string,
  finish: WalkInFinishInput,
  releases: string | null
): Promise<SubmitOutcome> {
  return submitJob<SendResult>({ kind: "walkin_finish", visitId, finish, releases }, landed);
}

/** "Ganti yang mengawasi", from `releases` (the current supervisor) to `staffId`. */
export function handOverSupervision(visitId: string, staffId: string, releases: string | null): Promise<SubmitOutcome> {
  return submitJob<SendResult>(
    {
      kind: "supervision_handover",
      input: { id: crypto.randomUUID(), visit_id: visitId, staff_id: staffId },
      releases,
    },
    () => void loadRepairs(true)
  );
}

function dropPhoto(url: string | null | undefined) {
  if (!url) return;
  void discardPhoto(url);
  void dataProvider.deletePhoto(url).catch(() => undefined);
}

/**
 * Batalkan after "Ada tukang datang" (5 minutes, migrations/149's delete
 * policy). Still on the phone: it leaves the queue, with any Selesai queued
 * after it. On the server: deleted, and with it the repair made by "Baru"
 * (a report this phone sent, also within 5 minutes). False when the server
 * kept it. Throws SaveStillWaitingError while it is being sent.
 */
export async function undoWalkIn(visitId: string, createdRepairId: string | null, beforePhoto: string): Promise<boolean> {
  const queued = outboxItems().filter(
    (item) =>
      (item.job.kind === "walkin_start" && item.job.visit.id === visitId) ||
      (item.job.kind === "walkin_finish" && item.job.visitId === visitId)
  );
  if (queued.some((item) => isSending(item.id))) throw new SaveStillWaitingError();
  // An earlier try may have landed with its reply lost: that copy goes
  // first. No answer throws, and the saves stay queued.
  let removed: boolean;
  if (createdRepairId) {
    removed = await dataProvider
      .deleteRepair(createdRepairId)
      .then(() => true)
      .catch((err: unknown) => {
        // Nothing to delete is "never landed" (or past the 5 minutes).
        if (err instanceof Error && /not deleted/.test(err.message)) return false;
        throw err;
      });
  } else {
    removed = await dataProvider.deleteRepairWalkIn(visitId);
  }
  if (!removed && queued.length === 0) return false;
  for (const item of queued) {
    await clearFromQueue(item.id);
    if (item.job.kind === "walkin_finish") dropPhoto(item.job.finish.after_photo_url);
  }
  forgetWalkIn(visitId);
  dropPhoto(beforePhoto);
  void loadRepairs(true);
  return true;
}

/**
 * Batalkan after Selesai: the walk-in is open again (5 minutes for a staff
 * phone, migrations/149), its supervising stretch with it, and the after
 * photo goes. Still on the phone: the Selesai leaves the queue.
 */
export async function undoFinish(visitId: string, afterPhoto: string): Promise<boolean> {
  const queued = outboxItems().find((item) => item.job.kind === "walkin_finish" && item.job.visitId === visitId);
  if (queued && isSending(queued.id)) throw new SaveStillWaitingError();
  // Its start is still on the phone too: neither has reached the server, so
  // taking it back needs no signal at all.
  const startWaits = outboxItems().some((item) => item.job.kind === "walkin_start" && item.job.visit.id === visitId);
  if (queued && startWaits) {
    await clearFromQueue(queued.id);
    dropPhoto(afterPhoto);
    return true;
  }
  try {
    await dataProvider.reopenRepairWalkIn(visitId);
  } catch (err) {
    // Not finished on the server: the Selesai never landed. Anything else
    // (past the 5 minutes, no signal) is a real answer.
    if (!queued) return false;
    if (!(err instanceof Error && /not reopened/.test(err.message))) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== "23514" && code !== "42501") throw err;
    }
  }
  if (queued) await clearFromQueue(queued.id);
  dropPhoto(afterPhoto);
  void loadRepairs(true);
  return true;
}
