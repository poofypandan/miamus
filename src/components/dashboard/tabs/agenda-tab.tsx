"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { ChoreTimelineRow } from "@/components/dashboard/chore-timeline-row";
import { TimelineRow } from "@/components/dashboard/unified-timeline";
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
  const { pets, schedules, logs, loading, selectedDate } = useHousehold();
  const { profiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(profiles);
  const chores = useChoreOccurrences();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);
  const label = dayLabel(selectedDate, today);

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
      {/* First on the page: a pending proposal is the only thing here blocking
          someone else's work, so it outranks the day itself. Renders nothing
          when the queue is empty. */}
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
