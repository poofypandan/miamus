"use client";

import { useSubmitLock } from "@/hooks/use-submit-lock";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SetupReview } from "@/components/setup/setup-review";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { useSetUpChores } from "@/hooks/use-set-up-chores";
import { useToday } from "@/hooks/use-today";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { applyHouseholdSetup } from "@/lib/setup-apply";
import {
  alreadyInHousehold,
  buildSetupDraft,
  countsFor,
  setupAddLabel,
  shapeFromHousehold,
  toApplyPayload,
  type Shape,
} from "@/lib/setup-templates";

/**
 * "Starter list" on Home → Chores (Phase 172 PR A2, D7 A): the same list a
 * new household ticks, for a household that already exists. Its own rooms
 * and chores are marked Added, with no checkbox, and are never sent twice
 * (apply_household_setup skips them too). Nothing changes unless they tick.
 * Chores go to Anyone; bills to the owner, as the Bills and upkeep checklist
 * does. Owner-facing: English or Bahasa Indonesia.
 */
export function StarterListSheet({
  open,
  onOpenChange,
  startTicked = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The Set up card's button (Phase 175 check, F3): a home with no rooms yet
   * (it skipped /setup) gets the list as /setup shows it, everything ticked,
   * "ticks, no typing". A home that already has rooms gets the usual sheet,
   * where nothing is ticked, even from the card.
   */
  startTicked?: boolean;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const { activeHouseholdId, refresh } = useHousehold();
  const { bills: billsOn } = useHouseholdFeatures();
  const today = formatDateLocal(useToday());
  const { locations, reload: reloadRooms } = useHouseholdLocations();
  const { rows: chores, loaded, failed, reload: reloadChores } = useSetUpChores(today);
  useBackToClose(open, () => onOpenChange(false));

  const start = useMemo(() => shapeFromHousehold(locations ?? []), [locations]);
  const [shape, setShape] = useState<Shape | null>(null);
  // Nothing starts ticked here (D7: "nothing changes unless they tick"),
  // unlike a new household's review, where everything does. `flipped` holds
  // what the owner changed from that start: ticked keys on the usual sheet,
  // unticked ones when it starts ticked.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  // Whether this opening starts ticked: settled once the rooms are read, and
  // held until the sheet closes, so the rooms Add creates can't turn the
  // owner's unticks into ticks while the sheet is still on screen.
  const [allTicked, setAllTicked] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const adding = useSubmitLock();
  // Opened again: start from the household as it is now.
  useEffect(() => {
    if (open) {
      setShape(null);
      setFlipped(new Set());
      setAllTicked(null);
    }
  }, [open]);
  useEffect(() => {
    if (open && allTicked === null && locations !== null) {
      setAllTicked(startTicked && locations.length === 0);
    }
  }, [open, allTicked, locations, startTicked]);

  const shown = shape ?? start.shape;
  const draft = useMemo(
    () => buildSetupDraft(shown, { homeType: start.homeType, today, locale, billsOn }),
    [shown, start.homeType, today, locale, billsOn]
  );
  const added = useMemo(
    () => alreadyInHousehold(draft, { locations: locations ?? [], chores: chores ?? [], today }),
    [draft, locations, chores, today]
  );
  const unticked = useMemo(() => {
    const keys = [
      ...draft.rooms.map((r) => r.key),
      ...draft.chores.map((c) => c.key),
      ...draft.bills.map((b) => `bill:${b.key}`),
    ];
    return new Set(keys.filter((k) => !added.has(k) && (allTicked ? flipped.has(k) : !flipped.has(k))));
  }, [draft, added, flipped, allTicked]);
  const counts = countsFor(draft, unticked, added);
  // Everything in the list is already in the household: say so, rather than
  // a disabled "Add 0" (demo check F-6).
  const allAdded =
    draft.rooms.every((r) => added.has(r.key)) &&
    draft.chores.every((c) => added.has(c.key)) &&
    draft.bills.every((b) => added.has(`bill:${b.key}`));
  const addLabel =
    setupAddLabel(counts, 0, locale) ??
    (allAdded ? t("Everything's added", "Semua sudah ditambahkan") : t("Tick what to add", "Centang yang mau ditambahkan"));
  // Until every set-up chore is read, "Added" can't be trusted: wait.
  const ready = loaded && locations !== null && allTicked !== null;

  function toggle(key: string) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function add() {
    // A ref, so two taps in one tick can't both send the list (demo check P-1).
    if (saving || !ready || !adding.acquire()) return;
    setSaving(true);
    const outcome = await applyHouseholdSetup(
      activeHouseholdId,
      toApplyPayload(draft, unticked, added, [])
    );
    if (!outcome.ok) {
      adding.release();
      setSaving(false);
      toast.error(t("Couldn't add the list. Nothing was added; try again.", "Daftar gagal ditambahkan. Belum ada yang ditambahkan; coba lagi."));
      return;
    }
    const n = outcome.result.rooms_added + outcome.result.chores_added + outcome.result.bills_added;
    await Promise.allSettled([refresh({ silent: true }), Promise.resolve(reloadRooms())]);
    adding.release();
    setSaving(false);
    onOpenChange(false);
    toast.success(t(`Added ${n}`, `${n} ditambahkan`));
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("Starter list", "Daftar awal")}</SheetTitle>
          <SheetDescription>
            {allTicked
              ? t(
                  "The usual rooms and chores for a home like yours. Untick what you don't have.",
                  "Ruangan dan tugas yang biasa untuk rumah seperti milik Anda. Hapus centang yang tidak ada."
                )
              : t(
                  "The usual rooms and chores for a home like yours. Tick what's missing; what you already have is marked Added.",
                  "Ruangan dan tugas yang biasa untuk rumah seperti milik Anda. Centang yang belum ada; yang sudah ada ditandai Sudah ditambahkan."
                )}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4">
          {ready ? (
            <SetupReview
              draft={draft}
              shape={shown}
              onShape={setShape}
              unticked={unticked}
              onToggle={toggle}
              added={added}
              locale={locale}
            />
          ) : failed ? (
            // Without every chore read, "Added" can't be trusted (code review, PR #90).
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {t("Couldn't load your chores.", "Tugas Anda gagal dimuat.")}
              </p>
              <Button variant="outline" className="min-h-11" onClick={reloadChores}>
                {t("Try again", "Coba lagi")}
              </Button>
            </div>
          ) : (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            {t(
              `${counts.rooms} rooms · ${counts.chores} chores · ${counts.bills} bills`,
              `${counts.rooms} ruangan · ${counts.chores} tugas · ${counts.bills} tagihan`
            )}
          </p>
          <Button className="min-h-[48px]" disabled={!ready || saving || counts.total === 0} onClick={() => void add()}>
            {saving && <Loader2 className="animate-spin" />}
            {addLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
