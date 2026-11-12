"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExpiryChips } from "@/components/kitchen/expiry-chips";
import { PlacePicker } from "@/components/kitchen/place-picker";
import { sheetToast } from "@/components/kitchen/sheet-toast";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import { FOOD_PLACE_LABELS, FOOD_UNDO_TOAST_MS, type FoodLocale } from "@/lib/food";
import { placeOf } from "@/lib/ingredients";
import { stockItemName } from "@/lib/inventory";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { FoodPlace, InventoryItem } from "@/types/database";

/**
 * Where an ingredient is kept and when it expires, on its sheet (Phase 176;
 * plan section 5b). Owners and staff phones alike; staff screens pass "id".
 *
 * - A tap on another place moves it at once; the sheet stays open. The toast
 *   says so, with Undo, which puts back the place and the date as they were.
 * - Out of the freezer, a line asks for the new date. No date is filled in:
 *   the app never writes a date nobody gave.
 * - Into the freezer with a date set, a line says the old date may no longer
 *   apply. The date is kept: a printed date is often still right.
 * - The date chips save at once. Hidden while the item is Out, which has no
 *   date (migrations/154).
 *
 * Give it `key={item.id}`, so the lines start fresh for each item.
 */
export function IngredientWhereWhen({ item, lang }: { item: InventoryItem; lang: FoodLocale }) {
  const { setIngredientPlace, setIngredientExpiry } = useHousehold();
  const today = formatDateLocal(useToday());
  const [hint, setHint] = useState<"thawed" | "frozen" | null>(null);
  const id = lang === "id";
  const name = stockItemName(item);
  const place = placeOf(item);
  const out = item.stock_status === "out";
  const failed = id ? "Gagal menyimpan. Coba lagi." : "Couldn't save. Try again.";

  async function undo(before: { kept_in: FoodPlace | null; expires_on: string | null }) {
    setHint(null);
    try {
      // Both, always: the toast can outlive this sheet (closed and opened
      // again, a date set meanwhile), so nothing here can say whether the
      // date changed (Codex, PR #116). The writes go out in order.
      await setIngredientPlace(item.id, before.kept_in);
      await setIngredientExpiry(item.id, before.expires_on);
    } catch (err) {
      console.error(err);
      toast.error(id ? "Gagal membatalkan. Coba lagi." : "Couldn't undo. Try again.", sheetToast);
    }
  }

  async function move(next: FoodPlace) {
    const before = { kept_in: item.kept_in ?? null, expires_on: item.expires_on ?? null };
    // Freezer to fridge then to the counter still wants the new date.
    setHint((h) => (place === "freezer" ? "thawed" : next === "freezer" ? "frozen" : h === "thawed" ? h : null));
    // The screen moves it at once (writeInventoryItem), so the toast does too;
    // a failed save replaces it with the error and the item goes back.
    const label = FOOD_PLACE_LABELS[lang][next];
    const toastId = toast.success(id ? `${name} · dipindahkan ke ${label}` : `${name} · moved to ${label}`, {
      ...sheetToast,
      duration: FOOD_UNDO_TOAST_MS,
      action: { label: id ? "Batalkan" : "Undo", onClick: () => void undo(before) },
    });
    try {
      await setIngredientPlace(item.id, next);
    } catch (err) {
      console.error(err);
      setHint(null);
      toast.error(failed, { ...sheetToast, id: toastId, action: undefined, duration: undefined });
    }
  }

  async function setDate(date: string | null) {
    setHint((h) => (h === "thawed" ? null : h));
    try {
      await setIngredientExpiry(item.id, date);
    } catch (err) {
      console.error(err);
      toast.error(failed, sheetToast);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PlacePicker value={place} onChange={(next) => void move(next)} locale={lang} />
      {!out && (
        <div className="flex flex-col gap-2">
          {hint === "thawed" && (
            <p role="status" className="text-sm font-medium text-amber-700">
              {id ? "Keluar dari freezer. Sekarang kapan kedaluwarsa?" : "Out of the freezer. When does it expire now?"}
            </p>
          )}
          <ExpiryChips value={item.expires_on ?? null} onChange={(date) => void setDate(date)} today={today} locale={lang} />
          {hint === "frozen" && place === "freezer" && item.expires_on && (
            <p role="status" className="text-xs text-muted-foreground">
              {id
                ? "Di freezer lebih awet. Ketuk Tidak ada kalau tanggal lama sudah tidak berlaku."
                : "In the freezer it keeps longer. Tap No date if the old date no longer applies."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
