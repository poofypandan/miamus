import { recurrenceOf } from "@/lib/chore-recurrence";
import type { ScheduleCategory } from "@/lib/schedule-categories";
import type { AgendaGroup } from "@/lib/scheduleEngine";
import type { UnifiedAgendaEntry } from "@/lib/unified-agenda";
import type { MasterSchedule } from "@/types/database";

/**
 * The owner's Week view as a summary rather than a calendar (Phase 143).
 *
 * WHY. The Week view used to be a 24-hour time grid with every routine and
 * chore drawn as a block. Measured against the live household it drew ~250
 * blocks a week, and every one of the daily ones carried one of three titles —
 * Makan Siang, Makan Malam, Pipis & Pup — repeated for four dogs, six to eight
 * times a day, seven days running. It took a screen of scrolling to learn
 * "the dogs were fed and let out", which a day view already says.
 *
 * The rule now is the one rosters and medication charts use: state recurring
 * load once, show deviations individually.
 *
 *   rhythm  the same every day — meals, potty, medicine, daily chores. One row
 *           per (dog, task), one cell per day, one mark per cell: a matrix you
 *           read across ("did Mocha get her evening dose every day?") instead
 *           of 252 cards you scroll past.
 *   beyond  everything else — vet visits, grooming, one-off pet tasks, weekly
 *           and monthly and one-off chores. The part of a week that actually
 *           differs from the last one, listed by day.
 *   days    a strip of seven: how much of each day got done, and how much was
 *           missed, so the day that went wrong is visible before anything is
 *           opened.
 *
 * Pure, so it can be tested without a browser.
 */

/** Pet routines that recur every day by construction in this app's editors. */
const RHYTHM_CATEGORIES: ReadonlySet<ScheduleCategory> = new Set([
  "meal",
  "potty",
  "medication",
]);

/** Within one dog, medicine first: a missed dose matters more than a missed walk. */
const CATEGORY_ORDER: Record<string, number> = { medication: 0, meal: 1, potty: 2, routine: 3, chore: 4 };

export type CellState =
  /** Everything owed that day was done. */
  | "done"
  /** A past day with something not done. It can no longer be made up. */
  | "missed"
  /** Today, with something past its time — late, but still doable. */
  | "late"
  /** Today, nothing late yet. */
  | "partial"
  /** Not due yet. */
  | "upcoming";

export interface RhythmCell {
  done: number;
  total: number;
  missed: number;
  state: CellState;
}

export interface RhythmRow {
  key: string;
  /** The dog, or "House" for a daily chore. */
  group: string;
  title: string;
  category: ScheduleCategory | "chore";
  /** One per day of the week; null when this task is not scheduled that day. */
  cells: (RhythmCell | null)[];
}

export interface DaySummary {
  date: string;
  /** Everything owed that day: each dog-slot of each routine, and each chore. */
  total: number;
  done: number;
  /**
   * Owed, not done, and its time has passed. On a past day these are missed;
   * on today they are late — still doable. The UI words them accordingly.
   */
  missed: number;
  when: "past" | "today" | "future";
}

export interface WeekSummary {
  days: DaySummary[];
  rhythm: RhythmRow[];
  /**
   * The rhythm across the days that have already started: `missed` on past
   * days, `late` today, and the busiest day's load for "N a day".
   */
  rhythmTotals: { due: number; done: number; missed: number; late: number; perDay: number };
  /** Non-daily entries, by day, in each day's own order. Empty days omitted. */
  beyond: { date: string; entries: UnifiedAgendaEntry[] }[];
}

/**
 * Whether a routine group is part of the daily rhythm.
 *
 * By category, because the categories are what the app's editors give
 * meaning to: vet, grooming and "temporary" are all single-day events
 * (lib/schedule-categories), while meals, potty and medicine courses recur
 * daily. A routine an editor did set to weekly is not daily whatever its
 * category, so the schedule's own frequency has the last word.
 */
export function isRhythmGroup(
  group: AgendaGroup,
  scheduleById: Map<string, MasterSchedule>
): boolean {
  // A routine from the Add routine sheet (Phase 173) is part of the rhythm
  // when it is every day with no end; some days or once are the week's news.
  if (group.category === "routine") {
    return group.items.every((item) => {
      const s = scheduleById.get(item.scheduleId);
      return !!s && !s.expires_at && !(s.days_of_week && s.days_of_week.length > 0);
    });
  }
  if (!RHYTHM_CATEGORIES.has(group.category)) return false;
  return group.items.every(
    (item) => scheduleById.get(item.scheduleId)?.frequency_type !== "weekly"
  );
}

/** Whether a chore occurrence belongs to the rhythm: only a daily repeat does. */
function isRhythmChore(entry: Extract<UnifiedAgendaEntry, { kind: "chore" }>): boolean {
  return recurrenceOf(entry.occurrence.template) === "daily";
}

function cellState(cell: Omit<RhythmCell, "state">, when: DaySummary["when"]): CellState {
  if (when === "future") return "upcoming";
  if (cell.done === cell.total) return "done";
  // Today's past-due slots are late, not missed: someone can still do them,
  // and red would say otherwise.
  if (when === "today") return cell.missed > 0 ? "late" : "partial";
  return "missed";
}

