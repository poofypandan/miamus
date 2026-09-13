"use client";

import { useMemo } from "react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { UnifiedSummaryCard } from "@/components/dashboard/unified-summary-card";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { PetDetailHeader } from "@/components/dashboard/pet-detail-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import type { TaskEntity, MasterSchedule, TaskLog } from "@/types/database";

export default function DashboardHomePage() {
  const { pets, entities, schedules, logs, activePetId, loading, selectedDate } = useHousehold();
  const activePet = pets.find((p) => p.id === activePetId) ?? null;
  const dateStr = formatDateLocal(selectedDate);

  const allTodaysLogs = useMemo(
    () => logs.filter((l) => formatDateLocal(new Date(l.completed_at)) === dateStr),
    [logs, dateStr]
  );

  if (loading) {
    return (
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <p className="mt-6 pt-8 text-center text-sm text-muted-foreground">
        No pets yet. Add a pet above to get started.
      </p>
    );
  }

  if (!activePet) {
    return (
      <div className="mt-6 flex flex-col">
        <UnifiedSummaryCard />
        <h3 className="mt-8 mb-3 text-sm font-medium text-gray-500">Photos</h3>
        <PhotoStream logs={allTodaysLogs} entities={entities} showAvatar />
        <div className="mt-8">
          <LowStockFlagButton />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <PetDetailHeader pet={activePet} />
      <PetDailyFeed
        pet={activePet}
        entities={entities}
        schedules={schedules}
        logs={logs}
        date={selectedDate}
      />
      <LowStockFlagButton />
    </div>
  );
}

function PetDailyFeed({
  pet,
  entities,
  schedules,
  logs,
  date,
}: {
  pet: TaskEntity;
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  date: Date;
}) {
  const dateStr = formatDateLocal(date);

  const items = useMemo(() => {
    const groups = buildAgenda({ date: dateStr, entities: [pet], schedules, logs });
    return groups.flatMap((g) => g.items);
  }, [dateStr, pet, schedules, logs]);

  const todaysLogs = useMemo(
    () =>
      logs.filter(
        (l) => l.entity_id === pet.id && formatDateLocal(new Date(l.completed_at)) === dateStr
      ),
    [logs, dateStr, pet]
  );

  return (
    <div className="flex flex-col">
      <SummaryCard dogName={pet.name} items={items} />
      <h3 className="mt-8 mb-3 text-sm font-medium text-gray-500">Photos</h3>
      <PhotoStream logs={todaysLogs} entities={entities} />
    </div>
  );
}
