import { compareOccurrences, type ChoreOccurrence } from "@/lib/chore-recurrence";
import type { AgendaGroup } from "@/lib/scheduleEngine";

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
 * Both halves of the day, in the order they happen.
 *
 * Untimed chores sink to the bottom: "sometime today" is genuinely less urgent
 * than anything with a clock against it, and sorting it as 00:00 would put the
 * vaguest item of the day above the 6am feed.
 *
 * Within the same minute a pet routine comes first. Dogs before housework is
 * the house rule everywhere else in this app (the staff view has always
 * stacked chores under the agenda), and a tie has to break somewhere.
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
    if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    if (a.kind !== b.kind) return a.kind === "routine" ? -1 : 1;
    if (a.kind === "chore" && b.kind === "chore") {
      return compareOccurrences(a.occurrence, b.occurrence);
    }
    return 0;
  });
}
