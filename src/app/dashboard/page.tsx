"use client";

import { useMemo } from "react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";

export default function DashboardHomePage() {
  const { pets, entities, schedules, logs, activePetId, loading } = useHousehold();
  const today = formatDateLocal(new Date());
  const activePet = pets.find((p) => p.id === activePetId) ?? null;

  const items = useMemo(() => {
    if (!activePet) return [];
    const groups = buildAgenda({ date: today, entities: [activePet], schedules, logs });
    return groups.flatMap((g) => g.items);
  }, [today, activePet, schedules, logs]);

  const todaysLogs = useMemo(
    () =>
      activePet
        ? logs.filter(
            (l) =>
              l.entity_id === activePet.id && formatDateLocal(new Date(l.completed_at)) === today
          )
        : [],
    [logs, today, activePet]
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

  if (!activePet) {
    return (
      <p className="pt-8 text-center text-sm text-muted-foreground">
        {pets.length === 0
          ? "No pets yet. Add a pet above to get started."
          : "Select a pet above to view their daily feed."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Today&apos;s Overview
        </h2>
        <SummaryCard dogName={activePet.name} items={items} />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Today&apos;s Photos
        </h2>
        <PhotoStream logs={todaysLogs} entities={entities} />
      </section>
      <LowStockFlagButton />
    </div>
  );
}
