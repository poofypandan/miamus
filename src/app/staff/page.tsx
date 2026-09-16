"use client";

import { useMemo } from "react";
import { UserRound } from "lucide-react";
import { DateRibbon } from "@/components/date-ribbon";
import { StaffLoginGate, useStaffIdentity } from "@/components/auth/staff-login-gate";
import { AgendaGroupCard } from "@/components/staff/agenda-group-card";
import { StaffReportsPanel } from "@/components/staff/staff-reports-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";

export default function StaffPage() {
  return (
    <StaffLoginGate>
      <StaffTasks />
    </StaffLoginGate>
  );
}

function StaffTasks() {
  const { pets, schedules, logs, loading, selectedDate, setSelectedDate } = useHousehold();
  const dateStr = formatDateLocal(selectedDate);

  useOfflineSync();

  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col gap-4 bg-slate-50 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Tugas Hari Ini</h1>
          <OnDutyBadge />
        </div>
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

      <StaffReportsPanel />
    </div>
  );
}

// Who the app thinks is holding the phone, and the way to hand it over. Quiet
// on purpose: it is a label most of the day, and only becomes a control at
// shift change.
function OnDutyBadge() {
  const { staffName, requestSwitch } = useStaffIdentity();
  return (
    <button
      type="button"
      onClick={requestSwitch}
      className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-500 active:bg-gray-50"
    >
      <UserRound className="size-3.5" />
      {staffName ?? "Pemilik"}
      <span className="text-gray-400">· Ganti</span>
    </button>
  );
}
