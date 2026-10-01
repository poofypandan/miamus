"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { PetFormDialog } from "@/components/dashboard/pet-form-dialog";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { UnifiedSummaryCard } from "@/components/dashboard/unified-summary-card";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import { dayLabel } from "@/lib/date-label";
import { getPetMeta, isAdmitted, petPhotoLogs } from "@/lib/pets";
import { formatDateLocal } from "@/lib/scheduleEngine";

/**
 * The pets dashboard: who lives here, how their day is going, and what came
 * back on camera.
 *
 * Phase 101 stripped this tab back to a bare directory and moved the visual
 * half onto the Agenda. That overcorrected: the Agenda became a chronological
 * list with a progress card and a photo grid stacked on top of it, which is
 * two different jobs on one screen. The split that actually works is by
 * subject rather than by time — the Agenda answers "what is due across the
 * household", this answers "how are the dogs".
 *
 * ITS OWN DATE (Phase 102). The ribbon here drives local state, not the shared
 * selectedDate the Agenda and chores use, so browsing back through last week's
 * photos does not drag the Agenda along with it. The two are meant to be
 * looked at independently and now can be.
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary. The
 * rows open PetProfileSheet, which is where every pet mutation already lives.
 */
export function PetsTab() {
  const {
    pets,
    entities,
    logs,
    medicalRecords,
    loading,
    setActivePetId,
    userRole,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useHousehold();
  const [addOpen, setAddOpen] = useState(false);
  const canManagePets = userRole === "owner";

  // Null until the owner picks a day, so the view follows the clock over
  // midnight rather than sitting on the date it mounted — the same shape as
  // the staff agenda's assignee filter, and the reason this is not seeded
  // with `new Date()`.
  const today = useToday();
  const [chosenDate, setChosenDate] = useState<Date | null>(null);
  const date = chosenDate ?? today;
  const dateStr = formatDateLocal(date);

  // How much history each pet has, so a profile with records to read is
  // distinguishable from an empty one before it is opened.
  // Pet routines only — never a chore's before/after shot. See petPhotoLogs
  // for why that is a filter rather than something to take on trust.
  const photoLogs = useMemo(
    () => petPhotoLogs({ logs, entities, date: dateStr }),
    [logs, entities, dateStr]
  );

  const recordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of medicalRecords) {
      counts.set(record.entity_id, (counts.get(record.entity_id) ?? 0) + 1);
    }
    return counts;
  }, [medicalRecords]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-4">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      {/* Local to this tab: moving it does not move the Agenda. */}
      <DateRibbon value={date} onChange={setChosenDate} locale="en" />

      <h2 className="text-sm font-semibold text-gray-900">Pets</h2>

      {pets.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card px-3 py-6 text-center text-sm text-muted-foreground">
          No pets yet. Add one to start building their profile and routines.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {pets.map((pet) => {
            const meta = getPetMeta(pet);
            const records = recordCounts.get(pet.id) ?? 0;
            return (
              <button
                key={pet.id}
                type="button"
                onClick={() => setActivePetId(pet.id)}
                className="flex min-h-[72px] w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left active:bg-muted/60"
              >
                <MiniPetAvatar pet={pet} className="size-12" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium">{pet.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {meta.breed && (
                      <span className="truncate text-xs text-muted-foreground">{meta.breed}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {records === 0
                        ? "No medical records"
                        : `${records} medical record${records === 1 ? "" : "s"}`}
                    </span>
                    {/* The one status worth seeing before opening a profile:
                        an admitted dog's routines are paused. */}
                    {isAdmitted(pet) && (
                      <Badge className="h-5 gap-1 bg-indigo-100 px-1.5 text-[10px] text-indigo-900">
                        <Stethoscope className="size-3" /> At the clinic
                      </Badge>
                    )}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-gray-400" />
              </button>
            );
          })}
        </div>
      )}

      {canManagePets && (
        <>
          {/* Moved here from the summary card on the Agenda (Phase 101):
              adding a pet is directory work, and the Agenda is for the day. */}
          <Button
            onClick={() => setAddOpen(true)}
            variant="outline"
            className="min-h-[48px] w-full rounded-xl border-zinc-200 bg-white text-sm font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
          >
            <Plus /> Add Pet
          </Button>

          <PetFormDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            pet={null}
            createEntity={createEntity}
            updateEntity={updateEntity}
            deleteEntity={deleteEntity}
          />
        </>
      )}

      {pets.length > 0 && (
        <>
          <h2 className="mt-2 text-sm font-semibold text-gray-900">
            {dayLabel(date, today)}&apos;s Progress
          </h2>
          <UnifiedSummaryCard date={date} />

          <h2 className="mt-2 text-sm font-semibold text-gray-900">Photos</h2>
          {/* No "Flag Low Stock" here: reporting is staff data entry and lives
              in the staff view. The owner reads reports and restocks. */}
          <PhotoStream logs={photoLogs} entities={entities} showAvatar />
        </>
      )}

      <p className="px-1 text-[11px] text-muted-foreground">
        Open a pet to edit their details, routines and medical records. The day&apos;s full
        task list — dogs and household — lives on the Agenda.
      </p>
    </div>
  );
}
