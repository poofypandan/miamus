"use client";

import { useMemo, useState } from "react";
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
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PhotoPicker } from "@/components/photo-picker";
import { ExpiryChips } from "@/components/kitchen/expiry-chips";
import { PlacePicker } from "@/components/kitchen/place-picker";
import { UnitChips } from "@/components/shopping/track-amount-sheet";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useToday } from "@/hooks/use-today";
import { defaultPlace, sameName } from "@/lib/ingredients";
import { isIngredient, parseAmount, unitLabel } from "@/lib/kitchen-units";
import { formatDateLocal } from "@/lib/scheduleEngine";
import {
  CATEGORY_LABELS_EN,
  CATEGORY_LABELS_ID,
  INVENTORY_SCOPES,
  SCOPE_CATEGORIES,
  SCOPE_LABELS_EN,
  SCOPE_LABELS_ID,
  stockItemName,
} from "@/lib/inventory";
import type {
  FoodPlace,
  InventoryCategory,
  InventoryItem,
  InventoryScope,
  InventoryUnit,
} from "@/types/database";

/**
 * Adding or editing an item on the shopping list (Phase 110; name, shelf and
 * photo only since Phase 154). Owner only: the staff view
 * never renders it, and the database refuses item edits from a staff device
 * regardless (migrations/099).
 *
 * Owner-facing: English or Bahasa Indonesia, as the owner chose (Phase 149).
 *
 * Opened from Food → Ingredients (Phase 176, `ingredient`; plan 5c and 5d),
 * a Fresh Food or Pantry item also says where it is kept (starting on, and
 * following, the category's default until a tap), when it expires (No date
 * to start) and, when adding, an optional amount: a number tracks it, in one
 * sheet. Adding a name already in Ingredients says so, with Open it; Save
 * still works. Household Supplies, and Shopping, show the form as before.
 */
