"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Archive, Check, ChevronDown, Loader2, Refrigerator, Snowflake, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FoodPhotoField } from "@/components/kitchen/food-photo-field";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useToday } from "@/hooks/use-today";
import {
  EXPIRY_CHOICES,
  FOOD_LIMITS,
  FOOD_PLACES,
  FOOD_PLACE_LABELS,
  addDaysTo,
  type FoodLocale,
} from "@/lib/food";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { FoodItem, FoodPlace } from "@/types/database";

const PLACE_ICONS: Record<FoodPlace, typeof Refrigerator> = {
  fridge: Refrigerator,
  freezer: Snowflake,
  pantry: Archive,
  counter: Utensils,
};

/**
 * Add or edit a food (Phase 156; mockups 2 and 2b). Only the name is
 * required. Where it is kept is four big choices, the expiry one tap; the
 * photo is optional; who gave it and notes are one tap away. Shared by the
 * owner's Kitchen tab and the staff's Dapur — staff screens pass "id".
 */
export function FoodFormSheet({
  open,
  item,
  locale,
  onClose,
}: {
  open: boolean;
  /** The food being edited; null to add one. */
  item: FoodItem | null;
  locale: FoodLocale;
  onClose: () => void;
}) {
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl">
        {/* Keyed so each opening starts from that food's values. */}
        {open && <FoodForm key={item?.id ?? "new"} item={item} locale={locale} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function FoodForm({ item, locale, onDone }: { item: FoodItem | null; locale: FoodLocale; onDone: () => void }) {
  const id = locale === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  const { addFood, editFood } = useHousehold();
  const today = formatDateLocal(useToday());

  const [photo, setPhoto] = useState<File | string | null>(item?.photo_url ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [name, setName] = useState(item?.name ?? "");
  const [keptIn, setKeptIn] = useState<FoodPlace>(item?.kept_in ?? "fridge");
  const [expiresOn, setExpiresOn] = useState<string | null>(item?.expires_on ?? null);
  // "pick": the date field is showing. Otherwise the chips say it.
  const [picking, setPicking] = useState(
    () => !!item?.expires_on && !EXPIRY_CHOICES.some((c) => addDaysTo(today, c.days) === item.expires_on)
  );
  const [fromWhom, setFromWhom] = useState(item?.from_whom ?? "");
  const [returnContainer, setReturnContainer] = useState(item?.return_container ?? false);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [moreOpen, setMoreOpen] = useState(!!(item?.from_whom || item?.notes));
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !photoBusy && !saving;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const who = fromWhom.trim();
    const input = {
      name: name.trim().slice(0, FOOD_LIMITS.name),
      kept_in: keptIn,
      expires_on: expiresOn,
      from_whom: who ? who.slice(0, FOOD_LIMITS.fromWhom) : null,
      return_container: who ? returnContainer : false,
      notes: notes.trim() ? notes.trim().slice(0, FOOD_LIMITS.notes) : null,
    };
    try {
      if (item) {
        // A new File replaces the photo; null removes it; the same URL keeps it.
        const photoChange = photo instanceof File ? photo : photo === null && item.photo_url ? null : undefined;
        await editFood(item.id, input, photoChange);
        toast.success(tr(`Saved — ${input.name}`, `Tersimpan — ${input.name}`));
      } else {
        await addFood(input, photo instanceof File ? photo : null);
        toast.success(tr(`Added — ${input.name}`, `Ditambahkan — ${input.name}`));
      }
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(tr("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col">
      <SheetHeader className="pb-2">
        <SheetTitle className="text-center text-lg font-semibold">
          {item ? tr("Edit food", "Ubah makanan") : tr("Add food", "Tambah makanan")}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {tr("What it is, where it is kept and when it expires.", "Makanan apa, disimpan di mana, dan kapan kedaluwarsa.")}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <FoodPhotoField value={photo} onChange={setPhoto} onBusyChange={setPhotoBusy} locale={locale} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="food-name">{tr("What is it?", "Makanan apa?")}</Label>
          <Input
            id="food-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("e.g. Lapis legit", "mis. Lapis legit")}
            maxLength={FOOD_LIMITS.name}
            autoComplete="off"
            enterKeyHint="done"
            className="min-h-12 rounded-xl"
          />
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{tr("Where is it kept?", "Disimpan di mana?")}</legend>
          <div className="grid grid-cols-4 gap-2">
            {FOOD_PLACES.map((place) => {
              const Icon = PLACE_ICONS[place];
              const on = keptIn === place;
              return (
                <button
                  key={place}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setKeptIn(place)}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-xs font-medium",
                    on ? "border-2 border-primary text-foreground" : "text-gray-700 active:bg-muted"
                  )}
                >
                  <Icon className="size-5" strokeWidth={on ? 2.25 : 1.75} />
                  {FOOD_PLACE_LABELS[locale][place]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{tr("Expires", "Kedaluwarsa")}</legend>
          <div className="flex flex-wrap gap-2">
            {EXPIRY_CHOICES.map((choice) => {
              const date = addDaysTo(today, choice.days);
              const on = !picking && expiresOn === date;
              return (
                <Chip
                  key={choice.days}
                  on={on}
                  onClick={() => {
                    setPicking(false);
                    setExpiresOn(date);
                  }}
                >
                  {choice.label[locale]}
                </Chip>
              );
            })}
            <Chip
              on={picking}
              onClick={() => {
                setPicking(true);
                if (!expiresOn) setExpiresOn(addDaysTo(today, 14));
              }}
            >
              {tr("Pick a date", "Pilih tanggal")}
            </Chip>
            <Chip
              on={!picking && expiresOn === null}
              onClick={() => {
                setPicking(false);
                setExpiresOn(null);
              }}
            >
              {tr("No date", "Tidak ada")}
            </Chip>
          </div>
          {picking && (
            <Input
              type="date"
              aria-label={tr("Expiry date", "Tanggal kedaluwarsa")}
              value={expiresOn ?? ""}
              onChange={(e) => setExpiresOn(e.target.value || null)}
              className="mt-1 min-h-12 rounded-xl"
            />
          )}
        </fieldset>

        {moreOpen ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="food-from">
                {tr("From whom", "Dari siapa")}{" "}
                <span className="font-normal text-muted-foreground">{tr("(optional)", "(boleh dikosongkan)")}</span>
              </Label>
              <Input
                id="food-from"
                value={fromWhom}
                onChange={(e) => setFromWhom(e.target.value)}
                placeholder={tr("e.g. Tante Rina", "mis. Tante Rina")}
                maxLength={FOOD_LIMITS.fromWhom}
                autoComplete="off"
                className="min-h-12 rounded-xl"
              />
            </div>
            {fromWhom.trim() && (
              <button
                type="button"
                role="checkbox"
                aria-checked={returnContainer}
                onClick={() => setReturnContainer((v) => !v)}
                className="flex min-h-12 items-center gap-3 rounded-xl border px-3 text-left text-sm active:bg-muted"
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md border",
                    returnContainer ? "border-primary bg-primary text-primary-foreground" : "border-gray-400"
                  )}
                >
                  {returnContainer && <Check className="size-4" />}
                </span>
                {tr("The container goes back to them", "Wadahnya perlu dikembalikan")}
              </button>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="food-notes">
                {tr("Notes", "Catatan")}{" "}
                <span className="font-normal text-muted-foreground">{tr("(optional)", "(boleh dikosongkan)")}</span>
              </Label>
              <Textarea
                id="food-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={FOOD_LIMITS.notes}
                rows={2}
                className="rounded-xl"
              />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="-my-1 flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-gray-700"
          >
            <ChevronDown className="size-4" />
            {tr("From whom, notes", "Dari siapa, catatan")}
          </button>
        )}

        <Button type="submit" disabled={!canSave} className="mt-1 min-h-12 rounded-xl text-base">
          {(saving || photoBusy) && <Loader2 className="animate-spin" />}
          {tr("Save", "Simpan")}
        </Button>
      </div>
    </form>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-full border px-3.5 text-sm",
        on ? "border-primary bg-primary text-primary-foreground" : "text-gray-700 active:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
