"use client";

import { useMemo } from "react";
import { Stethoscope, UserRound } from "lucide-react";
import { DateRibbon } from "@/components/date-ribbon";
import { StaffLoginGate, useStaffIdentity } from "@/components/auth/staff-login-gate";
import { DischargeButton } from "@/components/dashboard/discharge-button";
import { PullToRefresh } from "@/components/shared/pull-to-refresh";
import { AgendaGroupCard } from "@/components/staff/agenda-group-card";
import { HouseholdTasksPanel } from "@/components/staff/household-tasks-panel";
import { StaffReportsPanel } from "@/components/staff/staff-reports-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { isAdmitted } from "@/lib/pets";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";

export default function StaffPage() {
  return (
    <StaffLoginGate>
      <StaffTasks />
    </StaffLoginGate>
  );
}

function StaffTasks() {
  const { pets, schedules, logs, loading, selectedDate, setSelectedDate, refresh } = useHousehold();
  const dateStr = formatDateLocal(selectedDate);

  useOfflineSync();

  const admittedPets = useMemo(() => pets.filter(isAdmitted), [pets]);

  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  return (
    <div className="mx-auto min-h-screen w-full max-w-md flex-1 bg-slate-50 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      {/* Silent, because the pull's own spinner is the feedback — swapping the
          list for skeletons mid-gesture would be worse than no feedback. */}
      <PullToRefresh onRefresh={() => refresh({ silent: true })}>
        <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">Tugas Hari Ini</h1>
          <OnDutyBadge />
        </div>
        <DateRibbon value={selectedDate} onChange={setSelectedDate} />
      </header>

      {/* Whoever is holding this phone is the one who will fetch the dog, so
          the discharge lives here as well as on the owner's profile sheet.
          Staff-facing, so Bahasa Indonesia. */}
      {admittedPets.length > 0 && (
        <section className="flex flex-col gap-2">
          {admittedPets.map((pet) => (
            <div
              key={pet.id}
              className="flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3"
            >
              <p className="flex items-center gap-1.5 text-sm font-medium text-indigo-900">
                <Stethoscope className="size-4 shrink-0" /> {pet.name} sedang rawat inap
              </p>
              <p className="text-xs text-indigo-900/80">
                Jadwal makan dan pipisnya dijeda sampai dijemput.
              </p>
              <DischargeButton
                pet={pet}
                label="Jemput dari Klinik"
                successMessage={`${pet.name} sudah pulang — jadwal aktif lagi`}
                errorMessage="Gagal memperbarui status"
              />
            </div>
          ))}
        </section>
      )}

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

      <HouseholdTasksPanel />

      <StaffReportsPanel />
        </div>
      </PullToRefresh>
    </div>
  );
}

// Who the app thinks is holding the phone — a label, not a control. Each
// person works from their own device, so switching mid-shift is not a thing
// that happens, and a tappable badge only invited someone to sign themselves
// out by accident.
function OnDutyBadge() {
  const { staffName } = useStaffIdentity();
  return (
    <span className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-500">
      <UserRound className="size-3.5" />
      {staffName ?? "Pemilik"}
    </span>
  );
}
