"use client";

import { useMemo } from "react";
import { addDays } from "date-fns";
import { useHousehold } from "@/context/household-context";
import { categorizeSchedule } from "@/lib/schedule-categories";
import { formatDateLocal, isScheduleActiveOn } from "@/lib/scheduleEngine";

/** How far ahead the ribbon badges look. */
export const SPECIAL_EVENT_HORIZON_DAYS = 30;

// Grooming visits and one-offs only.
//
// Meals and the potty routine run every day for every dog, so badging them
// would mark every square and say nothing. Medication was dropped for the same
// reason in practice: a course runs daily for its whole duration, so a week of
// antibiotics badged the entire week and drowned out the occasional visit the
// dot is meant to flag.
//
// "temporary" is this codebase's id for the "Others" category (see
// ScheduleCategory in lib/schedule-categories) — there is no "other".
const SPECIAL_CATEGORIES = new Set(["grooming", "temporary", "vet"]);

/**
 * Dates within the horizon that carry at least one non-routine event, as
 * "YYYY-MM-DD" strings.
 *
 * Reuses isScheduleActiveOn — the same predicate buildAgenda uses to decide
 * whether a schedule applies to a given day — rather than re-deriving the rule
 * from created_at/expires_at here. That matters for generated grooming rows,
 * which are single occurrences pinned to one day via an explicit future
 * created_at; a naive "is it between start and end" check would light up every
 * day in the range instead of the one the visit actually falls on.
 */
export function useSpecialEventDates(start: Date): Set<string> {
  const { schedules } = useHousehold();
  const startStr = formatDateLocal(start);

  return useMemo(() => {
    const special = schedules.filter((s) => SPECIAL_CATEGORIES.has(categorizeSchedule(s)));
    const dates = new Set<string>();
    if (special.length === 0) return dates;

    // Walks days rather than schedules because a medication course spans many
    // days from one row; the horizon caps the work at 30 iterations.
    for (let offset = 0; offset < SPECIAL_EVENT_HORIZON_DAYS; offset++) {
      const dateStr = formatDateLocal(addDays(start, offset));
      if (special.some((s) => isScheduleActiveOn(s, dateStr))) dates.add(dateStr);
    }
    return dates;
    // startStr, not the Date object: a new Date instance every render would
    // rebuild this set on every render even when the day hasn't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, startStr]);
}
