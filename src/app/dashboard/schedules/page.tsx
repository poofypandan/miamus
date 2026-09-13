"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { ScheduleEditor } from "@/components/dashboard/schedule-editor";
import { UnifiedTimeline } from "@/components/dashboard/unified-timeline";
import { useHousehold } from "@/context/household-context";
import { useRequireOwner } from "@/hooks/use-require-owner";

export default function SchedulesPage() {
  const { pets, activePetId, viewMode, loading, selectedDate, setSelectedDate } = useHousehold();
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
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Schedules</h1>
        <DateRibbon value={selectedDate} onChange={setSelectedDate} />
        <UnifiedTimeline />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Schedules</h1>
      <DateRibbon value={selectedDate} onChange={setSelectedDate} />
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
