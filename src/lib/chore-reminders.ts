import type { OwnerLocale } from "@/lib/owner-locale";
import { isTemplate, nextOccurrence, occursOn } from "@/lib/chore-recurrence";
import { leaveCovering } from "@/lib/leave";
import type { HouseholdTask, LeaveRequest } from "@/types/database";

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
  /** Leave, applied as Today applies it (applyLeaveTriage). */
  leaves?: LeaveRequest[];
}): ComingUp[] {
  const { rows, today, memberId, ownerRows, leaves = [] } = params;
  const written = new Map<string, HouseholdTask>();
  for (const row of rows) {
    if (row.parent_task_id) written.set(`${row.parent_task_id}|${row.due_date}`, row);
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const forSomeoneElse = (assignee: string | null) => !!assignee && ownerRows.has(assignee) && assignee !== memberId;
  // Who a day is for once leave is applied, as applyLeaveTriage does on
  // Today (src/lib/leave.ts): "pause" takes the day off the agenda (no
  // reminder: undefined), "reassign" hands it to the cover person,
  // "unassign" makes it anyone's (Codex, PR #60). The same rule as the push.
  const afterLeave = (assignee: string | null, date: string): string | null | undefined => {
    const leave = leaveCovering(leaves, assignee, date);
    if (!leave) return assignee;
    const action = leave.fallback_action ?? "unassign";
    if (action === "pause") return undefined;
    return action === "reassign" && leave.fallback_assignee_id ? leave.fallback_assignee_id : null;
  };

  const items: ComingUp[] = [];
  for (const task of rows) {
    // A written day off its repeat's pattern, still owed: skipping a chore's
    // first day on the 31st keeps 28 February as its own row (Codex, PR #60).
    // It reminds with its repeat's setting. Days on the pattern are read
    // through the repeat below.
    if (task.parent_task_id) {
      const template = byId.get(task.parent_task_id);
      if (!template || template.status === "cancelled" || task.status !== "pending") continue;
      const remind = remindOf(template);
      if (!remind || occursOn(template, task.due_date)) continue;
      if (task.due_date <= today || task.due_date > addDays(today, remind)) continue;
      const who = afterLeave(task.assigned_to, task.due_date);
      if (who === undefined || forSomeoneElse(who)) continue;
      items.push({ task, date: task.due_date });
      continue;
    }
    if (task.status === "cancelled") continue;
    const remind = remindOf(task);
    if (!remind) continue;
    // A repeat also due today (daily, or weekly reminded a week ahead) is
    // already on today's list: not "coming up" as well (as the push).
    if (isTemplate(task) && occursOn(task, today)) continue;
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

    const who = afterLeave(row ? row.assigned_to : task.assigned_to, date);
    if (who === undefined || forSomeoneElse(who)) continue;

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
