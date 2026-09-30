import { dayKeyLabel } from "@/lib/date-label";
import { batchDates, type ProposalBatch } from "@/lib/proposal-batches";
import { formatDateLocal } from "@/lib/scheduleEngine";

export interface ApprovalDateSummary {
  /** Ready to render, e.g. "Tomorrow", "Oct 24", "Daily until Nov 2". */
  text: string;
  /** True once even the last day has gone — see below. */
  past: boolean;
}

/**
 * The days a proposal batch is asking for, in the owner's words (Phase 98).
 *
 * The approval queue used to show a title, a pet and a time and no date at
 * all, which made the one question the owner is actually being asked — *when* —
 * the one thing the card didn't answer. A 9:00 AM vet visit is a very
 * different decision tomorrow than it is in three weeks.
 *
 * English, because only the owner decides on proposals (the Phase 46 language
 * boundary); the staff-side list of the same batches keeps its own Indonesian
 * copy. Relative where relative helps and absolute otherwise, via the same
 * dayLabel the date ribbon uses, so "Today" means one thing across the app.
 *
 * `today` is passed in rather than read from the clock so the caller can hold
 * it in state and re-evaluate it when the day rolls over (see useToday) — and
 * so this is testable without mocking time.
 *
 * Returns null for a proposal filed before the Phase 62 migration, which has
 * no scheduled_date to show; the card then reads exactly as it did before
 * rather than inventing a day nobody chose.
 */
export function approvalDateSummary(
  batch: ProposalBatch,
  today: Date
): ApprovalDateSummary | null {
  const days = batchDates(batch);
  if (days.length === 0) return null;

  const first = days[0];
  const last = days[days.length - 1];
  const label = (key: string) => dayKeyLabel(key, today);

  // Past only once the *last* day has gone, so a grooming series that started
  // last week but runs into next month is not written off as expired. Worth
  // surfacing rather than quietly labelling: approval pins the schedule to
  // these days (created_at and expires_at both, for a one-off), so approving a
  // lapsed request writes a routine that has already expired and no staff
  // phone will ever show it.
  const past = last < formatDateLocal(today);

  // A medication course's scheduled_date is its last day rather than a day it
  // happens — it becomes expires_at on approval, and the course runs daily up
  // to it. Left as a bare "Oct 24" it would read as a single visit.
  if (batch.proposals[0].category === "medication") {
    return { text: `Daily until ${label(last)}`, past };
  }

  // One day for a vet visit or a one-off; several for a grooming series, which
  // files one proposal per occurrence.
  return { text: first === last ? label(first) : `${label(first)} – ${label(last)}`, past };
}
