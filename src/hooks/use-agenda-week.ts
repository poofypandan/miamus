"use client";

import { useMemo } from "react";
import { addDays } from "date-fns";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import { expandChores, occurrencesForStaff } from "@/lib/chore-recurrence";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import {
  AGENDA_WEEK_DAYS,
  buildUnifiedAgenda,
  type UnifiedAgendaEntry,
} from "@/lib/unified-agenda";

export interface AgendaDay {
  /** YYYY-MM-DD. */
  date: string;
  day: Date;
  entries: UnifiedAgendaEntry[];
}

/**
 * The Agenda's Week view (Phase 112): the selected day and the six after it,
 * each built exactly as the Day view builds one day — pet routines from the
 * schedules, chores expanded from the rows, merged and sorted with anytime
 * chores on top.
 *
 * `staffId` narrows chores the way the staff Day view does (their own plus
 * the unclaimed); leave it undefined for the owner, who sees everything. The
 * rows for all seven days are already loaded: the context fetches the week
 * whichever view is showing.
 */
export function useAgendaWeek(start: Date, staffId?: string | null): AgendaDay[] {
  const { pets, schedules, logs, householdTasks } = useHousehold();
  const todayStr = formatDateLocal(useToday());
  const startStr = formatDateLocal(start);

  return useMemo(() => {
    const first = new Date(`${startStr}T00:00:00`);
    return Array.from({ length: AGENDA_WEEK_DAYS }, (_, offset) => {
      const day = addDays(first, offset);
      const date = formatDateLocal(day);
      const groups = buildAgenda({ date, entities: pets, schedules, logs });
      const all = expandChores({ rows: householdTasks, date, today: todayStr });
      const chores = staffId ? occurrencesForStaff(all, staffId) : all;
      return { date, day, entries: buildUnifiedAgenda({ groups, chores }) };
    });
  }, [startStr, pets, schedules, logs, householdTasks, todayStr, staffId]);
}
