"use client";

import { AlertTriangle, CheckCircle2, Eye, Repeat } from "lucide-react";
import { AGENDA_TONES } from "@/lib/agenda-tones";
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
 * Owner-facing, so English, and tappable: the owner's way into the editor.
 */
const COPY = {
  en: { anytime: "Anytime", anyone: "Anyone", carried: "carried over" },
  // The staff Week view (Phase 112).
  id: { anytime: "Kapan saja", anyone: "Semua Petugas", carried: "belum selesai" },
} as const;

export function ChoreTimelineRow({
  occurrence,
  assigneeName,
  onPress,
  locale = "en",
}: {
  occurrence: ChoreOccurrence;
  assigneeName?: string | null;
  onPress: () => void;
  locale?: "en" | "id";
}) {
  const t = COPY[locale];
  const { task, status, overdue } = occurrence;
  const Icon = categoryIcon(task.category);
  const done = status === "completed";
  const supervised = !!task.requires_supervision;
  const repeats = recurrenceOf(occurrence.template) !== "none";

  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm active:bg-muted/60",
        // Amber marks every open chore (Phase 112's three tones), so the house
        // reads apart from the dogs at a glance. A finished one drops back to
        // neutral: it no longer needs anyone's eye.
        !done && AGENDA_TONES.chore.tint
      )}
    >
      <span
        className={cn(
          "w-16 shrink-0 font-mono text-xs",
          // A shade darker on the tint: muted grey falls under 4.5:1 there.
          !done ? "text-zinc-600" : "text-muted-foreground"
        )}
      >
        {/* Untimed chores say so rather than borrowing a clock they do not
            have; they sort to the top of the day (see buildUnifiedAgenda). */}
        {task.due_time ? formatTime12h(task.due_time) : t.anytime}
      </span>

      <Icon
        className={cn("size-4 shrink-0", done ? "text-muted-foreground" : AGENDA_TONES.chore.icon)}
      />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate font-medium", done && "text-muted-foreground line-through")}>
          {task.title}
        </span>
        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          {assigneeName ?? t.anyone}
          {repeats && <Repeat className="size-3 shrink-0" />}
          {supervised && <Eye className="size-3 shrink-0 text-amber-700" />}
          {overdue && !done && (
            <>
              <AlertTriangle className="size-3 shrink-0 text-amber-700" />
              <span className="text-amber-700">{t.carried}</span>
            </>
          )}
        </span>
      </span>

      {done && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
    </button>
  );
}
