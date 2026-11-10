import { dataProvider } from "@/lib/data";
import { formatIdr } from "@/lib/repairs";
import type { OwnerLocale } from "@/lib/owner-locale";
import type { BillPayment, HouseholdTask } from "@/types/database";

/**
 * Bill payments (Phase 164 PR B, D5 A; migrations/138): what a paid day of a
 * bill cost and its receipt, owners only. A bill is a chore in the Bills
 * category; a payment hangs off the paid day's row and names its bill
 * (series_id, set by the server).
 */

export const BILL_HISTORY_LIMIT = 12;

export function isBill(task: Pick<HouseholdTask, "category">): boolean {
  return task.category === "bill";
}

/** The payment recorded for one paid day, if any. */
export function paymentFor(payments: BillPayment[], taskId: string | null | undefined): BillPayment | null {
  if (!taskId) return null;
  return payments.find((p) => p.task_id === taskId) ?? null;
}

/** A bill's payments, newest first, at most BILL_HISTORY_LIMIT. */
export function historyFor(payments: BillPayment[], seriesId: string): BillPayment[] {
  return payments
    .filter((p) => p.series_id === seriesId)
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    .slice(0, BILL_HISTORY_LIMIT);
}

/** The bill's most recent payment with an amount: what "last time" says. */
export function lastAmount(payments: BillPayment[], seriesId: string, exceptTaskId?: string | null): number | null {
  const last = historyFor(payments, seriesId).find((p) => p.amount_idr != null && p.task_id !== exceptTaskId);
  return last?.amount_idr ?? null;
}

/** "Paid · Rp418.500" / "Sudah dibayar · Rp418.500", or just "Paid". */
export function paidLine(payment: BillPayment | null, locale: OwnerLocale): string {
  const word = locale === "id" ? "Sudah dibayar" : "Paid";
  return payment?.amount_idr != null ? `${word} · ${formatIdr(payment.amount_idr)}` : word;
}

/** "Last time Rp412.000" / "Terakhir Rp412.000", or null with no amount yet. */
export function lastTimeLine(amount: number | null, locale: OwnerLocale): string | null {
  if (amount == null) return null;
  return locale === "id" ? `Terakhir ${formatIdr(amount)}` : `Last time ${formatIdr(amount)}`;
}

/** "18 Oct" / "18 Okt": when a payment was recorded. */
export function paidOn(payment: BillPayment, locale: OwnerLocale): string {
  return new Date(payment.paid_at).toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", {
    day: "numeric",
    month: "short",
  });
}

// --- One shared copy of the household's payments ---------------------------------
//
// My tasks, the owner's sheet and the chore form all read payments. One read
// for all of them, done again whenever a payment changes here.

type Listener = (state: { payments: BillPayment[]; loaded: boolean; failed: boolean }) => void;
let state: { payments: BillPayment[]; loaded: boolean; failed: boolean } = { payments: [], loaded: false, failed: false };
let inflight: Promise<void> | null = null;
// A fresh read asked for while one is under way (after a save): that read may
// predate the change, so another follows it (Codex, PR #65).
let rerun = false;
let forHousehold: string | null = null;
const listeners = new Set<Listener>();

function publish(next: typeof state) {
  state = next;
  for (const listener of listeners) listener(state);
}

/**
 * Reads the household's payments. `fresh`: something just changed, so a read
 * already under way isn't enough; one more runs after it.
 */
export function loadBillPayments(fresh = false): Promise<void> {
  if (inflight) {
    if (fresh) rerun = true;
    return inflight;
  }
  inflight = dataProvider
    .listBillPayments()
    .then(
      (payments) => publish({ payments, loaded: true, failed: false }),
      (err) => {
        console.error("Bill payments not loaded", err);
        publish({ ...state, failed: true });
      }
    )
    .finally(() => {
      inflight = null;
      if (rerun) {
        rerun = false;
        void loadBillPayments();
      }
    });
  return inflight;
}

/**
 * The household's refresh (returning to the app, pull to refresh): payments
 * too, if anything on screen shows them, so another owner's change appears
 * (Codex, PR #65). As refreshRepairs.
 */
export function refreshBillPayments(): void {
  if (listeners.size > 0 && forHousehold) void loadBillPayments(true);
}

export function subscribeBillPayments(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/**
 * Makes sure the payments held are this household's: read them if nothing
 * is held yet, or start over when the household changed.
 */
export function ensureBillPayments(householdId: string): void {
  if (forHousehold !== householdId) {
    forHousehold = householdId;
    publish({ payments: [], loaded: false, failed: false });
    void loadBillPayments();
    return;
  }
  if (!state.loaded && !inflight) void loadBillPayments();
}

/**
 * Records (or replaces) a paid day's amount and receipt. A receipt given as a
 * File is uploaded first, under <household>/bills/<bill>/; a replaced receipt
 * is deleted from storage. With neither amount nor receipt, the day's payment
 * is removed. If the save fails, a just-uploaded receipt is removed again.
 */
export async function savePayment(params: {
  taskId: string;
  seriesId: string;
  amount: number | null;
  receipt: File | string | null;
  previous: BillPayment | null;
}): Promise<BillPayment | null> {
  const { taskId, seriesId, amount, receipt, previous } = params;
  let uploaded: string | null = null;
  try {
    if (receipt instanceof File) uploaded = await dataProvider.uploadReceipt(receipt, `bills/${seriesId}`);
    const receiptUrl = receipt instanceof File ? uploaded : receipt;
    if (amount === null && !receiptUrl) {
      await removePayment(taskId);
      return null;
    }
    const saved = await dataProvider.saveBillPayment(taskId, { amount_idr: amount, receipt_url: receiptUrl });
    if (previous?.receipt_url && previous.receipt_url !== saved.receipt_url) {
      void dataProvider.deleteReceipt(previous.receipt_url).catch(() => undefined);
    }
    void loadBillPayments(true);
    return saved;
  } catch (err) {
    if (uploaded) void dataProvider.deleteReceipt(uploaded).catch(() => undefined);
    throw err;
  }
}

/** Removes a day's payment and its receipt (Undo, Mark not done). */
export async function removePayment(taskId: string): Promise<void> {
  const removed = await dataProvider.deleteBillPayment(taskId);
  if (removed?.receipt_url) void dataProvider.deleteReceipt(removed.receipt_url).catch(() => undefined);
  void loadBillPayments(true);
}
