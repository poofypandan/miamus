"use client";

import { useMemo } from "react";
import { DateRibbon } from "@/components/date-ribbon";
import { AgendaGroupCard } from "@/components/staff/agenda-group-card";
import { AdHocSheet } from "@/components/staff/adhoc-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";

export default function StaffPage() {
  const { pets, schedules, logs, loading, selectedDate, setSelectedDate } = useHousehold();
  const dateStr = formatDateLocal(selectedDate);

  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col gap-4 bg-slate-50 px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Tugas Hari Ini</h1>
        <DateRibbon value={selectedDate} onChange={setSelectedDate} />
      </header>

      <main className="flex flex-1 flex-col gap-3">
        {loading ? (
          <>
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </>
        ) : groups.length === 0 ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            Tidak ada jadwal untuk tanggal ini.
          </p>
        ) : (
          groups.map((group) => <AgendaGroupCard key={`${group.time}-${group.title}`} group={group} />)
        )}
      </main>

      <AdHocSheet />
    </div>
  );
}
