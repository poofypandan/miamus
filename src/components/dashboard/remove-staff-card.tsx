"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { useSetUpChores } from "@/hooks/use-set-up-chores";
import { useToday } from "@/hooks/use-today";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { giveToChoices, suggestGiveTo } from "@/lib/staff-onboarding";
import { cn } from "@/lib/utils";
import type { StaffProfile } from "@/types/database";

export interface RemoveChoice {
  /** Who takes the work, or null for Anyone. */
  giveTo: string | null;
  /** How many chores and pet routines go with it, for the toast. */
  chores: number;
  routines: number;
}

/**
 * Removing someone (staff onboarding, step 4; plan section 2c): one card with
 * one question, who takes their work, in place of four paragraphs. The person
 * who shares their area is suggested (owner decision 7), else Anyone; one tap
 * changes it. archive_staff_profile (migrations/180) moves their unfinished
 * and repeating chores, and the pet routines made for them, to that person.
 *
 * Owner-facing: English or Bahasa Indonesia.
 */
export function RemoveStaffCard({
  person,
  roster,
  busy,
  onCancel,
  onRemove,
}: {
  person: StaffProfile | null;
  roster: StaffProfile[];
  busy: boolean;
  onCancel: () => void;
  onRemove: (person: StaffProfile, choice: RemoveChoice) => void;
}) {
  return (
    <Dialog open={!!person} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        {/* Keyed by person: a fresh suggestion for each, and a background
            roster refresh never resets the owner's choice. */}
        {person && <RemoveStaffBody key={person.id} person={person} roster={roster} busy={busy} onCancel={onCancel} onRemove={onRemove} />}
      </DialogContent>
    </Dialog>
  );
}

function RemoveStaffBody({
  person,
  roster,
  busy,
  onCancel,
  onRemove,
}: {
  person: StaffProfile;
  roster: StaffProfile[];
  busy: boolean;
  onCancel: () => void;
  onRemove: (person: StaffProfile, choice: RemoveChoice) => void;
}) {
  const t = useT();
  const { schedules } = useHousehold();
  const today = formatDateLocal(useToday());
  const { rows: chores } = useSetUpChores(today);
  const choices = useMemo(() => giveToChoices(person, roster), [person, roster]);
  const [giveTo, setGiveTo] = useState<string | null>(() => suggestGiveTo(person, roster));

  const choreCount = (chores ?? []).filter((c) => c.assigned_to === person.id).length;
  const routineCount = schedules.filter((s) => s.staff_id === person.id && s.is_active !== false).length;
  const work = choreCount + routineCount;
  const name = person.name;
  const what = [
    choreCount > 0 ? t(`${choreCount} ${choreCount === 1 ? "chore" : "chores"}`, `${choreCount} tugas`) : null,
    routineCount > 0 ? t(`${routineCount} pet ${routineCount === 1 ? "routine" : "routines"}`, `${routineCount} rutinitas hewan`) : null,
  ]
    .filter(Boolean)
    .join(t(" and ", " dan "));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(`${name} leaves today`, `${name} berhenti hari ini`)}</DialogTitle>
        <DialogDescription>
          {t(
            `${name}'s phone is signed out now. Their past work keeps their name.`,
            `HP ${name} langsung keluar. Pekerjaan sebelumnya tetap atas namanya.`
          )}
        </DialogDescription>
      </DialogHeader>

      {/* Always asked when someone could take it: the counts only cover
          set-up chores and routines, and may still be loading, while the
          server moves everything of theirs that is open. */}
      {choices.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-gray-900">
            {work > 0
              ? t(`${name}'s ${what} ${work === 1 ? "goes" : "go"} to:`, `${what} milik ${name} diberikan ke:`)
              : t(`Anything of ${name}'s still open goes to:`, `Tugas ${name} yang masih terbuka diberikan ke:`)}
          </legend>
          <div className="flex flex-wrap gap-2">
            {[...choices.map((p) => ({ id: p.id as string | null, label: p.name })), { id: null, label: t("Anyone", "Siapa saja") }].map(
              (option) => {
                const on = giveTo === option.id;
                return (
                  <button
                    key={option.id ?? "anyone"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGiveTo(option.id)}
                    className={cn(
                      "flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                      on ? "border-gray-900 bg-gray-900 text-white" : "bg-white text-gray-700 active:bg-muted"
                    )}
                  >
                    {on && <Check className="size-3.5" aria-hidden />}
                    {option.label}
                  </button>
                );
              }
            )}
          </div>
        </fieldset>
      )}
      <p className="text-xs text-muted-foreground">
        {t("You can bring them back later.", "Bisa dikembalikan nanti.")}
      </p>

      <DialogFooter>
        <Button variant="outline" className="min-h-[44px] rounded-xl" onClick={onCancel}>
          {t("Cancel", "Batal")}
        </Button>
        <Button
          variant="destructive"
          className="min-h-[44px] rounded-xl"
          disabled={busy}
          onClick={() => onRemove(person, { giveTo, chores: choreCount, routines: routineCount })}
        >
          {busy ? <Loader2 className="animate-spin" /> : <UserMinus />} {t(`Remove ${name}`, `Hapus ${name}`)}
        </Button>
      </DialogFooter>
    </>
  );
}
