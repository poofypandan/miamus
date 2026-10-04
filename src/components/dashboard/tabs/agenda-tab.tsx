"use client";

import { startTransition, useMemo, useState } from "react";
import { addDays } from "date-fns";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarDays, PawPrint, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AgendaWeekGrid } from "@/components/agenda/agenda-week-grid";
import { OverdueSection } from "@/components/agenda/overdue-section";
import { WeekPager } from "@/components/agenda/week-pager";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { ChoreTimelineRow } from "@/components/dashboard/chore-timeline-row";
import { TimelineRow } from "@/components/dashboard/timeline-row";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { ChoreReviewLightbox, hasChoreProof } from "@/components/chores/chore-proof-photos";
import { useHousehold } from "@/context/household-context";
import { useAgendaRange } from "@/hooks/use-agenda-range";
import { useAgendaWeek } from "@/hooks/use-agenda-week";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { APP_NAME, useHouseholdName } from "@/hooks/use-household-name";
import { dayLabel } from "@/lib/date-label";
import { moduleHref } from "@/lib/dashboard-modules";
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
 * Owner-facing, so entirely English per the Phase 46 language boundary. Every
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
  } = useHousehold();
  const householdName = useHouseholdName();
  // Nothing anywhere yet, not just nothing today: the first screen after
  // onboarding, which greets rather than reports (Phase 120).
  const brandNew = pets.length === 0 && householdTasks.length === 0;
  const { profiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(profiles);
  const chores = useChoreOccurrences();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate, today);

  const [range, setRange] = useAgendaRange();
  const week = useAgendaWeek(selectedDate);

  const [editing, setEditing] = useState<HouseholdTask | null>(null);
  // The day the editor was opened from (Phase 128): what "skip this day" and
  // "end the repeat here" act on. Null when adding.
  const [editingDate, setEditingDate] = useState<string | null>(null);
  // A finished chore opened from the Week grid, for review (Phase 129).
  const [reviewing, setReviewing] = useState<HouseholdTask | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  const entries = useMemo(
    () => buildUnifiedAgenda({ groups, chores }),
    [groups, chores]
  );
  const { overdue, rest } = useMemo(() => splitOverdue(entries), [entries]);

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
      {/* Day | Week (Phase 112). */}
      <SegmentedControl
        ariaLabel="Agenda range"
        segments={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
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
          <DateRibbon value={selectedDate} onChange={setSelectedDate} locale="en" />
        )}

        {/* A pending proposal is the only thing here blocking someone else's
            work, so it outranks the day itself. Renders nothing when the queue
            is empty. */}
        <ApprovalQueue />

        {range === "day" ? (
          <>
            <h2 className="text-sm font-semibold text-gray-900">{label}&apos;s Agenda</h2>

            {entries.length === 0 && brandNew ? (
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
                    ? "Welcome to your new household!"
                    : `Welcome to ${householdName}!`
                }
                description="Let's start by adding a pet or a chore. Everything you add shows up here, day by day, for you and your staff."
              >
                <Button className="min-h-[44px]" asChild>
                  <Link href={moduleHref("pets")} scroll={false} onClick={switchToPets}>
                    <PawPrint /> Add Pet
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
                  <Plus /> Add Chore
                </Button>
              </EmptyState>
            ) : entries.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nothing scheduled"
                description={
                  pets.length === 0
                    ? "No chores on this day. Add one, or add a pet to plan their daily routines."
                    : "No pet routines or chores on this day."
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
                  <Plus /> Add Chore
                </Button>
                {pets.length === 0 && (
                  <Button variant="outline" className="min-h-[44px]" asChild>
                    <Link href={moduleHref("pets")} scroll={false} onClick={switchToPets}>
                      <PawPrint /> Add Pet
                    </Link>
                  </Button>
                )}
              </EmptyState>
            ) : (
              <>
                {/* Undone chores from earlier days lead today (Phase 113). */}
                {overdue.length > 0 && (
                  <OverdueSection count={overdue.length} locale="en">
                    {overdue.map(renderEntry)}
                  </OverdueSection>
                )}
                {rest.length > 0 && (
                  <Card className="gap-3 py-4">
                    <CardContent className="flex flex-col gap-1.5 px-4">
                      {rest.map(renderEntry)}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        ) : (
          <>
            {/* Sunday to Saturday, a week at a time, endlessly (Phase 115). */}
            <WeekPager date={selectedDate} locale="en" onShift={shiftWeek} />
            {/* Keyed on the week, so a new one fades in rather than snapping. */}
            <div
              key={formatDateLocal(weekStartOf(selectedDate))}
              className="animate-view-fade motion-reduce:animate-none"
            >
              <AgendaWeekGrid
                days={week}
                locale="en"
                onOpenDay={(day) => {
                  setSelectedDate(day);
                  setRange("day");
                }}
                onChorePress={(occurrence) => {
                  // Same split as the Day rows (Phase 129): a finished chore
                  // is reviewed, never edited, from the Agenda.
                  if (occurrence.status === "completed") {
                    if (hasChoreProof(occurrence.row)) setReviewing(occurrence.row);
                    else toast("No photos were saved for this chore");
                    return;
                  }
                  setEditing(occurrence.row ?? occurrence.template);
                  setEditingDate(occurrence.date);
                  setEditorOpen(true);
                }}
                onShiftWeek={shiftWeek}
              />
            </div>
          </>
        )}
      </div>

      <ChoreReviewLightbox
        row={reviewing}
        open={!!reviewing}
        onClose={() => setReviewing(null)}
      />

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