export function InventoryItemForm({
  open,
  onOpenChange,
  item,
  defaultScope,
  ingredient = false,
  onOpenExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null to add a new item. */
  item: InventoryItem | null;
  /** The tab the owner was on, so "Add item" under Home starts as a Home item. */
  defaultScope: InventoryScope;
  /** Opened from Food → Ingredients (Phase 176): place, date, amount, no doubles. */
  ingredient?: boolean;
  /** "Open it": closes the form and opens that ingredient's sheet. */
  onOpenExisting?: (item: InventoryItem) => void;
}) {
  const { addInventoryItem, updateInventoryItem, removeInventoryItem, setTrackAmount, inventoryItems } = useHousehold();
  const today = formatDateLocal(useToday());
  // "Who lives here?" (Phase 162): a home without pets gets no Pets | Home
  // switch, so every new item is a home item. An existing pet item keeps it,
  // so it can still be moved.
  const { petsOn } = useHouseholdProfile();
  const showScopes = petsOn || item?.scope === "pet";
  const locale = useOwnerLocale();
  const t = useT();
  const scopeLabels = locale === "id" ? SCOPE_LABELS_ID : SCOPE_LABELS_EN;
  const categoryLabels = locale === "id" ? CATEGORY_LABELS_ID : CATEGORY_LABELS_EN;
  useBackToClose(open, () => onOpenChange(false));

  const [scope, setScope] = useState<InventoryScope>(defaultScope);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>(SCOPE_CATEGORIES[defaultScope][0]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Phase 176. Null place: nobody has tapped one, so the category's default
  // shows and nothing is stored (the list shows the default the same way).
  const [keptIn, setKeptIn] = useState<FoodPlace | null>(null);
  const [expiresOn, setExpiresOn] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<InventoryUnit>("pcs");

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
      setPhotoUrl(item?.photo_url ?? null);
      setPhotoBusy(false);
      setSaving(false);
      setConfirmingDelete(false);
      setKeptIn(item?.kept_in ?? null);
      setExpiresOn(item?.expires_on ?? null);
      setAmount("");
      setUnit("pcs");
    }
  }

  const showPlaces = ingredient && isIngredient({ category });
  // Amount is set here only when adding; Track amount keeps it after that,
  // so a number has one place to change.
  const showAmount = showPlaces && !item;
  const parsedAmount = amount.trim() === "" ? null : parseAmount(amount);
  // 0 reads as blank: not tracked, and the date kept. Tracked at 0 it would
  // go Out, which has no date, so a date given here would be lost.
  const typedAmount = parsedAmount === 0 ? null : parsedAmount;
  // "Already in Ingredients" (5d): exact names only, while adding.
  const existing = useMemo(
    () => (ingredient && !item ? (inventoryItems.find((i) => isIngredient(i) && sameName(i.name, name)) ?? null) : null),
    [ingredient, item, inventoryItems, name]
  );

  function changeScope(next: InventoryScope) {
    setScope(next);
    // A Home item cannot sit on the "Food" shelf; the database would refuse
    // the pair (migrations/099), so the shelf follows the scope.
    if (!SCOPE_CATEGORIES[next].includes(category)) setCategory(SCOPE_CATEGORIES[next][0]);
  }

  async function handleSave() {
    if (!name.trim()) return void toast.error(t("Give the item a name", "Beri nama barangnya"));
    if (showAmount && amount.trim() !== "" && parsedAmount === null) {
      return void toast.error(t("Check the amount", "Cek jumlahnya"));
    }

    setSaving(true);
    // No counts or thresholds since Phase 154 (a shopping list, not a
    // ledger): an edit leaves those columns as they are, and a new item gets
    // neutral values the database still requires.
    const details = { scope, name: name.trim(), category, photo_url: photoUrl };
    try {
      if (item) {
        // Only what changed here (Phase 176): a staff phone may have moved
        // or dated it meanwhile.
        await updateInventoryItem(item.id, {
          ...details,
          ...(showPlaces && keptIn !== (item.kept_in ?? null) ? { kept_in: keptIn } : {}),
          ...(showPlaces && expiresOn !== (item.expires_on ?? null) ? { expires_on: expiresOn } : {}),
        });
        toast.success(t(`${details.name} updated`, `${details.name} diperbarui`));
      } else {
        const added = await addInventoryItem({
          ...details,
          quantity: 0,
          unit: "pcs",
          min_threshold: 0,
          audit_frequency_days: 30,
          ...(showPlaces ? { kept_in: keptIn, expires_on: expiresOn } : {}),
        });
        if (showAmount && typedAmount !== null) {
          // With a number it is tracked, as Track amount would do it.
          try {
            await setTrackAmount(added.id, { track: true, unit, quantity: typedAmount, lowAt: 0 });
          } catch (err) {
            console.error(err);
            toast.error(
              t(
                `${details.name} added, but the amount wasn't saved. Set it in Track amount.`,
                `${details.name} ditambahkan, tapi jumlahnya gagal disimpan. Atur di Catat jumlah.`
              )
            );
            onOpenChange(false);
            return;
          }
        }
        toast.success(t(`${details.name} added`, `${details.name} ditambahkan`));
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
          {showScopes && (
            <SegmentedControl
              ariaLabel={t("Inventory", "Stok")}
              segments={INVENTORY_SCOPES.map((s) => ({ value: s, label: scopeLabels[s] }))}
              value={scope}
              onChange={changeScope}
            />
          )}

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
            {existing && (
              <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="min-w-0 flex-1 text-sm text-amber-900">
                  {t(
                    `${stockItemName(existing)} is already in Ingredients.`,
                    `${stockItemName(existing)} sudah ada di Bahan masakan.`
                  )}
                </p>
                {onOpenExisting && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-10 shrink-0 rounded-lg bg-white"
                    onClick={() => onOpenExisting(existing)}
                  >
                    {t("Open it", "Buka")}
                  </Button>
                )}
              </div>
            )}
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

          {showPlaces && (
            <>
              <PlacePicker value={keptIn ?? defaultPlace(category)} onChange={setKeptIn} locale={locale} tapSelected />
              {item?.stock_status !== "out" && (
                <ExpiryChips value={expiresOn} onChange={setExpiresOn} today={today} locale={locale} />
              )}
            </>
          )}

          {showAmount && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="inv-amount">{t("Amount (optional)", "Jumlah (opsional)")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="inv-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  className="min-h-11 flex-1 rounded-xl"
                />
                <span className="w-14 text-sm text-muted-foreground">{unitLabel(unit, locale)}</span>
              </div>
              <UnitChips value={unit} onChange={setUnit} lang={locale} />
            </div>
          )}

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
