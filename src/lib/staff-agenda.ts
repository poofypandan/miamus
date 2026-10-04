import type { AgendaItem } from "@/lib/scheduleEngine";
import type { UnifiedAgendaEntry } from "@/lib/unified-agenda";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { TaskLog } from "@/types/database";

/**
 * Where a vet visit stands (moved out of AgendaGroupCard in Phase 131, so the
 * card and the staff list's Selesai section read it the same way).
 *
 * A visit is two logs against the same schedule: the check-in, then either a
 * check-out or an admission. buildAgenda hands back one log per item, so the
 * pair is read straight from the day's logs.
 */
export function vetVisitState(items: AgendaItem[], logs: TaskLog[]) {
  const scheduleIds = new Set(items.map((i) => i.scheduleId).filter(Boolean));
  const day = items[0]?.log?.completed_at;
  const today = day ? formatDateLocal(new Date(day)) : formatDateLocal(new Date());
  const mine = logs.filter(
    (l) =>
      l.schedule_id &&
      scheduleIds.has(l.schedule_id) &&
      formatDateLocal(new Date(l.completed_at)) === today
  );
  return {
    checkedIn: mine.some((l) => l.sub_type === "check_in"),
    closed: mine.some((l) => l.sub_type === "check_out" || l.sub_type === "admitted"),
    admitted: mine.some((l) => l.sub_type === "admitted"),
  };
}

/**
 * Whether a staff-list entry has nothing left for anyone to do — what moves
 * it into the collapsed Selesai section (Phase 131).
 *
 * Stricter than isEntryDone, which only asks whether every item is logged:
 *   - a vet visit is logged complete at check-in, but stays in the day until
 *     it is closed (the dog came home, or was admitted);
 *   - dogs at the clinic are left out of a routine's count, as the card does,
 *     so the three dogs at home finishing their meal settles it;
 *   - a routine whose dogs are *all* at the clinic is never settled: it stays
 *     in the day, dimmed, saying the round is paused rather than done.
 */
export function isEntrySettled(
  entry: UnifiedAgendaEntry,
  { logs, admittedIds }: { logs: TaskLog[]; admittedIds: Set<string> }
): boolean {
  if (entry.kind === "chore") return entry.occurrence.status === "completed";
  const { group } = entry;
  const isVet = group.category === "vet";
  const active = isVet ? group.items : group.items.filter((i) => !admittedIds.has(i.entityId));
  if (active.length === 0) return false;
  if (!active.every((i) => i.status === "completed")) return false;
  if (!isVet) return true;
  const visit = vetVisitState(group.items, logs);
  return !visit.checkedIn || visit.closed;
}
