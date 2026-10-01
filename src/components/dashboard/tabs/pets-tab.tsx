"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DateRibbon } from "@/components/date-ribbon";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { ManageRoutinesSheet } from "@/components/dashboard/schedule-editor";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { UnifiedTimeline } from "@/components/dashboard/unified-timeline";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useToday } from "@/hooks/use-today";
import { dayLabel } from "@/lib/date-label";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { TaskEntity } from "@/types/database";

/**
 * The dogs: their day's routines, the photos that came back, and the way into
 * each pet's schedule.
 *
 * Phase 100 merged the old Daily Feed and Schedule sub-tabs into this one
 * screen. Those two were split when the dashboard had no Agenda — the feed was
 * "what happened" and the schedule "what is planned", and both were really
 * about pets. The unified Agenda now answers "what is due" for the whole
 * household, which leaves this tab free to be about the animals themselves.
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary.
 */
export function PetsTab() {
  const { pets, entities, logs, loading, selectedDate, setSelectedDate } = useHousehold();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate, today);

  const logsForDate = useMemo(
    () => logs.filter((l) => formatDateLocal(new Date(l.completed_at)) === dateStr),
    [logs, dateStr]
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <p className="px-4 pt-8 text-center text-sm text-muted-foreground">
        No pets yet. Add a pet to start building schedules.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <DateRibbon value={selectedDate} onChange={setSelectedDate} locale="en" />

      <h2 className="text-sm font-semibold text-gray-900">{label}&apos;s Timeline</h2>
      <UnifiedTimeline />

      <ManageRoutinesButton />

      <h3 className="mt-2 text-sm font-semibold text-gray-900">Photos</h3>
      {/* No "Flag Low Stock" here: reporting is staff data entry and lives in
          the staff view. The owner reads reports and restocks. */}
      <PhotoStream logs={logsForDate} entities={entities} showAvatar />
    </div>
  );
}

// Routines are defined per pet — there is no household-wide routine editor —
// so this opens a picker and hands off to that pet's routine editor.
function ManageRoutinesButton() {
  const { pets } = useHousehold();
  const [open, setOpen] = useState(false);
  // The picker deliberately stays open underneath: Back then unwinds editor
  // first, picker second, which is the order the user arrived in.
  const [editingPet, setEditingPet] = useState<TaskEntity | null>(null);

  useBackToClose(open, () => setOpen(false));

  return (
    <>
      {/* Primary action for this tab, so it keeps the solid dark fill — the
          same treatment as the profile sheet's own Manage Routines button. */}
      <Button
        onClick={() => setOpen(true)}
        size="lg"
        className="min-h-[52px] w-full bg-zinc-900 text-base text-white hover:bg-zinc-800"
      >
        <Settings2 /> Manage Routines
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl px-4 pb-10">
          <SheetHeader className="px-0">
            <SheetTitle>Manage Routines</SheetTitle>
            <SheetDescription>
              Pick a pet to edit their meals, potty routine, medication and grooming.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2">
            {pets.map((pet) => (
              <button
                key={pet.id}
                type="button"
                onClick={() => setEditingPet(pet)}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-3 text-left active:bg-gray-50"
              >
                <MiniPetAvatar pet={pet} className="size-10" />
                <span className="flex-1 font-medium">{pet.name}</span>
                <ChevronRight className="size-5 shrink-0 text-gray-400" />
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <ManageRoutinesSheet entity={editingPet} onClose={() => setEditingPet(null)} />
    </>
  );
}
