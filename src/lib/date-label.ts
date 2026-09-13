import { formatDateLocal } from "@/lib/scheduleEngine";

// Friendly relative label for a browsed date — "Today"/"Yesterday"/"Tomorrow"
// when it's close by, otherwise a short absolute date (e.g. "Sep 9").
export function dayLabel(date: Date, now: Date = new Date()): string {
  const target = formatDateLocal(date);
  if (target === formatDateLocal(now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (target === formatDateLocal(yesterday)) return "Yesterday";

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (target === formatDateLocal(tomorrow)) return "Tomorrow";

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
