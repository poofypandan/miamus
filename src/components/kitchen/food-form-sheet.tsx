"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Archive, Check, ChevronDown, Loader2, Minus, Plus, Refrigerator, Snowflake, Utensils } from "lucide-react";
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
  MAX_PORTIONS,
  FOOD_PLACES,
  FOOD_PLACE_LABELS,
  FOOD_SOURCES,
  FOOD_SOURCE_LABELS,
  addDaysTo,
  type FoodLocale,
} from "@/lib/food";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { FoodItem, FoodPlace, FoodSource } from "@/types/database";

const PLACE_ICONS: Record<FoodPlace, typeof Refrigerator> = {
  fridge: Refrigerator,
  freezer: Snowflake,
  pantry: Archive,
  counter: Utensils,
};

/**
 * Add or edit a food (Phase 156; mockups 2 and 2b). A name or a photo is
 * enough — staff who receive food at the door can just take a picture.
 * Where it came from (cooked at home, from someone, bought), where it is
 * kept and the expiry are one tap each, "Don't know" included; who gave it
 * appears once "From someone" is chosen; notes are one tap away. Shared by
 * the owner's Kitchen tab, the staff's Dapur and the staff's Lapor button —
 * staff screens pass "id".
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
  const { addFoodFromForm, editFood } = useHousehold();
  const today = formatDateLocal(useToday());

  const [photo, setPhoto] = useState<File | string | null>(item?.photo_url ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [name, setName] = useState(item?.name ?? "");
  const [keptIn, setKeptIn] = useState<FoodPlace>(item?.kept_in ?? "fridge");
  const [expiresOn, setExpiresOn] = useState<string | null>(item?.expires_on ?? null);
  const [unknownDate, setUnknownDate] = useState(!item?.expires_on && !!item?.expiry_unknown);
  const [source, setSource] = useState<FoodSource | null>(item?.source ?? (item?.from_whom ? "gift" : null));
  // "pick": the date field is showing. Otherwise the chips say it.
  const [picking, setPicking] = useState(
    () => !!item?.expires_on && !EXPIRY_CHOICES.some((c) => addDaysTo(today, c.days) === item.expires_on)
  );
  const [fromWhom, setFromWhom] = useState(item?.from_whom ?? "");
  const [returnContainer, setReturnContainer] = useState(item?.return_container ?? false);
  const [notes, setNotes] = useState(item?.notes ?? "");
  // Optional (D7): blank = not counted, as before.
  const [portions, setPortions] = useState<number | null>(item?.portions ?? null);
  const [notesOpen, setNotesOpen] = useState(!!item?.notes);
  const [saving, setSaving] = useState(false);

  const canSave = (name.trim().length > 0 || photo !== null) && !photoBusy && !saving;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const who = source === "gift" ? fromWhom.trim() : "";
    const typed = name.trim().slice(0, FOOD_LIMITS.name);
    const input = {
      name: typed || null,
      kept_in: keptIn,
      expires_on: unknownDate ? null : expiresOn,
      expiry_unknown: unknownDate,
      source,
      from_whom: who ? who.slice(0, FOOD_LIMITS.fromWhom) : null,
      // Kept without a name too: "Kembalikan wadahnya" still reminds (Codex
      // review, PR #10).
      return_container: source === "gift" ? returnContainer : false,
      notes: notes.trim() ? notes.trim().slice(0, FOOD_LIMITS.notes) : null,
      portions,
    };
    try {
      if (item) {
        // A new File replaces the photo; null removes it; the same URL keeps it.
        const photoChange = photo instanceof File ? photo : photo === null && item.photo_url ? null : undefined;
        await editFood(item.id, input, photoChange);
        toast.success(tr(`Saved — ${input.name ?? "Food"}`, `Tersimpan — ${input.name ?? "Makanan"}`));
      } else {
        // Kept on the phone first (Phase 161): on a weak signal it waits and
        // sends by itself, and the list marks it as waiting.
        const { queued } = await addFoodFromForm(input, photo instanceof File ? photo : null);
        if (queued) {
          toast.info(
            tr(
              "Saved on this phone. It will send by itself when the signal is back.",
              "Disimpan di HP. Akan dikirim otomatis saat sinyal bagus."
            )
          );
        } else {
          toast.success(tr(`Added — ${input.name ?? "Food"}`, `Ditambahkan — ${input.name ?? "Makanan"}`));
        }
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
          <Label htmlFor="food-name">
            {tr("What is it?", "Makanan apa?")}{" "}
            {photo !== null && (
              <span className="font-normal text-muted-foreground">
                {tr("(optional with a photo)", "(boleh dikosongkan kalau ada foto)")}
              </span>
            )}
          </Label>
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
          <legend className="mb-1.5 text-sm font-medium">{tr("Where is it from?", "Dari mana?")}</legend>
          <div className="flex flex-wrap gap-2">
            {FOOD_SOURCES.map((s) => (
              <Chip key={s} on={source === s} onClick={() => setSource((cur) => (cur === s ? null : s))}>
                {FOOD_SOURCE_LABELS[locale][s]}
              </Chip>
            ))}
          </div>
          {source === "gift" && (
            <div className="mt-1 flex flex-col gap-2">
              <Input
                aria-label={tr("From whom", "Dari siapa")}
                value={fromWhom}
                onChange={(e) => setFromWhom(e.target.value)}
                placeholder={tr("From whom? e.g. Tante Rina", "Dari siapa? mis. Tante Rina")}
                maxLength={FOOD_LIMITS.fromWhom}
                autoComplete="off"
                className="min-h-12 rounded-xl"
              />
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
            </div>
          )}
        </fieldset>

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
              const on = !picking && !unknownDate && expiresOn === date;
              return (
                <Chip
                  key={choice.days}
                  on={on}
                  onClick={() => {
                    setPicking(false);
                    setUnknownDate(false);
                    setExpiresOn(date);
                  }}
                >
                  {choice.label[locale]}
                </Chip>
              );
            })}
            <Chip
              on={picking && !unknownDate}
              onClick={() => {
                setPicking(true);
                setUnknownDate(false);
                if (!expiresOn) setExpiresOn(addDaysTo(today, 14));
              }}
            >
              {tr("Pick a date", "Pilih tanggal")}
            </Chip>
            <Chip
              on={!picking && !unknownDate && expiresOn === null}
              onClick={() => {
                setPicking(false);
                setUnknownDate(false);
                setExpiresOn(null);
              }}
            >
              {tr("No date", "Tidak ada")}
            </Chip>
            <Chip
              on={unknownDate}
              onClick={() => {
                setPicking(false);
                setUnknownDate(true);
                setExpiresOn(null);
              }}
            >
              {tr("Don't know", "Tidak tahu")}
            </Chip>
          </div>
          {unknownDate && (
            <p className="text-xs text-muted-foreground">
              {tr(
                "That's fine — a photo of the label helps. The owners will check the date.",
                "Tidak apa-apa — foto labelnya membantu. Pemilik rumah akan mengecek tanggalnya."
              )}
            </p>
          )}
          {picking && !unknownDate && (
            <Input
              type="date"
              aria-label={tr("Expiry date", "Tanggal kedaluwarsa")}
              value={expiresOn ?? ""}
              onChange={(e) => setExpiresOn(e.target.value || null)}
              className="mt-1 min-h-12 rounded-xl"
            />
          )}
        </fieldset>

        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-medium">
            {tr("Portions", "Porsi")}{" "}
            <span className="font-normal text-muted-foreground">{tr("(optional)", "(boleh dikosongkan)")}</span>
          </span>
          <Button
            type="button"
            variant="outline"
            className="size-11 rounded-xl"
            aria-label={tr("One portion less", "Kurangi 1 porsi")}
            disabled={portions === null}
            onClick={() => setPortions((n) => (n === null || n <= 1 ? null : n - 1))}
          >
            <Minus />
          </Button>
          <span className="w-8 text-center text-base font-semibold" aria-live="polite">
            {portions ?? "–"}
          </span>
          <Button
            type="button"
            variant="outline"
            className="size-11 rounded-xl"
            aria-label={tr("One portion more", "Tambah 1 porsi")}
            disabled={portions !== null && portions >= MAX_PORTIONS}
            onClick={() => setPortions((n) => Math.min(MAX_PORTIONS, (n ?? 0) + 1))}
          >
            <Plus />
          </Button>
        </div>

        {notesOpen ? (
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
        ) : (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="-my-1 flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-gray-700"
          >
            <ChevronDown className="size-4" />
            {tr("Add a note", "Tambah catatan")}
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
