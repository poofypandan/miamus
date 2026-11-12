"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useFormatTime } from "@/components/ui/ui-labels";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { useToday } from "@/hooks/use-today";
import { routineKindInfo, type StarterSpecies } from "@/lib/pet-routine-kinds";
import { starterOptions, starterRows, type StarterOption } from "@/lib/pet-starters";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { TaskEntity } from "@/types/database";

/**
 * "Usual routines for Coco" (Phase 173 PR B, D9): shown once, right after
 * Add pet saves a pet. A short tick-list of the usual routines for a dog or
 * a cat, ticked, plus the household's routines the new pet can join,
 * unticked. One tap adds them; Skip leaves nothing behind. Nothing here is
 * required: Dog or Cat starts on Dog, as every pet without a species reads.
 *
 * Saved through createSchedulesBatch, the Add routine sheet's own action, so
 * the write guard (admins only, migrations/144) applies as there.
 * Owner-facing: English or Bahasa Indonesia.
 */
export function StarterRoutinesSheet({ pet, onClose }: { pet: TaskEntity | null; onClose: () => void }) {
  const t = useT();
  const locale = useOwnerLocale();
  const formatTime = useFormatTime();
  const { pets, schedules, createSchedulesBatch, updateEntity } = useHousehold();
  const today = formatDateLocal(useToday());
  const [species, setSpecies] = useState<StarterSpecies>("dog");
  // The owner's own changes to the ticks, by option key; the rest follow the defaults.
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  // Two taps in one tick must not add every routine twice (demo check F-1).
  const lock = useSubmitLock();
  useBackToClose(!!pet, onClose);

  useEffect(() => {
    if (!pet) return;
    lock.release();
    setSaving(false);
    setSpecies(pet.metadata?.species === "cat" ? "cat" : "dog");
    setToggled(new Set());
  }, [pet, lock]);

  const options = useMemo(
    () =>
      pet
        ? starterOptions({
            species,
            petId: pet.id,
            schedules,
            pets: pets.map((p) => ({ id: p.id, name: p.name })),
            today,
          })
        : [],
    [pet, species, schedules, pets, today]
  );
  const isTicked = (option: StarterOption) => option.ticked !== toggled.has(option.key);
  const chosen = options.filter(isTicked);

  function toggle(key: string) {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function add() {
    if (!pet || saving || chosen.length === 0 || !lock.acquire()) return;
    setSaving(true);
    try {
      const rows = starterRows({
        petId: pet.id,
        options: chosen,
        schedules,
        today,
        nowIso: new Date().toISOString(),
        newGroupId: () => crypto.randomUUID(),
      });
      if (rows.length > 0) await createSchedulesBatch(rows);
      // A cat is remembered, so Kakak and the next list know (nothing else reads it).
      if (species === "cat" && pet.metadata?.species !== "cat") {
        await updateEntity(pet.id, { metadata: { ...pet.metadata, species: "cat" } }).catch((err) =>
          console.error("species not saved", err)
        );
      }
      toast.success(
        t(
          `${chosen.length} ${chosen.length === 1 ? "routine" : "routines"} added for ${pet.name}`,
          `${chosen.length} rutinitas ditambahkan untuk ${pet.name}`
        )
      );
      // Saving and the lock stay held while the sheet closes.
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(t("Routines not added. Try again.", "Rutinitas gagal ditambahkan. Coba lagi."));
      lock.release();
      setSaving(false);
    }
  }

  const name = pet?.name ?? "";
  return (
    <Sheet open={!!pet} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto" data-testid="starter-routines-sheet">
        <SheetHeader>
          <SheetTitle>{t(`Usual routines for ${name}`, `Rutinitas biasa untuk ${name}`)}</SheetTitle>
          <SheetDescription>
            {t(
              `${name} is added. Staff see these from today; untick what you don't want.`,
              `${name} sudah ditambahkan. Staf melihatnya mulai hari ini; hapus centang yang tidak perlu.`
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <SegmentedControl
            segments={[
              { value: "dog", label: t("Dog", "Anjing") },
              { value: "cat", label: t("Cat", "Kucing") },
            ]}
            value={species}
            onChange={(value) => {
              setSpecies(value);
              setToggled(new Set());
            }}
            ariaLabel={t(`${name} is a`, `${name} adalah`)}
          />
          <div className="flex flex-col">
            {options.map((option) => {
              const Icon = routineKindInfo(option.kind)?.icon;
              const checked = isTicked(option);
              const what = locale === "en" && option.en ? option.en : option.title;
              const label =
                option.type === "join"
                  ? t(`Add ${name} to ${what}`, `Tambahkan ${name} ke ${what}`)
                  : what;
              const times = option.times.map((time) => formatTime(time)).join(", ");
              const detail =
                option.type === "join" && option.petNames?.length
                  ? `${times} · ${t("with", "bersama")} ${option.petNames.join(", ")}`
                  : times;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`${label}, ${times}`}
                  onClick={() => toggle(option.key)}
                  className="flex min-h-12 items-center gap-3 rounded-lg px-1 text-left active:bg-muted"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border",
                      checked ? "border-gray-900 bg-gray-900 text-white" : "bg-white"
                    )}
                  >
                    {checked && <Check className="size-3.5" aria-hidden />}
                  </span>
                  {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-gray-900">{label}</span>
                    <span className="text-xs text-muted-foreground">{detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button className="min-h-[48px]" disabled={saving || chosen.length === 0} onClick={() => void add()}>
            {saving && <Loader2 className="animate-spin" />}
            {t(`Add ${chosen.length}`, `Tambah ${chosen.length}`)}
          </Button>
          <Button variant="ghost" className="min-h-[48px]" disabled={saving} onClick={onClose}>
            {t("Skip", "Lewati")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
