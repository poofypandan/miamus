"use client";

import { useState } from "react";
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
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { ManageRoutinesSheet } from "@/components/dashboard/schedule-editor";
import { UnifiedTimeline } from "@/components/dashboard/unified-timeline";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { dayLabel } from "@/lib/date-label";
import type { TaskEntity } from "@/types/database";

// The date ribbon used to live here; it now sits above the carousel in
// dashboard/page.tsx so it stays put while the panels swipe underneath it.
export function SchedulesTab() {
  const { pets, loading, selectedDate } = useHousehold();
  const isOwner = useRequireOwner();
  const label = dayLabel(selectedDate);

  if (!isOwner) return null;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="pt-8 text-center text-sm text-muted-foreground">
          No pets yet. Add a pet above to start building schedules.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-900">{label}&apos;s Timeline</h2>
      <UnifiedTimeline />
      <ManageRoutinesButton />
    </div>
  );
}

// Routines are defined per pet — there is no household-wide routine editor —
// so this opens a picker and hands off to that pet's profile sheet, which is
// where the full ScheduleEditor (and its own "Manage Routines" sheet) lives.
function ManageRoutinesButton() {
  const { pets } = useHousehold();
  const [open, setOpen] = useState(false);
  // Picking a pet now opens its routine editor straight over the picker,
  // rather than routing through the whole pet profile sheet to reach the same
  // editor. The picker deliberately stays open underneath: Back then unwinds
  // editor first, picker second, which is the order the user arrived in.
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