export function summarizeWeek(params: {
  days: { date: string; entries: UnifiedAgendaEntry[] }[];
  today: string;
  schedules: MasterSchedule[];
}): WeekSummary {
  const { days, today, schedules } = params;
  const scheduleById = new Map(schedules.map((s) => [s.id, s]));
  const whenOf = (date: string): DaySummary["when"] =>
    date < today ? "past" : date === today ? "today" : "future";

  const rows = new Map<string, RhythmRow>();
  const dayCount = days.length;

  function rowFor(
    key: string,
    group: string,
    title: string,
    category: RhythmRow["category"]
  ): RhythmRow {
    let row = rows.get(key);
    if (!row) {
      row = { key, group, title, category, cells: Array(dayCount).fill(null) };
      rows.set(key, row);
    }
    return row;
  }

  function addToCell(row: RhythmRow, dayIndex: number, done: boolean, missed: boolean) {
    const cell = row.cells[dayIndex] ?? { done: 0, total: 0, missed: 0, state: "upcoming" };
    cell.total += 1;
    if (done) cell.done += 1;
    else if (missed) cell.missed += 1;
    row.cells[dayIndex] = cell;
  }

  const daySummaries: DaySummary[] = [];
  const beyond: WeekSummary["beyond"] = [];

  days.forEach((day, dayIndex) => {
    const when = whenOf(day.date);
    const summary: DaySummary = { date: day.date, total: 0, done: 0, missed: 0, when };
    const beyondToday: UnifiedAgendaEntry[] = [];

    for (const entry of day.entries) {
      if (entry.kind === "routine") {
        const rhythm = isRhythmGroup(entry.group, scheduleById);
        for (const item of entry.group.items) {
          const done = item.status === "completed";
          // "overdue" from buildAgenda: a past day, or today past its slot.
          const missed = item.status === "overdue";
          summary.total += 1;
          if (done) summary.done += 1;
          else if (missed) summary.missed += 1;
          if (rhythm) {
            addToCell(
              rowFor(
                `pet|${item.entityId}|${item.title}`,
                item.entityName,
                item.title,
                entry.group.category
              ),
              dayIndex,
              done,
              missed
            );
          }
        }
        if (!rhythm) beyondToday.push(entry);
        continue;
      }

      // A chore carried over from an earlier day is shown on today, but it is
      // that earlier day's debt: counted there (if that day is in this week),
      // never twice. It still appears in today's list, flagged overdue.
      const ownDay = entry.occurrence.date === day.date;
      const done = entry.occurrence.status === "completed";
      const missed = !done && entry.occurrence.overdue;

      if (ownDay) {
        summary.total += 1;
        if (done) summary.done += 1;
        else if (missed) summary.missed += 1;
      }

      if (isRhythmChore(entry)) {
        if (ownDay) {
          addToCell(
            rowFor(
              `chore|${entry.occurrence.template.id}`,
              "House",
              entry.occurrence.template.title,
              "chore"
            ),
            dayIndex,
            done,
            missed
          );
        }
        continue;
      }
      beyondToday.push(entry);
    }

    daySummaries.push(summary);
    if (beyondToday.length > 0) beyond.push({ date: day.date, entries: beyondToday });
  });

  // Settle each cell's state now its counts are final.
  for (const row of rows.values()) {
    row.cells = row.cells.map((cell, i) =>
      cell ? { ...cell, state: cellState(cell, daySummaries[i].when) } : null
    );
  }

  const rhythm = [...rows.values()].sort(
    (a, b) =>
      // The house after the dogs, as everywhere else in the app.
      Number(a.category === "chore") - Number(b.category === "chore") ||
      a.group.localeCompare(b.group) ||
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      a.title.localeCompare(b.title)
  );

  let due = 0;
  let done = 0;
  let missed = 0;
  let late = 0;
  let perDay = 0;
  rhythm.forEach((row) => {
    row.cells.forEach((cell, i) => {
      if (!cell) return;
      const when = daySummaries[i].when;
      if (when === "future") return;
      due += cell.total;
      done += cell.done;
      if (when === "past") missed += cell.missed;
      else late += cell.missed;
    });
  });
  // The busiest day's rhythm load, for "N a day" — a routine can start or end
  // mid-week, so the maximum describes the household better than an average.
  for (let i = 0; i < dayCount; i++) {
    let load = 0;
    for (const row of rhythm) load += row.cells[i]?.total ?? 0;
    perDay = Math.max(perDay, load);
  }

  return {
    days: daySummaries,
    rhythm,
    rhythmTotals: { due, done, missed, late, perDay },
    beyond,
  };
}

/** Rows grouped under their dog (or House), in the matrix's order. */
export function groupRhythmRows(rows: RhythmRow[]): { group: string; rows: RhythmRow[] }[] {
  const out: { group: string; rows: RhythmRow[] }[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.group === row.group) last.rows.push(row);
    else out.push({ group: row.group, rows: [row] });
  }
  return out;
}
