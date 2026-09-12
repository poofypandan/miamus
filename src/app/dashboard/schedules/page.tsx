"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleEditor } from "@/components/dashboard/schedule-editor";
import { useHousehold } from "@/context/household-context";
import { useRequireOwner } from "@/hooks/use-require-owner";

export default function SchedulesPage() {
  const { pets, activePetId, viewMode, loading } = useHousehold();
  const isOwner = useRequireOwner();
  const activePet = pets.find((p) => p.id === activePetId) ?? null;

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
        <h1 className="text-xl font-semibold">Schedules</h1>
        <p className="pt-8 text-center text-sm text-muted-foreground">
          No pets yet. Add a pet above to start building schedules.
        </p>
      </div>
    );
  }

  if (viewMode === "all") {
    return (
      <div className="flex flex-col">
        <h1 className="text-xl font-semibold">Schedules</h1>
        {pets.map((pet) => (
          <div key={pet.id}>
            <h3 className="mt-6 mb-2 text-lg font-bold">{pet.name}</h3>
            <ScheduleEditor entity={pet} />
          </div>
        ))}
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
          Select a pet above to view their schedule.
        </p>
      )}
    </div>
  );
}
