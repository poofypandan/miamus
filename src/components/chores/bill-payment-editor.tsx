"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FoodPhotoField } from "@/components/kitchen/food-photo-field";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useBillPayments } from "@/hooks/use-bill-payments";
import { lastAmount, lastTimeLine, paymentFor, savePayment } from "@/lib/bill-payments";
import { photoSrc } from "@/lib/photos";
import { formatIdr, parseIdr } from "@/lib/repairs";
import type { HouseholdTask } from "@/types/database";

/**
 * A bill's amount and receipt, both optional (Phase 164 PR B). The amount is
 * typed with dots or without ("418.500", "418500", "418rb"); the receipt is a
 * photo or a screenshot of the bank app's proof. Owners only.
 */
export function BillPaymentFields({
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

/**
 * A paid day's payment, shown and changed: what the owner sees on a bill
 * that is done, whoever finished it (an owner from My tasks, or staff with
 * their photos; Codex, PR #65). `row` is the paid day's own row.
 */
export function BillPaymentEditor({ row, seriesId }: { row: HouseholdTask; seriesId: string }) {
  const t = useT();
  const locale = useOwnerLocale();
  const { payments, loaded } = useBillPayments(true);
  const payment = paymentFor(payments, row.id);
  const lastTime = lastTimeLine(lastAmount(payments, seriesId, row.id), locale);
  const [editing, setEditing] = useState(false);
  const [amountText, setAmountText] = useState("");
  const [receipt, setReceipt] = useState<File | string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const parsed = parseIdr(amountText);
  const amountInvalid = amountText.trim() !== "" && parsed === null;

  function start() {
    setAmountText(payment?.amount_idr != null ? formatIdr(payment.amount_idr) : "");
    setReceipt(payment?.receipt_url ?? null);
    setEditing(true);
  }

  async function save() {
    if (amountInvalid || receiptBusy) return;
    setBusy(true);
    try {
      await savePayment({ taskId: row.id, seriesId, amount: parsed, receipt, previous: payment });
      setEditing(false);
      toast.success(t("Saved", "Disimpan"));
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <section aria-label={t("Payment", "Pembayaran")} className="flex flex-col gap-2 rounded-xl border p-3">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Lock className="size-3.5" aria-hidden /> {t("Payment · owners only", "Pembayaran · hanya pemilik")}
      </h4>
      {editing ? (
        <>
          <BillPaymentFields
            amountText={amountText}
            onAmountText={setAmountText}
            amountInvalid={amountInvalid}
            parsedAmount={parsed}
            hint={lastTime}
            receipt={receipt}
            onReceipt={setReceipt}
            onReceiptBusy={setReceiptBusy}
          />
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-11 flex-1 rounded-xl" disabled={busy} onClick={() => setEditing(false)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button className="min-h-11 flex-1 rounded-xl" disabled={busy || amountInvalid || receiptBusy} onClick={save}>
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
          <Button variant="outline" className="min-h-11 self-start rounded-xl" onClick={start}>
            {t("Change", "Ubah")}
          </Button>
        </>
      ) : (
        <Button variant="outline" className="min-h-11 self-start rounded-xl" onClick={start}>
          {t("Add amount or receipt", "Tambah jumlah atau bukti bayar")}
        </Button>
      )}
    </section>
  );
}

/** The editor on its own, for a bill done by someone else (Chores → Today). */
export function BillPaymentSheet({
  row,
  seriesId,
  title,
  open,
  onOpenChange,
}: {
  row: HouseholdTask | null;
  seriesId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  useBackToClose(open, () => onOpenChange(false));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{t("What it cost, and its receipt.", "Jumlahnya, dan bukti bayarnya.")}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {row && <BillPaymentEditor key={row.id} row={row} seriesId={seriesId} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
