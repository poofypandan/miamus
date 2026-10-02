"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Stethoscope, UserRound } from "lucide-react";
import { DateRibbon } from "@/components/date-ribbon";
import { StaffLoginGate, useStaffIdentity } from "@/components/auth/staff-login-gate";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useToday } from "@/hooks/use-today";
import { occurrencesForStaff, type ChoreOccurrence } from "@/lib/chore-recurrence";
import { buildUnifiedAgenda } from "@/lib/unified-agenda";
import { DischargeButton } from "@/components/dashboard/discharge-button";
import { PullToRefresh } from "@/components/shared/pull-to-refresh";
import { AgendaGroupCard } from "@/components/staff/agenda-group-card";
import { ChoreCard } from "@/components/chores/chore-card";
import { FinishChoreSheet } from "@/components/chores/finish-chore-sheet";
import { StaffActionsFab } from "@/components/staff/staff-actions-fab";
import { StockCheckPanel } from "@/components/staff/stock-check-panel";
import { AppHeader, HeaderNavLink } from "@/components/navigation/app-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { useOfflineSync } from "@/hooks/use-offline-sync";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { dueStockItems } from "@/lib/inventory";
import { isAdmitted } from "@/lib/pets";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";

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

// Not a staff id, and it cannot collide with one: ids are uuids.
const ALL_ASSIGNEES = "all";

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

  // The same shell as dashboard/layout.tsx — column, shared AppHeader outside
  // the pull, content starting pt-3 below it — so switching between the two
  // views moves nothing but the words (Phase 84C). The bottom padding differs:
  // there is no tab bar here to clear, but Tugas has the FAB.
  return (
    <div
      className={cn(
        "mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50",
        // Tugas also has the "+ Lapor" FAB floating bottom-right (h-14 at
        // bottom-6): clear it so the last card can scroll out from under it.
        view === "tugas"
          ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
          : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      )}
    >
      <AppHeader action={<HeaderIdentity />}>
        <SegmentedControl
          ariaLabel="Tampilan"
          segments={[
            { value: "tugas", label: "Tugas Hari Ini" },
            { value: "stok", label: "Cek Stok", badge: dueCount > 0 ? dueCount : undefined },
          ]}
          value={view}
          onChange={setView}
        />
      </AppHeader>

      {/* Silent, because the pull's own spinner is the feedback — swapping the
          list for skeletons mid-gesture would be worse than no feedback. */}
      <PullToRefresh onRefresh={() => refresh({ silent: true })}>
        <div className="flex flex-col gap-4 px-4 pt-3">
          {view === "tugas" ? <TasksView /> : <StockCheckPanel />}
        </div>
      </PullToRefresh>

      {/* The reports that used to end the task feed live behind this FAB now.
          Outside PullToRefresh on purpose: its content wrapper carries a CSS
          transform, which would make a `position: fixed` child scroll with
          the page instead of floating over it. */}
      {view === "tugas" && <StaffActionsFab />}
    </div>
  );
}

