"use client";

import { useMemo, useState } from "react";
import { PawPrint, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRibbon } from "@/components/date-ribbon";
import { PetFormDialog } from "@/components/dashboard/pet-form-dialog";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { UnifiedSummaryCard } from "@/components/dashboard/unified-summary-card";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import { dayLabel } from "@/lib/date-label";
import { petPhotoLogs } from "@/lib/pets";
import { formatDateLocal } from "@/lib/scheduleEngine";

/**
 * The pets dashboard: how each dog's day is going, and what came back on
 * camera.
 *
 * ONE LIST (Phase 103). This tab briefly held two: a static directory above a
 * progress list, both of them every pet, both of them opening the same profile
 * sheet. The progress rows were already tappable, so the directory was a
 * second copy that only added scrolling between the ribbon and the thing worth
 * reading.
 *
 * ITS OWN DATE (Phase 102). The ribbon drives local state, not the shared
 * selectedDate the Agenda and chores use, so browsing back through last week's
 * photos does not drag the Agenda along with it.
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary.
 */
export function PetsTab() {
  const {
    pets,
    entities,
    logs,
    loading,
    userRole,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useHousehold();
  const [addOpen, setAddOpen] = useState(false);
  const canManagePets = userRole === "owner";

  // Null until the owner picks a day, so the view follows the clock over
  // midnight rather than sitting on the date it mounted.
  const today = useToday();
  const [chosenDate, setChosenDate] = useState<Date | null>(null);
  const date = chosenDate ?? today;
  const dateStr = formatDateLocal(date);

  // Pet routines only — never a chore's before/after shot. See petPhotoLogs
  // for why that is a filter rather than something to take on trust.
  const photoLogs = useMemo(
    () => petPhotoLogs({ logs, entities, date: dateStr }),
    [logs, entities, dateStr]
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-4">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  // One dialog, two triggers: the empty state's primary button and the quiet
  // full-width one under the list.
  const addDialog = canManagePets ? (
    <PetFormDialog
      open={addOpen}
      onOpenChange={setAddOpen}
      pet={null}
      createEntity={createEntity}
      updateEntity={updateEntity}
      deleteEntity={deleteEntity}
    />
  ) : null;

  const addButton = canManagePets ? (
    <Button
      onClick={() => setAddOpen(true)}
      variant="outline"
      className="min-h-[48px] w-full rounded-xl border-zinc-200 bg-white text-sm font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
    >
      <Plus /> Add Pet
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      {addDialog}

      {pets.length === 0 ? (
        // No date ribbon until there is a pet: it would pick a day for a
        // summary that cannot exist yet (Phase 120). And the empty state gets
        // the primary button the Agenda and Chores ones have — the quiet
        // list-footer style read as disabled on a page with nothing else on it.
        <EmptyState
          icon={PawPrint}
          title="No pets yet"
          description="Add your first pet to start their profile, daily routines and photo log. Staff see them on their phones straight away."
        >
          {canManagePets && (
            <Button className="min-h-[44px]" onClick={() => setAddOpen(true)}>
              <Plus /> Add Pet
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          {/* Local to this tab: moving it does not move the Agenda. */}
          <DateRibbon value={date} onChange={setChosenDate} locale="en" />

          <h2 className="text-sm font-semibold text-gray-900">
            {dayLabel(date, today)}&apos;s Progress
          </h2>
          {/* Every row opens that pet's profile sheet — details, routines,
              medical records — which is what the directory above this used to
              be for. */}
          <UnifiedSummaryCard date={date} />
          {addButton}

          <h2 className="mt-2 text-sm font-semibold text-gray-900">Photos</h2>
          {/* No "Flag Low Stock" here: reporting is staff data entry and lives
              in the staff view. The owner reads reports and restocks. */}
          <PhotoStream logs={photoLogs} entities={entities} showAvatar />
        </>
      )}
    </div>
  );
}
