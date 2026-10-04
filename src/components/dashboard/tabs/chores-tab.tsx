"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { OverdueSection } from "@/components/agenda/overdue-section";
import { StaffCompletionStrip } from "@/components/dashboard/staff-completion-strip";
import { StaffWorkloadSheet } from "@/components/dashboard/staff-workload-sheet";
import { dayLabel } from "@/lib/date-label";
import { DateRibbon } from "@/components/date-ribbon";
import { ChoreCard } from "@/components/chores/chore-card";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { useHousehold } from "@/context/household-context";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useLocationName } from "@/hooks/use-household-locations";
import { useToday } from "@/hooks/use-today";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import type { HouseholdTask } from "@/types/database";

/**
 * The owner's chore desk: what the house owes on the selected day, and the
 * only place chores are created, edited or deleted (Phase 100).
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary, and
 * owner-only in capability: the staff view imports none of this.
 */
export function ChoresTab() {
  const { selectedDate, setSelectedDate, householdTasks } = useHousehold();
  // No chore exists at all, as opposed to none falling on this day: a new
  // household should be told to make its first, not that today is free
  // (Phase 120).
  const noChoresYet = householdTasks.length === 0;
  const { profiles } = useStaffProfiles();
  // Default fallback ("Staff"), not "Unassigned": the two null cases mean
  // different things. An absent assigned_to is genuinely unassigned and is
  // spelled out on the badge; an id this roster cannot resolve — a profile
  // still loading — is a name we don't have, not an empty chore.
  const staffName = useStaffNameLookup(profiles);
  const roomName = useLocationName();
  const occurrences = useChoreOccurrences();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);

  const [editing, setEditing] = useState<HouseholdTask | null>(null);
  // The day the editor was opened from (Phase 128): what "skip this day" and
  // "end the repeat here" act on. Null when adding.
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Rolled-over chores lead the open list under their own header (Phase 113),
  // oldest first; only ever non-empty when browsing today.
  const { overdue, open, done } = useMemo(
    () => ({
      overdue: occurrences
        .filter((o) => o.overdue && o.status !== "completed")
        .sort((a, b) => a.date.localeCompare(b.date)),
      open: occurrences.filter((o) => o.status !== "completed" && !o.overdue),
      done: occurrences.filter((o) => o.status === "completed"),
    }),
    [occurrences]
  );

  function edit(occurrence: ChoreOccurrence) {
    // A repeat is edited through its template from whichever day you tapped;
    // an occurrence that already has its own row edits that row.
    setEditing(occurrence.row ?? occurrence.template);
    setEditingDate(occurrence.date);
    setEditorOpen(true);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <DateRibbon value={selectedDate} onChange={setSelectedDate} locale="en" />

      <StaffCompletionStrip
        occurrences={occurrences}
        date={dateStr}
        dayLabel={dayLabel(selectedDate, today)}
      />

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Chores</h2>
        <Button
          variant="outline"
          className="min-h-[36px] shrink-0 px-3 text-xs"
          onClick={() => {
            setEditing(null);
            setEditingDate(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="size-3.5" /> Add Chore
        </Button>
      </div>

      {occurrences.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={noChoresYet ? "No chores yet" : "No chores on this day"}
          description={
            noChoresYet
              ? "Add your first chore — one-off or repeating — and it appears on every staff phone straight away."
              : "Add one and it appears on every staff phone straight away."
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
        </EmptyState>
      ) : (
        <>
          {overdue.length > 0 && (
            <OverdueSection count={overdue.length} locale="en">
              {overdue.map((occurrence) => (
                <ChoreCard
                  key={occurrence.key}
                  occurrence={occurrence}
                  locationName={roomName(occurrence.task.location_id)}
                  locale="en"
                  today={today}
                  assigneeName={
                    occurrence.task.assigned_to ? staffName(occurrence.task.assigned_to) : null
                  }
                  onPress={() => edit(occurrence)}
                  editable
                />
              ))}
            </OverdueSection>
          )}

          <div className="flex flex-col gap-2">
            {open.map((occurrence) => (
              <ChoreCard
                key={occurrence.key}
                occurrence={occurrence}
                locationName={roomName(occurrence.task.location_id)}
                locale="en"
                today={today}
                assigneeName={
                  occurrence.task.assigned_to ? staffName(occurrence.task.assigned_to) : null
                }
                onPress={() => edit(occurrence)}
                editable
              />
            ))}
            {open.length === 0 && overdue.length === 0 && (
              <p className="text-sm text-muted-foreground">Everything on this day is done.</p>
            )}
          </div>

          {done.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-gray-500">Completed</h3>
              {done.map((occurrence) => (
                // No onPress on a completed chore: its footer holds the proof
                // photos, which are themselves buttons, and a button inside a
                // button is invalid HTML that browsers resolve however they
                // like. The explicit Edit control in the footer is the way in.
                <ChoreCard
                  key={occurrence.key}
                  occurrence={occurrence}
                  locationName={roomName(occurrence.task.location_id)}
                  locale="en"
                  today={today}
                  assigneeName={
                    occurrence.task.assigned_to ? staffName(occurrence.task.assigned_to) : null
                  }
                  footer={
                    <ChoreProof
                      occurrence={occurrence}
                      staffName={staffName}
                      onEdit={() => edit(occurrence)}
                    />
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Opened from the progress strip; open while ?workload= is set. */}
      <StaffWorkloadSheet />

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
 * Who finished a chore and when, plus the owner's way into editing it.
 *
 * The before/after photos used to live here as two small thumbnails; they are
 * part of the card itself now (ChoreProofPhotos, Phase 113).
 */
function ChoreProof({
  occurrence,
  staffName,
  onEdit,
}: {
  occurrence: ChoreOccurrence;
  staffName: (id: string) => string;
  onEdit: () => void;
}) {
  const row = occurrence.row;
  // A completed occurrence always has a row — it is what records the
  // completion — so this is a type guard rather than a real case.
  if (!row) return null;

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      {row.completed_by && (
        <p className="text-[11px] text-muted-foreground">
          Done by {staffName(row.completed_by)}
          {row.completed_at && ` · ${formatTime12h(new Date(row.completed_at))}`}
        </p>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="self-start rounded-lg px-1 py-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 active:bg-muted"
      >
        Edit chore
      </button>
    </div>
  );
}
