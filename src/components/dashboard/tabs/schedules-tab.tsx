"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { UnifiedTimeline } from "@/components/dashboard/unified-timeline";
import { useSearchParams } from "next/navigation";
import { useHousehold } from "@/context/household-context";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { dayLabel } from "@/lib/date-label";

export function SchedulesTab() {
  const { pets, loading, selectedDate, setSelectedDate } = useHousehold();
  const isOwner = useRequireOwner();
  const label = dayLabel(selectedDate);
  // Safe without its own Suspense boundary: this only ever renders inside the
  // dashboard canvas, which is already wrapped in one.
  const searchParams = useSearchParams();

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
      {/* Ribbon first, then the header it scopes — same order as Daily Feed. */}
      <DateRibbon
        value={selectedDate}
        onChange={setSelectedDate}
        recenterKey={searchParams.get("tab") ?? "feed"}
      />
      <h2 className="text-sm font-medium text-gray-500">{label}&apos;s Timeline</h2>
      <UnifiedTimeline />
    </div>
  );
}
