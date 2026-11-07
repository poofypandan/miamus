"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, CircleAlert, Loader2, PackageX, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
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
 */
export function StockStatusSheet({
  item,
  lang,
  onClose,
  onEdit,
}: {
  item: InventoryItem | null;
  lang: "en" | "id";
  onClose: () => void;
  /** Owner only: opens the item's details. */
  onEdit?: (item: InventoryItem) => void;
}) {
  const { setInventoryStatus } = useHousehold();
  const [busy, setBusy] = useState<StockStatus | null>(null);
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
export function StockStatusText({ item, lang }: { item: InventoryItem; lang: "en" | "id" }) {
  const status = stockStatus(item);
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