function TasksView() {
  const { pets, schedules, logs, loading, selectedDate, setSelectedDate } = useHousehold();
  const { staffId } = useStaffIdentity();
  const dateStr = formatDateLocal(selectedDate);
  const today = useToday();

  const admittedPets = useMemo(() => pets.filter(isAdmitted), [pets]);

  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  // The house, alongside the dogs, in one list (Phase 100). Chores used to sit
  // in their own panel below the whole agenda, which made "what is left?" a
  // question of scrolling to the bottom and comparing two lists by eye.
  const allChores = useChoreOccurrences();

  // Who the chore list is narrowed to (Phase 101). ALL_ASSIGNEES shows the
  // whole board; a name shows that person's chores plus everything still
  // unclaimed, because a filter that hid unclaimed work would leave nobody
  // able to pick anything up.
  //
  // Defaults to this device's own staff member, which is exactly what the
  // feed showed before the filter existed — the pills add a way to look
  // wider, they do not change what you see on opening the app.
  // Null until the staff member picks one, rather than seeded from staffId:
  // useStaffIdentity hydrates from localStorage *after* mount, so a seeded
  // initial value would be captured as "all" and stay there. Derived instead,
  // so the default follows the identity the moment it arrives and is
  // overridden for good the first time anyone taps a pill.
  const [chosenAssignee, setChosenAssignee] = useState<string | null>(null);
  const assignee = chosenAssignee ?? staffId ?? ALL_ASSIGNEES;
  const chores = useMemo(
    () =>
      assignee === ALL_ASSIGNEES
        ? allChores
        : occurrencesForStaff(allChores, assignee),
    [allChores, assignee]
  );

  // Pet routines are never filtered: they belong to the household rather than
  // to a person, and whoever is holding a phone may have to feed a dog.
  const entries = useMemo(() => buildUnifiedAgenda({ groups, chores }), [groups, chores]);

  // Which chore the detail sheet is showing, held as a KEY rather than as the
  // occurrence itself. Occurrences are derived fresh whenever the chore rows
  // change, so a captured one goes stale the moment anything writes: claiming
  // a chore from inside the sheet updated the list underneath it while the
  // sheet still rendered the pre-claim snapshot, and so kept offering "Ambil
  // Tugas" for a chore the staff member had just taken. The key survives
  // materialising too — it is (template, day), not the row id.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Looked up in the unfiltered list on purpose: switching the filter while a
  // chore sheet is open should not yank it shut mid-upload.
  const openChore = useMemo(
    () => allChores.find((c) => c.key === openKey) ?? null,
    [allChores, openKey]
  );

  return (
    <>
      <DateRibbon value={selectedDate} onChange={setSelectedDate} />

      <AssigneeFilter value={assignee} onChange={setChosenAssignee} chores={allChores} />

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
        ) : entries.length === 0 ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            Tidak ada jadwal untuk tanggal ini.
          </p>
        ) : (
          entries.map((entry) =>
            entry.kind === "routine" ? (
              <AgendaGroupCard key={entry.key} group={entry.group} />
            ) : (
              <ChoreCard
                key={entry.key}
                occurrence={entry.occurrence}
                locale="id"
                today={today}
                onPress={() => setOpenKey(entry.occurrence.key)}
              />
            )
          )
        )}
      </main>

      {/* Read, claim, prove, close — and nothing else. There is no add, edit
          or delete anywhere in the staff view (Phase 100). */}
      <FinishChoreSheet
        occurrence={openChore}
        open={!!openChore}
        onOpenChange={(next) => !next && setOpenKey(null)}
      />
    </>
  );
}

/**
 * The chore filter: everyone, or one person (Phase 101).
 *
 * Staff-facing, so Bahasa Indonesia. The shared SegmentedControl rather than a
 * bespoke pill row, per CLAUDE.md — and in its scrollable mode, because the
 * roster is data: three names fit a phone, six would not.
 *
 * Only ever filters chores. It is deliberately not a people picker either:
 * tapping a name does not change who you are, only which chores you are
 * looking at, which is why it sits above the list rather than in the header
 * next to the on-duty badge.
 */
function AssigneeFilter({
  value,
  onChange,
  chores,
}: {
  value: string;
  onChange: (value: string) => void;
  chores: ChoreOccurrence[];
}) {
  const { profiles } = useStaffProfiles();

  const segments = useMemo(() => {
    const open = (predicate: (o: ChoreOccurrence) => boolean) =>
      chores.filter((o) => o.status !== "completed" && predicate(o)).length;
    return [
      { value: ALL_ASSIGNEES, label: "Semua", badge: open(() => true) || undefined },
      ...(profiles ?? []).map((p) => ({
        value: p.id,
        label: p.name,
        // Counts what tapping would show: their own, plus the unclaimed ones
        // anyone can take.
        badge: open((o) => !o.task.assigned_to || o.task.assigned_to === p.id) || undefined,
      })),
    ];
  }, [profiles, chores]);

  // One name and nothing to choose between is just clutter.
  if (segments.length < 2) return null;

  return (
    <SegmentedControl
      ariaLabel="Saring tugas"
      segments={segments}
      value={value}
      onChange={onChange}
      scrollable
    />
  );
}

// Who the app thinks is holding the phone — a label, not a control. Each
// person works from their own device, so switching mid-shift is not a thing
// that happens, and a tappable badge only invited someone to sign themselves
// out by accident.
function HeaderIdentity() {
  const { isHouseholdMember } = useHousehold();
  const { staffId } = useStaffIdentity();

  // The owner's way back out, shown only to a real household member: a row in
  // household_members, which only a Google account can have. A bound staff
  // device has an anonymous session and no membership, so it never renders
  // this. (Entering the owner PIN on a phone used to be enough to show it,
  // until Phase 91; the owner PIN itself is gone since Phase 108.) The staffId check stays for the
  // owner who also signed in as staff on their own phone.
  //
  // Still not access control: it hides a button. The dashboard itself is held
  // by the middleware, which sends anonymous sessions back to /staff.
  if (isHouseholdMember && !staffId) {
    return <HeaderNavLink href="/dashboard">← Owner Dashboard</HeaderNavLink>;
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
