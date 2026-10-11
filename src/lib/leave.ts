import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import type { LeaveFallbackAction, LeaveRequest } from "@/types/database";

/**
 * Leave ("Cuti") and what it does to chores (Phase 140; migrations/108).
 *
 * THE INTERCEPTOR. Chores are not generated ahead of time: a repeat is one
 * template row, and expandChores (lib/chore-recurrence.ts) works out its days
 * on the device. So this is applied right after that expansion, in the two
 * hooks that call it (useChoreOccurrences, useAgendaWeek) — every list, both
 * views, the week grid and the completion strip see the same triaged chores.
 *
 * For a pending occurrence whose assignee is on approved leave that day:
 *
 *   reassign  shown, claimed and completed as the cover person's
 *   unassign  shown as "anyone"
 *   pause     not shown at all — including as a carried-over chore after the
 *             person returns: a paused day was skipped, not postponed
 *
 * Done chores are history and left alone. Nothing is written to the chore
 * rows, so leave ending — on its last day or early — needs no undoing: the
 * next render simply stops applying it. When someone acts on a covered
 * occurrence, the row it materialises is filed under the triaged assignee
 * (see FinishChoreSheet), so the record matches what was on screen.
 */

/**
 * How far back leave is loaded. A paused one-off chore keeps rolling over
 * until someone does it, so the leave that paused it has to stay in view for
 * as long as such a chore plausibly lingers; the rows are tiny.
 */
export const LEAVE_LOOKBACK_DAYS = 180;

/** The leave that takes `staffId` out on `date`, if any. */
export function leaveCovering(
  leaves: LeaveRequest[],
  staffId: string | null | undefined,
  date: string
): LeaveRequest | null {
  if (!staffId) return null;
  for (const leave of leaves) {
    if (leave.staff_id !== staffId) continue;
    if (leave.status !== "approved" && leave.status !== "ended_early") continue;
    if (date < leave.start_date || date > leave.end_date) continue;
    // Back early: covered only up to the day before they returned.
    if (leave.ended_on && date >= leave.ended_on) continue;
    return leave;
  }
  return null;
}

export function isOnLeave(leaves: LeaveRequest[], staffId: string, date: string): boolean {
  return leaveCovering(leaves, staffId, date) !== null;
}

/** Covered by someone on leave — what the card can say about why. */
export interface LeaveCover {
  /** Who is away. */
  absentStaffId: string;
  action: LeaveFallbackAction;
}

export type TriagedOccurrence = ChoreOccurrence & { leaveCover?: LeaveCover };

export function applyLeaveTriage(
  occurrences: ChoreOccurrence[],
  leaves: LeaveRequest[]
): TriagedOccurrence[] {
  if (leaves.length === 0) return occurrences;
  const result: TriagedOccurrence[] = [];
  for (const occurrence of occurrences) {
    const absent = occurrence.task.assigned_to;
    const leave = occurrence.status === "pending" ? leaveCovering(leaves, absent, occurrence.date) : null;
    if (!leave || !absent) {
      result.push(occurrence);
      continue;
    }
    // An approved request always has an action (migrations/108); a reassign
    // whose cover person has since left the roster falls back to "anyone"
    // rather than to nobody.
    const action = leave.fallback_action ?? "unassign";
    if (action === "pause") continue;
    const coverId =
      action === "reassign" && leave.fallback_assignee_id ? leave.fallback_assignee_id : null;
    result.push({
      ...occurrence,
      task: { ...occurrence.task, assigned_to: coverId },
      leaveCover: { absentStaffId: absent, action: coverId ? "reassign" : "unassign" },
    });
  }
  return result;
}

/** The current person's own request worth showing in Action Mode, if any. */
export function ownLeaveStatus(
  leaves: LeaveRequest[],
  staffId: string | null,
  today: string
): { kind: "away"; leave: LeaveRequest } | { kind: "pending"; leave: LeaveRequest } | null {
  if (!staffId) return null;
  const away = leaveCovering(leaves, staffId, today);
  if (away && away.status === "approved") return { kind: "away", leave: away };
  const pending = leaves.find(
    (l) => l.staff_id === staffId && l.status === "pending" && l.end_date >= today
  );
  return pending ? { kind: "pending", leave: pending } : null;
}

/** Where an admin approves or rejects a request: the WhatsApp deep link. */
export function leaveApprovalPath(id: string): string {
  return `/dashboard/leave/${id}`;
}

/** Inclusive length of a request, in days. */
export function leaveDays(leave: Pick<LeaveRequest, "start_date" | "end_date">): number {
  const ms = Date.parse(`${leave.end_date}T00:00:00Z`) - Date.parse(`${leave.start_date}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/** "12 Okt – 14 Okt" / "12 Oct – 14 Oct", or one date for a single day. */
export function formatLeaveRange(
  leave: Pick<LeaveRequest, "start_date" | "end_date">,
  locale: "en" | "id"
): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
      day: "numeric",
      month: "short",
    });
  return leave.start_date === leave.end_date
    ? fmt(leave.start_date)
    : `${fmt(leave.start_date)} – ${fmt(leave.end_date)}`;
}

/**
 * The people a chore can be given to, for a dropdown (Phase 140): yourself
 * first, anyone on leave on `date` last and marked "[On Leave]", so nobody
 * hands a one-off to someone who is away by accident.
 */
export function assigneeOptions<P extends { id: string; name: string; user_id?: string | null }>(
  profiles: P[],
  opts: { selfId?: string | null; leaves: LeaveRequest[]; date: string; exclude?: string }
): { profile: P; label: string; onLeave: boolean }[] {
  const rank = (o: { profile: P; onLeave: boolean }) =>
    o.onLeave ? 2 : o.profile.id === opts.selfId ? 0 : 1;
  return profiles
    .filter((p) => p.id !== opts.exclude)
    .map((profile) => {
      const onLeave = isOnLeave(opts.leaves, profile.id, opts.date);
      const base =
        profile.id === opts.selfId
          ? `${profile.name} (me)`
          : profile.user_id
            ? `${profile.name} · Admin`
            : profile.name;
      return { profile, onLeave, label: onLeave ? `${base} [On Leave]` : base };
    })
    .sort((a, b) => rank(a) - rank(b));
}
