"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { DateRibbon } from "@/components/date-ribbon";
import { ChoreCard } from "@/components/chores/chore-card";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { useHousehold } from "@/context/household-context";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import { photoSrc } from "@/lib/photos";
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
  const { selectedDate, setSelectedDate } = useHousehold();
  const { profiles } = useStaffProfiles();
  // Default fallback ("Staff"), not "Unassigned": the two null cases mean
  // different things. An absent assigned_to is genuinely unassigned and is
  // spelled out on the badge; an id this roster cannot resolve — a profile
  // still loading — is a name we don't have, not an empty chore.
  const staffName = useStaffNameLookup(profiles);
  const occurrences = useChoreOccurrences();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);

  const [editing, setEditing] = useState<HouseholdTask | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const { open, done } = useMemo(
    () => ({
      open: occurrences.filter((o) => o.status !== "completed"),
      done: occurrences.filter((o) => o.status === "completed"),
    }),
    [occurrences]
  );

  function edit(occurrence: ChoreOccurrence) {
    // A repeat is edited through its template from whichever day you tapped;
    // an occurrence that already has its own row edits that row.
    setEditing(occurrence.row ?? occurrence.template);
    setEditorOpen(true);
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6">
      <DateRibbon value={selectedDate} onChange={setSelectedDate} locale="en" />

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Chores</h2>
        <Button
          variant="outline"
          className="min-h-[36px] shrink-0 px-3 text-xs"
          onClick={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="size-3.5" /> Add Chore
        </Button>
      </div>

      {occurrences.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No chores on this day"
          description="Add one and it appears on every staff phone straight away."
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
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {open.map((occurrence) => (
              <ChoreCard
                key={occurrence.key}
                occurrence={occurrence}
                locale="en"
                today={today}
                assigneeName={
                  occurrence.task.assigned_to ? staffName(occurrence.task.assigned_to) : null
                }
                onPress={() => edit(occurrence)}
              />
            ))}
            {open.length === 0 && (
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

      <ChoreEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        task={editing}
        defaultDate={dateStr}
      />
    </div>
  );
}

/**
 * What came back from a finished chore: who did it, when, and the before/after
 * pair (Phase 100).
 *
 * Falls back to `photo_url` when there is no after shot, which is every chore
 * completed before this phase — those rows carry a single proof photo and it
 * is still the evidence, so it shows in the "after" slot rather than being
 * quietly dropped from the record.
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
  const [lightbox, setLightbox] = useState<number | null>(null);
  // A completed occurrence always has a row — it is what records the
  // completion — so this is a type guard rather than a real case.
  if (!row) return null;

  const after = row.after_photo_url ?? row.photo_url;
  const shots = [
    { url: row.before_photo_url, label: "Before" },
    { url: after, label: "After" },
  ].filter((s): s is { url: string; label: string } => !!s.url);

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      {row.completed_by && (
        <p className="text-[11px] text-muted-foreground">
          Done by {staffName(row.completed_by)}
          {row.completed_at && ` · ${formatTime12h(new Date(row.completed_at))}`}
        </p>
      )}
      {shots.length > 0 && (
        <div className="flex gap-2">
          {shots.map((shot, index) => (
            <button
              key={shot.label}
              type="button"
              onClick={() => setLightbox(index)}
              className="flex flex-col gap-1"
            >
              <span className="text-[10px] font-medium text-muted-foreground">{shot.label}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoSrc(shot.url, 160)}
                alt={`${shot.label}: ${occurrence.task.title}`}
                loading="lazy"
                decoding="async"
                className="size-20 rounded-lg object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onEdit}
        className="self-start rounded-lg px-1 py-1 text-[11px] font-medium text-muted-foreground underline underline-offset-2 active:bg-muted"
      >
        Edit chore
      </button>

      <PhotoLightbox
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        initialIndex={lightbox ?? 0}
        items={shots.map((shot) => ({
          src: shot.url,
          alt: `${shot.label}: ${occurrence.task.title}`,
          title: occurrence.task.title,
          description: <span>{shot.label}</span>,
        }))}
      />
    </div>
  );
}
