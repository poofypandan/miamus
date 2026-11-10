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
}

/**
 * Sends what is waiting, once, and says what is left. `onSending` is called
 * with the count before the try, for "Mengirim 3 catatan…".
 */
export async function sendBeforeMove(deps: SendDeps, onSending?: (count: number) => void): Promise<SendOutcome> {
  let before: readonly OfflineQueueItem[];
  try {
    before = await deps.readQueue();
  } catch {
    return { status: "waiting", waiting: null, sent: 0, refused: 0, reason: "error" };
  }
  if (before.length === 0) return { status: "empty", sent: 0, refused: 0 };

  const waiting = (reason: WaitingReason, count: number | null, sent = 0, refused = 0): SendOutcome => ({
    status: "waiting",
    waiting: count,
    sent,
    refused,
    reason,
  });

  if (!deps.online()) return waiting("offline", before.length);
  if (await deps.signedOut().catch(() => false)) return waiting("signed-out", before.length);

  onSending?.(before.length);
  let report: DrainReport;
  try {
    report = await deps.drain();
  } catch {
    const left = await deps.readQueue().catch(() => null);
    if (left && left.length === 0) return { status: "empty", sent: 0, refused: 0 };
    return waiting("error", left ? left.length : before.length);
  }

  let after: readonly OfflineQueueItem[];
  try {
    after = await deps.readQueue();
  } catch {
    return waiting("error", null, report.sent.length, report.refused.length);
  }
  const sent = report.sent.length;
  const refused = report.refused.length;
  if (after.length === 0) return { status: "empty", sent, refused };
  // drainOutbox counts what it tried and could not send; what it skipped
  // belongs to another household and is in neither count.
  const reason: WaitingReason = report.waiting > 0 || !report.confirmed ? "no-answer" : "other-household";
  return waiting(reason, after.length, sent, refused);
}

/**
 * The one rule of the screen: open miamus.app only with nothing waiting, or
 * after the person has seen the warning and chosen to go anyway.
 */
export function mayMove(outcome: SendOutcome | null, choseToLeaveWaiting: boolean): boolean {
  if (outcome?.status === "empty") return true;
  return choseToLeaveWaiting;
}

/** Chore drafts kept on this phone (lib/chore-draft.ts): photos taken, not yet finished. */
export const CHORE_DRAFT_PREFIX = "miamus_chore_draft:";

export function countChoreDrafts(keys: Iterable<string>): number {
  let count = 0;
  for (const key of keys) if (key.startsWith(CHORE_DRAFT_PREFIX)) count++;
  return count;
}
