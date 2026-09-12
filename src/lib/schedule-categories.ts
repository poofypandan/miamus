import type { MasterSchedule } from "@/types/database";

// master_schedules has no dedicated "category" column, so potty/grooming
// entries are tagged through `title` itself: potty always uses this exact
// title, grooming entries carry a stripped-for-display prefix. Meal entries
// are simply whatever's left after potty/grooming/temporary are excluded.
export const POTTY_TITLE = "Pipis & Pup";
const GROOMING_PREFIX = "Grooming: ";

export type ScheduleCategory = "potty" | "meal" | "grooming" | "temporary";

export function categorizeSchedule(schedule: MasterSchedule): ScheduleCategory {
  if (schedule.expires_at) return "temporary";
  if (schedule.title === POTTY_TITLE) return "potty";
  if (schedule.title.startsWith(GROOMING_PREFIX)) return "grooming";
  return "meal";
}

export function groomingTitle(label: string): string {
  return `${GROOMING_PREFIX}${label}`;
}

export function displayTitle(schedule: MasterSchedule): string {
  return schedule.title.startsWith(GROOMING_PREFIX)
    ? schedule.title.slice(GROOMING_PREFIX.length)
    : schedule.title;
}
