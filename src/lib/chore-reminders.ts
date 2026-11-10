import type { OwnerLocale } from "@/lib/owner-locale";
import { isTemplate, nextOccurrence, occursOn } from "@/lib/chore-recurrence";
import type { HouseholdTask } from "@/types/database";

/**
 * "Remind me" on a chore (Phase 164, D3; migrations/137): off, on the day,
 * or 1, 3 or 7 days before. The 07:00 push is composed by the database
 * (notify_chores_due); this file is the app's half: the choices in the chore
 * form, and the Coming up line on Today, which shows the same reminders with
 * push off.
 */
export const REMIND_CHOICES = [null, 0, 1, 3, 7] as const;

export type RemindChoice = (typeof REMIND_CHOICES)[number];

const REMIND_LABELS: Record<OwnerLocale, Record<string, string>> = {
  en: { off: "Off", 0: "On the day", 1: "1 day before", 3: "3 days before", 7: "1 week before" },
  // docs/indonesian-glossary.md, Phase 164 rows.
  id: { off: "Mati", 0: "Pada harinya", 1: "1 hari sebelumnya", 3: "3 hari sebelumnya", 7: "1 minggu sebelumnya" },
};

export function remindLabel(days: number | null, locale: OwnerLocale): string {
  const labels = REMIND_LABELS[locale];
  if (days === null) return labels.off;
  return labels[days] ?? (locale === "id" ? `${days} hari sebelumnya` : `${days} days before`);
}

/** A chore's reminder, tolerating a value this build doesn't know (no reminder). */
export function remindOf(task: HouseholdTask): number | null {
  const n = task.remind_days_before;
  return typeof n === "number" && (REMIND_CHOICES as readonly (number | null)[]).includes(n) ? n : null;
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

export interface ComingUp {
  task: HouseholdTask;
  /** The day it's due. */
  date: string;
}

/**
 * What the Coming up line on Today shows: chores with a reminder whose next
 * day falls after today and within their reminder window, not yet done or
 * called off, for this owner. The same rule as the push (D4): a chore given
 * to an owner is that owner's alone; one given to staff or to anyone is every
 * owner's. Due today isn't "coming up": it's in My tasks, or the day's list.
 *
 * `rows` are the household's chores as the app holds them: templates,
 * one-offs, and any day already written (a day finished early, or skipped).
 * `ownerRows` are the roster rows of the household's admins.
 */
export function comingUpReminders(params: {
  rows: HouseholdTask[];
  today: string;
  memberId: string | null;
  ownerRows: ReadonlySet<string>;
}): ComingUp[] {
  const { rows, today, memberId, ownerRows } = params;
  const written = new Map<string, HouseholdTask>();
  for (const row of rows) {
    if (row.parent_task_id) written.set(`${row.parent_task_id}|${row.due_date}`, row);
  }

  const items: ComingUp[] = [];
  for (const task of rows) {
    if (task.parent_task_id || task.status === "cancelled") continue;
    const remind = remindOf(task);
    if (!remind) continue;
    const last = addDays(today, remind);

    // Its next day after today.
    let date: string | null;
    if (!isTemplate(task)) {
      date = task.due_date;
    } else if (task.due_date > today) {
      date = task.due_date;
    } else {
      date = nextOccurrence(task, today);
    }
    if (!date || date <= today || date > last) continue;
    if (isTemplate(task) && !occursOn(task, date)) continue;

    // That day's own row governs it, as on Today; otherwise the chore itself
    // on its first day.
    const row = written.get(`${task.id}|${date}`);
    const status = row ? row.status : date === task.due_date ? task.status : "pending";
    if (status !== "pending") continue;

    const assignee = row ? row.assigned_to : task.assigned_to;
    if (assignee && ownerRows.has(assignee) && assignee !== memberId) continue;

    items.push({ task: row ?? task, date });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.task.title.localeCompare(b.task.title));
}

/** "Thu, Nov 26" / "Kam, 26 Nov", or Tomorrow / Besok. */
export function comingUpDay(date: string, today: string, locale: OwnerLocale): string {
  if (date === addDays(today, 1)) return locale === "id" ? "Besok" : "Tomorrow";
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * The line itself. One: "Coming up: PBB · Thu, Nov 26" / "Segera: PBB ·
 * Kam, 26 Nov". Several: "Coming up: PBB, AC service and 1 more" /
 * "Segera: PBB, Servis AC, dan 1 lagi" (as the push lists them).
 */
export function comingUpLabel(items: ComingUp[], today: string, locale: OwnerLocale): string {
  const id = locale === "id";
  const lead = id ? "Segera" : "Coming up";
  if (items.length === 1) {
    return `${lead}: ${items[0].task.title} · ${comingUpDay(items[0].date, today, locale)}`;
  }
  const titles = items.map((i) => i.task.title);
  const shown = titles.slice(0, 2);
  const extra = titles.length - shown.length;
  if (extra === 0) return `${lead}: ${shown[0]}${id ? " dan " : " and "}${shown[1]}`;
  return `${lead}: ${shown.join(", ")}${id ? `, dan ${extra} lagi` : ` and ${extra} more`}`;
}
