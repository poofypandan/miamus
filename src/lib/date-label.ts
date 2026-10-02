import { formatDateLocal } from "@/lib/scheduleEngine";

const RELATIVE = {
  en: { today: "Today", yesterday: "Yesterday", tomorrow: "Tomorrow", locale: "en-US" },
  // Staff-facing views (Phase 46 language boundary). Until Phase 112 this was
  // English-only, so the staff chore card read "Belum selesai dari Yesterday".
  id: { today: "Hari ini", yesterday: "Kemarin", tomorrow: "Besok", locale: "id-ID" },
} as const;

// Friendly relative label for a browsed date — "Today"/"Yesterday"/"Tomorrow"
// when it's close by, otherwise a short absolute date (e.g. "Sep 9").
export function dayLabel(date: Date, now: Date = new Date(), lang: "en" | "id" = "en"): string {
  const words = RELATIVE[lang];
  const target = formatDateLocal(date);
  if (target === formatDateLocal(now)) return words.today;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (target === formatDateLocal(yesterday)) return words.yesterday;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (target === formatDateLocal(tomorrow)) return words.tomorrow;

  return date.toLocaleDateString(words.locale, { month: "short", day: "numeric" });
}

/**
 * dayLabel for a `YYYY-MM-DD` day key, which is how the database stores a day
 * that has no time attached (`routine_proposals.scheduled_date`, a chore's
 * `due_date`).
 *
 * Parsed with an explicit midnight rather than `new Date("2026-10-24")`, which
 * the spec reads as *UTC* — east of Greenwich that lands the day before, so a
 * visit scheduled for tomorrow would have been labelled "Today".
 */
export function dayKeyLabel(
  key: string,
  now: Date = new Date(),
  lang: "en" | "id" = "en"
): string {
  return dayLabel(new Date(`${key}T00:00:00`), now, lang);
}
