"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, CloudUpload, HandHeart, Loader2, Pencil, Soup, Trash2, TriangleAlert, Utensils } from "lucide-react";
import { PlacePicker } from "@/components/kitchen/place-picker";
import { keepOpenForToasts, sheetToast } from "@/components/kitchen/sheet-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { SyncedImg } from "@/components/shared/synced-img";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useToday } from "@/hooks/use-today";
import { ingredientsUnderFood } from "@/lib/features";
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
import type { FoodItem, FoodOutcome, FoodPlace } from "@/types/database";

/**
 * One food's moves, and their Undo, go to the server one at a time in the
 * order tapped (Codex, PR #116): on a slow signal two taps sent side by side
 * could land out of order and leave the earlier place. Module level, so a
 * move still waiting when the sheet closes keeps its turn.
 */
const moveTurns = new Map<string, Promise<unknown>>();
function inTurn<T>(foodId: string, run: () => Promise<T>): Promise<T> {
  const next = (moveTurns.get(foodId) ?? Promise.resolve()).then(run);
  const tail = next.catch(() => undefined);
  moveTurns.set(foodId, tail);
  void tail.then(() => {
    if (moveTurns.get(foodId) === tail) moveTurns.delete(foodId);
  });
  return next;
}

// A tick on Eaten: the crossed fork and knife read as "do not eat" (Fable's
// look, #189).
const OUTCOME_ICONS: Record<FoodOutcome, typeof Trash2> = {
  eaten: Check,
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
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl"
        onInteractOutside={keepOpenForToasts}
      >
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
  const {
    finishFood,
    unfinishFood,
    releaseFinishedFoodPhoto,
    removeFood,
    flagLowStock,
    pendingIds,
    eatFoodPortion,
    undoFoodPortion,
    moveFood,
  } = useHousehold();
  // Phase 176: the four place buttons, where Food → Ingredients shows too
  // (Kitchen amounts and Food at home on), so a home without it sees no change.
  const canMove = ingredientsUnderFood(useHouseholdFeatures());
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
  const state = eatByLine(days, item.expiry_unknown, item.expires_on, locale);

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

  // D7: one portion eaten, decided on the server (migrations/148): it takes
  // one if there is one, and the last finishes the food as Eaten, even when
  // this phone's count is out of date (Codex, PR #93). Undo puts back only
  // what this tap took.
  async function atePortion() {
    if (portions === null) return;
    setBusy("portion");
    try {
      const tap = await eatFoodPortion(item.id);
      const undo = {
        label: tr("Undo", "Batalkan"),
        onClick: () =>
          void undoFoodPortion(tap).catch(() =>
            toast.error(tr("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi."))
          ),
      };
      if (tap.consumed === 0) {
        // Nothing was taken here: someone else finished it meanwhile, or no
        // portions were left to count.
        toast.info(
          tap.food?.outcome
            ? tr(`${name} is already finished`, `${name} sudah habis`)
            : tr(`${name}: no portions left`, `${name}: porsinya sudah habis`)
        );
        if (tap.food?.outcome) onClose();
      } else if (tap.food?.outcome === "eaten") {
        // This tap took the last portion: finished, as the Eaten button does.
        onClose();
        toast.success(`${FOOD_OUTCOME_LABELS[locale].eaten} — ${name}`, {
          duration: FOOD_UNDO_TOAST_MS,
          onAutoClose: () => releaseFinishedFoodPhoto(item.id),
          onDismiss: () => releaseFinishedFoodPhoto(item.id),
          action: undo,
        });
      } else {
        const left = tap.food?.portions ?? Math.max(0, portions - 1);
        toast.success(
          tr(`${name} · ${left} ${left === 1 ? "portion" : "portions"} left`, `${name} · sisa ${left} porsi`),
          { action: undo }
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(tr("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } finally {
      setBusy(null);
    }
  }

  // Phase 176 (plan 5b): a tap moves it at once, kept_in only (moveFood), so
  // a portion another phone took meanwhile is kept. Undo puts the place back.
  // The buttons show the latest tap while earlier ones are still on their way.
  const [shownPlace, setShownPlace] = useState<FoodPlace | null>(null);
  // While a move is on its way, the other buttons wait, as the place buttons
  // wait for them: a portion or finish answered after the move would put the
  // old place back on screen (Codex, PR #116).
  const moving = shownPlace !== null;
  const movesOnTheirWay = useRef(0);
  async function sendMove(place: FoodPlace) {
    movesOnTheirWay.current += 1;
    setShownPlace(place);
    try {
      await inTurn(item.id, () => moveFood(item.id, place));
    } finally {
      movesOnTheirWay.current -= 1;
      if (movesOnTheirWay.current === 0) setShownPlace(null);
    }
  }

  async function move(place: FoodPlace) {
    const before = shownPlace ?? item.kept_in;
    const label = FOOD_PLACE_LABELS[locale][place];
    const toastId = toast.success(tr(`${name} · moved to ${label}`, `${name} · dipindahkan ke ${label}`), {
      ...sheetToast,
      duration: FOOD_UNDO_TOAST_MS,
      action: {
        label: tr("Undo", "Batalkan"),
        onClick: () =>
          void sendMove(before).catch(() =>
            toast.error(tr("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi."), sheetToast)
          ),
      },
    });
    try {
      await sendMove(place);
    } catch (err) {
      console.error(err);
      toast.error(tr("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."), {
        ...sheetToast,
        id: toastId,
        action: undefined,
        duration: undefined,
      });
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
      {/* The thing itself, as the shelf shows it (21 Nov; Fable's
          mockup-opened): its photo or symbol, the name, when to eat it in
          words, and where it is and where it came from. */}
      <SheetHeader className="items-center gap-1 pt-6 pb-3 text-center">
        <span
          aria-hidden
          className={cn(
            "mb-2 flex size-24 items-center justify-center overflow-hidden rounded-3xl",
            state.tone === "urgent" ? "bg-attention-tint text-attention" : "bg-muted text-gray-600"
          )}
        >
          {item.photo_url ? (
            <SyncedImg url={item.photo_url} size={320} className="size-full object-cover" />
          ) : (
            <Soup className="size-10" strokeWidth={1.5} />
          )}
        </span>
        <SheetTitle className="max-w-full px-8 text-[22px] leading-7 font-semibold tracking-[-0.02em] break-words">{name}</SheetTitle>
        {state.text && (
          <p
            className={cn(
              "flex items-center gap-1 text-sm",
              state.tone === "quiet" ? "text-muted-foreground" : "font-medium text-attention"
            )}
          >
            {state.tone === "urgent" && <TriangleAlert className="size-3.5 shrink-0" aria-hidden />}
            {state.text}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {[
            FOOD_PLACE_LABELS[locale][shownPlace ?? item.kept_in],
            item.from_whom ?? (item.source ? FOOD_SOURCE_LABELS[locale][item.source].toLowerCase() : null),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <SheetDescription className="sr-only">
          {tr("Details, and whether it is finished.", "Detail, dan apakah sudah habis.")}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pb-4">

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
            disabled={busy !== null || moving}
            onClick={() => void atePortion()}
          >
            {busy === "portion" ? <Loader2 className="animate-spin" /> : <Utensils />}
            {tr("Ate 1 portion", "Dimakan 1 porsi")}
          </Button>
        )}
        {/* Is it finished? Eaten is the one solid action; the other two
            quiet under it; and every one can be undone straight after. */}
        <div role="group" aria-label={tr("Is it finished?", "Sudah habis?")} className="flex flex-col gap-2">
          {FOOD_OUTCOMES.map((outcome) => {
            const Icon = OUTCOME_ICONS[outcome];
            return (
              <Button
                key={outcome}
                variant={outcome === "eaten" ? "default" : "outline"}
                disabled={busy !== null || moving}
                onClick={() => finish(outcome)}
                className="min-h-12 rounded-2xl text-base font-semibold"
              >
                {busy === outcome ? <Loader2 className="size-5 animate-spin" /> : outcome === "eaten" ? <Icon className="size-5" /> : null}
                {FOOD_OUTCOME_LABELS[locale][outcome]}
              </Button>
            );
          })}
          <p className="text-center text-xs text-muted-foreground">
            {tr("You can undo it straight after.", "Bisa dibatalkan langsung setelahnya.")}
          </p>
        </div>

        {canMove && (
          <PlacePicker value={shownPlace ?? item.kept_in} onChange={(place) => void move(place)} locale={locale} disabled={busy !== null} />
        )}

        <Button variant="ghost" className="min-h-11 text-gray-700" onClick={() => onEdit(item)} disabled={busy !== null || moving}>
          <Pencil /> {tr("Edit", "Ubah")}
        </Button>

        {canDelete &&
          (confirmingDelete ? (
            <div className="flex gap-2">
              <Button variant="destructive" className="min-h-11 flex-1 rounded-xl" onClick={remove} disabled={busy !== null || moving}>
                {busy === "delete" && <Loader2 className="animate-spin" />}
                {tr("Yes, delete", "Ya, hapus")}
              </Button>
              <Button variant="ghost" className="min-h-11" onClick={() => setConfirmingDelete(false)} disabled={busy !== null || moving}>
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
        {/* The rest of what is known, quiet, under the actions (mockup-opened). */}
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
          <Fact label={tr("Added", "Ditambahkan")}>
            {[addedBy, shortDate(item.created_at)].filter(Boolean).join(" · ")}
          </Fact>
          {item.notes && <Fact label={tr("Notes", "Catatan")}>{item.notes}</Fact>}
        </dl>
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

/**
 * When to eat it, in words, under the name (Fable's mockup-opened): "Eat by
 * tomorrow" in amber with its mark today, tomorrow or past its date; two or
 * three days away in amber; further off, grey. The app's attention colour.
 */
function eatByLine(
  days: number | null,
  unknown: boolean,
  expiresOn: string | null,
  locale: FoodLocale
): { text: string | null; tone: "urgent" | "soon" | "quiet" } {
  const id = locale === "id";
  if (days === null && unknown) return { text: id ? "Cek tanggalnya" : "Check the date", tone: "urgent" };
  if (days === null) return { text: null, tone: "quiet" };
  if (days < 0) return { text: expiryLabel(days, locale), tone: "urgent" };
  if (days === 0) return { text: id ? "Habiskan hari ini" : "Eat today", tone: "urgent" };
  if (days === 1) return { text: id ? "Habiskan besok" : "Eat by tomorrow", tone: "urgent" };
  if (days <= 3) return { text: id ? `Habiskan dalam ${days} hari` : `Eat within ${days} days`, tone: "soon" };
  const date = expiresOn
    ? new Date(`${expiresOn}T00:00:00`).toLocaleDateString(DATE_LOCALE[locale], { day: "numeric", month: "short" })
    : "";
  return { text: id ? `Baik sampai ${date}` : `Good until ${date}`, tone: "quiet" };
}
