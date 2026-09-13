"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { UnifiedTimeline } from "@/components/dashboard/unified-timeline";
import { useHousehold } from "@/context/household-context";
import { useRequireOwner } from "@/hooks/use-require-owner";

export function SchedulesTab() {
  const { pets, loading, selectedDate, setSelectedDate } = useHousehold();
  const isOwner = useRequireOwner();

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
      <DateRibbon value={selectedDate} onChange={setSelectedDate} />
      <UnifiedTimeline />
    </div>
  );
}
