"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isToday } from "date-fns";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { NumberStepper } from "@/components/number-stepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import {
  STOCK_CATEGORY_ICONS,
  STOCK_CATEGORY_LABELS_ID,
  dueStockItems,
  isStockItem,
  stockItemName,
} from "@/lib/inventory";
import type { InventoryItem, StockCategory } from "@/types/database";

/**
 * "Cek Stok" — the shelves due for a count today (PRD 02).
 *
 * Staff-facing, so entirely Bahasa Indonesia per the Phase 46 language
 * boundary. An item leaves this list the moment its count is saved, and comes
 * back on its own once its cadence (3/7/14 days) has passed.
 *
 * Always measured against the real today: it is its own segment of the staff
 * view, with no date ribbon, because a stock check is a count of what is on
 * the shelf right now.
 */
export function StockCheckPanel() {
  const { inventoryItems, loading } = useHousehold();

  const due = useMemo(() => dueStockItems(inventoryItems), [inventoryItems]);

  const checkedToday = useMemo(
    () =>
      inventoryItems.filter(
        (item) =>
          isStockItem(item) && item.last_audited_at && isToday(new Date(item.last_audited_at))
      ).length,
    [inventoryItems]
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
    );
  }

  if (due.length === 0) {
    return (
      <p className="pt-10 text-center text-sm text-muted-foreground">
        {checkedToday > 0
          ? "Semua stok sudah dicek hari ini. 🎉"
          : "Tidak ada stok yang perlu dicek hari ini."}
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        {due.length} barang perlu dicek. Hitung, foto raknya, lalu simpan.
      </p>
      {due.map((item) => (
        <AuditCard key={item.id} item={item} category={item.category} />
      ))}
    </section>
  );
}

function AuditCard({ item, category }: { item: InventoryItem; category: StockCategory }) {
  const { submitInventoryAudit } = useHousehold();
  const CategoryIcon = STOCK_CATEGORY_ICONS[category];
  const inputRef = useRef<HTMLInputElement>(null);

  // Blank counts rather than last time's numbers: a prefilled stepper can be
  // saved without looking at the shelf, and a wrong-but-plausible count is
  // worse than a zero that shows up red on the owner's dashboard.
  const [boxes, setBoxes] = useState(0);
  const [looseUnits, setLooseUnits] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Preview only — the file itself is uploaded on save, compressed then, so a
  // retaken photo never leaves an orphan in the bucket.
  const previewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again after a retake still fires.
    e.target.value = "";
    if (file) setPhoto(file);
  }

  async function handleSave() {
    if (!photo) {
      toast.error("Ambil foto stok dulu");
      return;
    }
    setSaving(true);
    try {
      await submitInventoryAudit(item.id, boxes, looseUnits, photo);
      // No state reset: saving takes the item off the list, which unmounts
      // this card.
      toast.success(`Stok ${stockItemName(item)} tersimpan ✅`);
    } catch (err) {
      console.error(err);
      toast.error(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "Tidak ada koneksi. Coba lagi nanti."
          : "Gagal menyimpan. Coba lagi."
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium break-words">{stockItemName(item)}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
            <CategoryIcon className="size-3" />
            {STOCK_CATEGORY_LABELS_ID[category]}
          </Badge>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
            Satuan: {item.unit_type}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberStepper
          label="Dus"
          value={boxes}
          onChange={setBoxes}
          disabled={saving}
          decrementLabel="Kurangi Dus"
          incrementLabel="Tambah Dus"
        />
        <NumberStepper
          label="Satuan Lepas"
          value={looseUnits}
          onChange={setLooseUnits}
          disabled={saving}
          decrementLabel="Kurangi Satuan Lepas"
          incrementLabel="Tambah Satuan Lepas"
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhoto}
      />
      {previewUrl ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt=""
            className="size-16 shrink-0 rounded-lg object-cover ring-1 ring-border"
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            disabled={saving}
            onClick={() => inputRef.current?.click()}
          >
            <RefreshCw /> Foto Ulang
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="min-h-[48px] w-full"
          disabled={saving}
          onClick={() => inputRef.current?.click()}
        >
          <Camera /> Foto Stok
        </Button>
      )}

      <Button className="min-h-[48px] w-full" disabled={saving || !photo} onClick={handleSave}>
        {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Simpan & Lanjut
      </Button>
    </div>
  );
}
