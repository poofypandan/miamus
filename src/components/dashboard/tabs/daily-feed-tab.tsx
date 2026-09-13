"use client";

import { useMemo } from "react";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { UnifiedSummaryCard } from "@/components/dashboard/unified-summary-card";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { formatDateLocal } from "@/lib/scheduleEngine";

export function DailyFeedTab() {
  const { pets, entities, logs, loading, selectedDate } = useHousehold();
  const dateStr = formatDateLocal(selectedDate);

  const allTodaysLogs = useMemo(
    () => logs.filter((l) => formatDateLocal(new Date(l.completed_at)) === dateStr),
    [logs, dateStr]
  );

  if (loading) {
    return (
      <div className="-mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <p className="-mt-2 pt-8 text-center text-sm text-muted-foreground">
        No pets yet. Add a pet above to get started.
      </p>
    );
  }

  return (
    <div className="-mt-2 flex flex-col">
      <UnifiedSummaryCard />
      <h3 className="mt-8 mb-3 text-sm font-medium text-gray-500">Photos</h3>
      <PhotoStream logs={allTodaysLogs} entities={entities} showAvatar />
      <div className="mt-8">
        <LowStockFlagButton />
      </div>
    </div>
  );
}
