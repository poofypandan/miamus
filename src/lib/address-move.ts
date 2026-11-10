import { CANONICAL_ORIGIN } from "@/config/hosts";
import type { DrainReport, OfflineQueueItem } from "@/lib/offline-queue";

/**
 * Moving a phone from an old address to miamus.app without losing what is
 * waiting on it (address move, 2026-11-10). The screen is AddressMoveGate;
 * this is its logic, free of React and of the browser, so the tests can run
 * it with any queue, any connection and any host.
 *
 * WHY. Browser storage belongs to one address. A phone on miamus.vercel.app
 * keeps its unsent logs (lib/offline-queue.ts) there, where miamus.app can
 * never read them. So the old address sends them first, and moves on only
 * when nothing is waiting — or when the person deliberately chooses to go
 * anyway, told that what is waiting stays behind on the old address.
 *
 * Nothing here ever removes a save from the queue. Only drainOutbox does,
 * exactly as on every other screen: once the server has it, or once the
 * server has refused it.
 */

/**
 * What the middleware serves every page as on an old address: an empty page,
 * so the page asked for never runs there; AddressMoveGate draws the screen.
 */
export const MOVED_PATH = "/moved";

/** Who is holding the phone, as far as the old address can tell. */
export type MoveAudience = "owner" | "staff" | "visitor";

/**
 * Where on miamus.app to continue.
 *
 *   /join/…   the same link: an invite link (its token already in the link
 *             the admin sent, unused because this address never opened it)
 *             or the house-code screen
 *   staff     the house-code screen: code, name, PIN — the existing way back
 *             in for a phone with no session (Phase 151)
 *   /auth/…   the start: a half-finished Google sign-in belongs to this
 *             address and cannot finish on the other one
 *   anything  else: the same page
 *
 * Nothing new is put in the link: no session, no house code, no PIN. The
 * hash is dropped, as auth-js can carry tokens there.
 */
export function movedUrl(
  location: { pathname: string; search: string },
  audience: MoveAudience,
  origin: string = CANONICAL_ORIGIN
): string {
  const path = location.pathname.startsWith("/") ? location.pathname : "/";
  if (path.startsWith("/auth")) return `${origin}/`;
  if (path === "/join" || path.startsWith("/join/")) return `${origin}${path}${location.search}`;
  if (audience === "staff") return `${origin}/join/code`;
  return `${origin}${path}${location.search}`;
}

/** Why saves are still waiting after a try. */
export type WaitingReason =
  /** The phone says it has no connection: nothing was tried. */
  | "offline"
  /** Tried, and the server did not answer (a weak signal), or the reload after failed. */
  | "no-answer"
  /** Saved for another household this phone was linked to; only that one can send them. */
  | "other-household"
  /** This phone is signed out on the old address, so nothing can be sent from it. */
  | "signed-out"
  /** The queue itself could not be read or sent (blocked storage, say). */
  | "error";

export type SendOutcome =
  | { status: "empty"; sent: number; refused: number }
  | {
      status: "waiting";
      /** How many saves are still on the phone; null when the queue could not be read. */
      waiting: number | null;
      sent: number;
      refused: number;
      reason: WaitingReason;
    };

export interface SendDeps {
  /** Everything on the phone, every household. */
  readQueue(): Promise<readonly OfflineQueueItem[]>;
  /** One pass of drainOutbox (with whatever lock and clean-up the screen adds). */
  drain(): Promise<DrainReport>;
  /** navigator.onLine — false means no try at all. */
  online(): boolean;
  /** True when the old address has no session to send with. */
  signedOut(): Promise<boolean>;
  /**
   * The longest the screen waits for one pass. A photo upload has no deadline
   * of its own (lib/photo-queue.ts), so on weak Wi-Fi a pass can take
   * minutes; past this the screen says "still waiting" and offers Coba lagi
   * and Pindah sekarang while the pass carries on (Codex, PR #54).
   */
  waitMs?: number;
  /**
   * What every pass on this screen has sent and had refused, kept across
   * tries. Without it a pass that finished after the screen stopped waiting
   * would be forgotten — and drainOutbox has already removed what the server
   * refused, so the next look finds an empty queue and the person is never
   * told to enter those saves again (Codex, PR #54).
   */
  tally?: SendTally;
}

/** Counts each pass's report once, however many tries waited on it. */
export class SendTally {
  private counted = new WeakSet<DrainReport>();
  sent = 0;
  refused = 0;

  add(report: DrainReport): void {
    if (this.counted.has(report)) return;
    this.counted.add(report);
    // Sent saves leave the queue only once the reload after them worked;
    // until then the next pass confirms them (lib/offline-queue.ts).
    if (report.confirmed) this.sent += report.sent.length;
    this.refused += report.refused.length;
  }
}

