"use client";

import { useMemo, useState } from "react";
import { DateRibbon } from "@/components/date-ribbon";
import { AgendaGroupCard } from "@/components/staff/agenda-group-card";
import { StaffReportsPanel } from "@/components/staff/staff-reports-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { ViewModeToggle } from "@/components/view-mode-toggle";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { buildRollingAgenda, formatDayHeader, type ViewMode } from "@/lib/week-agenda";

export default function StaffPage() {
  const { pets, schedules, logs, loading, selectedDate, setSelectedDate } = useHousehold();
  const [viewMode, setViewMode] = useState<ViewMode>("day");

  useOfflineSync();

  const days = useMemo(
    () =>
      buildRollingAgenda({ start: selectedDate, mode: viewMode, entities: pets, schedules, logs }),
    [selectedDate, viewMode, pets, schedules, logs]
  );

  const isEmpty = days.every((d) => d.groups.length === 0);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col gap-4 bg-slate-50 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">
            {viewMode === "week" ? "Tugas Minggu Ini" : "Tugas Hari Ini"}
          </h1>
          <ViewModeToggle value={viewMode} onChange={setViewMode} locale="id" />
        </div>
        {/* Ribbon stays put in both modes — in week mode the day it selects is
            the first of the seven, not a filter. */}
        <DateRibbon value={selectedDate} onChange={setSelectedDate} />
      </header>

      <main className="flex flex-1 flex-col gap-3">
        {loading ? (
          <>
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </>
        ) : isEmpty ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            {viewMode === "week"
              ? "Tidak ada jadwal minggu ini."
              : "Tidak ada jadwal untuk tanggal ini."}
          </p>
        ) : viewMode === "day" ? (
          days[0].groups.map((group) => (
            <AgendaGroupCard key={`${group.time}-${group.title}`} group={group} />
          ))
        ) : (
          days.map((day) => (
            <section key={day.date} className="flex flex-col gap-3">
              {/* Sticky so the day being read stays labelled while its cards
                  scroll past. -mx-4/px-4 lets the bar span the page gutter. */}
              <h2 className="sticky top-0 z-20 -mx-4 border-b bg-slate-50/95 px-4 py-2 text-sm font-semibold text-gray-900 backdrop-blur">
                {formatDayHeader(day.dateObj, "id")}
              </h2>
              {day.groups.map((group) => (
                <AgendaGroupCard key={`${day.date}-${group.time}-${group.title}`} group={group} />
              ))}
            </section>
          ))
        )}
      </main>

      <StaffReportsPanel />
    </div>
  );
}
