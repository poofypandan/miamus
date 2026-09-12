"use client";

import { useMemo } from "react";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { buildAgenda, formatDateLocal, type AgendaItem } from "@/lib/scheduleEngine";

export default function DashboardHomePage() {
  const { entities, schedules, logs, loading } = useHousehold();
  const today = formatDateLocal(new Date());

  const groups = useMemo(
    () => buildAgenda({ date: today, entities, schedules, logs }),
    [today, entities, schedules, logs]
  );

  const itemsByEntity = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const group of groups) {
      for (const item of group.items) {
        const list = map.get(item.entityId) ?? [];
        list.push(item);
        map.set(item.entityId, list);
      }
    }
    return map;
  }, [groups]);

  const todaysLogs = useMemo(
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

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Today&apos;s Overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {entities.map((entity) => (
            <SummaryCard
              key={entity.id}
              dogName={entity.name}
              items={itemsByEntity.get(entity.id) ?? []}
            />
          ))}
        </div>
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
