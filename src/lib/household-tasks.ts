import {
  ClipboardList,
  ShoppingBag,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { HouseholdTask, HouseholdTaskCategory } from "@/types/database";

// The order the owner's category picker offers, and the order the two views
// group by. Unlike ScheduleCategory this is a real column, so there is nothing
// to infer from a title prefix — see migrations/082.
export const HOUSEHOLD_TASK_CATEGORIES: HouseholdTaskCategory[] = [
  "cleaning",
  "maintenance",
  "errand",
  "groceries",
];

// Owner-facing, so English per the Phase 46 language boundary.
export const CATEGORY_LABELS_EN: Record<HouseholdTaskCategory, string> = {
  cleaning: "Cleaning",
  maintenance: "Maintenance",
  errand: "Errand",
  groceries: "Groceries",
};

// Staff-facing, so Bahasa Indonesia.
export const CATEGORY_LABELS_ID: Record<HouseholdTaskCategory, string> = {
  cleaning: "Bersih-bersih",
  maintenance: "Perbaikan",
  errand: "Titipan",
  groceries: "Belanja",
};

const CATEGORY_ICONS: Record<HouseholdTaskCategory, LucideIcon> = {
  cleaning: Sparkles,
  maintenance: Wrench,
  errand: ClipboardList,
  groceries: ShoppingBag,
};

// Badge tints, one per category, so a list is scannable before it is read.
// Kept deliberately pale — the strong colours in this app mean urgency (see
// the admitted-pet cards), and a chore's category is not urgency.
const CATEGORY_CLASSES: Record<HouseholdTaskCategory, string> = {
  cleaning: "bg-sky-100 text-sky-900",
  maintenance: "bg-amber-100 text-amber-900",
  errand: "bg-violet-100 text-violet-900",
  groceries: "bg-emerald-100 text-emerald-900",
};

/**
 * Resolves a category to its icon, tolerating a value this build has never
 * heard of.
 *
 * The column has no CHECK constraint (see migrations/082), so a hand-entered
 * or future row can carry anything. Falling back keeps such a row rendering as
 * a chore rather than crashing the panel on an undefined component.
 */
export function categoryIcon(category: HouseholdTaskCategory): LucideIcon {
  return CATEGORY_ICONS[category] ?? ClipboardList;
}

export function categoryClass(category: HouseholdTaskCategory): string {
  return CATEGORY_CLASSES[category] ?? "bg-gray-100 text-gray-700";
}

/** Same tolerance as categoryIcon: an unknown value shows itself, verbatim. */
export function categoryLabel(
  category: HouseholdTaskCategory,
  locale: "en" | "id"
): string {
  const labels = locale === "en" ? CATEGORY_LABELS_EN : CATEGORY_LABELS_ID;
  return labels[category] ?? category;
}

/**
 * Splits a day's chores into what is still open and what is done.
 *
 * "Cancelled" falls out of both lists on purpose: it is neither waiting for
 * anyone nor an achievement to show. Nothing writes it yet, but every read
 * path has to handle it rather than assuming pending-or-completed.
 */
export function splitByStatus(tasks: HouseholdTask[]): {
  pending: HouseholdTask[];
  completed: HouseholdTask[];
} {
  return {
    pending: tasks.filter((task) => task.status === "pending"),
    // Most recently finished first, so the last thing done is at the top —
    // the list is read to check on progress, not as a chronology.
    completed: tasks
      .filter((task) => task.status === "completed")
      .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? "")),
  };
}

/**
 * The chores one staff member should see: their own, plus everything nobody
 * has taken yet.
 *
 * A chore someone else has claimed disappears from this feed — it is no longer
 * this person's business, and leaving it visible invites two people doing the
 * same job.
 */
export function tasksForStaff(tasks: HouseholdTask[], staffId: string | null): HouseholdTask[] {
  return tasks.filter((task) => !task.assigned_to || task.assigned_to === staffId);
}
