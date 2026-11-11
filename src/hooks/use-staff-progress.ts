"use client";

import { useMemo } from "react";
import { useHousehold } from "@/context/household-context";
import { useChoreOccurrences } from "@/hooks/use-chore-occurrences";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useTaskExceptions } from "@/hooks/use-task-exceptions";
import { useToday } from "@/hooks/use-today";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { isAdmitted } from "@/lib/pets";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import { buildStaffProgress, type StaffProgress } from "@/lib/staff-progress";

/**
 * Staff progress for the day being browsed (lib/staff-progress): the owner's
 * rows on Today, the person sheet behind them, and a staff phone's own line.
 *
 * Reads only what the phone already holds (the household snapshot, the
 * roster, the couldn't-do records and the Features switches), so a staff
 * phone fetches nothing new for it. `petsOn` comes from the caller: Today
 * already holds the household's answer, and a staff phone, which never reads
 * it, has no pets to count once Pets is off (it can only go off with no pets
 * left, Phase 162). Null until the roster has loaded, so nobody is shown as missing.
 * Ticks each minute while it shows today, so a task turns late on a screen
 * left open.
 */
export function useStaffProgress({ petsOn = true }: { petsOn?: boolean } = {}): StaffProgress | null {
  const { pets, schedules, logs, leaveRequests, selectedDate } = useHousehold();
  const chores = useChoreOccurrences();
  const { exceptions } = useTaskExceptions();
  const { profiles } = useStaffProfiles();
  const today = useToday();
  const date = formatDateLocal(selectedDate);
  const todayKey = formatDateLocal(today);
  const clock = useMinuteClock(date === todayKey);
  // Features switches (Phase 171): Pets off, no pet counts; Repairs off, no busy line.
  const { repairs: repairsOn } = useHouseholdFeatures();

  const groups = useMemo(
    () => buildAgenda({ date, entities: pets, schedules, logs }),
    [date, pets, schedules, logs]
  );

  return useMemo(() => {
    if (!profiles) return null;
    const now = new Date(clock);
    return buildStaffProgress({
      date,
      today: todayKey,
      nowMinutes: now.getHours() * 60 + now.getMinutes(),
      chores,
      groups,
      exceptions,
      leaves: leaveRequests,
      admittedIds: new Set(pets.filter(isAdmitted).map((p) => p.id)),
      logs,
      roster: profiles,
      features: { pets: petsOn, repairs: repairsOn },
    });
  }, [profiles, clock, date, todayKey, chores, groups, exceptions, leaveRequests, pets, logs, petsOn, repairsOn]);
}
