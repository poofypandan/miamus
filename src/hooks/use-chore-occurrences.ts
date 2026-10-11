"use client";

import { useMemo } from "react";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import { expandChores, type ChoreOccurrence } from "@/lib/chore-recurrence";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { applyLeaveTriage } from "@/lib/leave";

/**
 * The chores the household owes on the day being browsed (Phase 100).
 *
 * The context holds rows; this turns them into occurrences. Both views read
 * through here so a repeat, a carried-over chore and a finished one mean the
 * same thing on the owner's dashboard and on a staff phone — the owner
 * deciding a chore is done and the staff member who did it must never be
 * looking at two different lists.
 *
 * `today` comes from useToday rather than the clock, so a phone left open
 * overnight re-expands against the new day instead of still calling yesterday
 * "today" and hiding everything that carried over.
 *
 * Leave is applied here too (Phase 140; lib/leave.ts): a chore whose owner is
 * away comes out reassigned, unassigned or paused, for both views alike.
 */
export function useChoreOccurrences(): ChoreOccurrence[] {
  const { householdTasks, selectedDate, leaveRequests } = useHousehold();
  const today = useToday();
  const dateStr = formatDateLocal(selectedDate);
  const todayStr = formatDateLocal(today);

  return useMemo(
    () =>
      applyLeaveTriage(
        expandChores({ rows: householdTasks, date: dateStr, today: todayStr }),
        leaveRequests
      ),
    [householdTasks, dateStr, todayStr, leaveRequests]
  );
}
