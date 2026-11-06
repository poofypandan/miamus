"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PhotoPicker } from "@/components/photo-picker";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import {
  CATEGORY_LABELS_EN,
  CATEGORY_LABELS_ID,
  INVENTORY_SCOPES,
  INVENTORY_UNITS,
  SCOPE_CATEGORIES,
  SCOPE_LABELS_EN,
  SCOPE_LABELS_ID,
} from "@/lib/inventory";
import type {
  InventoryCategory,
  InventoryItem,
  InventoryScope,
  InventoryUnit,
} from "@/types/database";

// How often staff are asked to count the item on "Stok". The fresh/pantry
// cadences of Phase 83B (3 and 14 days) sit either side of the weekly default.
const CHECK_INTERVALS = [3, 7, 14, 30] as const;

/** "2", "2.5", "2,5" (an Indonesian keyboard's decimal) — or null if not a number ≥ 0. */
function parseAmount(raw: string): number | null {
  const value = Number(raw.trim().replace(",", "."));
  return raw.trim() !== "" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Adding or editing an inventory item (Phase 110). Owner only: the staff view
 * never renders it, and the database refuses item edits from a staff device
 * regardless (migrations/099).
 *
 * Owner-facing: English or Bahasa Indonesia, as the owner chose (Phase 149).
 */
export function InventoryItemForm({
  open,
  onOpenChange,
  item,
  defaultScope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null to add a new item. */
  item: InventoryItem | null;
  /** The tab the owner was on, so "Add item" under Home starts as a Home item. */
  defaultScope: InventoryScope;
}) {
  const { addInventoryItem, updateInventoryItem, removeInventoryItem } = useHousehold();
  const locale = useOwnerLocale();
  const t = useT();
  const scopeLabels = locale === "id" ? SCOPE_LABELS_ID : SCOPE_LABELS_EN;
  const categoryLabels = locale === "id" ? CATEGORY_LABELS_ID : CATEGORY_LABELS_EN;
  useBackToClose(open, () => onOpenChange(false));

  const [scope, setScope] = useState<InventoryScope>(defaultScope);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>(SCOPE_CATEGORIES[defaultScope][0]);
  const [quantity, setQuantity] = useState("0");
  const [unit, setUnit] = useState<InventoryUnit>("pcs");
  const [threshold, setThreshold] = useState("1");
  const [checkEvery, setCheckEvery] = useState<number>(7);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Reset on every open, from the item or from blank. The component stays
  // mounted between uses, so this is what stops one item's values leaking
  // into the next "Add item".
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const startScope = item?.scope ?? defaultScope;
      setScope(startScope);
      setName(item?.name ?? "");
      setCategory(item?.category ?? SCOPE_CATEGORIES[startScope][0]);
      setQuantity(String(item?.quantity ?? 0));
      setUnit(item?.unit ?? "pcs");
      setThreshold(String(item?.min_threshold ?? 1));
      setCheckEvery(item?.audit_frequency_days ?? 7);
      setPhotoUrl(item?.photo_url ?? null);
      setPhotoBusy(false);
      setSaving(false);
      setConfirmingDelete(false);
    }
  }

  function changeScope(next: InventoryScope) {
    setScope(next);
    // A Home item cannot sit on the "Food" shelf; the database would refuse
    // the pair (migrations/099), so the shelf follows the scope.
    if (!SCOPE_CATEGORIES[next].includes(category)) setCategory(SCOPE_CATEGORIES[next][0]);
  }

  async function handleSave() {
    const qty = parseAmount(quantity);
    const min = parseAmount(threshold);
    if (!name.trim()) return void toast.error(t("Give the item a name", "Beri nama barangnya"));
    if (qty === null) return void toast.error(t("Enter how many are in stock", "Masukkan jumlah stok"));
    if (min === null) return void toast.error(t("Enter the low-stock threshold", "Masukkan batas stok menipis"));

    setSaving(true);
    const input = {
      scope,
      name: name.trim(),
      category,
      quantity: qty,
      unit,
      min_threshold: min,
      photo_url: photoUrl,
      audit_frequency_days: checkEvery,
    };
    try {
      if (item) {
        await updateInventoryItem(item.id, input);
        toast.success(t(`${input.name} updated`, `${input.name} diperbarui`));
      } else {
        await addInventoryItem(input);
        toast.success(t(`${input.name} added`, `${input.name} ditambahkan`));
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(t("Failed to save item", "Barang gagal disimpan"));
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    setSaving(true);
    try {
      await removeInventoryItem(item.id);
      toast.success(t(`${item.name} deleted`, `${item.name} dihapus`));
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(t("Failed to delete item", "Barang gagal dihapus"));
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? t("Edit item", "Ubah barang") : t("Add item", "Tambah barang")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <SegmentedControl
            ariaLabel={t("Inventory", "Stok")}
            segments={INVENTORY_SCOPES.map((s) => ({ value: s, label: scopeLabels[s] }))}
            value={scope}
            onChange={changeScope}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv-name">{t("Name", "Nama")}</Label>
            <Input
              id="inv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                scope === "pet"
                  ? t("e.g. Royal Canin Mini Adult", "mis. Royal Canin Mini Adult")
                  : t("e.g. Floor Cleaner", "mis. Pembersih Lantai")
              }
              className="min-h-[48px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("Category", "Kategori")}</Label>
            {/* Three per scope, so one row of three. Allowed to wrap: "Household
                Supplies" does not fit a third of a phone on one line. */}
            <div className="grid grid-cols-3 gap-2">
              {SCOPE_CATEGORIES[scope].map((c) => (
                <Button
                  key={c}
                  type="button"
                  variant={category === c ? "default" : "outline"}
                  className="h-auto min-h-[44px] px-2 text-xs leading-tight whitespace-normal"
                  onClick={() => setCategory(c)}
                >
                  {categoryLabels[c]}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-qty">{t("In stock", "Stok saat ini")}</Label>
              <Input
                id="inv-qty"
                inputMode="decimal"
                value={quantity}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setQuantity(e.target.value)}
                className="min-h-[48px] tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("Unit", "Satuan")}</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as InventoryUnit)}>
                <SelectTrigger className="min-h-[48px] w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-min">{t("Low at or below", "Menipis jika")}</Label>
              <Input
                id="inv-min"
                inputMode="decimal"
                value={threshold}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setThreshold(e.target.value)}
                className="min-h-[48px] tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("Count it every", "Hitung setiap")}</Label>
              <Select value={String(checkEvery)} onValueChange={(v) => setCheckEvery(Number(v))}>
                <SelectTrigger className="min-h-[48px] w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHECK_INTERVALS.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {t(`${days} days`, `${days} hari`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t("Reference photo (optional)", "Foto contoh (opsional)")}</Label>
            <p className="text-xs text-muted-foreground">
              {t(
                "The exact product, so whoever shops buys the right one.",
                "Produk yang tepat, agar yang berbelanja membeli yang benar."
              )}
            </p>
            {/* Square-cropped like a pet avatar, since it renders in the same
                fixed thumbnail. From the library: a product shot is a
                reference, not proof that something happened today. No
                onMaster — the square is all this ever shows. */}
            <PhotoPicker
              pathPrefix={`inventory/${item?.id ?? "new"}`}
              value={photoUrl}
              onChange={setPhotoUrl}
              onBusyChange={setPhotoBusy}
              label={t("Add photo", "Tambah foto")}
              busyLabel={t("Uploading...", "Mengunggah...")}
              locale={locale}
              errorMessage={t("Failed to upload photo", "Foto gagal diunggah")}
              square
              allowGallery
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleSave}
            disabled={saving || photoBusy}
            className="min-h-[48px] w-full"
          >
            {(saving || photoBusy) && <Loader2 className="animate-spin" />}
            {photoBusy
              ? t("Waiting for photo...", "Menunggu foto...")
              : item
                ? t("Save changes", "Simpan perubahan")
                : t("Add item", "Tambah barang")}
          </Button>
          {item &&
            (confirmingDelete ? (
              <div className="flex w-full gap-2">
                <Button
                  variant="destructive"
                  className="min-h-[48px] flex-1"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  {t("Confirm delete", "Yakin hapus")}
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-[48px]"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={saving}
                >
                  {t("Cancel", "Batal")}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                className="min-h-[48px] w-full text-destructive"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                <Trash2 /> {t("Delete item", "Hapus barang")}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
