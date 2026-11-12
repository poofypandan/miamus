"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { stockItemName } from "@/lib/inventory";
import {
  STOCK_UNITS,
  UNIT_HINTS_EN,
  amountInputValue,
  amountStep,
  clean,
  convertAmount,
  oldCountHint,
  parseAmount,
  startingAmount,
  unitLabel,
} from "@/lib/kitchen-units";
import { cn } from "@/lib/utils";
import type { InventoryItem, InventoryUnit } from "@/types/database";

/**
 * Track amount (Phase 170 PR A, mockup screen 2). Owner only: the database
 * refuses tracking, units and low levels from staff phones (D3).
 *
 * Opt-in per item (D1). Turning it on asks the unit, how much there is now
 * (required: tracking starts from a number; a guess is fine) and an
 * optional "Running low at". A Phase 110 count is shown as a hint, never
 * used (D14). Turning it off keeps the numbers, unshown.
 */
export function TrackAmountSheet({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  useBackToClose(item !== null, onClose);
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        {item && <TrackAmountForm key={item.id} item={item} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function TrackAmountForm({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { setTrackAmount, latestInventoryAudits } = useHousehold();
  const lang = useOwnerLocale();
  const t = useT();
  const start = startingAmount(item);
  const [on, setOn] = useState(item.track_amount === true);
  const [unit, setUnit] = useState<InventoryUnit>(item.unit);
  const [amount, setAmount] = useState(start === null ? "" : amountInputValue(start, lang));
  // The Phase 110 default of 2 was never chosen: blank unless tracking set it.
  const [lowAt, setLowAt] = useState(
    item.amount_set_at && item.min_threshold > 0 ? amountInputValue(item.min_threshold, lang) : ""
  );
  const [saving, setSaving] = useState(false);
  const hint = oldCountHint(item, lang, latestInventoryAudits[item.id]?.created_at ?? null);

  const typed = parseAmount(amount);
  const typedLow = lowAt.trim() === "" ? 0 : parseAmount(lowAt);
  const valid = !on || (typed !== null && typedLow !== null);

  function pickUnit(next: InventoryUnit) {
    // g ↔ kg, ml ↔ L, pieces 1 : 1: the typed numbers follow the unit.
    const amountNow = parseAmount(amount);
    const lowNow = lowAt.trim() === "" ? null : parseAmount(lowAt);
    const amountThen = amountNow === null ? null : convertAmount(amountNow, unit, next);
    const lowThen = lowNow === null ? null : convertAmount(lowNow, unit, next);
    if (amountThen !== null) setAmount(amountInputValue(amountThen, lang));
    if (lowThen !== null) setLowAt(amountInputValue(lowThen, lang));
    setUnit(next);
  }

  function step(direction: 1 | -1) {
    const now = parseAmount(amount) ?? 0;
    setAmount(amountInputValue(Math.max(0, clean(now + direction * amountStep(unit))), lang));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    if (!on && item.track_amount !== true) return onClose();
    setSaving(true);
    try {
      await setTrackAmount(
        item.id,
        on ? { track: true, unit, quantity: typed!, lowAt: typedLow! } : { track: false }
      );
      toast.success(
        on
          ? t(`Tracking ${stockItemName(item)}`, `Jumlah ${stockItemName(item)} dicatat`)
          : t(`${stockItemName(item)}: amount not tracked`, `Jumlah ${stockItemName(item)} tidak dicatat`)
      );
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <SheetHeader>
        <SheetTitle>{stockItemName(item)}</SheetTitle>
        <SheetDescription className="sr-only">{t("Track amount", "Catat jumlah")}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium text-gray-900">{t("Track amount", "Catat jumlah")}</span>
            <span className="text-xs text-muted-foreground">
              {t(
                "Shows exactly how much is left. It changes when you buy or cook, never on a schedule.",
                "Menunjukkan sisa yang pasti. Berubah saat belanja atau memasak, tidak perlu dihitung rutin."
              )}
            </span>
          </span>
          <Switch on={on} label={t("Track amount", "Catat jumlah")} onToggle={() => setOn((v) => !v)} />
        </div>

        {on && (
          <>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{t("Unit", "Satuan")}</legend>
              <UnitChips value={unit} onChange={pickUnit} lang={lang} />
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="track-amount-now">{t("How much is there now?", "Berapa yang ada sekarang?")}</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" className="size-11 rounded-xl" onClick={() => step(-1)} aria-label={t("Less", "Kurangi")}>
                  <Minus />
                </Button>
                <Input
                  id="track-amount-now"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="min-h-11 flex-1 rounded-xl text-center"
                />
                <Button type="button" variant="outline" className="size-11 rounded-xl" onClick={() => step(1)} aria-label={t("More", "Tambah")}>
                  <Plus />
                </Button>
                <span className="w-14 text-sm text-muted-foreground">{unitLabel(unit, lang)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "A guess is fine; it corrects itself next time you buy.",
                  "Perkiraan juga boleh; nanti terkoreksi saat belanja."
                )}
              </p>
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="track-amount-low">
                {t("Running low at", "Hampir habis kalau tinggal")}{" "}
                <span className="font-normal text-muted-foreground">{t("(optional)", "(opsional)")}</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="track-amount-low"
                  value={lowAt}
                  onChange={(e) => setLowAt(e.target.value)}
                  inputMode="decimal"
                  className="min-h-11 flex-1 rounded-xl"
                />
                <span className="w-14 text-sm text-muted-foreground">{unitLabel(unit, lang)}</span>
              </div>
            </div>
          </>
        )}

        <Button type="submit" className="min-h-12 rounded-xl text-base" disabled={!valid || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {t("Save", "Simpan")}
        </Button>
      </div>
    </form>
  );
}

/**
 * The unit chips (g, kg, ml, L, pcs, butir…), with the English hint line.
 * Shared with the add-ingredient form's Amount (Phase 176, 5c).
 */
export function UnitChips({
  value,
  onChange,
  lang,
}: {
  value: InventoryUnit;
  onChange: (unit: InventoryUnit) => void;
  lang: "en" | "id";
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STOCK_UNITS.map((unit) => {
        const selected = unit === value;
        const sub = lang === "en" ? UNIT_HINTS_EN[unit] : undefined;
        return (
          <button
            key={unit}
            type="button"
            onClick={() => onChange(unit)}
            aria-pressed={selected}
            className={cn(
              "flex min-h-11 min-w-12 flex-col items-center justify-center rounded-lg border px-2.5 text-sm",
              selected ? "border-primary bg-primary text-primary-foreground" : "bg-card text-gray-900"
            )}
          >
            <span>{unitLabel(unit, lang)}</span>
            {sub && sub !== unitLabel(unit, lang) && (
              <span className={cn("text-[10px] leading-none", selected ? "opacity-80" : "text-muted-foreground")}>
                {sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
