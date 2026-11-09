"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FoodPhotoField } from "@/components/kitchen/food-photo-field";
import { useT, useOwnerLocale } from "@/context/owner-locale-context";
import { dataProvider } from "@/lib/data";
import { photoSrc } from "@/lib/photos";
import { COST_NOTE_LIMIT, formatIdr, parseIdr } from "@/lib/repairs";
import type { RepairCost } from "@/types/database";

/**
 * What a repair cost, its receipt and a short note (Phase 159 PR B, D4).
 * Owners only: it lives in the owners' repair sheet, the table is closed to
 * staff phones and the receipt sits in the owner-only owner-receipts bucket
 * (migrations/131). Loaded when the sheet opens, not with the list.
 */
export function RepairCostSection({ repairId }: { repairId: string }) {
  const t = useT();
  const locale = useOwnerLocale();
  const [cost, setCost] = useState<RepairCost | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<File | string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    dataProvider
      .getRepairCost(repairId)
      .then((row) => {
        if (cancelled) return;
        setCost(row);
        setAmount(row?.amount_idr != null ? formatIdr(row.amount_idr) : "");
        setNote(row?.note ?? "");
        setReceipt(row?.receipt_url ?? null);
      })
      .catch((err) => console.error("Repair cost not loaded", err))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [repairId]);

  const parsed = parseIdr(amount);
  const amountInvalid = amount.trim() !== "" && parsed === null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (amountInvalid || saving || receiptBusy) return;
    setSaving(true);
    let uploaded: string | null = null;
    try {
      if (receipt instanceof File) uploaded = await dataProvider.uploadReceipt(receipt, repairId);
      const receiptUrl = receipt instanceof File ? uploaded : receipt;
      const saved = await dataProvider.saveRepairCost(repairId, {
        amount_idr: parsed,
        receipt_url: receiptUrl,
        note: note.trim() ? note.trim().slice(0, COST_NOTE_LIMIT) : null,
      });
      // The old receipt, replaced or removed: gone from storage too.
      if (cost?.receipt_url && cost.receipt_url !== saved.receipt_url) {
        void dataProvider.deleteReceipt(cost.receipt_url).catch(() => undefined);
      }
      setCost(saved);
      setReceipt(saved.receipt_url);
      setAmount(saved.amount_idr != null ? formatIdr(saved.amount_idr) : "");
      setEditing(false);
      toast.success(t("Cost saved", "Biaya disimpan"));
    } catch (err) {
      console.error(err);
      if (uploaded) void dataProvider.deleteReceipt(uploaded).catch(() => undefined);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  const hasAny = !!cost && (cost.amount_idr != null || !!cost.receipt_url || !!cost.note);

  return (
    <section aria-label={t("Cost and receipt", "Biaya dan nota")} className="flex flex-col gap-2 rounded-xl border p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Lock className="size-3.5" /> {t("Cost and receipt · owners only", "Biaya dan nota · hanya pemilik")}
      </h3>
      {!editing && hasAny ? (
        <div className="flex flex-col gap-2">
          {cost?.amount_idr != null && <p className="text-base font-semibold">{formatIdr(cost.amount_idr)}</p>}
          {cost?.note && <p className="text-sm text-gray-700">{cost.note}</p>}
          {cost?.receipt_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc(cost.receipt_url, 640)}
              alt={t("Receipt", "Nota")}
              className="max-h-56 w-full rounded-lg bg-muted object-contain"
            />
          )}
          <Button variant="outline" className="min-h-[44px] self-start rounded-xl" onClick={() => setEditing(true)}>
            {t("Change", "Ubah")}
          </Button>
        </div>
      ) : !editing ? (
        <Button variant="outline" className="min-h-[44px] self-start rounded-xl" onClick={() => setEditing(true)}>
          {t("Add cost or receipt", "Tambah biaya atau nota")}
        </Button>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`cost-${repairId}`} className="text-xs">
              {t("Cost (optional)", "Biaya (opsional)")}
            </Label>
            <Input
              id={`cost-${repairId}`}
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("e.g. 350.000", "mis. 350.000")}
              className="min-h-[48px]"
            />
            {amountInvalid ? (
              <p className="text-[11px] font-medium text-destructive">
                {t("Write it as a number, e.g. 350.000", "Tulis angkanya, mis. 350.000")}
              </p>
            ) : (
              parsed !== null && <p className="text-[11px] text-muted-foreground">{formatIdr(parsed)}</p>
            )}
          </div>
          <FoodPhotoField value={receipt} onChange={setReceipt} onBusyChange={setReceiptBusy} locale={locale} />
          <Input
            value={note}
            maxLength={COST_NOTE_LIMIT}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("Note (optional), e.g. new capacitor", "Catatan (opsional), mis. ganti kapasitor")}
            aria-label={t("Cost note", "Catatan biaya")}
            className="min-h-[44px]"
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="min-h-[44px] flex-1 rounded-xl" onClick={() => setEditing(false)}>
              {t("Cancel", "Batal")}
            </Button>
            <Button type="submit" className="min-h-[44px] flex-1 rounded-xl" disabled={amountInvalid || saving || receiptBusy}>
              {saving && <Loader2 className="animate-spin" />} {t("Save", "Simpan")}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("Staff never see costs or receipts.", "Staf tidak pernah melihat biaya atau nota.")}
          </p>
        </form>
      )}
    </section>
  );
}
