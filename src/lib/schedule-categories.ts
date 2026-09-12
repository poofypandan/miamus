import type { MasterSchedule } from "@/types/database";

// master_schedules has no dedicated "category" column, so potty/grooming/
// medication entries are tagged through `title` itself: potty always uses
// this exact title, grooming/medication entries carry a stripped-for-display
// prefix. "Others" (nee "Temporary/One-Off Tasks") entries are plain-titled
// rows that set `expires_at` without one of those prefixes. Meal entries are
// whatever's left after all of the above are excluded.
//
// Grooming and medication rows both also set `expires_at` (grooming pins a
// single occurrence day, medication caps a daily course) — so the prefix
// checks below must run *before* the `expires_at` fallback, or they'd get
// miscategorized as "Others".
export const POTTY_TITLE = "Pipis & Pup";
const GROOMING_PREFIX = "Grooming: ";
const MEDICATION_PREFIX = "Medication: ";

export type ScheduleCategory = "potty" | "meal" | "grooming" | "medication" | "temporary";

export function categorizeSchedule(schedule: MasterSchedule): ScheduleCategory {
  if (schedule.title === POTTY_TITLE) return "potty";
  if (schedule.title.startsWith(MEDICATION_PREFIX)) return "medication";
  if (schedule.title.startsWith(GROOMING_PREFIX)) return "grooming";
  if (schedule.expires_at) return "temporary";
  return "meal";
}

export function groomingTitle(label: string): string {
  return `${GROOMING_PREFIX}${label}`;
}

export function medicationTitle(label: string): string {
  return `${MEDICATION_PREFIX}${label}`;
}

export function displayTitle(schedule: MasterSchedule): string {
  if (schedule.title.startsWith(GROOMING_PREFIX)) {
    return schedule.title.slice(GROOMING_PREFIX.length);
  }
  if (schedule.title.startsWith(MEDICATION_PREFIX)) {
    return schedule.title.slice(MEDICATION_PREFIX.length);
  }
  return schedule.title;
}
