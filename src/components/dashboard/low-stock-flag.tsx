"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { WhatsAppNotifyPanel } from "@/components/staff/whatsapp-notify-panel";
import { useBackToClose } from "@/hooks/use-back-to-close";
import type { ItemType } from "@/types/database";

// Phase 46 language boundary: the owner dashboard is English, the staff view
// is Bahasa Indonesia. Same form, same table — only the copy differs, so it
// lives in one component with two dictionaries rather than two near-identical
// files that would drift apart.
const COPY = {
  en: {
    trigger: "Flag Low Stock",
    title: "Flag Low Stock",
    description: "Let the owner know something needs restocking.",
    pet: "Pet",
    petPlaceholder: "Select pet",
    item: "Item",
    note: "Note (optional)",
    notePlaceholder: "e.g. Down to the last cup",
    validation: "Choose an item type",
    success: "Low stock flagged for the owner",
    failure: "Failed to flag low stock",
    items: {
      food: "Food",
      medicine: "Medicine",
      treats: "Treats",
      shampoo: "Shampoo",
      pee_pad: "Pee Pad",
      other: "Other",
    },
    petOptional: "Pet (optional)",
    noPet: "General / household item",
    knownItem: "Known item (optional)",
    knownPlaceholder: "Pick from the household list",
  },
  id: {
    trigger: "Laporkan Stok Menipis",
    title: "Laporkan Stok Menipis",
    description: "Beri tahu pemilik kalau ada yang perlu dibeli lagi.",
    pet: "Anjing",
    petPlaceholder: "Pilih anjing",
    item: "Barang",
    note: "Catatan (opsional)",
    notePlaceholder: "mis. Tinggal sisa sedikit",
    validation: "Pilih jenis barang dulu",
    success: "Laporan stok menipis terkirim ke pemilik",
    failure: "Gagal mengirim laporan",
    items: {
      food: "Makanan",
      medicine: "Obat",
      treats: "Camilan",
      shampoo: "Sampo",
      pee_pad: "Pee Pad",
      other: "Lainnya",
    },
    petOptional: "Anjing (opsional)",
    noPet: "Barang umum rumah",
    knownItem: "Barang yang sudah terdaftar (opsional)",
    knownPlaceholder: "Pilih dari daftar rumah",
  },
} as const;

// What the picker offers, in order — a clean 2x2. `medicine` and `treats` are
// deliberately absent: medicines are tracked as routines rather than stock,
// and treats were never reported. Both remain in ItemType so older rows still
// show a label.
const ITEM_ORDER: ItemType[] = ["food", "shampoo", "pee_pad", "other"];

// Sentinel for the "no particular dog" choice. Radix Select treats "" as
// "nothing selected" and won't render an item for it, so the empty case needs
// a real value that is mapped back to null on submit.
const NO_PET = "__none__";

export function LowStockFlagButton({ locale = "en" }: { locale?: "en" | "id" }) {
  const t = COPY[locale];
  const { pets, activePetId, flagLowStock, inventoryItems } = useHousehold();
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));
  const [petId, setPetId] = useState("");
  const [itemType, setItemType] = useState<ItemType | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // What was just reported, for the staff WhatsApp follow-up. Null while the
  // form is showing.
  const [reported, setReported] = useState<string | null>(null);

  // Reset the form to the current active pet each time the drawer (re)opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPetId(activePetId ?? NO_PET);
      setItemType("");
      setNote("");
      setReported(null);
    }
  }

  async function handleSubmit() {
    // Pet is optional since Phase 49 — a shared household item belongs to no
    // one dog, and forcing a choice put restock requests on arbitrary pets.
    if (!itemType) {
      toast.error(t.validation);
      return;
    }
    setSubmitting(true);
    try {
      await flagLowStock({
        pet_id: petId === NO_PET || !petId ? null : petId,
        item_type: itemType,
        note: note.trim() || null,
      });
      if (locale === "id") {
        // Staff swap the form for a success view offering to message the
        // owner. The owner's own English form keeps the toast-and-close: there
        // is nobody for an owner to notify.
        const trimmed = note.trim();
        setReported(trimmed ? `${t.items[itemType]} – ${trimmed}` : t.items[itemType]);
      } else {
        toast.success(t.success);
        setOpen(false);
      }
    } catch (err) {
      console.error(err);
      toast.error(t.failure);
    } finally {
      setSubmitting(false);
    }
  }

  if (pets.length === 0) return null;

  const trigger = (
    <SheetTrigger asChild>
      <Button variant="outline" className="min-h-[48px] w-full">
        <PackageX /> {t.trigger}
      </Button>
    </SheetTrigger>
  );

  // Same Sheet > SheetContent shape as the form below, so React keeps the open
  // sheet mounted and only its contents change.
  if (reported) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        {trigger}
        <SheetContent side="bottom">
          {/* Visually hidden, but Radix requires every sheet to have a title. */}
          <SheetHeader className="sr-only">
            <SheetTitle>{t.title}</SheetTitle>
            <SheetDescription>{t.success}</SheetDescription>
          </SheetHeader>
          <div className="px-4">
            <WhatsAppNotifyPanel
              title={t.success}
              message={`Halo! Ada laporan stok menipis (${reported}). Cek di sini:`}
              onDone={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger}
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t.title}</SheetTitle>
          <SheetDescription>{t.description}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t.petOptional}</Label>
            <Select value={petId} onValueChange={setPetId}>
              <SelectTrigger className="min-h-[48px] w-full">
                <SelectValue placeholder={t.petPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PET}>{t.noPet}</SelectItem>
                {pets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t.item}</Label>
            <div className="grid grid-cols-2 gap-2">
              {ITEM_ORDER.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={itemType === value ? "default" : "outline"}
                  className="min-h-[48px]"
                  onClick={() => setItemType(value)}
                >
                  {t.items[value]}
                </Button>
              ))}
            </div>
          </div>

          {/* Only appears once the owner has built a catalogue — before the
              Phase 60 migration, or on a fresh household, the form is exactly
              what it was. Picking an item prefills the note and its category,
              both still editable, so this is a shortcut rather than a new
              required step. */}
          {inventoryItems.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t.knownItem}</Label>
              <Select
                value=""
                onValueChange={(id) => {
                  const item = inventoryItems.find((i) => i.id === id);
                  if (!item) return;
                  setItemType(item.category);
                  setNote(item.name);
                }}
              >
                <SelectTrigger className="min-h-[48px] w-full">
                  <SelectValue placeholder={t.knownPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t.note}</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.notePlaceholder}
            />
          </div>
        </div>
        <SheetFooter>
          <Button onClick={handleSubmit} disabled={submitting} className="min-h-[48px]">
            {submitting ? <Loader2 className="animate-spin" /> : <PackageX />}
            {t.trigger}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
