"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, Repeat } from "lucide-react";
import { ChoreReviewLightbox, choreProofShots } from "@/components/chores/chore-proof-photos";
import { photoSrc } from "@/lib/photos";
import { AGENDA_TONES, DONE_TONE } from "@/lib/agenda-tones";
import { categoryIcon } from "@/lib/household-tasks";
import { recurrenceOf, type ChoreOccurrence } from "@/lib/chore-recurrence";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * A chore as a row of the owner's Agenda, shaped to match TimelineRow (Phase
 * 100) — same time gutter, same icon column, same density.
 *
 * The point of the unified Agenda is that the dogs and the house read as one
 * day, which only works if the two kinds of row look like they belong to the
 * same list. A chore rendered as a bordered card between timeline rows would
 * announce the seam this phase exists to remove.
 *
 * Owner-facing, so English, and tappable — with an intent that depends on
 * the chore's state (Phase 129):
 *   open      → the editor: the owner is managing the schedule;
 *   completed → the proof gallery: the owner is reviewing the work. The
 *               before/after shots sit on the row itself, as a finished pet
 *               routine's photo does on its row, and a tap opens them full
 *               screen with their times and the span between (Phase 126).
 * Editing a chore that is finished today is done from the Chores tab.
 */
export function ChoreTimelineRow({
  occurrence,
  assigneeName,
  onPress,
}: {
  occurrence: ChoreOccurrence;
  assigneeName?: string | null;
  onPress: () => void;
}) {
  const { task, status, overdue } = occurrence;
  const Icon = categoryIcon(task.category);
  const done = status === "completed";
  const supervised = !!task.requires_supervision;
  const repeats = recurrenceOf(occurrence.template) !== "none";
  const [reviewing, setReviewing] = useState(false);

  // The proof, when this day's row carries any: only a completed occurrence
  // can, and only it is reviewed rather than edited.
  const proof = done && occurrence.row ? choreProofShots(occurrence.row, "en") : null;
  const shots = proof?.shots ?? [];

  function handlePress() {
    if (!done) {
      onPress();
      return;
    }
    // Never the editor for a finished chore, even one with nothing to show:
    // completions from before photos existed simply have none.
    if (shots.length === 0) {
      toast("No photos were saved for this chore");
      return;
    }
    setReviewing(true);
  }

  return (
    <>
    <button
      type="button"
      onClick={handlePress}
      aria-label={done && shots.length > 0 ? `Review photos: ${task.title}` : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm active:bg-muted/60",
        // Amber marks every open chore (Phase 112's three tones), so the house
        // reads apart from the dogs at a glance. A finished one turns the
        // staff view's green (Phase 114) and sinks to the bottom of the day.
        // pl-1.5: the 3px edge less the usual 1px, so text stays in line.
        done ? cn(DONE_TONE.tint, AGENDA_TONES.chore.doneEdge, "pl-1.5") : AGENDA_TONES.chore.tint
      )}
    >
      <span
        className={cn(
          "w-16 shrink-0 font-mono text-xs",
          // A shade darker on a tint: muted grey falls under 4.5:1 there.
          "text-zinc-600"
        )}
      >
        {/* Untimed chores say so rather than borrowing a clock they do not
            have; they sort to the top of the day (see buildUnifiedAgenda). */}
        {task.due_time ? formatTime12h(task.due_time) : "Anytime"}
      </span>

      <Icon
        // Amber even when done (Phase 132), with the row's amber edge: the
        // house stays recognisable as the house among finished dog routines.
        className={cn("size-4 shrink-0", AGENDA_TONES.chore.icon)}
      />

      <span className="flex min-w-0 flex-1 flex-col">
        {/* No strikethrough (Phase 131) — the green row and photos say done. */}
        <span className={cn("truncate font-medium", done && "text-muted-foreground")}>
          {task.title}
        </span>
        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          {assigneeName ?? "Anyone"}
          {repeats && <Repeat className="size-3 shrink-0" />}
          {supervised && <Eye className="size-3 shrink-0 text-amber-700" />}
          {overdue && !done && (
            <>
              <AlertTriangle className="size-3 shrink-0 text-amber-700" />
              <span className="text-amber-700">carried over</span>
            </>
          )}
        </span>
      </span>

      {done &&
        (shots.length > 0 ? (
          // The pet rows' thumbnail, before then after: same 48px rounded
          // square, same ring, so a finished chore and a finished routine
          // read as the same kind of thing. Plain images, not buttons — the
          // whole row is the button.
          <span className="flex shrink-0 gap-1">
            {shots.map((shot) => (
              <span
                key={shot.label}
                className="relative size-12 overflow-hidden rounded-xl ring-2 ring-background"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc(shot.url, 160)}
                  alt={shot.label}
                  loading="lazy"
                  decoding="async"
                  // Pinned and centred, as on the Chores tab (Phase 128).
                  className="absolute inset-0 size-full object-cover object-center"
                />
              </span>
            ))}
          </span>
        ) : (
          <span className={cn("flex shrink-0 items-center gap-1 text-xs font-medium", DONE_TONE.icon)}>
            <CheckCircle2 className="size-4" /> Done
          </span>
        ))}
    </button>

    {done && (
      <ChoreReviewLightbox
        row={occurrence.row}
        open={reviewing}
        onClose={() => setReviewing(false)}
      />
    )}
    </>
  );
}
