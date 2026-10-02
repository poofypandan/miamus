"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, PawPrint, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AgendaWeekGrid } from "@/components/agenda/agenda-week-grid";
import { OverdueSection } from "@/components/agenda/overdue-section";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { ChoreTimelineRow } from "@/components/dashboard/chore-timeline-row";
import { TimelineRow } from "@/components/dashboard/timeline-row";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { useHousehold } from "@/context/household-context";
import { useAgendaRange } from "@/hooks/use-agenda-range";
import { useAgendaWeek } from "@/hooks/use-agenda-week";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { dayLabel } from "@/lib/date-label";
import { moduleHref } from "@/lib/dashboard-modules";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import {
  buildUnifiedAgenda,
  splitOverdue,
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
  const { pets, schedules, logs, loading, selectedDate, setSelectedDate } = useHousehold();
  const { profiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(profiles);
  const chores = useChoreOccurrences();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate, today);

  const [range, setRange] = useAgendaRange();
  const week = useAgendaWeek(selectedDate);

  const [editing, setEditing] = useState<HouseholdTask | null>(null);
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
      {/* The Agenda is a view of one day, so it owns the control that picks
          which. It had none until Phase 101: before the five-tab refactor the
          dashboard rendered a single ribbon above the whole canvas, and when
          that went the Agenda was left following a date it could not change. */}
      {/* Day | Week (Phase 112). In Week the ribbon still picks the day the
          seven start from, so planning next week is one tap. */}
      <SegmentedControl
        ariaLabel="Agenda range"
        segments={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
        ]}
        value={range}
        onChange={setRange}
      />

      <DateRibbon value={selectedDate} onChange={setSelectedDate} locale="en" />

      {/* A pending proposal is the only thing here blocking someone else's
          work, so it outranks the day itself. Renders nothing when the queue
          is empty. */}
      <ApprovalQueue />

      {range === "day" ? (
        <>
          <h2 className="text-sm font-semibold text-gray-900">{label}&apos;s Agenda</h2>

          {entries.length === 0 ? (
            // The first screen a new household sees, so it says how to fill it:
            // a chore from here, and — while there are no pets to have routines —
            // the way to the tab that adds them.
            <EmptyState
              icon={CalendarDays}
              title="Nothing scheduled"
              description={
                pets.length === 0
                  ? "Tap + to add a chore, or add a pet to plan their daily routines."
                  : "No pet routines or chores on this day. Tap + to add a chore."
              }
            >
              <Button
                className="min-h-[44px]"
                onClick={() => {
                  setEditing(null);
                  setEditorOpen(true);
                }}
              >
                <Plus /> Add chore
              </Button>
              {pets.length === 0 && (
                <Button variant="outline" className="min-h-[44px]" asChild>
                  <Link href={moduleHref("pets")} scroll={false}>
                    <PawPrint /> Add a pet
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
          <h2 className="text-sm font-semibold text-gray-900">
            {label === "Today" ? "The next 7 days" : `7 days from ${label}`}
          </h2>
          <AgendaWeekGrid
            days={week}
            locale="en"
            onOpenDay={(day) => {
              setSelectedDate(day);
              setRange("day");
            }}
            onChorePress={(occurrence) => {
              setEditing(occurrence.row ?? occurrence.template);
              setEditorOpen(true);
            }}
          />
        </>
      )}

      <ChoreEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        task={editing}
        defaultDate={dateStr}
      />
    </div>
  );
}
