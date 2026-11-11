"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, CircleAlert, Loader2, PackageX, Pencil, Scale } from "lucide-react";
import { AmountControls } from "@/components/shopping/amount-controls";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { amountsOn } from "@/lib/features";
import { amountLine, formatAmount, isTracked } from "@/lib/kitchen-units";
import {
  CATEGORY_LABELS_EN,
  CATEGORY_LABELS_ID,
  STOCK_STATUSES,
  STOCK_STATUS_LABELS,
  stockItemName,
  stockStatus,
} from "@/lib/inventory";
import { photoSrc } from "@/lib/photos";
import { cn } from "@/lib/utils";
import type { InventoryItem, StockStatus } from "@/types/database";

const ICONS: Record<StockStatus, typeof Check> = {
  ok: Check,
  low: CircleAlert,
  out: PackageX,
};

/**
 * Tap an item, say how much is left (Phase 154): three big choices — enough,
 * running low, out. Shared by the owner's Shopping tab and the staff's
 * "Belanja"; staff screens pass "id". The owner also gets "Edit item".
 *
 * Kitchen amounts (Phase 170 PR A): a tracked item also shows its amount,
 * minus, plus and Set amount, for owners and staff; owners get a Track
 * amount row. The item is read live, so the sheet follows every change.
 */
export function StockStatusSheet({
  item: picked,
  lang,
  onClose,
  onEdit,
  onTrack,
}: {
  item: InventoryItem | null;
  lang: "en" | "id";
  onClose: () => void;
  /** Owner only: opens the item's details. */
  onEdit?: (item: InventoryItem) => void;
  /** Owner only: opens Track amount (Kitchen amounts on). */
  onTrack?: (item: InventoryItem) => void;
}) {
  const { setInventoryStatus, inventoryItems } = useHousehold();
  const flags = useHouseholdFeatures();
  const showAmounts = amountsOn(flags);
  // As it is now, not as it was when tapped (minus and plus change it).
  const item = picked ? (inventoryItems.find((i) => i.id === picked.id) ?? picked) : null;
  const tracked = item !== null && showAmounts && isTracked(item);
  const [busy, setBusy] = useState<StockStatus | null>(null);
  // Back (Android, or the browser's) closes the sheet, not the list under it
  // — as every other sheet does (Codex review, PR #9).
  useBackToClose(item !== null, onClose);
  const id = lang === "id";
  const labels = STOCK_STATUS_LABELS[lang];

  async function choose(status: StockStatus) {
    if (!item) return;
    if (status === stockStatus(item)) return onClose();
    setBusy(status);
    try {
      await setInventoryStatus(item.id, status);
      toast.success(`${stockItemName(item)} — ${labels[status].toLowerCase()}`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(id ? "Gagal menyimpan. Coba lagi." : "Couldn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const current = item ? stockStatus(item) : "ok";

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{item ? stockItemName(item) : ""}</SheetTitle>
          <SheetDescription>
            {item && (id ? CATEGORY_LABELS_ID : CATEGORY_LABELS_EN)[item.category]}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {item?.photo_url && (
            // The owner's reference photo, so whoever buys it gets the right
            // product (staff included; Codex review, PR #9).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoSrc(item.photo_url, 640)}
              alt={stockItemName(item)}
              className="mb-1 max-h-48 w-full rounded-xl bg-muted object-contain"
            />
          )}
          {tracked && item && <AmountControls item={item} lang={lang} />}
          {STOCK_STATUSES.map((status) => {
            const Icon = ICONS[status];
            const selected = status === current;
            return (
              <Button
                key={status}
                variant={selected ? "default" : "outline"}
                className={cn("min-h-14 justify-start gap-3 rounded-xl px-4 text-base")}
                disabled={busy !== null}
                onClick={() => choose(status)}
                aria-pressed={selected}
              >
                {busy === status ? <Loader2 className="animate-spin" /> : <Icon className="size-5" />}
                {labels[status]}
              </Button>
            );
          })}
          {onTrack && showAmounts && item && (
            <button
              type="button"
              onClick={() => onTrack(item)}
              className="mt-1 flex min-h-12 items-center gap-3 rounded-xl border bg-card px-3 text-left text-sm active:bg-muted"
            >
              <Scale className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex-1">{id ? "Catat jumlah" : "Track amount"}</span>
              <span className="text-xs text-muted-foreground">
                {isTracked(item)
                  ? [
                      id ? "Aktif" : "On",
                      item.min_threshold > 0
                        ? id
                          ? `hampir habis di ${formatAmount(item.min_threshold, item.unit, lang)}`
                          : `low at ${formatAmount(item.min_threshold, item.unit, lang)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : id
                    ? "Mati"
                    : "Off"}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          )}
          {onEdit && item && (
            <Button
              variant="ghost"
              className="mt-1 min-h-11 text-muted-foreground"
              onClick={() => onEdit(item)}
            >
              <Pencil /> {id ? "Ubah barang" : "Edit item"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The quiet word beside an item that needs buying; nothing for one that is
 * fine (Phase 153 colour rule: red only for out, amber for running low).
 */
export function StockStatusText({
  item,
  lang,
  showAmounts = false,
}: {
  item: InventoryItem;
  lang: "en" | "id";
  /** Kitchen amounts on (read once by the list, not per row). */
  showAmounts?: boolean;
}) {
  const status = stockStatus(item);
  if (showAmounts && isTracked(item)) {
    // "1,2 kg left", grey and "about …" once untouched for 14 days (D2),
    // with the status word when it's running low or out.
    const line = amountLine(item, lang);
    return (
      <span className="flex shrink-0 flex-col items-end text-xs">
        <span className={cn(line.stale ? "text-muted-foreground" : "font-medium text-gray-900")}>{line.text}</span>
        {status !== "ok" && (
          <span className={cn("font-medium", status === "out" ? "text-red-700" : "text-amber-700")}>
            {STOCK_STATUS_LABELS[lang][status]}
          </span>
        )}
      </span>
    );
  }
  if (status === "ok") return null;
  return (
    <span
      className={cn(
        "shrink-0 text-xs font-medium",
        status === "out" ? "text-red-700" : "text-amber-700"
      )}
    >
      {STOCK_STATUS_LABELS[lang][status]}
    </span>
  );
}
