"use client";

import { startTransition, useMemo, useState } from "react";
import { addDays } from "date-fns";
import Link from "next/link";
import { CalendarDays, ChevronRight, CookingPot, PawPrint, Plus, ShoppingBasket, Sparkles, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FilterPill } from "@/components/shared/filter-pill";
import { OverdueSection } from "@/components/agenda/overdue-section";
import { WeekPager } from "@/components/agenda/week-pager";
import { WeekSummaryView } from "@/components/agenda/week-summary-view";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { MedicationCourseAlerts } from "@/components/dashboard/medication-course-alerts";
import { ChoreTimelineRow } from "@/components/dashboard/chore-timeline-row";
import { TimelineRow } from "@/components/dashboard/timeline-row";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useAgendaRange } from "@/hooks/use-agenda-range";
import { applyAgendaFilter, useAgendaFilter, type AgendaFilter } from "@/hooks/use-agenda-filter";
import { useAgendaWeek } from "@/hooks/use-agenda-week";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useLocationName } from "@/hooks/use-household-locations";
import { useToday } from "@/hooks/use-today";
import { useRepairs } from "@/hooks/use-repairs";
import { repairsToday, repairsTodayLabel } from "@/lib/repairs";
import { APP_NAME, useHouseholdName } from "@/hooks/use-household-name";
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
 * Owner-facing, in the language the owner chose (Phase 149). Every
 * row here is tappable only as far as reading and editing goes: completing a
 * chore is staff work and lives on their phones.
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
  } = useHousehold();
  const householdName = useHouseholdName();
  const locale = useOwnerLocale();
  const t = useT();
  // Nothing anywhere yet, not just nothing today: the first screen after
  // onboarding, which greets rather than reports (Phase 120).
  const brandNew = pets.length === 0 && householdTasks.length === 0;
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const roomName = useLocationName();
  const chores = useChoreOccurrences();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate, today, locale);

  const [range, setRange] = useAgendaRange();
  const week = useAgendaWeek(selectedDate);

  const [editing, setEditing] = useState<HouseholdTask | null>(null);
  // The day the editor was opened from (Phase 128): what "skip this day" and
  // "end the repeat here" act on. Null when adding.
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  // The Week view's every-day matrix (Phase 143). Held here rather than in the
  // view, which remounts on every page-turn: paging back through weeks to
  // check whether evening doses were missed should not fold it up each time.
  const [rhythmOpen, setRhythmOpen] = useState(false);

  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  // All | Pets | Chores (Phase 132): narrows what is drawn, never what is
  // loaded. `allEntries` still decides the welcome screen, so filtering a
  // brand-new household to Pets does not greet it twice.
  const [filter, setFilter] = useAgendaFilter();
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
  const eatSoon = useMemo(() => countEatSoon(foodItems, formatDateLocal(today)), [foodItems, today]);
  // Staff answered "don't know" for a date: waiting for an owner (amber).
  const needsDate = useMemo(() => countNeedsDate(foodItems), [foodItems]);

  // Repairs (Phase 159): staff reports to review, and work done to check.
  // Normal staff reports land here rather than as a push (D6).
  const { repairs, visits } = useRepairs();
  const repairLines = useMemo(() => repairsToday(repairs, visits), [repairs, visits]);
  const repairsHref = `${moduleHref("chores")}&chores=repairs`;
  function switchToRepairs(event: React.MouseEvent) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    startTransition(() => pushInPlace(repairsHref));
  }

  // The Kitchen tab opens on Food; the shopping line goes straight to Shopping.
  const toBuyHref = `${moduleHref("inventory")}&kitchen=buy`;
  function switchToShopping(event: React.MouseEvent) {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    startTransition(() => pushInPlace(toBuyHref));
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
        onPress={() => {
          // The template, not the occurrence: editing a repeat from any of its
          // days edits the repeat. A materialised occurrence has its own row
          // and edits that.
          setEditing(entry.occurrence.row ?? entry.occurrence.template);
          setEditingDate(entry.occurrence.date);
          setEditorOpen(true);
        }}
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

        {/* A pending proposal is the only thing here blocking someone else's
            work, so it outranks the day itself. Renders nothing when the queue
            is empty. */}
        <ApprovalQueue />

        {/* A medicine course ending, ended or never started (Phase 144). Here
            rather than on the Pets tab because this is the screen the owner
            opens every day, and a course stops without a word otherwise.
            Renders nothing when there is nothing to ask. */}
        <MedicationCourseAlerts />

        {(needsDate > 0 || eatSoon > 0 || toBuy > 0 || repairLines.toReview > 0 || repairLines.toCheck > 0) && (
          <div className="-my-1 flex flex-col">
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

        {range === "day" ? (
          <>
            <h2 className="text-sm font-semibold text-gray-900">
              {label}
            </h2>
            {/* Under the heading, as the Pets tab's photo filters sit under
                theirs (Phase 134). Not on an empty day — unless a filter is
                on, which must stay reachable to be turned off. */}
            {(allEntries.length > 0 || filter !== "all") && (
              <AgendaFilterPills
                value={filter}
                onChange={setFilter}
                entries={allEntries}
              />
            )}

            {allEntries.length === 0 && brandNew ? (
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
                description={t(
                  "Let's start by adding a pet or a chore. Everything you add shows up here, day by day, for everyone in the house.",
                  "Mari mulai dengan menambahkan hewan atau tugas. Semua yang Anda tambahkan muncul di sini, hari demi hari, untuk semua orang di rumah."
                )}
              >
                <Button className="min-h-[44px]" asChild>
                  <Link href={moduleHref("pets")} scroll={false} onClick={switchToPets}>
                    <PawPrint /> {t("Add Pet", "Tambah Hewan")}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => {
                    setEditing(null);
                    setEditingDate(null);
                    setEditorOpen(true);
                  }}
                >
                  <Plus /> {t("Add Chore", "Tambah Tugas")}
                </Button>
              </EmptyState>
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
                  pets.length === 0
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
                  onClick={() => {
                    setEditing(null);
                    setEditingDate(null);
                    setEditorOpen(true);
                  }}
                >
                  <Plus /> {t("Add Chore", "Tambah Tugas")}
                </Button>
                {pets.length === 0 && (
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

      <ChoreEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        task={editing}
        occurrenceDate={editingDate}
        defaultDate={dateStr}
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
