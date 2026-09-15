"use client";

import { useMemo } from "react";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { InventoryAlertsPanel } from "@/components/dashboard/inventory-alerts-panel";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { UnifiedSummaryCard } from "@/components/dashboard/unified-summary-card";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { dayLabel } from "@/lib/date-label";
import { formatDateLocal } from "@/lib/scheduleEngine";

// The date ribbon used to live here; it now sits above the carousel in
// dashboard/page.tsx so it stays put while the panels swipe underneath it.
export function DailyFeedTab() {
  const { pets, entities, logs, loading, selectedDate } = useHousehold();
  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate);

  // Named for the browsed day, not literally today: this follows the shared
  // selectedDate, so picking an earlier day in the ribbon re-filters the photo
  // stream along with the summary counts.
  const logsForDate = useMemo(
    () => logs.filter((l) => formatDateLocal(new Date(l.completed_at)) === dateStr),
    [logs, dateStr]
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <p className="pt-8 text-center text-sm text-muted-foreground">
        No pets yet. Add a pet above to get started.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {/* First thing on the page: a pending proposal is the only item here
          that is blocking someone else's work, so it outranks the day's
          status summary. Renders nothing when the queue is empty. */}
      <ApprovalQueue />
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{label}&apos;s Overview</h2>
      <UnifiedSummaryCard />
      <InventoryAlertsPanel />
      <h3 className="mt-8 mb-3 text-sm font-semibold text-gray-900">Photos</h3>
      <PhotoStream logs={logsForDate} entities={entities} showAvatar />
      <div className="mt-8">
        <LowStockFlagButton />
      </div>
    </div>
  );
}
