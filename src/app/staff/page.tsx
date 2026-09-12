"use client";

import { useMemo, useState } from "react";
import { DateStrip } from "@/components/staff/date-strip";
import { AgendaGroupCard } from "@/components/staff/agenda-group-card";
import { AdHocSheet } from "@/components/staff/adhoc-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";

export default function StaffPage() {
  const { entities, schedules, logs, loading } = useHousehold();
  const [selectedDate, setSelectedDate] = useState(() => formatDateLocal(new Date()));

  const groups = useMemo(
    () => buildAgenda({ date: selectedDate, entities, schedules, logs }),
    [selectedDate, entities, schedules, logs]
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 pb-28">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Tugas Hari Ini</h1>
        <DateStrip value={selectedDate} onChange={setSelectedDate} />
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
