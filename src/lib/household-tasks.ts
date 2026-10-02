import { AGENDA_TONES } from "@/lib/agenda-tones";
import {
  ClipboardList,
  ShoppingBag,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { HouseholdTaskCategory } from "@/types/database";

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

/**
 * The category badge's colour: the same amber for every chore category
 * (Phase 112). Amber is what marks a row as housework at all, so a hue per
 * category — sky cleaning, violet errands — would only compete with it. The
 * icon and the label carry which kind of chore it is.
 */
export function categoryClass(): string {
  return AGENDA_TONES.chore.badge;
}

/** Same tolerance as categoryIcon: an unknown value shows itself, verbatim. */
export function categoryLabel(
  category: HouseholdTaskCategory,
  locale: "en" | "id"
): string {
  const labels = locale === "en" ? CATEGORY_LABELS_EN : CATEGORY_LABELS_ID;
  return labels[category] ?? category;
}
