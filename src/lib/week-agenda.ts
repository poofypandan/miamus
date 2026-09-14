import { addDays } from "date-fns";
import { buildAgenda, formatDateLocal, type AgendaGroup } from "@/lib/scheduleEngine";
import type { MasterSchedule, TaskEntity, TaskLog } from "@/types/database";

export type ViewMode = "day" | "week";

/** How many days a week view covers, counting the selected day as day one. */
export const WEEK_LENGTH = 7;

const DAY_NAMES_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTH_NAMES_ID = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

/**
 * Date header for a day in the week view.
 *
 * Indonesian puts the day number before the month ("Sen, 14 Sep"); English
 * puts it after ("Mon, Sep 14"). Built by hand for "id" rather than via
 * toLocaleDateString, whose Indonesian output depends on which locale data the
 * device happens to ship — this keeps the staff view identical everywhere.
 */
export function formatDayHeader(date: Date, locale: "en" | "id"): string {
  if (locale === "id") {
    return `${DAY_NAMES_ID[date.getDay()]}, ${date.getDate()} ${MONTH_NAMES_ID[date.getMonth()]}`;
  }
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export interface AgendaDay {
  /** "YYYY-MM-DD", local. */
  date: string;
  dateObj: Date;
  groups: AgendaGroup[];
}

/**
 * Rolling agenda starting at `start`.
 *
 * `day` mode returns the single selected day — including when it has nothing
 * scheduled, so the view can say so. `week` mode returns WEEK_LENGTH
 * consecutive days with empty ones dropped, because a week of mostly-empty
 * headers is noise; the caller shows one empty state if everything is empty.
 */
export function buildRollingAgenda({
  start,
  mode,
  entities,
  schedules,
  logs,
}: {
  start: Date;
  mode: ViewMode;
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
}): AgendaDay[] {
  const span = mode === "week" ? WEEK_LENGTH : 1;
  const days: AgendaDay[] = [];

  for (let offset = 0; offset < span; offset++) {
    const dateObj = addDays(start, offset);
    const date = formatDateLocal(dateObj);
    const groups = buildAgenda({ date, entities, schedules, logs });
    if (mode === "week" && groups.length === 0) continue;
    days.push({ date, dateObj, groups });
  }

  return days;
}
