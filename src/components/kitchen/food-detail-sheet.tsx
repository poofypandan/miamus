"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CloudUpload, HandHeart, Loader2, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { SyncedImg } from "@/components/shared/synced-img";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useToday } from "@/hooks/use-today";
import {
  FOOD_OUTCOMES,
  FOOD_OUTCOME_LABELS,
  FOOD_PLACE_LABELS,
  FOOD_SOURCE_LABELS,
  FOOD_UNDO_TOAST_MS,
  daysLeft,
  expiryLabel,
  foodName,
  needsDate,
  portionsLabel,
  type FoodLocale,
} from "@/lib/food";
import { DATE_LOCALE } from "@/lib/owner-locale";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { FoodItem, FoodOutcome } from "@/types/database";

const OUTCOME_ICONS: Record<FoodOutcome, typeof Trash2> = {
  eaten: UtensilsCrossed,
  given_away: HandHeart,
  thrown_away: Trash2,
};

/**
 * Tap a food (Phase 156; mockup 3): its photo and facts, then one question —
 * is it finished? — with three big answers. Edit is a quiet link; delete,
 * for food added by mistake, is offered to admins only (the database refuses
 * it from staff phones anyway).
 */
export function FoodDetailSheet({
  item,
  locale,
  staffName,
  canDelete,
  onClose,
  onEdit,
}: {
  item: FoodItem | null;
  locale: FoodLocale;
  staffName: (id: string | null) => string | null;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (item: FoodItem) => void;
}) {
  useBackToClose(item !== null, onClose);
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl">
        {item && (
          <Detail
            key={item.id}
            item={item}
            locale={locale}
            staffName={staffName}
            canDelete={canDelete}
            onClose={onClose}
            onEdit={onEdit}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Detail({
  item,
  locale,
  staffName,
  canDelete,
  onClose,
  onEdit,
}: {
  item: FoodItem;
  locale: FoodLocale;
  staffName: (id: string | null) => string | null;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (item: FoodItem) => void;
}) {
  const id = locale === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  const { finishFood, unfinishFood, releaseFinishedFoodPhoto, removeFood, flagLowStock, pendingIds, eatFoodPortion } =
    useHousehold();
  // Added on this phone and not sent yet (Phase 161): nothing on the server to
  // finish, change or delete until it arrives.
  const waitingToSend = pendingIds.has(item.id);
  const name = foodName(item, locale);
  const today = formatDateLocal(useToday());
  const [busy, setBusy] = useState<FoodOutcome | "delete" | "portion" | null>(null);
  const portions = item.portions ?? null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const days = daysLeft(item, today);
  const shortDate = (iso: string) =>
    new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString(DATE_LOCALE[locale], {
      day: "numeric",
      month: "short",
    });
  const addedBy = staffName(item.added_by);

  async function finish(outcome: FoodOutcome) {
    setBusy(outcome);
    try {
      await finishFood(item.id, outcome);
      onClose();
      // The photo goes when this toast closes — by itself, by a swipe or by
      // Undo — so Undo always brings the food back with its photo (Codex
      // review, PR #10). After an Undo, release finds it back on the list
      // and keeps the photo.
      toast.success(`${FOOD_OUTCOME_LABELS[locale][outcome]} — ${name}`, {
        duration: FOOD_UNDO_TOAST_MS,
        onAutoClose: () => releaseFinishedFoodPhoto(item.id),
        onDismiss: () => releaseFinishedFoodPhoto(item.id),
        // Bought food that is gone may need buying again (Phase 157): one tap
        // puts it on the shopping list, as a note in this person's name.
        ...(item.source === "bought" && outcome !== "given_away"
          ? {
              cancel: {
                label: tr("Buy again", "Beli lagi"),
                onClick: () =>
                  void flagLowStock({ pet_id: null, item_type: "other", note: name.slice(0, 120) })
                    .then(() => toast.success(tr(`On the shopping list — ${name}`, `Masuk daftar belanja — ${name}`)))
                    .catch(() => toast.error(tr("Couldn't add it. Try again.", "Gagal menambahkan. Coba lagi."))),
              },
            }
          : {}),
        action: {
          label: tr("Undo", "Batalkan"),
          onClick: () =>
            void unfinishFood(item.id).catch(() =>
              toast.error(tr("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi."))
            ),
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(tr("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
      setBusy(null);
    }
  }

  // D7: one portion eaten; the last one finishes it as Eaten.
  async function atePortion() {
    if (portions === null) return;
    if (portions <= 1) return finish("eaten");
    setBusy("portion");
    try {
      // A change made on the server (migrations/148): two phones at once each
      // count, so the toast says what the server counted (code review).
      const { food } = await eatFoodPortion(item.id, 1);
      const left = food?.portions ?? portions - 1;
      const text =
        food?.outcome === "eaten"
          ? `${FOOD_OUTCOME_LABELS[locale].eaten} — ${name}`
          : tr(`${name} · ${left} ${left === 1 ? "portion" : "portions"} left`, `${name} · sisa ${left} porsi`);
      toast.success(text, {
        action: {
          label: tr("Undo", "Batalkan"),
          onClick: () =>
            void eatFoodPortion(item.id, -1).catch(() =>
              toast.error(tr("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi."))
            ),
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(tr("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await removeFood(item.id);
      onClose();
      toast.success(tr(`Deleted — ${name}`, `Dihapus — ${name}`));
    } catch (err) {
      console.error(err);
      toast.error(tr("Couldn't delete. Try again.", "Gagal menghapus. Coba lagi."));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col">
      <SheetHeader className="pb-2">
        <SheetTitle className="px-8 text-center text-lg font-semibold">{name}</SheetTitle>
        <SheetDescription className="sr-only">
          {tr("Details, and whether it is finished.", "Detail, dan apakah sudah habis.")}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pb-4">
        {item.photo_url && (
          <SyncedImg url={item.photo_url} size={640} alt={name} className="max-h-56 w-full rounded-xl bg-muted object-cover" />
        )}

        <dl className="flex flex-col divide-y text-sm">
          <Fact label={tr("Expires", "Kedaluwarsa")}>
            <span
              className={cn(days !== null && days < 0 && "text-red-700", needsDate(item) && "text-amber-700")}
            >
              {expiryLabel(days, locale, item.expiry_unknown)}
              {item.expires_on && days !== null && days >= 0 && ` · ${shortDate(item.expires_on)}`}
            </span>
          </Fact>
          {portions !== null && portions > 0 && (
            <Fact label={tr("Portions", "Porsi")}>{portionsLabel(portions, locale)}</Fact>
          )}
          <Fact label={tr("Kept in", "Disimpan di")}>{FOOD_PLACE_LABELS[locale][item.kept_in]}</Fact>
          {(item.from_whom || item.source) && (
            <Fact label={tr("From", "Dari")}>
              {item.from_whom ?? (item.source ? FOOD_SOURCE_LABELS[locale][item.source] : null)}
            </Fact>
          )}
          <Fact label={tr("Added", "Ditambahkan")}>
            {[addedBy, shortDate(item.created_at)].filter(Boolean).join(" · ")}
          </Fact>
          {item.notes && <Fact label={tr("Notes", "Catatan")}>{item.notes}</Fact>}
        </dl>

        {waitingToSend ? (
          // Amber means waiting (Phase 153 colour rule).
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <CloudUpload className="mt-0.5 size-4 shrink-0" />
            <span>
              {tr(
                "Saved on this phone, waiting to send. It goes by itself when the signal is back; you can change it after that.",
                "Tersimpan di HP, menunggu dikirim. Terkirim otomatis saat sinyal bagus; setelah itu bisa diubah."
              )}
            </span>
          </p>
        ) : (
        <>
        {portions !== null && portions > 0 && (
          <Button
            variant="outline"
            className="min-h-12 rounded-xl text-base"
            disabled={busy !== null}
            onClick={() => void atePortion()}
          >
            {busy === "portion" ? <Loader2 className="animate-spin" /> : <UtensilsCrossed />}
            {tr("Ate 1 portion", "Dimakan 1 porsi")}
          </Button>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{tr("Is it finished?", "Sudah habis?")}</p>
          <div className="grid grid-cols-3 gap-2">
            {FOOD_OUTCOMES.map((outcome) => {
              const Icon = OUTCOME_ICONS[outcome];
              return (
                <Button
                  key={outcome}
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => finish(outcome)}
                  className="h-auto min-h-16 flex-col gap-1 rounded-xl px-1 text-[13px] font-semibold whitespace-normal"
                >
                  {busy === outcome ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
                  {FOOD_OUTCOME_LABELS[locale][outcome]}
                </Button>
              );
            })}
          </div>
        </div>

        <Button variant="ghost" className="min-h-11 text-gray-700" onClick={() => onEdit(item)} disabled={busy !== null}>
          <Pencil /> {tr("Edit", "Ubah")}
        </Button>

        {canDelete &&
          (confirmingDelete ? (
            <div className="flex gap-2">
              <Button variant="destructive" className="min-h-11 flex-1 rounded-xl" onClick={remove} disabled={busy !== null}>
                {busy === "delete" && <Loader2 className="animate-spin" />}
                {tr("Yes, delete", "Ya, hapus")}
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={() => setConfirmingDelete(false)} disabled={busy !== null}>
                {tr("Cancel", "Batal")}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="-mt-2 min-h-10 text-center text-xs text-muted-foreground"
            >
              {tr("Delete — added by mistake", "Hapus — salah tambah")}
            </button>
          ))}
        </>
        )}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium break-words">{children}</dd>
    </div>
  );
}
