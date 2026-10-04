"use client";

import { Suspense, useMemo, useState } from "react";
import { addDays } from "date-fns";
import { useSearchParams } from "next/navigation";
import { Hand, Stethoscope, UserRound } from "lucide-react";
import { DateRibbon } from "@/components/date-ribbon";
import { AgendaWeekGrid } from "@/components/agenda/agenda-week-grid";
import { OverdueSection } from "@/components/agenda/overdue-section";
import { TodayButton } from "@/components/agenda/today-button";
import { WeekPager } from "@/components/agenda/week-pager";
import { StaffLoginGate, useStaffIdentity } from "@/components/auth/staff-login-gate";
import { useAgendaRange } from "@/hooks/use-agenda-range";
import { useAgendaWeek } from "@/hooks/use-agenda-week";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useToday } from "@/hooks/use-today";
import { occurrencesForStaff } from "@/lib/chore-recurrence";
import {
  buildUnifiedAgenda,
  splitOverdue,
  weekStartOf,
  type UnifiedAgendaEntry,
} from "@/lib/unified-agenda";
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
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { dueStockItems } from "@/lib/inventory";
import { isAdmitted } from "@/lib/pets";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import { LaunchCover } from "@/components/brand/brand-cover";
import { TapHint } from "@/components/staff/tap-hint";
import { CompletedSection } from "@/components/agenda/completed-section";
import { isEntrySettled } from "@/lib/staff-agenda";
import { useHouseholdNameState } from "@/hooks/use-household-name";
import { PendingBar } from "@/components/shared/pending-bar";
import { useScrollTopOnChange, useTabNavigation } from "@/hooks/use-tab-navigation";
import { cn } from "@/lib/utils";

export default function StaffPage() {
  const { loading, tenantReady, roleHydrated } = useHousehold();
  const { ready: nameReady } = useHouseholdNameState();
  return (
    <>
      <StaffLoginGate>
        {/* useSearchParams() needs a Suspense boundary to keep the page static;
            nothing here is worth a fallback while it resolves. */}
        <Suspense fallback={null}>
          <StaffTasks />
        </Suspense>
      </StaffLoginGate>
      {/* The RUMAH cover over a cold start (Phase 123). Outside the gate, so
          it covers the gate's own first moments as well as the task list. */}
      <LaunchCover
        variant="staff"
        ready={tenantReady && roleHydrated && !loading && nameReady}
      />
    </>
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
  const param = useSearchParams().get("view");
  const view: StaffView = VIEWS.includes(param as StaffView) ? (param as StaffView) : "tugas";

  // The pill lights on the tap, the list follows when ready, the page
  // returns to the top in that same commit — useTabNavigation (Phase 125).
  const {
    active: activeView,
    navigate: setView,
    isPending,
  } = useTabNavigation<StaffView>(view, (next) => `/staff?view=${next}`);
  useScrollTopOnChange(view);


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
      <AppHeader
        action={
          <div className="flex min-w-0 items-center gap-1.5">
            {/* Back to today (Phase 115) — on the task list, which is the
                only view here with dates to get lost in. */}
            {view === "tugas" && <TodayButton locale="id" />}
            <HeaderIdentity />
          </div>
        }
      >
        <SegmentedControl
          ariaLabel="Tampilan"
          segments={[
            { value: "tugas", label: "Tugas Hari Ini" },
            { value: "stok", label: "Stok", badge: dueCount > 0 ? dueCount : undefined },
          ]}
          value={activeView}
          onChange={setView}
        />
      </AppHeader>

      {/* Silent, because the pull's own spinner is the feedback — swapping the
          list for skeletons mid-gesture would be worse than no feedback. */}
      <PullToRefresh onRefresh={() => refresh({ silent: true })}>
        <div className="flex flex-col gap-4 px-4 pt-3">
          {/* Never remounted, so a view that suspends on first read keeps the
              other one on screen until it is complete (Phase 125). */}
          <Suspense fallback={null}>
            {view === "tugas" ? <TasksView /> : <StockCheckPanel />}
          </Suspense>
        </div>
      </PullToRefresh>

      {/* The reports that used to end the task feed live behind this FAB now.
          Outside PullToRefresh on purpose: its content wrapper carries a CSS
          transform, which would make a `position: fixed` child scroll with
          the page instead of floating over it. */}
      {view === "tugas" && <StaffActionsFab />}

      {/* A slow Tugas ↔ Stok switch's only sign (Phase 125). */}
      <PendingBar active={isPending} />
    </div>
  );
}

