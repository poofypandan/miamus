"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isToday } from "date-fns";
import { toast } from "sonner";
import { Camera, CheckCircle2, Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import {
  STOCK_CATEGORIES,
  STOCK_CATEGORY_ICONS,
  STOCK_CATEGORY_LABELS_ID,
  isAuditDue,
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
 * Tied to the real today, not the ribbon's date: a stock check is a count of
 * what is on the shelf right now, so browsing to tomorrow must not offer
 * tomorrow's checks early — the panel simply steps aside on any other day.
 */
export function StockCheckPanel() {
  const { inventoryItems, selectedDate } = useHousehold();

  const stockItems = useMemo(() => inventoryItems.filter(isStockItem), [inventoryItems]);

  // Walked shelf by shelf in STOCK_CATEGORIES order, so dog supplies — the
  // high-priority shelf — are counted first.
  const due = useMemo(() => {
    const now = new Date();
    return stockItems
      .filter((item) => isAuditDue(item, now))
      .sort(
        (a, b) =>
          STOCK_CATEGORIES.indexOf(a.category) - STOCK_CATEGORIES.indexOf(b.category) ||
          stockItemName(a).localeCompare(stockItemName(b))
      );
  }, [stockItems]);

  const checkedToday = useMemo(
    () =>
      stockItems.filter((item) => item.last_audited_at && isToday(new Date(item.last_audited_at)))
        .length,
    [stockItems]
  );

  if (!isToday(selectedDate)) return null;
  // Nothing to count and nothing counted: a fresh install or a missing
  // migration. Stay out of the way rather than showing an empty heading.
  if (due.length === 0 && checkedToday === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Cek Stok</h2>
        {due.length > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {due.length} barang
          </Badge>
        )}
      </div>

      {due.length === 0 ? (
        <p className="text-sm text-muted-foreground">Semua stok sudah dicek hari ini. 🎉</p>
      ) : (
        <div className="flex flex-col gap-2">
          {due.map((item) => (
            <AuditCard key={item.id} item={item} category={item.category} />
          ))}
        </div>
      )}
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
        <Stepper label="Dus" value={boxes} onChange={setBoxes} disabled={saving} />
        <Stepper label="Satuan Lepas" value={looseUnits} onChange={setLooseUnits} disabled={saving} />
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

/**
 * A `-` / `+` counter with the number itself typeable, because a tray of 30
 * eggs is thirty taps otherwise.
 */
function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Kurangi ${label}`}
        >
          <Minus />
        </Button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const parsed = parseInt(e.target.value.replace(/\D/g, ""), 10);
            onChange(Number.isNaN(parsed) ? 0 : parsed);
          }}
          aria-label={label}
          className="h-11 w-full min-w-0 rounded-md border bg-background text-center text-base font-semibold tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          aria-label={`Tambah ${label}`}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
