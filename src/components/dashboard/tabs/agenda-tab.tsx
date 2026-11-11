"use client";

import { startTransition, useMemo, useState } from "react";
import { addDays } from "date-fns";
import Link from "next/link";
import { Bell, CalendarDays, ChevronRight, CookingPot, Moon, PawPrint, Plus, ShoppingBasket, Smartphone, Sparkles, Wrench } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FilterPill } from "@/components/shared/filter-pill";
import { OverdueSection } from "@/components/agenda/overdue-section";
import { MyTasksCard } from "@/components/agenda/my-tasks-card";
import { FirstRunCard } from "@/components/agenda/first-run-card";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { OwnerFinishSheet } from "@/components/chores/owner-finish-sheet";
import { WeekPager } from "@/components/agenda/week-pager";
import { WeekSummaryView } from "@/components/agenda/week-summary-view";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { MedicationCourseAlerts } from "@/components/dashboard/medication-course-alerts";
import { PetsQuestionCard } from "@/components/dashboard/pets-question-card";
import { ChoreTimelineRow } from "@/components/dashboard/chore-timeline-row";
import { StaffProgressCard } from "@/components/dashboard/staff-progress-card";
import { StaffWorkloadSheet } from "@/components/dashboard/staff-workload-sheet";
import { useStaffProgress } from "@/hooks/use-staff-progress";
import { TimelineRow } from "@/components/dashboard/timeline-row";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useAgendaRange } from "@/hooks/use-agenda-range";
import { applyAgendaFilter, useAgendaFilter, type AgendaFilter } from "@/hooks/use-agenda-filter";
import { useAgendaWeek } from "@/hooks/use-agenda-week";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useFinishMyChore } from "@/hooks/use-finish-my-chore";
import { useFirstRun } from "@/hooks/use-first-run";
import { coverTakeover, myOccurrences, myTasksMode, type ChoreOccurrence } from "@/lib/chore-recurrence";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useLocationName } from "@/hooks/use-household-locations";
import { useToday } from "@/hooks/use-today";
import { useRepairs } from "@/hooks/use-repairs";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useStaffClaimsToday } from "@/hooks/use-staff-claims-today";
import { useSetUpChores, useWrittenOccurrences } from "@/hooks/use-set-up-chores";
import { useBillPayments } from "@/hooks/use-bill-payments";
import { isBill, lastAmount, lastTimeLine, paidLine, paymentFor } from "@/lib/bill-payments";
import { comingUpLabel, comingUpReminders } from "@/lib/chore-reminders";
import { repairsToday, repairsTodayLabel } from "@/lib/repairs";
import {
  isForgotten,
  openWalkIns,
  ownerSupervisingLine,
  supervisionExplains,
  supervisionStretches,
  walkInTodayLine,
} from "@/lib/repair-walkins";
import { leaveCovering } from "@/lib/leave";
import { slotOf } from "@/lib/couldnt-do";
import { HardHat, UtensilsCrossed } from "lucide-react";
import { useMenuWeek } from "@/hooks/use-menu";
import { todayMenuLine } from "@/lib/menu";
import { APP_NAME, useHouseholdName } from "@/hooks/use-household-name";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { dayLabel } from "@/lib/date-label";
import { moduleHref } from "@/lib/dashboard-modules";
import { isLowStock } from "@/lib/inventory";
import { countEatSoon, countNeedsDate, eatSoonLabel, needsDateLabel } from "@/lib/food";
import { isActiveAlert } from "@/lib/inventory-status";
import { isPlainClick, pushInPlace } from "@/lib/in-place-navigation";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import {
  buildUnifiedAgenda,
  splitOverdue,
  weekStartOf,
  type UnifiedAgendaEntry,
} from "@/lib/unified-agenda";
import type { HouseholdTask } from "@/types/database";
import { EveningSummarySheet } from "@/components/agenda/evening-summary-sheet";
import { OwnerCouldntSheet } from "@/components/agenda/owner-couldnt-sheet";
import { useTaskExceptions } from "@/hooks/use-task-exceptions";
import { useNotificationPrefs } from "@/hooks/use-notification-prefs";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { isAdmitted } from "@/lib/pets";
import { replaceInPlace } from "@/lib/in-place-navigation";
import {
  DEFAULT_SUMMARY_HOUR,
  buildEveningSummary,
  choreException,
  ownerCouldntRowLine,
  summaryHref,
  summaryOpenCount,
} from "@/lib/couldnt-do";