function TasksView() {
  const {
    pets,
    schedules,
    logs,
    loading,
    selectedDate,
    setSelectedDate,
    isHouseholdMember,
    todayJumps,
  } = useHousehold();
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

  // A staff phone sees its own chores and the unclaimed ones — never a
  // chore assigned to somebody else (Phase 112). Phase 101 added a "Semua"
  // pill and one per colleague, which put everyone's assignments a tap away;
  // they are gone. Unclaimed chores stay, because a list that hid them would
  // leave nobody able to pick one up.
  //
  // What this is not: access control. A staff phone is bound to the
  // household, not to a person — the name on it is chosen on the device — so
  // the database cannot tell Ari's phone from Syam's, and the rows still
  // arrive. This keeps each person's list to their own work; it does not
  // stop a determined colleague reading the network traffic.
  //
  // Owners see everything (Phase 113). Decided by membership — a Google
  // account in household_members — not by "no staff name on this phone":
  // an owner who once picked a staff name on their own phone still had one
  // stored, and Phase 112's filter then hid every colleague's chore from them.
  // A staff phone has no membership, so it can never take this branch.
  const isolatedTo = isHouseholdMember ? null : staffId;
  const chores = useMemo(
    () => (isolatedTo ? occurrencesForStaff(allChores, isolatedTo) : allChores),
    [allChores, isolatedTo]
  );

  // Pet routines are never filtered: they belong to the household rather than
  // to a person, and whoever is holding a phone may have to feed a dog.
  const entries = useMemo(() => buildUnifiedAgenda({ groups, chores }), [groups, chores]);
  const { overdue, rest } = useMemo(() => splitOverdue(entries), [entries]);
  // What is left, and what is finished (Phase 131). Finished work folds into
  // the collapsed Selesai section at the bottom, so the list is only ever as
  // long as what remains. isEntrySettled, not isEntryDone: a vet visit that
  // is checked in but not closed is still today's business.
  const { open: openEntries, settled } = useMemo(() => {
    const admittedIds = new Set(admittedPets.map((p) => p.id));
    const open: UnifiedAgendaEntry[] = [];
    const settled: UnifiedAgendaEntry[] = [];
    for (const entry of rest) {
      (isEntrySettled(entry, { logs, admittedIds }) ? settled : open).push(entry);
    }
    return { open, settled };
  }, [rest, logs, admittedPets]);

  // Which chore the detail sheet is showing, held as a KEY rather than as the
  // occurrence itself. Occurrences are derived fresh whenever the chore rows
  // change, so a captured one goes stale the moment anything writes: claiming
  // a chore from inside the sheet updated the list underneath it while the
  // sheet still rendered the pre-claim snapshot, and so kept offering "Ambil
  // Tugas" for a chore the staff member had just taken. The key survives
  // materialising too — it is (template, day), not the row id.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openChore = useMemo(
    () => chores.find((c) => c.key === openKey) ?? null,
    [chores, openKey]
  );

  const [range, setRange] = useAgendaRange();
  const week = useAgendaWeek(selectedDate, isolatedTo);
  // Only ever needed for the owner browsing this view: a staff phone sees no
  // chore assigned to anyone but itself.
  const { profiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(profiles, "Petugas");

  // A week at a time, from the selected day (Phase 115).
  function shiftWeek(weeks: -1 | 1) {
    setSelectedDate(addDays(selectedDate, weeks * 7));
  }

  // `compact` inside Selesai: a finished chore loses its inline photo pair
  // and says "Lihat foto" instead (Phase 131); routines are compact already.
  function renderEntry(entry: UnifiedAgendaEntry, compact = false) {
    return entry.kind === "routine" ? (
      <AgendaGroupCard key={entry.key} group={entry.group} />
    ) : (
      <ChoreCard
        key={entry.key}
        occurrence={entry.occurrence}
        // Someone else's name only when it is someone else's chore — which a
        // staff phone never sees, but an owner here does. Left out, the card
        // says "Untuk Kamu".
        assigneeName={
          entry.occurrence.task.assigned_to && entry.occurrence.task.assigned_to !== isolatedTo
            ? staffName(entry.occurrence.task.assigned_to)
            : undefined
        }
        locale="id"
        today={today}
        onPress={() => setOpenKey(entry.occurrence.key)}
        compact={compact}
        // What the tap leads to (Phase 130): an unclaimed chore is claimed
        // before anything is photographed.
        action={
          entry.occurrence.task.assigned_to ? (
            <TapHint urgent={entry.occurrence.overdue} />
          ) : (
            <TapHint label="Ketuk untuk ambil" icon={Hand} urgent={entry.occurrence.overdue} />
          )
        }
      />
    );
  }

  return (
    <>
      {/* Hari | Minggu (Phase 112), the same toggle as the owner's Agenda. */}
      <SegmentedControl
        ariaLabel="Rentang jadwal"
        segments={[
          { value: "day", label: "Hari" },
          { value: "week", label: "Minggu" },
        ]}
        value={range}
        onChange={setRange}
      />

      {/* Fades in afresh on Hari ⇄ Minggu and on Hari ini (Phase 115), the
          same as the owner's Agenda. */}
      <div
        key={`${range}|${todayJumps}`}
        className="flex flex-1 animate-view-fade flex-col gap-4 motion-reduce:animate-none"
      >
        {/* Hari only: in Minggu the grid's own headers are the days. */}
        {range === "day" && <DateRibbon value={selectedDate} onChange={setSelectedDate} />}

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
          {range === "week" && !loading ? (
            <>
              <WeekPager date={selectedDate} locale="id" onShift={shiftWeek} />
              <div
                key={formatDateLocal(weekStartOf(selectedDate))}
                className="animate-view-fade motion-reduce:animate-none"
              >
                <AgendaWeekGrid
                  days={week}
                  locale="id"
                  onOpenDay={(day) => {
                    setSelectedDate(day);
                    setRange("day");
                  }}
                  onShiftWeek={shiftWeek}
                />
              </div>
            </>
          ) : loading ? (
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
            <>
              {/* Undone chores from earlier days lead today (Phase 113). */}
              {overdue.length > 0 && (
                <OverdueSection count={overdue.length} locale="id">
                  {overdue.map((entry) => renderEntry(entry))}
                </OverdueSection>
              )}
              {openEntries.map((entry) => renderEntry(entry))}
              {/* Said plainly when the open list is empty, rather than leaving
                  a lone collapsed section to imply it. */}
              {overdue.length === 0 && openEntries.length === 0 && settled.length > 0 && (
                <p className="py-4 text-center text-sm font-medium text-emerald-700">
                  Semua tugas hari ini sudah selesai 🎉
                </p>
              )}
              {settled.length > 0 && (
                <CompletedSection count={settled.length} locale="id">
                  {settled.map((entry) => renderEntry(entry, true))}
                </CompletedSection>
              )}
            </>
          )}
        </main>
      </div>

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
    return <HeaderNavLink href="/dashboard" switchTo="owner">
        ← Owner Dashboard
      </HeaderNavLink>;
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
