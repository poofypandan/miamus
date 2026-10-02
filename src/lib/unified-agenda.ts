import { startOfWeek } from "date-fns";
import { compareOccurrences, type ChoreOccurrence } from "@/lib/chore-recurrence";
import type { AgendaGroup } from "@/lib/scheduleEngine";

/** How many days the Agenda's Week view shows. */
export const AGENDA_WEEK_DAYS = 7;

/**
 * The Sunday that starts the calendar week `date` is in (Phase 115). The
 * Week view shows Sunday to Saturday, the way a wall calendar does, rather
 * than Phase 112's rolling "selected day and the six after it" — a week that
 * started wherever the reader last tapped never looked the same twice.
 */
export function weekStartOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 0 });
}

/**
 * One row of the unified Agenda: either a pet routine block or a household
 * chore (Phase 100).
 *
 * A discriminated union rather than a common shape both are flattened into.
 * The two are genuinely different things — a routine block is several dogs'
 * instances of the same task at the same minute, a chore is one job for one
 * person — and squashing them into a shared interface would mean every
 * renderer unpicking it again at the other end.
 */
export type UnifiedAgendaEntry =
  | { kind: "routine"; key: string; time: string; group: AgendaGroup }
  | { kind: "chore"; key: string; time: string | null; occurrence: ChoreOccurrence };

/**
 * Both halves of the day, in the order they happen — after the anytime chores.
 *
 * Anytime chores (no due_time) lead the day (Phase 112). They used to sink to
 * the bottom on the theory that "sometime today" is less urgent than anything
 * with a clock against it, but the bottom of a long day is below the fold, and
 * a job that can be done whenever is exactly the one people pick up in a free
 * moment — if they can see it. Timed entries then follow in clock order.
 *
 * Within the same minute a pet routine comes first. Dogs before housework is
 * the house rule everywhere else in this app (the staff view has always
 * stacked chores under the agenda), and a tie has to break somewhere.
 *
 * Finished entries sink below everything still open (Phase 114), in the same
 * anytime-then-clock order among themselves. Left in their slot, a morning's
 * done work sat between the reader and what was left; at the bottom it is
 * still there to check, just no longer in the way. (Overdue chores are lifted
 * out above all of this by splitOverdue.)
 */
export function buildUnifiedAgenda(params: {
  groups: AgendaGroup[];
  chores: ChoreOccurrence[];
}): UnifiedAgendaEntry[] {
  const { groups, chores } = params;

  const entries: UnifiedAgendaEntry[] = [
    ...groups.map((group) => ({
      kind: "routine" as const,
      // The same key the staff and owner feeds already used for a group.
      key: `routine|${group.time}|${group.title}|${group.items[0]?.entityId ?? ""}`,
      time: group.time,
      group,
    })),
    ...chores.map((occurrence) => ({
      kind: "chore" as const,
      key: `chore|${occurrence.key}`,
      time: occurrence.task.due_time ?? null,
      occurrence,
    })),
  ];

  return entries.sort((a, b) => {
    const doneA = isEntryDone(a);
    if (doneA !== isEntryDone(b)) return doneA ? 1 : -1;
    if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
    if (!a.time && b.time) return -1;
    if (a.time && !b.time) return 1;
    if (a.kind !== b.kind) return a.kind === "routine" ? -1 : 1;
    if (a.kind === "chore" && b.kind === "chore") {
      return compareOccurrences(a.occurrence, b.occurrence);
    }
    return 0;
  });
}

/**
 * Whether an entry needs nobody any more: a chore marked done, or a routine
 * every dog in it has been through.
 */
export function isEntryDone(entry: UnifiedAgendaEntry): boolean {
  if (entry.kind === "chore") return entry.occurrence.status === "completed";
  const { items } = entry.group;
  return items.length > 0 && items.every((item) => item.status === "completed");
}

/**
 * Today's rolled-over chores, lifted out of the timeline (Phase 113).
 *
 * They used to sit in it at their old time, marked "carried over" — which put
 * a chore three days late anywhere from the top to the bottom of today's list
 * depending on when it was first due. They now lead the day under their own
 * Overdue header, oldest first; `rest` keeps the usual order. Only ever
 * non-empty on today: expandChores rolls nothing onto any other day.
 */
export function splitOverdue<T extends UnifiedAgendaEntry>(
  entries: T[]
): { overdue: T[]; rest: T[] } {
  const isOverdue = (entry: T) =>
    entry.kind === "chore" && entry.occurrence.overdue && entry.occurrence.status !== "completed";
  return {
    overdue: entries
      .filter(isOverdue)
      .sort((a, b) =>
        a.kind === "chore" && b.kind === "chore"
          ? a.occurrence.date.localeCompare(b.occurrence.date)
          : 0
      ),
    rest: entries.filter((entry) => !isOverdue(entry)),
  };
}
