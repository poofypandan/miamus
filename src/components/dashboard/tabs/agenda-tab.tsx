"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { ChoreTimelineRow } from "@/components/dashboard/chore-timeline-row";
import { TimelineRow } from "@/components/dashboard/timeline-row";
import { PhotoStream } from "@/components/dashboard/photo-stream";
import { UnifiedSummaryCard } from "@/components/dashboard/unified-summary-card";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { useHousehold } from "@/context/household-context";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { dayLabel } from "@/lib/date-label";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import { buildUnifiedAgenda } from "@/lib/unified-agenda";
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
 * Owner-facing, so entirely English per the Phase 46 language boundary. Every
 * row here is tappable only as far as reading and editing goes: completing a
 * chore is staff work and lives on their phones.
 */
export function AgendaTab() {
  const { pets, entities, schedules, logs, loading, selectedDate, setSelectedDate } =
    useHousehold();
  const { profiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(profiles);
  const chores = useChoreOccurrences();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate, today);

  const [editing, setEditing] = useState<HouseholdTask | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // The proof that came back today. Moved here from the Pets tab in Phase
  // 101: a photo of this morning's walk is daily tracking, and the Agenda is
  // where the date ribbon that scopes it lives.
  const logsForDate = useMemo(
    () => logs.filter((l) => formatDateLocal(new Date(l.completed_at)) === dateStr),
    [logs, dateStr]
  );

  const groups = useMemo(
    () => buildAgenda({ date: dateStr, entities: pets, schedules, logs }),
    [dateStr, pets, schedules, logs]
  );

  const entries = useMemo(
    () => buildUnifiedAgenda({ groups, chores }),
    [groups, chores]
  );

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
      <DateRibbon value={selectedDate} onChange={setSelectedDate} locale="en" />

      {/* A pending proposal is the only thing here blocking someone else's
          work, so it outranks the day itself. Renders nothing when the queue
          is empty. */}
      <ApprovalQueue />

      <h2 className="text-sm font-semibold text-gray-900">{label}&apos;s Agenda</h2>

      <Card className="gap-3 py-4">
        <CardContent className="flex flex-col gap-1.5 px-4">
          {entries.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nothing scheduled for this day — no pet routines and no chores.
            </p>
          ) : (
            entries.map((entry) =>
              entry.kind === "routine" ? (
                <TimelineRow key={entry.key} group={entry.group} pets={pets} />
              ) : (
                <ChoreTimelineRow
                  key={entry.key}
                  occurrence={entry.occurrence}
                  assigneeName={
                    entry.occurrence.task.assigned_to
                      ? staffName(entry.occurrence.task.assigned_to)
                      : null
                  }
                  onPress={() => {
                    // The template, not the occurrence: editing a repeat from
                    // any of its days edits the repeat. A materialised
                    // occurrence has its own row and edits that.
                    setEditing(entry.occurrence.row ?? entry.occurrence.template);
                    setEditorOpen(true);
                  }}
                />
              )
            )
          )}
        </CardContent>
      </Card>

      {pets.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-900">Pet Progress</h2>
          <UnifiedSummaryCard />

          <h2 className="mt-2 text-sm font-semibold text-gray-900">Photos</h2>
          {/* No "Flag Low Stock" here: reporting is staff data entry and lives
              in the staff view. The owner reads reports and restocks. */}
          <PhotoStream logs={logsForDate} entities={entities} showAvatar />
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
