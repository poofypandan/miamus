"use client";

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
  shapeFromHousehold,
  toApplyPayload,
  type Shape,
} from "@/lib/setup-templates";

/**
 * "Starter list" on Chores → Today (Phase 172 PR A2, D7 A): the same list a
 * new household ticks, for a household that already exists. Its own rooms
 * and chores are marked Added, with no checkbox, and are never sent twice
 * (apply_household_setup skips them too). Nothing changes unless they tick.
 * Chores go to Anyone; bills to the owner, as the Bills and upkeep checklist
 * does. Owner-facing: English or Bahasa Indonesia.
 */
export function StarterListSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
  // unlike a new household's review, where everything does.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  // Opened again: start from the household as it is now.
  useEffect(() => {
    if (open) {
      setShape(null);
      setTicked(new Set());
    }
  }, [open]);

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
    return new Set(keys.filter((k) => !added.has(k) && !ticked.has(k)));
  }, [draft, added, ticked]);
  const counts = countsFor(draft, unticked, added);
  // Until every set-up chore is read, "Added" can't be trusted: wait.
  const ready = loaded && locations !== null;

  function toggle(key: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function add() {
    if (saving || !ready) return;
    setSaving(true);
    const outcome = await applyHouseholdSetup(
      activeHouseholdId,
      toApplyPayload(draft, unticked, added, [])
    );
    if (!outcome.ok) {
      setSaving(false);
      toast.error(t("Couldn't add the list. Nothing was added; try again.", "Daftar gagal ditambahkan. Belum ada yang ditambahkan; coba lagi."));
      return;
    }
    const n = outcome.result.rooms_added + outcome.result.chores_added + outcome.result.bills_added;
    await Promise.allSettled([refresh({ silent: true }), Promise.resolve(reloadRooms())]);
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
            {t(
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
            {t(`Add ${counts.total}`, `Tambah ${counts.total}`)}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
