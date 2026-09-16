import {
  Droplets,
  List,
  Pill,
  Scissors,
  Stethoscope,
  Utensils,
  type LucideIcon,
} from "lucide-react";
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
const VET_PREFIX = "Vet: ";

export type ScheduleCategory =
  | "potty"
  | "meal"
  | "grooming"
  | "medication"
  | "temporary"
  | "vet";

export function categorizeSchedule(schedule: MasterSchedule): ScheduleCategory {
  if (schedule.title === POTTY_TITLE) return "potty";
  if (schedule.title.startsWith(MEDICATION_PREFIX)) return "medication";
  if (schedule.title.startsWith(GROOMING_PREFIX)) return "grooming";
  // Ahead of the expires_at fallback, like the other prefixes: a vet visit
  // always sets expires_at (it is a single day), so checking it later would
  // file every appointment as "temporary".
  if (schedule.title.startsWith(VET_PREFIX)) return "vet";
  if (schedule.expires_at) return "temporary";
  return "meal";
}

export function groomingTitle(label: string): string {
  return `${GROOMING_PREFIX}${label}`;
}

export function medicationTitle(label: string): string {
  return `${MEDICATION_PREFIX}${label}`;
}

export function vetTitle(label: string): string {
  return `${VET_PREFIX}${label}`;
}

export function displayTitle(schedule: MasterSchedule): string {
  if (schedule.title.startsWith(GROOMING_PREFIX)) {
    return schedule.title.slice(GROOMING_PREFIX.length);
  }
  if (schedule.title.startsWith(MEDICATION_PREFIX)) {
    return schedule.title.slice(MEDICATION_PREFIX.length);
  }
  if (schedule.title.startsWith(VET_PREFIX)) {
    return schedule.title.slice(VET_PREFIX.length);
  }
  return schedule.title;
}

const CATEGORY_ICONS: Record<ScheduleCategory, LucideIcon> = {
  potty: Droplets,
  meal: Utensils,
  medication: Pill,
  grooming: Scissors,
  temporary: List,
  vet: Stethoscope,
};

export function categoryIcon(category: ScheduleCategory): LucideIcon {
  return CATEGORY_ICONS[category];
}

// Tailwind text colours for the category icon, so a day of near-identical rows
// can be scanned by colour before it is read. Deliberately the icon only: a
// timeline of tinted rows reads as noise, and the title still says what the
// task is, so colour is a shortcut rather than the only carrier of meaning.
//
// The three "significant" categories share the hue of the card tint they get
// in the timeline (see CATEGORY_CARD_TINTS), so icon and card agree.
const CATEGORY_ICON_COLORS: Record<ScheduleCategory, string> = {
  potty: "text-emerald-500",
  meal: "text-amber-500",
  medication: "text-rose-500",
  vet: "text-indigo-500",
  grooming: "text-cyan-600",
  // Everything that is simply a task keeps the timeline's own muted grey.
  temporary: "text-muted-foreground",
};

export function categoryIconColor(category: ScheduleCategory): string {
  return CATEGORY_ICON_COLORS[category] ?? "text-muted-foreground";
}

// A tinted card face for the three things that are not the ordinary shape of
// the day: a course of medicine, a vet appointment, a grooming visit. Meals and
// potty breaks stay neutral precisely because they are most of the list —
// tinting those too would leave nothing standing out.
//
// No dark-mode variants: the app pins itself to a light scheme (see the
// color-scheme rule from Phase 37), so a dark override would never render.
const CATEGORY_CARD_TINTS: Partial<Record<ScheduleCategory, string>> = {
  medication: "border-rose-200 bg-rose-50",
  vet: "border-indigo-200 bg-indigo-50",
  grooming: "border-cyan-200 bg-cyan-50",
};

/** Tint classes for a category's card, or "" for the neutral default. */
export function categoryCardTint(category: ScheduleCategory): string {
  return CATEGORY_CARD_TINTS[category] ?? "";
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
