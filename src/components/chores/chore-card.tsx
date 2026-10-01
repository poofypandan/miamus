"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Eye, Repeat, UserRound, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  categoryClass,
  categoryIcon,
  categoryLabel,
} from "@/lib/household-tasks";
import {
  RECURRENCE_LABELS_EN,
  RECURRENCE_LABELS_ID,
  recurrenceOf,
  type ChoreOccurrence,
} from "@/lib/chore-recurrence";
import { dayKeyLabel } from "@/lib/date-label";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";

// Both views render the same card, so the two dictionaries live together and
// cannot drift — the Phase 46 language boundary is a difference in wording,
// not a reason for two components that then diverge in behaviour.
const COPY = {
  en: {
    anytime: "Anytime today",
    unassigned: "Anyone",
    forYou: "For you",
    supervision: "Owner must be present",
    done: "Done",
    overdue: (label: string) => `Carried over from ${label}`,
  },
  id: {
    anytime: "Kapan saja hari ini",
    unassigned: "Semua Petugas",
    forYou: "Untuk Kamu",
    supervision: "Tunggu Pemilik",
    done: "Selesai",
    overdue: (label: string) => `Belum selesai dari ${label}`,
  },
} as const;

/**
 * One chore on one day, as both the owner's dashboard and a staff phone draw
 * it (Phase 100).
 *
 * Presentational only: every action belongs to whoever rendered it and arrives
 * through `footer`. That is what lets the staff view hand it a "Selesaikan"
 * button and the owner's hand it nothing at all, without this component
 * knowing which of them it is inside — the owner/staff capability split is a
 * property of the caller, not something re-decided here.
 */
export function ChoreCard({
  occurrence,
  locale,
  assigneeName,
  onPress,
  footer,
  today,
}: {
  occurrence: ChoreOccurrence;
  locale: "en" | "id";
  /** Resolved by the caller, which owns the staff roster. */
  assigneeName?: string | null;
  /** Makes the whole card tappable — the owner's way into the editor. */
  onPress?: () => void;
  footer?: ReactNode;
  /** For the "carried over from …" label; defaults to the real today. */
  today?: Date;
}) {
  const t = COPY[locale];
  const { task, status, overdue } = occurrence;
  const CategoryIcon = categoryIcon(task.category);
  const recurrence = recurrenceOf(occurrence.template);
  const supervised = !!task.requires_supervision;
  const done = status === "completed";

  const body = (
    <>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-sm font-medium break-words",
              done && "text-muted-foreground line-through"
            )}
          >
            {task.title}
          </span>
          {task.notes && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{task.notes}</span>
          )}
        </span>
        {done && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={cn("h-5 gap-1 px-1.5 text-[10px]", categoryClass(task.category))}>
          <CategoryIcon className="size-3" />
          {categoryLabel(task.category, locale)}
        </Badge>

        <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
          <Clock className="size-3" />
          {task.due_time ? formatTime12h(task.due_time) : t.anytime}
        </Badge>

        <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-normal">
          {task.assigned_to ? (
            <>
              <UserRound className="size-3" /> {assigneeName ?? t.forYou}
            </>
          ) : (
            <>
              <Users className="size-3" /> {t.unassigned}
            </>
          )}
        </Badge>

        {recurrence !== "none" && (
          <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-normal">
            <Repeat className="size-3" />
            {(locale === "en" ? RECURRENCE_LABELS_EN : RECURRENCE_LABELS_ID)[recurrence]}
          </Badge>
        )}

        {/* Amber, the app's warning tint — this is the one badge that changes
            what a staff member should do: wait, rather than start. */}
        {supervised && (
          <Badge className="h-5 gap-1 bg-amber-100 px-1.5 text-[10px] text-amber-900">
            <Eye className="size-3" />
            {t.supervision}
          </Badge>
        )}
      </div>

      {/* Only ever shown on today's list, where it is the explanation for a
          chore whose own date has passed (see expandChores). */}
      {overdue && !done && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
          <AlertTriangle className="size-3 shrink-0" />
          {t.overdue(dayKeyLabel(occurrence.date, today))}
        </p>
      )}

      {footer}
    </>
  );

  const className = cn(
    "flex w-full flex-col gap-2 rounded-xl border p-3 text-left",
    done
      ? "border-border bg-muted/40"
      : supervised
        ? "border-amber-200 bg-amber-50"
        : overdue
          ? "border-amber-200 bg-white"
          : "border-border bg-card"
  );

  if (!onPress) return <div className={className}>{body}</div>;

  return (
    <button type="button" onClick={onPress} className={cn(className, "active:bg-muted/60")}>
      {body}
    </button>
  );
}