/** As long as a save button spins (lib/offline-queue.ts UI_WAIT_MS). */
export const SEND_WAIT_MS = 25_000;

const TIMED_OUT = Symbol("timed out");

/**
 * Sends what is waiting, once, and says what is left. `onSending` is called
 * with the count before the try, for "Mengirim 3 catatan…".
 *
 * `sent` and `refused` are this screen's totals when `deps.tally` is given
 * (the screen always gives one), otherwise this try's alone.
 */
export async function sendBeforeMove(deps: SendDeps, onSending?: (count: number) => void): Promise<SendOutcome> {
  const tally = deps.tally ?? new SendTally();
  const empty = (): SendOutcome => ({ status: "empty", sent: tally.sent, refused: tally.refused });
  const waiting = (reason: WaitingReason, count: number | null): SendOutcome => ({
    status: "waiting",
    waiting: count,
    sent: tally.sent,
    refused: tally.refused,
    reason,
  });

  let before: readonly OfflineQueueItem[];
  try {
    before = await deps.readQueue();
  } catch {
    return waiting("error", null);
  }
  if (before.length === 0) return empty();

  if (!deps.online()) return waiting("offline", before.length);
  if (await deps.signedOut().catch(() => false)) return waiting("signed-out", before.length);

  onSending?.(before.length);
  const pass = deps.drain();
  // Counted whenever it ends, even after this try has stopped waiting.
  pass.then(
    (finished) => tally.add(finished),
    () => undefined
  );
  let report: DrainReport | typeof TIMED_OUT;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    report = await Promise.race([
      pass,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), deps.waitMs ?? SEND_WAIT_MS);
      }),
    ]);
  } catch {
    const left = await deps.readQueue().catch(() => null);
    if (left && left.length === 0) return empty();
    return waiting("error", left ? left.length : before.length);
  } finally {
    clearTimeout(timer);
  }

  if (report === TIMED_OUT) {
    // Still sending. The queue says what is left; the pass carries on, and
    // the tally takes its report when it ends.
    const left = await deps.readQueue().catch(() => null);
    if (left && left.length === 0) return empty();
    return waiting("no-answer", left ? left.length : before.length);
  }
  tally.add(report);

  let after: readonly OfflineQueueItem[];
  try {
    after = await deps.readQueue();
  } catch {
    return waiting("error", null);
  }
  if (after.length === 0) return empty();
  // drainOutbox counts what it tried and could not send; what it skipped
  // belongs to another household and is in neither count.
  const reason: WaitingReason = report.waiting > 0 || !report.confirmed ? "no-answer" : "other-household";
  return waiting(reason, after.length);
}

/**
 * The one rule of the screen: open miamus.app only with nothing waiting, or
 * after the person has seen the warning and chosen to go anyway.
 */
export function mayMove(outcome: SendOutcome | null, choseToLeaveWaiting: boolean): boolean {
  if (outcome?.status === "empty") return true;
  return choseToLeaveWaiting;
}

/** What turning push off at the move needs; the screen passes the real ones. */
export interface StopPushDeps {
  /** This address's browser subscription, if it has one. */
  subscription(): Promise<{ endpoint: string; unsubscribe(): Promise<boolean> } | null>;
  /** The server's copy (push_subscriptions), deleted by endpoint. */
  deleteRow(endpoint: string): Promise<void>;
  /** Stops the silent re-subscribe (PUSH_WANTED_KEY). */
  forget(): void;
  /** How long the move waits for the server. */
  waitMs?: number;
}

/**
 * Turns push off on the old address before the move, as the screen says.
 *
 * The phone's own subscription goes first and does not wait for the server:
 * on a stalled connection the move goes ahead after a few seconds, and a
 * browser still subscribed here would keep receiving notifications that
 * open the old address (Codex, PR #54). The server's row is removed alongside,
 * best-effort; one left behind only fails to deliver, and send-push removes
 * it the next time it tries (the browser answers 410 Gone).
 */
export async function stopPushForMove(deps: StopPushDeps): Promise<void> {
  deps.forget();
  const subscription = await deps.subscription().catch(() => null);
  if (!subscription) return;
  const { endpoint } = subscription;
  const server = deps.deleteRow(endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
  await Promise.race([server, new Promise((resolve) => setTimeout(resolve, deps.waitMs ?? 4_000))]);
}

/** Chore drafts kept on this phone (lib/chore-draft.ts): photos taken, not yet finished. */
export const CHORE_DRAFT_PREFIX = "miamus_chore_draft:";

export function countChoreDrafts(keys: Iterable<string>): number {
  let count = 0;
  for (const key of keys) if (key.startsWith(CHORE_DRAFT_PREFIX)) count++;
  return count;
}
