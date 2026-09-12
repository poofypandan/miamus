"use client";

import { useMemo } from "react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { UnifiedSummaryCard } from "@/components/dashboard/unified-summary-card";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import type { TaskEntity, MasterSchedule, TaskLog } from "@/types/database";

export default function DashboardHomePage() {
  const { pets, entities, schedules, logs, activePetId, viewMode, loading } = useHousehold();
  const activePet = pets.find((p) => p.id === activePetId) ?? null;
  const today = formatDateLocal(new Date());

  const allTodaysLogs = useMemo(
    () => logs.filter((l) => formatDateLocal(new Date(l.completed_at)) === today),
    [logs, today]
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

  if (viewMode === "all") {
    return (
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Today&apos;s Overview
          </h2>
          <UnifiedSummaryCard />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Today&apos;s Photos
          </h2>
          <PhotoStream logs={allTodaysLogs} entities={entities} showAvatar />
        </section>
        <LowStockFlagButton />
      </div>
    );
  }

  if (!activePet) {
    return (
      <p className="pt-8 text-center text-sm text-muted-foreground">
        Select a pet above to view their daily feed.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PetDailyFeed pet={activePet} entities={entities} schedules={schedules} logs={logs} />
      <LowStockFlagButton />
    </div>
  );
}

function PetDailyFeed({
  pet,
  entities,
  schedules,
  logs,
}: {
  pet: TaskEntity;
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
}) {
  const today = formatDateLocal(new Date());

  const items = useMemo(() => {
    const groups = buildAgenda({ date: today, entities: [pet], schedules, logs });
    return groups.flatMap((g) => g.items);
  }, [today, pet, schedules, logs]);

  const todaysLogs = useMemo(
    () =>
      logs.filter(
        (l) => l.entity_id === pet.id && formatDateLocal(new Date(l.completed_at)) === today
      ),
    [logs, today, pet]
  );

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Today&apos;s Overview
        </h2>
        <SummaryCard dogName={pet.name} items={items} />
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Today&apos;s Photos
        </h2>
        <PhotoStream logs={todaysLogs} entities={entities} />
      </section>
    </div>
  );
}
