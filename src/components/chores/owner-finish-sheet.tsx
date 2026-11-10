"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CloudUpload, Loader2, Lock, Pencil, RotateCcw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FoodPhotoField } from "@/components/kitchen/food-photo-field";
import { useBillPayments } from "@/hooks/use-bill-payments";
import { isBill, lastAmount, lastTimeLine, paymentFor, savePayment } from "@/lib/bill-payments";
import { formatIdr, parseIdr } from "@/lib/repairs";
import { photoSrc, photoTakenAt } from "@/lib/photos";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PhotoPicker } from "@/components/photo-picker";
import { ChoreProofPhotos } from "@/components/chores/chore-proof-photos";
import { useFormatTime } from "@/components/ui/ui-labels";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useQueuedPhoto } from "@/hooks/use-queued-photo";
import { useFinishMyChore } from "@/hooks/use-finish-my-chore";
import { useLocationName } from "@/hooks/use-household-locations";
import { choreDraftKey, clearChoreDraft, readChoreDraft, writeChoreDraft } from "@/lib/chore-draft";
import {
  coverTakeover,
  recurrenceOf,
  taskRepeatLabel,
  type ChoreOccurrence,
} from "@/lib/chore-recurrence";

import { cn } from "@/lib/utils";

/**
 * An admin's own chore, opened from "My tasks" on Today (Phase 163): mark it
 * done, optionally with the before and after photos staff take, mark it not
 * done again, or edit it.
 *
 * Owner-facing, in the owner's language. The staff view keeps its own
 * sheet (FinishChoreSheet), unchanged: photos stay required there, and it
 * remains how an owner sees what a staff phone sees.
 *
 * Photos are both or none (migrations/136): with one in, Mark done waits for
 * the other.
 */
export function OwnerFinishSheet({
  occurrence,
  mode,
  open,
  onOpenChange,
  onEdit,
}: {
  occurrence: ChoreOccurrence | null;
  mode: "today" | "future" | "past";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (occurrence: ChoreOccurrence) => void;
}) {
  useBackToClose(open, () => onOpenChange(false));
  if (!occurrence) return null;
  // Keyed, so a second chore never inherits the first one's photos.
  return (
    <OwnerFinishBody
      key={occurrence.key}
      occurrence={occurrence}
      mode={mode}
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
    />
  );
}

