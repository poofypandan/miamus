"use client";

import { AlertTriangle, CheckCircle2, Eye, Repeat } from "lucide-react";
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

  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm active:bg-muted/60",
        // Amber is this app's "needs a decision" tint, and supervision is
        // exactly that — the owner has to turn up for it.
        supervised && !done && "border-amber-200 bg-amber-50"
      )}
    >
      <span
        className={cn(
          "w-16 shrink-0 font-mono text-xs",
          supervised && !done ? "text-zinc-600" : "text-muted-foreground"
        )}
      >
        {/* Untimed chores say so rather than borrowing a clock they do not
            have; they already sort below the timed run. */}
        {task.due_time ? formatTime12h(task.due_time) : "Anytime"}
      </span>

      <Icon className={cn("size-4 shrink-0", done ? "text-muted-foreground" : "text-zinc-500")} />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate font-medium", done && "text-muted-foreground line-through")}>
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

      {done && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
    </button>
  );
}
