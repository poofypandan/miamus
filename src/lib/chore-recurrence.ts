import type { ChoreRecurrence, HouseholdTask, HouseholdTaskStatus } from "@/types/database";


export const CHORE_RECURRENCES: ChoreRecurrence[] = ["none", "daily", "weekly", "monthly"];

// Owner-facing, so English per the Phase 46 language boundary.
export const RECURRENCE_LABELS_EN: Record<ChoreRecurrence, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

// Staff-facing, so Bahasa Indonesia. Staff never set a repeat — they only ever
// read that a chore has one.
export const RECURRENCE_LABELS_ID: Record<ChoreRecurrence, string> = {
  none: "Sekali saja",
  daily: "Setiap hari",
  weekly: "Setiap minggu",
  monthly: "Setiap bulan",
};

/**
 * The cadence of a row, tolerating a value this build has never heard of.
 *
 * The column has no CHECK (see migrations/097), so a hand-entered or
 * future-version row can carry anything. An unrecognised cadence degrades to a
 * one-off, which shows the chore on its own day and nowhere else — wrong, but
 * visible and harmless, rather than an exception inside a render.
 */
export function recurrenceOf(task: HouseholdTask): ChoreRecurrence {
  const value = task.recurrence;
  return value && CHORE_RECURRENCES.includes(value) ? value : "none";
}

export function isTemplate(task: HouseholdTask): boolean {
  return recurrenceOf(task) !== "none";
}

// "YYYY-MM-DD" at local midnight. `new Date("2026-10-01")` is parsed as UTC by
// the spec, which lands on the previous day east of Greenwich.
function parseDayKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Does `task`'s repeat land on `dateStr`?
 *
 * Anchored on the template's own due_date, which is both its first occurrence
 * and the thing that defines the pattern: a weekly chore filed on a Tuesday
 * repeats on Tuesdays, a monthly one on the 14th.
 *
 * A monthly chore anchored on the 31st is clamped to the last day of shorter
 * months rather than skipping them — "end of month" is what someone filing a
 * chore on the 31st means, and silently skipping February is the one behaviour
 * nobody wants from a cleaning rota.
 */
export function occursOn(task: HouseholdTask, dateStr: string): boolean {
  const recurrence = recurrenceOf(task);
  if (recurrence === "none") return dateStr === task.due_date;

  // Before it started, or after it was told to stop.
  if (dateStr < task.due_date) return false;
  if (task.recurrence_until && dateStr > task.recurrence_until) return false;

  if (recurrence === "daily") return true;

  const start = parseDayKey(task.due_date);
  const target = parseDayKey(dateStr);

  if (recurrence === "weekly") return start.getDay() === target.getDay();

  // monthly
  const anchorDay = start.getDate();
  const lastDayOfTargetMonth = daysInMonth(target.getFullYear(), target.getMonth());
  return target.getDate() === Math.min(anchorDay, lastDayOfTargetMonth);
}

/** The longest gap a repeat can leave between two of its days (monthly). */
export const LONGEST_REPEAT_GAP_DAYS = 31;

/**
 * How far back a repeat's missed day can be: what the providers must read
 * for expandChores to tell a missed day from a finished one.
 */
