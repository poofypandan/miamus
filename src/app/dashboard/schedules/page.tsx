"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleEditor } from "@/components/dashboard/schedule-editor";
import { useHousehold } from "@/context/household-context";

export default function SchedulesPage() {
  const { pets, activePetId, loading } = useHousehold();
  const activePet = pets.find((p) => p.id === activePetId) ?? null;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Schedules</h1>
      {activePet ? (
        <ScheduleEditor entity={activePet} />
      ) : (
        <p className="pt-8 text-center text-sm text-muted-foreground">
          {pets.length === 0
            ? "No pets yet. Add a pet above to start building schedules."
            : "Select a pet above to view their schedule."}
        </p>
      )}
    </div>
  );
}
