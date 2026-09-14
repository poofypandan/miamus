import { Droplets, List, Pill, Scissors, Utensils, type LucideIcon } from "lucide-react";
import type { MasterSchedule, TaskLog } from "@/types/database";

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

const CATEGORY_ICONS: Record<ScheduleCategory, LucideIcon> = {
  potty: Droplets,
  meal: Utensils,
  medication: Pill,
  grooming: Scissors,
  temporary: List,
};

export function categoryIcon(category: ScheduleCategory): LucideIcon {
  return CATEGORY_ICONS[category];
}

// The Indonesian labels AdHocSheet writes into `notes` for a "Catat Ekstra"
// entry. Kept in sync by hand with ADHOC_TYPES in components/staff/adhoc-sheet
// — the labels are user-visible copy there, and this is the only place that
// needs to read them back out.
// Old labels are kept alongside the current ones on purpose: this map reads
// what is already stored, and logs filed before Phase 57 still carry "Snack
// Ekstra" / "Obat Ekstra" in their notes.
const ADHOC_CATEGORIES: Record<string, ScheduleCategory> = {
  "Pipis Ekstra": "potty",
  "Muntah / Sakit": "medication",
  Lainnya: "temporary",
  // retired from the picker, still present in historical rows
  "Snack Ekstra": "meal",
  "Obat Ekstra": "medication",
};

// A task_log has no category column of its own. A scheduled log inherits one
// from its master_schedule; an ad-hoc log (schedule_id null, either because it
// came from Catat Ekstra or because its schedule was later deleted — the FK is
// `on delete set null`) can only be read back out of the label staff left in
// `notes`, which looks like "Pipis Ekstra — muntah sedikit".
export function describeLog(
  log: Pick<TaskLog, "schedule_id" | "notes">,
  schedules: MasterSchedule[]
): { title: string; category: ScheduleCategory } {
  const schedule = log.schedule_id ? schedules.find((s) => s.id === log.schedule_id) : undefined;
  if (schedule) {
    return { title: displayTitle(schedule), category: categorizeSchedule(schedule) };
  }

  const label = (log.notes ?? "").split("—")[0].trim();
  return {
    title: label || "Catatan Ekstra",
    category: ADHOC_CATEGORIES[label] ?? "temporary",
  };
}