export function rolloverFloorFor(today: string): string {
  const floor = parseDayKey(today);
  floor.setDate(floor.getDate() - LONGEST_REPEAT_GAP_DAYS);
  return dayKey(floor);
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * The last day before `beforeDate` on which a repeat falls, within its run —
 * or null if it had not started yet (Phase 126). Looks back at most
 * LONGEST_REPEAT_GAP_DAYS, which always reaches the previous occurrence of a
 * daily, weekly or monthly chore.
 */
export function previousOccurrence(task: HouseholdTask, beforeDate: string): string | null {
  const cursor = parseDayKey(beforeDate);
  for (let i = 0; i < LONGEST_REPEAT_GAP_DAYS; i++) {
    cursor.setDate(cursor.getDate() - 1);
    const key = dayKey(cursor);
    if (key < task.due_date) return null;
    if (occursOn(task, key)) return key;
  }
  return null;
}

/**
 * One chore on one day — the unit both views render.
 *
 * `task` is the row it came from, which for a virtual occurrence is the
 * template rather than anything that exists for this date. Everything that
 * varies by date (status, completion, photos) is read from here instead of
 * from `task`, because on a template those columns describe its *first*
 * occurrence and nothing else.
 */
export interface ChoreOccurrence {
  /** Stable across renders and unique per (chore, day). */
  key: string;
  /**
   * Whatever governs this day: the real row if one exists, otherwise the
   * template. Read every displayed field from here.
   *
   * The distinction is not academic. A materialised occurrence carries its own
   * assignee, status and proof — claiming Tuesday assigns Tuesday, not the
   * repeat — so reading `assigned_to` from the template would show a chore as
   * unclaimed seconds after someone claimed it.
   */
  task: HouseholdTask;
  /**
   * The repeating definition this belongs to, which is the row itself for a
   * one-off. Only the cadence is read from here: a materialised occurrence is
   * stored with recurrence "none" (it is one day's work), so asking `task`
   * whether it repeats would say no.
   */
  template: HouseholdTask;
  /** The row that actually holds this day's state, if one exists yet. */
  row: HouseholdTask | null;
  /** The day this occurrence belongs to. */
  date: string;
  /** No row exists for this date yet — completing it will write one. */
  virtual: boolean;
  status: HouseholdTaskStatus;
  /** Still pending, and its day has already passed. */
  overdue: boolean;
}

function toOccurrence(
  row: HouseholdTask,
  template: HouseholdTask,
  date: string,
  todayStr: string
): ChoreOccurrence {
  const status = row.status;
  return {
    key: `${template.id}|${date}`,
    task: row,
    template,
    row,
    date,
    virtual: false,
    status,
    overdue: status === "pending" && date < todayStr,
  };
}

/**
 * Everything the household owes on `dateStr`, from a set of rows that may
 * contain concrete chores, templates, and materialised occurrences.
 *
 * Three sources, in order of authority:
 *
 *   1. a real row dated `dateStr` — a one-off, or an occurrence someone has
 *      already claimed or finished;
 *   2. a template whose own due_date is `dateStr`, which is its first
 *      occurrence and an ordinary row in every other respect;
 *   3. a template that lands on `dateStr` with nothing written for it yet,
 *      which becomes a virtual occurrence.
 *
 * Plus, when looking at today, anything still pending from any earlier day —
 * the rollover. A chore filed for the 29th used to vanish on the 30th with
 * nobody having done it (Phase 100); it now follows the household until it is
 * done, however long that takes (Phase 113 dropped the 30-day cut-off). Its
 * due_date is never touched: the row keeps the day it was owed, which is what
 * the "carried over from" label reads and what keeps repeats generating from
 * the right day. Only one-offs and claimed occurrences roll over — an
 * unclaimed repeating chore comes back on its own and would otherwise appear
 * twice — except a repeat's most recent missed day, which is carried over
 * until its next occurrence falls due (Phase 126; see below).
 */
export function expandChores(params: {
  rows: HouseholdTask[];
  date: string;
  today: string;
}): ChoreOccurrence[] {
  const { rows, date, today } = params;

  const byId = new Map(rows.map((r) => [r.id, r]));
  // Which (template, day) pairs already have a row, so a materialised
  // occurrence suppresses the virtual one it replaces.
  const materialised = new Set<string>();
  for (const row of rows) {
    if (row.parent_task_id) materialised.add(`${row.parent_task_id}|${row.due_date}`);
  }

  const occurrences: ChoreOccurrence[] = [];
  const seen = new Set<string>();

  function push(occurrence: ChoreOccurrence) {
    if (seen.has(occurrence.key)) return;
    seen.add(occurrence.key);
    occurrences.push(occurrence);
  }

  for (const row of rows) {
    if (row.status === "cancelled") continue;

    // A materialised occurrence stands in for its template on its own day.
    if (row.parent_task_id) {
      if (row.due_date !== date) continue;
      const template = byId.get(row.parent_task_id) ?? row;
      push(toOccurrence(row, template, date, today));
      continue;
    }

    // The row's own day: true for a one-off, and for a template's first
    // occurrence.
    if (row.due_date === date) {
      push(toOccurrence(row, row, date, today));
      continue;
    }

    // A repeat landing on this date with nothing written for it yet.
    if (isTemplate(row) && occursOn(row, date) && !materialised.has(`${row.id}|${date}`)) {
      push({
        key: `${row.id}|${date}`,
        // Nothing is written for this day yet, so the template is both the
        // definition and the only description of it there is.
        task: row,
        template: row,
        row: null,
        date,
        virtual: true,
        status: "pending",
        overdue: date < today,
      });
    }
  }

  // Unfinished business, shown only on today so browsing an earlier day stays
  // a faithful record of that day rather than a pile of everything since.
  if (date === today) {
    for (const row of rows) {
      // Pending only: completed is done, and cancelled was called off.
      if (row.status !== "pending") continue;
      if (row.due_date >= date) continue;
      // A repeating chore reappears today under its own cadence; carrying its
      // first occurrence over as well would show it twice.
      if (isTemplate(row)) continue;
      // A claimed occurrence of a repeat rolls over as itself, but keyed and
      // edited through its template, exactly as on its own day.
      const template = (row.parent_task_id && byId.get(row.parent_task_id)) || row;
      push(toOccurrence(row, template, row.due_date, today));
    }

    // A repeat's missed day (Phase 126). Nothing above catches it when nobody
    // ever claimed it: it has no row, so nothing is "pending" to roll over —
    // and the old reasoning, that a repeat simply comes back on its own, only
    // holds for a daily one. A weekly chore missed on Saturday vanished until
    // the next Saturday.
    //
    // The rule: a missed occurrence stays owed until the repeat's next one
    // falls due. So it carries over only while today is not itself one of
    // the repeat's days — a daily chore is never shown twice, a weekly one
    // is owed from Sunday to Friday — and only the most recent miss counts:
    // an older one was superseded by the occurrence after it.
    for (const row of rows) {
      if (!isTemplate(row) || row.status === "cancelled") continue;
      if (occursOn(row, today)) continue;
      const missed = previousOccurrence(row, today);
      if (!missed) continue;

      // That day's state: the template itself on its first day, otherwise a
      // materialised row, if anyone ever touched it.
      if (missed === row.due_date) {
        if (row.status === "pending") push(toOccurrence(row, row, missed, today));
        continue;
      }
      const written = rows.find((r) => r.parent_task_id === row.id && r.due_date === missed);
      // Done or called off; or pending, and already carried over as itself by
      // the loop above.
      if (written) continue;
      push({
        key: `${row.id}|${missed}`,
        task: row,
        template: row,
        row: null,
        date: missed,
        virtual: true,
        status: "pending",
        overdue: true,
      });
    }
  }

  return occurrences.sort(compareOccurrences);
}

/**
 * Anytime chores first, then chronological (Phase 112; untimed sorted last
 * before that). A chore with no due_time can be picked up in any free moment,
 * which only happens if it is in view — not below a day's worth of timed
 * rows. See buildUnifiedAgenda.
 */
export function compareOccurrences(a: ChoreOccurrence, b: ChoreOccurrence): number {
  const at = a.task.due_time;
  const bt = b.task.due_time;
  if (at && bt && at !== bt) return at.localeCompare(bt);
  // Anytime chores first (Phase 112) — see buildUnifiedAgenda for why.
  if (!at && bt) return -1;
  if (at && !bt) return 1;
  // Overdue carry-overs first within a tie: they have been waiting longest.
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  return a.task.title.localeCompare(b.task.title);
}

/**
 * The occurrences one staff member should see: their own, plus everything
 * nobody has taken yet.
 *
 * A chore someone else has claimed disappears from this feed: it is no longer
 * this person's business, and leaving it visible invites two people doing the
 * same job.
 */
export function occurrencesForStaff(
  occurrences: ChoreOccurrence[],
  staffId: string | null
): ChoreOccurrence[] {
  return occurrences.filter(
    (o) => !o.task.assigned_to || o.task.assigned_to === staffId
  );
}
