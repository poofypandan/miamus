import { repeatLabel } from "@/lib/chore-recurrence";
import { dayKeyLabel } from "@/lib/date-label";
import type { OwnerLocale } from "@/lib/owner-locale";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { ChoreRecurrence } from "@/types/database";

/**
 * Add Chore's one "When" row, read back in words (21 Nov; Fable's 07,
 * section 10): "Today, once", "Tomorrow at 09:00, once", "Every Monday at
 * 09:00", "Every day, from 25 Nov, until 30 Dec". The date, time and repeat
 * open from it. Pure, so it is unit-tested (tests/unit/chore-when.test.ts).
 */
export function choreWhenSummary(
  input: {
    date: string;
    time: string;
    recurrence: ChoreRecurrence;
    interval: number;
    until: string;
  },
  locale: OwnerLocale,
  now: Date = new Date()
): string {
  const id = locale === "id";
  const { date, time, recurrence, interval, until } = input;
  const day = dayKeyLabel(date, now, locale);
  const at = time ? (id ? ` pukul ${time.slice(0, 5).replace(":", ".")}` : ` at ${time.slice(0, 5)}`) : "";

  if (recurrence === "none") return `${day}${at}, ${id ? "sekali" : "once"}`;

  const start = new Date(`${date}T00:00:00`);
  let repeat: string;
  if (recurrence === "daily") repeat = id ? "Setiap hari" : "Every day";
  else if (recurrence === "weekly" && interval <= 1) {
    const weekday = start.toLocaleDateString(id ? "id-ID" : "en-GB", { weekday: "long" });
    repeat = id ? `Setiap ${weekday}` : `Every ${weekday}`;
  } else if (recurrence === "monthly" && interval <= 1) {
    const n = start.getDate();
    repeat = id ? `Setiap bulan, tanggal ${n}` : `Every month, on the ${ordinal(n)}`;
  } else repeat = repeatLabel(recurrence, interval, locale);

  const parts = [`${repeat}${at}`];
  if (date !== formatDateLocal(now)) parts.push(`${id ? "mulai" : "from"} ${lowerRelative(day, locale)}`);
  if (until) parts.push(`${id ? "sampai" : "until"} ${lowerRelative(dayKeyLabel(until, now, locale), locale)}`);
  return parts.join(", ");
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** "Tomorrow" mid-sentence reads "tomorrow"; a date ("25 Nov") stays as it is. */
function lowerRelative(label: string, locale: OwnerLocale): string {
  const words = locale === "id" ? ["Hari ini", "Besok", "Kemarin"] : ["Today", "Tomorrow", "Yesterday"];
  return words.includes(label) ? label.toLowerCase() : label;
}