/**
 * The Agenda: everything this household owes on one day, dogs and house
 * together, in the order it happens (Phase 100).
 *
 * This is the screen the app is opened for, which is why it is the middle tab.
 * Before this phase the same information lived on two screens a level apart —
 * Pets > Daily Feed and Household > Chores — and no screen showed both, so
 * "what is left today?" was a question the app could not answer.
 *
 * Text-forward on purpose (Phase 102). It briefly also carried the pet
 * progress card and the day's photo grid, which pushed the actual timeline —
 * the thing this tab exists for — below two screens of pictures. Those are
 * about the dogs rather than about the day, and they live on the Pets tab.
 *
 * Owner-facing, in the language the owner chose (Phase 149). The
 * household's rows are tappable only as far as reading and editing goes;
 * since Phase 163 an admin's OWN chores sit apart, in "My tasks" above the
 * list, where they can be finished without switching to the staff view.
 */
export function AgendaTab() {
  const {
    pets,
    schedules,
    logs,
    householdTasks,
    loading,
    selectedDate,
    setSelectedDate,
    todayJumps,
    inventoryItems,
    foodItems,
    inventoryAlerts,
    memberProfile,
    pendingIds,
    leaveRequests,
  } = useHousehold();
  const householdName = useHouseholdName();
  // "Who lives here?" (Phase 162): with pets off, Today says nothing about
  // pets (no Add Pet, no All | Pets | Chores pills).
  const { petsOn } = useHouseholdProfile();
  const locale = useOwnerLocale();
  const t = useT();
  // Nothing anywhere yet, not just nothing today: the first screen after
  // onboarding, which greets rather than reports (Phase 120).
  const brandNew = pets.length === 0 && householdTasks.length === 0;
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const roomName = useLocationName();
  const allChores = useChoreOccurrences();
  // Couldn't-do records (Phase 165), for the rows and the evening summary.
  const { exceptions } = useTaskExceptions();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate, today, locale);

  // My tasks (Phase 163): this admin's own chores on the day, lifted out of
  // the household's list so none shows twice (D1 A). Without a roster row
  // (still loading, or none) the card is empty and the list is as before.
  const mine = useMemo(() => myOccurrences(allChores, memberProfile?.id), [allChores, memberProfile?.id]);
  // Bills among mine (Phase 164 PR B): their payments, owners only, read
  // only when there is one.
  const { payments: billPayments } = useBillPayments(mine.some((o) => isBill(o.task)));
  const chores = useMemo(() => {
    if (mine.length === 0) return allChores;
    const keys = new Set(mine.map((o) => o.key));
    return allChores.filter((o) => !keys.has(o.key));
  }, [allChores, mine]);
  const myMode = myTasksMode(dateStr, formatDateLocal(today));
  const hasOwnChores = useMemo(
    () => !!memberProfile && householdTasks.some((task) => task.assigned_to === memberProfile.id),
    [householdTasks, memberProfile]
  );
  const { finish } = useFinishMyChore();
  // Held as a key, as the staff list does: occurrences are rebuilt on every
  // write, so a captured one would go stale the moment the chore is saved.
  const [myOpenKey, setMyOpenKey] = useState<string | null>(null);
  const myOpen = useMemo(() => mine.find((o) => o.key === myOpenKey) ?? null, [mine, myOpenKey]);

  const [range, setRange] = useAgendaRange();
  const week = useAgendaWeek(selectedDate);

  const [editing, setEditing] = useState<HouseholdTask | null>(null);
  // The day the editor was opened from (Phase 128): what "skip this day" and
  // "end the repeat here" act on. Null when adding.
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // What a new chore starts with: the first-run checklist's "Add a task"
  // fills in the staff member (audit B1). Null from every other Add.
  const [editorPreset, setEditorPreset] = useState<{ assigneeId: string | null } | null>(null);
  function addChore(preset: { assigneeId: string | null } | null = null) {
    setEditing(null);
    setEditingDate(null);
    setEditorPreset(preset);
    setEditorOpen(true);
  }

  // "Set up your home" (audit B1, item 3): until the first task is finished.
  // Reads only on the Day view, where the card lives.
  const firstRun = useFirstRun(range === "day");
  // The Week view's every-day matrix (Phase 143). Held here rather than in the
  // view, which remounts on every page-turn: paging back through weeks to
  // check whether evening doses were missed should not fold it up each time.
  const [rhythmOpen, setRhythmOpen] = useState(false);

  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  // Staff progress (owners, 11 Nov): one row per person, house and pets,
  // in place of the Chores tab's chores-only strip. Only in a home with
  // staff: an owner on their own has nobody to follow.
  const progress = useStaffProgress({ petsOn, locale });
  const hasStaff = useMemo(() => (allProfiles ?? []).some((p) => !p.user_id && !p.archived_at), [allProfiles]);

  // All | Pets | Chores (Phase 132): narrows what is drawn, never what is
  // loaded. `allEntries` still decides the welcome screen, so filtering a
  // brand-new household to Pets does not greet it twice.
  const [chosenFilter, setFilter] = useAgendaFilter();
  // A ?show=pets left in the URL can't hide everything once pets are off.
  const filter: AgendaFilter = petsOn ? chosenFilter : "all";
  const allEntries = useMemo(
    () => buildUnifiedAgenda({ groups, chores }),
    [groups, chores]
  );
  const entries = useMemo(() => applyAgendaFilter(allEntries, filter), [allEntries, filter]);
  const { overdue, rest } = useMemo(() => splitOverdue(entries), [entries]);

  // Things to buy (Phase 154): one quiet line here instead of a banner on
  // every tab. Items marked running low or out, plus the staff's notes.
  const toBuy = useMemo(
    () => inventoryItems.filter(isLowStock).length + inventoryAlerts.filter(isActiveAlert).length,
    [inventoryItems, inventoryAlerts]
  );

  // Food to eat soon (Phase 156): the same kind of quiet line, above it.
  // Food at home and Repairs switched off (Phase 171): their lines go.
  const { food: foodOn, repairs: repairsOn, kitchen: kitchenOn } = useHouseholdFeatures();
  const eatSoon = useMemo(
    () => (foodOn ? countEatSoon(foodItems, formatDateLocal(today)) : 0),
    [foodItems, today, foodOn]
  );
  // Staff answered "don't know" for a date: waiting for an owner (amber).
  const needsDate = useMemo(() => (foodOn ? countNeedsDate(foodItems) : 0), [foodItems, foodOn]);

  // Repairs (Phase 159): staff reports to review, and work done to check.
  // Normal staff reports land here rather than as a push (D6).
  // Staff in one go (Phase 172 PR A2): whose phone was linked today.
  const { linked: linkedToday, undo: undoClaim } = useStaffClaimsToday();
  const { reload: reloadRoster } = useStaffProfiles();
  // Two taps: the first asks, the second undoes (code review, PR #90): an
  // undo signs a phone out and clears a PIN, so a brushed link mustn't.
  const [confirmingUndo, setConfirmingUndo] = useState<string | null>(null);
  async function notThem(staffId: string, name: string) {
    if (confirmingUndo !== staffId) {
      setConfirmingUndo(staffId);
      window.setTimeout(() => setConfirmingUndo((current) => (current === staffId ? null : current)), 5000);
      return;
    }
    setConfirmingUndo(null);
    const ok = await undoClaim(staffId);
    // The roster (Household → Staff) shows the name without a PIN again.
    if (ok) reloadRoster();
    if (ok) {
      toast.success(
        t(
          `${name}'s phone is removed. ${name} can pick the name again from the link.`,
          `HP ${name} dihapus. ${name} bisa memilih namanya lagi lewat link.`
        )
      );
    } else {
      toast.error(t("Couldn't undo. Try again.", "Gagal dibatalkan. Coba lagi."));
    }
  }
  const { repairs, visits, walkIns, supervision } = useRepairs();
  const repairLines = useMemo(
    () => (repairsOn ? repairsToday(repairs, visits, walkIns) : { toReview: 0, toCheck: 0 }),
    [repairs, visits, walkIns, repairsOn]
  );
  // Someone working in the house now (Phase 174): "Pak Budi is here · Leaking tap, LT2".
  // Only those who came today: a walk-in nobody closed since an earlier day
  // isn't "here" (it never closes itself, D6; Repairs lists it).
  const hereNow = useMemo(
    () => (repairsOn ? openWalkIns(walkIns).filter((v) => !isForgotten(v, formatDateLocal(today))) : []),
    [walkIns, repairsOn, today]
  );
  // Supervising stretches (D10): a missed task due inside one says so on its row.
  const stretches = useMemo(
    () => (repairsOn ? supervisionStretches(supervision, walkIns, repairs) : []),
    [repairsOn, supervision, walkIns, repairs]
  );
  const onDuty = useMemo(
    () =>
      (allProfiles ?? [])
        .filter((p) => !p.user_id && !p.archived_at && !leaveCovering(leaveRequests, p.id, dateStr))
        .map((p) => p.id),
    [allProfiles, leaveRequests, dateStr]
  );
  const repairsHref = `${moduleHref("chores")}&chores=repairs`;
  function switchToRepairs(event: React.MouseEvent) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    startTransition(() => pushInPlace(repairsHref));
  }

  // Bills and upkeep coming up (Phase 164, D3): chores with a reminder whose
  // day is inside its window, for this owner. The same thing the 07:00 push
  // says, so it works with notifications off. Read from every set-up chore,
  // not just the week on screen: a yearly bill can be a week out.
  const todayKey = formatDateLocal(today);
  const { rows: setUpRows } = useSetUpChores(todayKey);
  // The days ahead already written (finished early, skipped, given to
  // someone else), up to the longest reminder: past the week the cache holds.
  const horizonKey = formatDateLocal(addDays(today, 7));
  const writtenAhead = useWrittenOccurrences(todayKey, horizonKey);
  const ownerRows = useMemo(
    () => new Set((allProfiles ?? []).filter((p) => !!p.user_id).map((p) => p.id)),
    [allProfiles]
  );
  const comingUp = useMemo(
    () =>
      comingUpReminders({
        // The cache's copy of a row wins over the separate read's.
        rows: [
          ...new Map(
            [...writtenAhead, ...(setUpRows ?? householdTasks)].map((row) => [row.id, row] as const)
          ).values(),
        ],
        today: todayKey,
        memberId: memberProfile?.id ?? null,
        ownerRows,
        leaves: leaveRequests,
      }),
    [writtenAhead, setUpRows, householdTasks, todayKey, memberProfile?.id, ownerRows, leaveRequests]
  );
  function showComingUp() {
    if (comingUp.length === 0) return;
    setRange("day");
    setSelectedDate(new Date(`${comingUp[0].date}T00:00:00`));
  }

  // The Kitchen tab opens on Food; the shopping line goes straight to Shopping.
  const toBuyHref = `${moduleHref("inventory")}&kitchen=buy`;
  function switchToShopping(event: React.MouseEvent) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    startTransition(() => pushInPlace(toBuyHref));
  }

  // The evening summary (Phase 165): open while ?summary=<day> is in the URL
  // (the push links there), so Back and a reload agree with the screen.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const summaryDate = searchParams.get("summary");
  const summaryOpen = summaryDate && /^\d{4}-\d{2}-\d{2}$/.test(summaryDate) ? summaryDate : null;
  function openSummary() {
    startTransition(() => pushInPlace(summaryHref(todayKey)));
  }
  function closeSummary() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("summary");
    const query = params.toString();
    replaceInPlace(query ? `${pathname}?${query}` : pathname);
  }
  // Today's quiet line, from this admin's summary hour (19.00 when off).
  const { prefs } = useNotificationPrefs();
  const summaryHour = prefs.evening_summary_hour ?? DEFAULT_SUMMARY_HOUR;
  const showsToday = range === "day" && dateStr === todayKey;
  // Ticks each minute, so the line appears when the hour comes.
  const clock = useMinuteClock(showsToday);
  const notDoneCount = useMemo(() => {
    if (!showsToday) return 0;
    const now = new Date(clock);
    if (now.getHours() < summaryHour) return 0;
    return summaryOpenCount(
      buildEveningSummary({
        date: todayKey,
        chores: allChores,
        groups,
        exceptions,
        leaves: leaveRequests,
        proposals: [],
        admittedIds: new Set(pets.filter(isAdmitted).map((p) => p.id)),
        untilMinutes: now.getHours() * 60 + now.getMinutes(),
        logs,
      })
    );
  }, [showsToday, clock, summaryHour, todayKey, allChores, groups, exceptions, leaveRequests, pets, logs]);

  // Today's menu (Phase 170 PR C, D9): one quiet line while the Kitchen
  // switch is on and today has a plan.
  const { dishes: menuDishes } = useMenuWeek(todayKey, { enabled: kitchenOn });
  const menuLine = kitchenOn && showsToday ? todayMenuLine(menuDishes, todayKey, locale) : null;
  const menuHref = `${moduleHref("inventory")}&kitchen=menu`;
  function switchToMenu(event: React.MouseEvent) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    startTransition(() => pushInPlace(menuHref));
  }

  function switchToFood(event: React.MouseEvent) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    startTransition(() => pushInPlace(moduleHref("inventory")));
  }

  // Same page, so in place — and in a transition like the tab bar's, so
  // Agenda stays up until Pets is ready to replace it (Phase 125).
  function switchToPets(event: React.MouseEvent) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    startTransition(() => pushInPlace(moduleHref("pets")));
  }

  // A week at a time from whichever day is selected, so Day view lands on
  // the same weekday of the new week.
  function shiftWeek(weeks: -1 | 1) {
    setSelectedDate(addDays(selectedDate, weeks * 7));
  }

  // Couldn't-do records (Phase 165): amber rows, and the owner's sheet for one.
  const [couldntChore, setCouldntChore] = useState<ChoreOccurrence | null>(null);
  function couldntLineFor(occurrence: ChoreOccurrence): string | null {
    const exception = choreException(exceptions, occurrence);
    return exception
      ? ownerCouldntRowLine(exception, locale, exception.staff_id ? staffName(exception.staff_id) : null)
      : null;
  }
  function supervisingLineFor(occurrence: ChoreOccurrence): string | null {
    if (stretches.length === 0 || occurrence.status !== "pending" || choreException(exceptions, occurrence)) return null;
    const stretch = supervisionExplains(
      { staffId: occurrence.task.assigned_to ?? null, date: occurrence.date, time: slotOf(occurrence.task.due_time) },
      stretches,
      onDuty
    );
    return stretch ? ownerSupervisingLine(stretch, stretch.staffId ? staffName(stretch.staffId) : null, locale) : null;
  }
  function openEditorFor(occurrence: ChoreOccurrence) {
    // The template, not the occurrence: editing a repeat from any of its
    // days edits the repeat. A materialised occurrence has its own row
    // and edits that.
    setEditing(occurrence.row ?? occurrence.template);
    setEditingDate(occurrence.date);
    setEditorPreset(null);
    setEditorOpen(true);
  }
  function openChore(occurrence: ChoreOccurrence) {
    if (choreException(exceptions, occurrence)) setCouldntChore(occurrence);
    else openEditorFor(occurrence);
  }

  function renderEntry(entry: UnifiedAgendaEntry) {
    return entry.kind === "routine" ? (
      <TimelineRow key={entry.key} group={entry.group} pets={pets} />
    ) : (
      <ChoreTimelineRow
        key={entry.key}
        occurrence={entry.occurrence}
        locationName={roomName(entry.occurrence.task.location_id, entry.occurrence.task.spot)}
        assigneeName={
          entry.occurrence.task.assigned_to ? staffName(entry.occurrence.task.assigned_to) : null
        }
        completedByName={
          entry.occurrence.task.completed_by ? staffName(entry.occurrence.task.completed_by) : null
        }
        couldnt={couldntLineFor(entry.occurrence)}
        supervising={supervisingLineFor(entry.occurrence)}
        onPress={() => openChore(entry.occurrence)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      {/* Day | Week (Phase 112): which view. What the view shows is the
          filter row further down, with the list it narrows (Phase 134). */}
      <SegmentedControl
        ariaLabel={t("Agenda range", "Rentang agenda")}
        segments={[
          { value: "day", label: t("Day", "Hari") },
          { value: "week", label: t("Week", "Minggu") },
        ]}
        value={range}
        onChange={setRange}
      />

      {/* Everything under the toggle fades in afresh when the range changes
          or Today is tapped (Phase 115) — keyed, so it remounts: the ribbon
          re-centres and the grid scrolls back to today. */}
      <div
        key={`${range}|${todayJumps}`}
        className="flex animate-view-fade flex-col gap-4 motion-reduce:animate-none"
      >
        {/* The Agenda is a view of one day, so it owns the control that picks
            which. It had none until Phase 101: before the five-tab refactor the
            dashboard rendered a single ribbon above the whole canvas, and when
            that went the Agenda was left following a date it could not change.
            Day view only since Phase 115: the Week grid's own headers are the
            days, and a strip of the same dates above them said it twice. */}
        {range === "day" && (
          <DateRibbon value={selectedDate} onChange={setSelectedDate} locale={locale} />
        )}

        {/* Set up your home (audit B1): a new household's steps to its first
            finished task. Directly under the date, above everything else
            (Phase 172, D11 rule 4): for a new house it is the whole screen.
            Renders nothing once past it. */}
        {range === "day" && (
          <FirstRunCard
            firstRun={firstRun}
            householdName={householdName}
            onAddTask={() => addChore({ assigneeId: firstRun.staff[0]?.id ?? null })}
          />
        )}

        {/* A pending proposal is the only thing here blocking someone else's
            work, so it outranks the day itself. Renders nothing when the queue
            is empty. */}
        <ApprovalQueue />

        {/* A medicine course ending, ended or never started (Phase 144). Here
            rather than on the Pets tab because this is the screen the owner
            opens every day, and a course stops without a word otherwise.
            Renders nothing when there is nothing to ask. */}
        <MedicationCourseAlerts />

        {/* Asked once, of a household that never answered and never had a
            pet (Phase 162, D3). Renders nothing otherwise. */}
        <PetsQuestionCard />

        {/* Who is on track, at a glance (owners, 11 Nov): above the quiet
            lines, since it is what Today is opened for in a home with staff.
            A row opens that person's day in the Who did what sheet. */}
        {range === "day" && hasStaff && progress && <StaffProgressCard progress={progress} dayLabel={label} />}

        {(linkedToday.length > 0 || !!menuLine || notDoneCount > 0 || comingUp.length > 0 || needsDate > 0 || eatSoon > 0 || toBuy > 0 || repairLines.toReview > 0 || repairLines.toCheck > 0 || (showsToday && hereNow.length > 0)) && (
          <div className="-my-1 flex flex-col">
            {linkedToday.map(({ staffId, name }) => (
              <div key={staffId} className="flex min-h-11 items-center gap-2 px-1 text-sm text-gray-700">
                <Smartphone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">{t(`${name}'s phone is linked`, `HP ${name} sudah terhubung`)}</span>
                {/* Audit L5: if it wasn't them, the owner puts the name back. */}
                <button
                  type="button"
                  onClick={() => void notThem(staffId, name)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-gray-900 underline underline-offset-2 active:bg-muted"
                >
                  {confirmingUndo === staffId
                    ? t("Tap again to undo", "Ketuk lagi untuk membatalkan")
                    : t(`Not ${name}? Undo`, `Bukan ${name}? Batalkan`)}
                </button>
              </div>
            ))}
            {showsToday &&
              hereNow.map((visit) => {
                const repair = repairs.find((r) => r.id === visit.repair_id);
                return (
                  <Link
                    key={visit.id}
                    href={repairsHref}
                    scroll={false}
                    onClick={switchToRepairs}
                    data-testid="walkin-today-line"
                    className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm text-gray-700 active:bg-muted"
                  >
                    <HardHat className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      {walkInTodayLine(visit, repair?.title ?? "", repair ? roomName(repair.location_id, null) : null, locale)}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                );
              })}
            {notDoneCount > 0 && (
              <button
                type="button"
                onClick={openSummary}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-left text-sm text-gray-700 active:bg-muted"
              >
                <Moon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  {t(`${notDoneCount} not done today`, `${notDoneCount} belum selesai hari ini`)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            )}
            {comingUp.length > 0 && (
              <button
                type="button"
                onClick={showComingUp}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-left text-sm font-medium text-amber-800 active:bg-muted"
              >
                <Bell className="size-4 shrink-0 text-amber-700" aria-hidden />
                <span className="min-w-0 flex-1">{comingUpLabel(comingUp, todayKey, locale)}</span>
                <ChevronRight className="size-4 shrink-0 text-amber-700" aria-hidden />
              </button>
            )}
            {repairLines.toReview > 0 && (
              <Link
                href={repairsHref}
                scroll={false}
                onClick={switchToRepairs}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-medium text-amber-800 active:bg-muted"
              >
                <Wrench className="size-4 shrink-0 text-amber-700" />
                <span className="flex-1">{repairsTodayLabel("review", repairLines.toReview, locale)}</span>
                <ChevronRight className="size-4 shrink-0 text-amber-700" />
              </Link>
            )}
            {repairLines.toCheck > 0 && (
              <Link
                href={repairsHref}
                scroll={false}
                onClick={switchToRepairs}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm text-gray-700 active:bg-muted"
              >
                <Wrench className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{repairsTodayLabel("check", repairLines.toCheck, locale)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            )}
            {needsDate > 0 && (
              <Link
                href={moduleHref("inventory")}
                scroll={false}
                onClick={switchToFood}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-medium text-amber-800 active:bg-muted"
              >
                <CookingPot className="size-4 shrink-0 text-amber-700" />
                <span className="flex-1">{needsDateLabel(needsDate, locale)}</span>
                <ChevronRight className="size-4 shrink-0 text-amber-700" />
              </Link>
            )}
            {menuLine && (
              <Link
                href={menuHref}
                scroll={false}
                onClick={switchToMenu}
                data-testid="menu-today-line"
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm text-gray-700 active:bg-muted"
              >
                <UtensilsCrossed className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{menuLine}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            )}
            {eatSoon > 0 && (
              <Link
                href={moduleHref("inventory")}
                scroll={false}
                onClick={switchToFood}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm text-gray-700 active:bg-muted"
              >
                <CookingPot className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{eatSoonLabel(eatSoon, locale)}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            )}

            {toBuy > 0 && (
              <Link
                href={toBuyHref}
                scroll={false}
                onClick={switchToShopping}
                className="flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm text-gray-700 active:bg-muted"
              >
                <ShoppingBasket className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">
                  {t(
                    `${toBuy} thing${toBuy === 1 ? "" : "s"} to buy`,
                    `${toBuy} barang perlu dibeli`
                  )}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            )}
          </div>
        )}


        {/* My tasks (Phase 163): below what waits on a decision, above the
            household's day. Renders nothing on a day with none of mine. */}
        {/* Its tutorial, only for an admin who has a chore of their own (D5). */}
        {range === "day" && hasOwnChores && <WhatsNewCard id="my-tasks-2026-11" />}
        {/* Marking a bill paid (Phase 164 PR B): for an admin with a bill of their own. */}
        {range === "day" && mine.some((o) => isBill(o.task)) && <WhatsNewCard id="bill-payments-2026-11" />}
        {/* Couldn't-do and the evening summary (Phase 165, D10): for homes with staff. */}
        {range === "day" && (allProfiles ?? []).some((p) => !p.user_id && !p.archived_at) && (
          <WhatsNewCard id="couldnt-do-2026-11" />
        )}
        {/* Bills and upkeep (Phase 164, D9): Show me opens the checklist on Chores. */}
        {range === "day" && (
          <WhatsNewCard
            id="bills-2026-11"
            onTry={() => startTransition(() => pushInPlace(`${moduleHref("chores")}&bills=open`))}
          />
        )}
        {range === "day" && (
          <MyTasksCard
            billLine={(occurrence, done) =>
              !isBill(occurrence.task)
                ? null
                : done
                  ? paidLine(paymentFor(billPayments, occurrence.row?.id), locale)
                  : lastTimeLine(lastAmount(billPayments, occurrence.template.id, occurrence.row?.id), locale)
            }
            occurrences={mine}
            couldntLine={couldntLineFor}
            mode={myMode}
            dayLabel={label}
            roomName={roomName}
            pendingIds={pendingIds}
            onFinish={async (occurrence) => {
              // Covering a repeat's first day for someone on leave: that one
              // needs both photos, so the circle opens the sheet.
              if (coverTakeover(occurrence, memberProfile?.id).kind === "needsPhotos") {
                setMyOpenKey(occurrence.key);
                return false;
              }
              return (await finish(occurrence)) !== null;
            }}
            onOpen={(occurrence) => setMyOpenKey(occurrence.key)}
          />
        )}

        {range === "day" ? (
          <>
            <h2 className="text-sm font-semibold text-gray-900">
              {label}
            </h2>
            {/* Under the heading, as the Pets tab's photo filters sit under
                theirs (Phase 134). Not on an empty day — unless a filter is
                on, which must stay reachable to be turned off. */}
            {petsOn && (allEntries.length > 0 || filter !== "all") && (
              <AgendaFilterPills
                value={filter}
                onChange={setFilter}
                entries={allEntries}
              />
            )}

            {allEntries.length === 0 && brandNew && firstRun.view === "checklist" ? (
              // The checklist above already holds the way in (audit B1): the
              // welcome's Add Chore would say it twice. Add Pet stays for a
              // home with pets, which the checklist doesn't cover.
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-center text-sm text-muted-foreground">
                  {t("Nothing on this day yet.", "Belum ada apa-apa hari ini.")}
                </p>
                {petsOn && (
                  <Button variant="outline" className="min-h-[44px]" asChild>
                    <Link href={moduleHref("pets")} scroll={false} onClick={switchToPets}>
                      <PawPrint /> {t("Add Pet", "Tambah Hewan")}
                    </Link>
                  </Button>
                )}
              </div>
            ) : allEntries.length === 0 && brandNew ? (
              // The first screen a new household sees (Phase 120). A pet first:
              // its routines are what fill most of an Agenda, and a chore is
              // one tap from here either way.
              <EmptyState
                icon={Sparkles}
                // useHouseholdName falls back to the app's name until the
                // household's own arrives; greeting "Miamus" and then
                // swapping the title a beat later would be the first thing
                // a new owner sees jump.
                title={
                  householdName === APP_NAME
                    ? t("Welcome to your new household!", "Selamat datang di rumah baru Anda!")
                    : t(`Welcome to ${householdName}!`, `Selamat datang di ${householdName}!`)
                }
                description={
                  petsOn
                    ? t(
                        "Let's start by adding a pet or a chore. Everything you add shows up here, day by day, for everyone in the house.",
                        "Mari mulai dengan menambahkan hewan atau tugas. Semua yang Anda tambahkan muncul di sini, hari demi hari, untuk semua orang di rumah."
                      )
                    : t(
                        "Let's start by adding a chore. Everything you add shows up here, day by day, for everyone in the house.",
                        "Mari mulai dengan menambahkan tugas. Semua yang Anda tambahkan muncul di sini, hari demi hari, untuk semua orang di rumah."
                      )
                }
              >
                {petsOn && (
                  <Button className="min-h-[44px]" asChild>
                    <Link href={moduleHref("pets")} scroll={false} onClick={switchToPets}>
                      <PawPrint /> {t("Add Pet", "Tambah Hewan")}
                    </Link>
                  </Button>
                )}
                <Button
                  // The only button when pets are off, so the primary one.
                  variant={petsOn ? "outline" : "default"}
                  className="min-h-[44px]"
                  onClick={() => addChore()}
                >
                  <Plus /> {t("Add Chore", "Tambah Tugas")}
                </Button>
              </EmptyState>
            ) : allEntries.length === 0 && mine.length > 0 ? (
              // Everything on this day is mine, and it is all in the card.
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("Nothing else on this day.", "Tidak ada yang lain hari ini.")}
              </p>
            ) : entries.length === 0 && filter !== "all" ? (
              // Filtered to nothing, on a day that has other things: say what
              // the filter hid, rather than "Nothing scheduled".
              <p className="py-6 text-center text-sm text-muted-foreground">
                {filter === "pets"
                  ? t("No pet routines on this day.", "Tidak ada rutinitas hewan hari ini.")
                  : t("No chores on this day.", "Tidak ada tugas hari ini.")}
              </p>
            ) : entries.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title={t("Nothing scheduled", "Tidak ada jadwal")}
                description={
                  !petsOn
                    ? t("No chores on this day.", "Tidak ada tugas hari ini.")
                    : pets.length === 0
                    ? t(
                        "No chores on this day. Add one, or add a pet to plan their daily routines.",
                        "Tidak ada tugas hari ini. Tambahkan satu, atau tambahkan hewan untuk merencanakan rutinitas hariannya."
                      )
                    : t(
                        "No pet routines or chores on this day.",
                        "Tidak ada rutinitas hewan atau tugas hari ini."
                      )
                }
              >
                <Button
                  className="min-h-[44px]"
                  onClick={() => addChore()}
                >
                  <Plus /> {t("Add Chore", "Tambah Tugas")}
                </Button>
                {petsOn && pets.length === 0 && (
                  <Button variant="outline" className="min-h-[44px]" asChild>
                    <Link href={moduleHref("pets")} scroll={false} onClick={switchToPets}>
                      <PawPrint /> {t("Add Pet", "Tambah Hewan")}
                    </Link>
                  </Button>
                )}
              </EmptyState>
            ) : (
              <>
                {/* Undone chores from earlier days lead today (Phase 113). */}
                {overdue.length > 0 && (
                  <OverdueSection count={overdue.length} locale={locale}>
                    {overdue.map((entry) => renderEntry(entry))}
                  </OverdueSection>
                )}
                {/* Straight onto the page, no card around them (Phase 136): the
                    frame's border and padding cost every row 34px of width,
                    and each row is its own surface now, as on the staff list. */}
                {rest.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {rest.map((entry) => renderEntry(entry))}
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* Sunday to Saturday, a week at a time, endlessly (Phase 115). */}
            <WeekPager date={selectedDate} locale={locale} onShift={shiftWeek} />
            {/* No All | Pets | Chores pills here since Phase 143: the summary
                already separates the routine (the matrix) from everything
                else (the list), which is what the filter was standing in for.
                Keyed on the week, so a new one fades in rather than snapping. */}
            <div
              key={formatDateLocal(weekStartOf(selectedDate))}
              className="animate-view-fade motion-reduce:animate-none"
            >
              <WeekSummaryView
                days={week}
                today={formatDateLocal(today)}
                staffName={staffName}
                renderEntry={renderEntry}
                onOpenDay={(day) => {
                  setSelectedDate(day);
                  setRange("day");
                }}
                rhythmOpen={rhythmOpen}
                onRhythmOpenChange={setRhythmOpen}
              />
            </div>
          </>
        )}
      </div>

      <OwnerFinishSheet
        occurrence={myOpen}
        mode={myMode}
        open={!!myOpen}
        onOpenChange={(next) => !next && setMyOpenKey(null)}
        onEdit={(occurrence: ChoreOccurrence) => {
          setEditing(occurrence.row ?? occurrence.template);
          setEditingDate(occurrence.date);
          setEditorPreset(null);
          setEditorOpen(true);
        }}
      />

      {/* Who did what, and a person's day from their progress row; open
          while ?workload= is set. Mounted here only, so one sheet opens. */}
      <StaffWorkloadSheet />

      <EveningSummarySheet
        date={summaryOpen}
        onClose={closeSummary}
        onOpenChore={openChore}
        toBuy={toBuy}
        toBuyHref={toBuyHref}
        onToBuy={switchToShopping}
      />
      <OwnerCouldntSheet
        open={!!couldntChore}
        onOpenChange={(next) => !next && setCouldntChore(null)}
        title={couldntChore?.task.title ?? ""}
        subtitle={
          couldntChore
            ? [
                couldntChore.task.assigned_to
                  ? t(`for ${staffName(couldntChore.task.assigned_to)}`, `untuk ${staffName(couldntChore.task.assigned_to)}`)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || null
            : null
        }
        entries={
          couldntChore
            ? (() => {
                const exception = choreException(exceptions, couldntChore);
                return exception ? [{ exception }] : [];
              })()
            : []
        }
        onEdit={couldntChore ? () => openEditorFor(couldntChore) : undefined}
      />

      <ChoreEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        task={editing}
        occurrenceDate={editingDate}
        defaultDate={dateStr}
        preset={editorPreset}
      />
    </div>
  );
}

/**
 * All | Pets | Chores (Phases 132, 134) as filter pills with counts — the
 * same control the Pets tab filters its photos with, in the same place: on
 * the list, under its heading, rather than in the controls row at the top.
 * Counts are of what the view holds unfiltered, so each pill says what
 * tapping it will show.
 */
function AgendaFilterPills({
  value,
  onChange,
  entries,
}: {
  value: AgendaFilter;
  onChange: (next: AgendaFilter) => void;
  entries: UnifiedAgendaEntry[];
}) {
  const pets = entries.filter((entry) => entry.kind === "routine").length;
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("Filter the agenda", "Saring agenda")}
      // As in PhotoStream: a sideways scroll of the pills must not drag the
      // swipeable tab carousel underneath.
      onPointerDownCapture={(e) => e.stopPropagation()}
      className="-mt-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <FilterPill
        label={t("All", "Semua")}
        count={entries.length}
        active={value === "all"}
        onClick={() => onChange("all")}
      />
      <FilterPill
        label={t("Pets", "Hewan")}
        icon={PawPrint}
        count={pets}
        active={value === "pets"}
        onClick={() => onChange("pets")}
      />
      <FilterPill
        label={t("Chores", "Tugas")}
        icon={Sparkles}
        count={entries.length - pets}
        active={value === "chores"}
        onClick={() => onChange("chores")}
      />
    </div>
  );
}
