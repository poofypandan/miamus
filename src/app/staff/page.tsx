"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Stethoscope, UserRound } from "lucide-react";
import { DateRibbon } from "@/components/date-ribbon";
import { StaffLoginGate, useStaffIdentity } from "@/components/auth/staff-login-gate";
import { DischargeButton } from "@/components/dashboard/discharge-button";
import { PullToRefresh } from "@/components/shared/pull-to-refresh";
import { AgendaGroupCard } from "@/components/staff/agenda-group-card";
import { HouseholdTasksPanel } from "@/components/staff/household-tasks-panel";
import { StaffReportsPanel } from "@/components/staff/staff-reports-panel";
import { StockCheckPanel } from "@/components/staff/stock-check-panel";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { dueStockItems } from "@/lib/inventory";
import { isAdmitted } from "@/lib/pets";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";

export default function StaffPage() {
  return (
    <StaffLoginGate>
      {/* useSearchParams() needs a Suspense boundary to keep the page static;
          nothing here is worth a fallback while it resolves. */}
      <Suspense fallback={null}>
        <StaffTasks />
      </Suspense>
    </StaffLoginGate>
  );
}

// The two jobs on a staff member's phone, as ?view= values. Kept apart rather
// than stacked: with the stock checklist under the agenda, the day's pet tasks
// and a 29-item count competed for the same scroll.
//
// In the URL, like the owner's ?tab= and ?view=, so the pill and the screen
// read one value (CLAUDE.md, State Persistence). It also survives the page
// reload a low-memory phone can do on the way back from the camera, which is
// exactly when a staff member is mid-stock-check.
const VIEWS = ["tugas", "stok"] as const;
type StaffView = (typeof VIEWS)[number];

function StaffTasks() {
  const { inventoryItems, refresh } = useHousehold();
  const router = useRouter();
  const param = useSearchParams().get("view");
  const view: StaffView = VIEWS.includes(param as StaffView) ? (param as StaffView) : "tugas";

  // A .push(), so the phone's Back button returns to the other view, as it
  // does for the owner's pills.
  function setView(next: StaffView) {
    router.push(`/staff?view=${next}`, { scroll: false });
  }

  useOfflineSync();

  // Shown on the pill so a due count is visible from the task list, where
  // staff spend most of the day.
  const dueCount = useMemo(() => dueStockItems(inventoryItems).length, [inventoryItems]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-md flex-1 bg-slate-50 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      {/* Silent, because the pull's own spinner is the feedback — swapping the
          list for skeletons mid-gesture would be worse than no feedback. */}
      <PullToRefresh onRefresh={() => refresh({ silent: true })}>
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-semibold">
                {view === "tugas" ? "Tugas Hari Ini" : "Cek Stok"}
              </h1>
              <HeaderIdentity />
            </div>
            <SegmentedControl
              ariaLabel="Tampilan"
              segments={[
                { value: "tugas", label: "Tugas Hari Ini" },
                { value: "stok", label: "Cek Stok", badge: dueCount > 0 ? dueCount : undefined },
              ]}
              value={view}
              onChange={setView}
            />
          </header>

          {view === "tugas" ? <TasksView /> : <StockCheckPanel />}
        </div>
      </PullToRefresh>
    </div>
  );
}

function TasksView() {
  const { pets, schedules, logs, loading, selectedDate, setSelectedDate } = useHousehold();
  const dateStr = formatDateLocal(selectedDate);

  const admittedPets = useMemo(() => pets.filter(isAdmitted), [pets]);

  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  return (
    <>
      <DateRibbon value={selectedDate} onChange={setSelectedDate} />

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
    </>
  );
}

// Who the app thinks is holding the phone — a label, not a control. Each
// person works from their own device, so switching mid-shift is not a thing
// that happens, and a tappable badge only invited someone to sign themselves
// out by accident.
function HeaderIdentity() {
  const { userRole } = useHousehold();
  const { staffId } = useStaffIdentity();

  // The owner's way back out, shown only when both signals agree: the owner
  // role from HouseholdContext (set by the owner PIN) AND no staff profile
  // signed in on this phone. A staff member's device never renders it — even
  // one where owner mode was once unlocked — so nobody on shift is handed a
  // door to the dashboard. Rendered after StaffLoginGate, which only lets
  // anyone through once the role has been read back from storage, so there is
  // no flash of the button before the role is known.
  //
  // This hides a button; it is not access control. The dashboard's own
  // owner-only screens stay guarded by useRequireOwner.
  if (userRole === "owner" && !staffId) {
    return (
      <Button variant="outline" asChild className="min-h-[40px] shrink-0 bg-white">
        <Link href="/dashboard">← Owner Dashboard</Link>
      </Button>
    );
  }
  return <OnDutyBadge />;
}

function OnDutyBadge() {
  const { staffName } = useStaffIdentity();
  return (
    <span className="flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-500">
      <UserRound className="size-3.5" />
      {staffName ?? "Pemilik"}
    </span>
  );
}