function OwnerFinishBody({
  occurrence,
  mode,
  open,
  onOpenChange,
  onEdit,
}: {
  occurrence: ChoreOccurrence;
  mode: "today" | "future" | "past";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (occurrence: ChoreOccurrence) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const formatTime = useFormatTime();
  const roomName = useLocationName();
  const { activeHouseholdId, memberProfile, pendingIds } = useHousehold();
  const { finish, reopen } = useFinishMyChore();
  const { task } = occurrence;
  const done = occurrence.status === "completed";
  const waiting = !!occurrence.row && pendingIds.has(occurrence.row.id);

  // Photos survive the tab being killed between the two, as on staff phones
  // (Phase 133): the same draft, keyed by the chore and the day.
  const draftKey = choreDraftKey(activeHouseholdId, occurrence.template.id, occurrence.date);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(() => readChoreDraft(draftKey)?.before ?? null);
  const [afterUrl, setAfterUrl] = useState<string | null>(() => readChoreDraft(draftKey)?.after ?? null);
  const [uploadingBefore, setUploadingBefore] = useState(false);
  const [uploadingAfter, setUploadingAfter] = useState(false);
  const [busy, setBusy] = useState(false);
  const uploading = uploadingBefore || uploadingAfter;
  const beforeState = useQueuedPhoto(beforeUrl).state;
  const afterState = useQueuedPhoto(afterUrl).state;
  const photoFailed = beforeState === "failed" || afterState === "failed";
  const onePhoto = !!beforeUrl !== !!afterUrl;
  // Covering a repeat's first day for someone on leave (coverTakeover):
  // photos are required for this one.
  const photosRequired = coverTakeover(occurrence, memberProfile?.id).kind === "needsPhotos";
  const missingPhotos = onePhoto || (photosRequired && !(beforeUrl && afterUrl));

  useEffect(() => {
    if (done) return;
    writeChoreDraft(draftKey, { before: beforeUrl, after: afterUrl });
  }, [draftKey, beforeUrl, afterUrl, done]);

  // --- A bill (Phase 164 PR B): Mark paid, with an optional amount and
  // receipt, owners only. Instead of the chore photos.
  const bill = isBill(task);
  const { payments, loaded: paymentsLoaded } = useBillPayments(bill);
  const seriesId = occurrence.template.id;
  const payment = paymentFor(payments, occurrence.row?.id);
  const lastTime = lastTimeLine(lastAmount(payments, seriesId, occurrence.row?.id), locale);
  const [amountText, setAmountText] = useState("");
  const [receipt, setReceipt] = useState<File | string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [editingPayment, setEditingPayment] = useState(false);
  const parsedAmount = parseIdr(amountText);
  const amountInvalid = amountText.trim() !== "" && parsedAmount === null;
  const hasPaymentInput = parsedAmount !== null || !!receipt;

  async function markPaid() {
    if (amountInvalid || receiptBusy) return;
    setBusy(true);
    const result = await finish(occurrence);
    if (result?.outcome === "sent" && hasPaymentInput) {
      try {
        await savePayment({ taskId: result.task.id, seriesId, amount: parsedAmount, receipt, previous: null });
      } catch (err) {
        console.error(err);
        toast.error(
          t(
            "Paid, but the amount wasn't saved. Open it to add it again.",
            "Sudah dibayar, tapi jumlahnya gagal disimpan. Buka lagi untuk menambahkannya."
          )
        );
      }
    } else if (result?.outcome === "queued" && hasPaymentInput) {
      toast.info(
        t(
          "The amount and receipt can be added once it has been sent.",
          "Jumlah dan bukti bayar bisa ditambahkan setelah terkirim."
        )
      );
    }
    setBusy(false);
    if (result) onOpenChange(false);
  }

  function startEditingPayment() {
    setAmountText(payment?.amount_idr != null ? formatIdr(payment.amount_idr) : "");
    setReceipt(payment?.receipt_url ?? null);
    setEditingPayment(true);
  }

  async function savePaymentEdit() {
    if (!occurrence.row || amountInvalid || receiptBusy) return;
    setBusy(true);
    try {
      await savePayment({ taskId: occurrence.row.id, seriesId, amount: parsedAmount, receipt, previous: payment });
      setEditingPayment(false);
      toast.success(t("Saved", "Disimpan"));
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  async function markDone() {
    if (bill) return markPaid();
    if (missingPhotos || uploading || photoFailed) return;
    setBusy(true);
    const result = await finish(occurrence, beforeUrl && afterUrl ? { before: beforeUrl, after: afterUrl } : undefined);
    setBusy(false);
    if (!result) return;
    // Sent: nothing is owed any more. Kept on the phone: the queue clears
    // the draft once it has gone (useOfflineSync).
    if (result.outcome === "sent") clearChoreDraft(draftKey);
    onOpenChange(false);
  }

  async function markNotDone() {
    if (!occurrence.row) return;
    setBusy(true);
    const ok = await reopen(
      occurrence.row.id,
      {
        before: occurrence.row.before_photo_url ?? null,
        after: occurrence.row.after_photo_url ?? null,
      },
      bill
    );
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  const recurrence = recurrenceOf(occurrence.template);
  const repeatLabel = recurrence === "none" ? null : taskRepeatLabel(occurrence.template, locale);
  const where = roomName(task.location_id, task.spot);
  const details = [task.due_time ? formatTime(task.due_time) : t("Anytime", "Kapan saja"), where, repeatLabel]
    .filter(Boolean)
    .join(" · ");
  const forMe = !!memberProfile && task.assigned_to === memberProfile.id;
  const pathPrefix = `household/${occurrence.template.id}`;
  const canFinish = mode === "today" && !done;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{task.title}</SheetTitle>
          <SheetDescription>{details}</SheetDescription>
          {forMe && (
            <span className="mt-1 flex w-fit items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-gray-700">
              <UserRound className="size-3" aria-hidden /> {t("For you", "Untuk Anda")}
            </span>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {task.notes && (
            <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">{task.notes}</p>
          )}

          {done ? (
            <>
              {waiting ? (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <CloudUpload className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {t(
                      "Done, saved on this phone. It will be sent when the signal is back.",
                      "Selesai, tersimpan di HP. Akan dikirim otomatis saat sinyal bagus."
                    )}
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <CheckCircle2 className="size-4 shrink-0" /> {t("This chore is done.", "Tugas ini sudah selesai.")}
                </p>
              )}
              {occurrence.row && !bill && <ChoreProofPhotos row={occurrence.row} locale={locale} interactive />}
              {bill && occurrence.row && paymentsLoaded && (
                <section aria-label={t("Payment", "Pembayaran")} className="flex flex-col gap-2 rounded-xl border p-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Lock className="size-3.5" aria-hidden /> {t("Payment · owners only", "Pembayaran · hanya pemilik")}
                  </h4>
                  {editingPayment ? (
                    <>
                      <BillPaymentFields
                        amountText={amountText}
                        onAmountText={setAmountText}
                        amountInvalid={amountInvalid}
                        parsedAmount={parsedAmount}
                        hint={lastTime}
                        receipt={receipt}
                        onReceipt={setReceipt}
                        onReceiptBusy={setReceiptBusy}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="min-h-11 flex-1 rounded-xl"
                          disabled={busy}
                          onClick={() => setEditingPayment(false)}
                        >
                          {t("Cancel", "Batal")}
                        </Button>
                        <Button
                          className="min-h-11 flex-1 rounded-xl"
                          disabled={busy || amountInvalid || receiptBusy}
                          onClick={savePaymentEdit}
                        >
                          {busy && <Loader2 className="animate-spin" />} {t("Save", "Simpan")}
                        </Button>
                      </div>
                    </>
                  ) : payment ? (
                    <>
                      {payment.amount_idr != null && <p className="text-base font-semibold">{formatIdr(payment.amount_idr)}</p>}
                      {payment.receipt_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoSrc(payment.receipt_url, 640)}
                          alt={t("Receipt", "Bukti bayar")}
                          className="max-h-56 w-full rounded-lg bg-muted object-contain"
                        />
                      )}
                      <Button variant="outline" className="min-h-11 self-start rounded-xl" onClick={startEditingPayment}>
                        {t("Change", "Ubah")}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" className="min-h-11 self-start rounded-xl" onClick={startEditingPayment}>
                      {t("Add amount or receipt", "Tambah jumlah atau bukti bayar")}
                    </Button>
                  )}
                </section>
              )}
            </>
          ) : canFinish && bill ? (
            <section className="flex flex-col gap-3">
              <BillPaymentFields
                amountText={amountText}
                onAmountText={setAmountText}
                amountInvalid={amountInvalid}
                parsedAmount={parsedAmount}
                hint={lastTime}
                receipt={receipt}
                onReceipt={setReceipt}
                onReceiptBusy={setReceiptBusy}
              />
            </section>
          ) : canFinish ? (
            <>
              <section className="flex flex-col gap-2">
                {photosRequired && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {t(
                      "You're covering this for someone on leave, so it needs both photos.",
                      "Anda menggantikan staf yang sedang cuti, jadi tugas ini perlu dua foto."
                    )}
                  </p>
                )}
                <h4 className="text-sm font-semibold text-gray-800">
                  {photosRequired ? t("Photos", "Foto") : t("Add photos (optional)", "Tambah foto (opsional)")}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <PhotoStep step={1} title={t("Before photo", "Foto sebelum")} url={beforeUrl}>
                    <PhotoPicker
                      offline
                      disabled={busy}
                      pathPrefix={pathPrefix}
                      value={beforeUrl}
                      onChange={setBeforeUrl}
                      onBusyChange={setUploadingBefore}
                      label={t("Take photo", "Ambil foto")}
                      locale={locale}
                      busyLabel={t("Saving…", "Menyimpan…")}
                      errorMessage={t("Couldn't upload the photo", "Gagal mengunggah foto")}
                      className="min-h-11 w-full"
                    />
                  </PhotoStep>
                  <PhotoStep step={2} title={t("After photo", "Foto sesudah")} url={afterUrl}>
                    <PhotoPicker
                      offline
                      disabled={busy}
                      pathPrefix={pathPrefix}
                      value={afterUrl}
                      onChange={setAfterUrl}
                      onBusyChange={setUploadingAfter}
                      label={t("Take photo", "Ambil foto")}
                      locale={locale}
                      busyLabel={t("Saving…", "Menyimpan…")}
                      errorMessage={t("Couldn't upload the photo", "Gagal mengunggah foto")}
                      className="min-h-11 w-full"
                    />
                  </PhotoStep>
                </div>
                <p className={cn("text-center text-xs", onePhoto ? "font-medium text-amber-800" : "text-muted-foreground")}>
                  {onePhoto
                    ? beforeUrl
                      ? t("Add the after photo too, or remove this one.", "Tambahkan foto sesudah, atau hapus foto ini.")
                      : t("Add the before photo too, or remove this one.", "Tambahkan foto sebelum, atau hapus foto ini.")
                    : photosRequired
                      ? t("Both photos are needed.", "Perlu dua foto.")
                      : t("Both photos, or none.", "Dua foto, atau tidak sama sekali.")}
                </p>
              </section>
            </>
          ) : mode === "future" ? (
            <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
              {t("You can mark it done on the day.", "Bisa ditandai selesai pada harinya.")}
            </p>
          ) : null}
        </div>

        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {canFinish && (
            bill ? (
              <Button
                onClick={markPaid}
                disabled={busy || amountInvalid || receiptBusy}
                className="min-h-12 rounded-xl"
              >
                {busy || receiptBusy ? <Loader2 className="animate-spin" /> : <Check />}
                {t("Mark paid", "Tandai sudah dibayar")}
              </Button>
            ) : (
              <Button
                onClick={markDone}
                disabled={busy || uploading || missingPhotos || photoFailed}
                className="min-h-12 rounded-xl"
              >
                {busy || uploading ? <Loader2 className="animate-spin" /> : photoFailed ? <AlertTriangle /> : <Check />}
                {uploading
                  ? t("Saving photo…", "Menyimpan foto…")
                  : photoFailed
                    ? t("Retake the broken photo", "Ambil ulang foto yang rusak")
                    : t("Mark done", "Tandai selesai")}
              </Button>
            )
          )}
          {/* Past days too (Codex, PR #58): a carried-over chore finished
              today leaves today's list, and its own day is where it can be
              opened again once the Undo toast has gone. */}
          {done && occurrence.row && (
            <Button variant="outline" onClick={markNotDone} disabled={busy} className="min-h-12 rounded-xl">
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} {t("Mark not done", "Tandai belum selesai")}
            </Button>
          )}
          {!done && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onEdit(occurrence);
              }}
              className="min-h-12 rounded-xl"
            >
              <Pencil /> {bill ? t("Edit bill", "Ubah tagihan") : t("Edit chore", "Ubah tugas")}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A bill's amount and receipt, both optional (Phase 164 PR B). The amount is
 * typed with dots as you go or not ("418.500", "418500", "418rb"); the
 * receipt is a photo or a screenshot of the bank app's proof.
 */
function BillPaymentFields({
  amountText,
  onAmountText,
  amountInvalid,
  parsedAmount,
  hint,
  receipt,
  onReceipt,
  onReceiptBusy,
}: {
  amountText: string;
  onAmountText: (text: string) => void;
  amountInvalid: boolean;
  parsedAmount: number | null;
  hint: string | null;
  receipt: File | string | null;
  onReceipt: (next: File | null) => void;
  onReceiptBusy: (busy: boolean) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bill-amount" className="text-xs">
          {t("Amount (optional)", "Jumlah (opsional)")}
        </Label>
        <Input
          id="bill-amount"
          inputMode="numeric"
          value={amountText}
          onChange={(e) => onAmountText(e.target.value)}
          placeholder={hint ?? t("e.g. 418.500", "mis. 418.500")}
          className="min-h-12"
        />
        {amountInvalid ? (
          <p className="text-[11px] font-medium text-destructive">
            {t("Write it as a number, e.g. 418.500", "Tulis angkanya, mis. 418.500")}
          </p>
        ) : parsedAmount !== null ? (
          <p className="text-[11px] text-muted-foreground">{formatIdr(parsedAmount)}</p>
        ) : (
          hint && <p className="text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">{t("Receipt (optional)", "Bukti bayar (opsional)")}</span>
        <FoodPhotoField value={receipt} onChange={onReceipt} onBusyChange={onReceiptBusy} locale={locale} />
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="size-3 shrink-0" aria-hidden />
        {t("Only owners see amounts and receipts.", "Hanya pemilik yang bisa melihat jumlah dan bukti bayar.")}
      </p>
    </>
  );
}

/** One optional photo, numbered; green with the time once it is in. */
function PhotoStep({
  step,
  title,
  url,
  children,
}: {
  step: 1 | 2;
  title: string;
  url: string | null;
  children: React.ReactNode;
}) {
  const t = useT();
  const formatTime = useFormatTime();
  const takenAt = photoTakenAt(url);
  const failed = useQueuedPhoto(url).state === "failed";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-2.5",
        failed ? "border-red-200 bg-red-50/60" : url ? "border-emerald-200 bg-emerald-50/60" : "bg-card"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            failed ? "bg-red-600 text-white" : url ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
          )}
        >
          {failed ? <AlertTriangle className="size-3.5" /> : url ? <Check className="size-3.5" /> : step}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{title}</span>
          {url && takenAt && (
            <span className="text-[11px] text-muted-foreground">
              {t(`Taken ${formatTime(takenAt)}`, `Diambil ${formatTime(takenAt)}`)}
            </span>
          )}
        </span>
      </div>
      {children}
    </div>
  );
}
