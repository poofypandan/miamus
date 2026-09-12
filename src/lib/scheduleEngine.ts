import { displayTitle } from "@/lib/schedule-categories";
import type { MasterSchedule, TaskEntity, TaskLog, Module } from "@/types/database";

export type AgendaStatus = "pending" | "completed" | "overdue";

export interface AgendaItem {
  key: string;
  scheduleId: string;
  entityId: string;
  entityName: string;
  entityIcon: string | null;
  time: string; // "HH:mm"
  title: string;
  module: Module;
  status: AgendaStatus;
  log: TaskLog | null;
}

export interface AgendaGroup {
  time: string;
  title: string;
  module: Module;
  items: AgendaItem[];
}

export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function toHHMM(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Postgres `time` columns serialize as "HH:mm:ss" — trim to "HH:mm".
function normalizeTime(t: string): string {
  return t.slice(0, 5);
}

function isSameLocalDay(isoTimestamp: string, dateStr: string): boolean {
  return formatDateLocal(new Date(isoTimestamp)) === dateStr;
}

function localMinutesOfDay(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  return d.getHours() * 60 + d.getMinutes();
}

function scheduleSlotMinutes(schedule: MasterSchedule): number[] {
  if (schedule.frequency_type === "interval") {
    if (!schedule.start_time || !schedule.end_time || !schedule.interval_hours) return [];
    const start = toMinutes(normalizeTime(schedule.start_time));
    const end = toMinutes(normalizeTime(schedule.end_time));
    const step = schedule.interval_hours * 60;
    if (step <= 0) return [];
    const slots: number[] = [];
    for (let t = start; t <= end; t += step) slots.push(t);
    return slots;
  }
  if (schedule.frequency_type === "fixed_time") {
    return (schedule.fixed_times ?? []).map((t) => toMinutes(normalizeTime(t)));
  }
  // "weekly" schedules aren't expanded into daily slots yet.
  return [];
}

function isScheduleActiveOn(schedule: MasterSchedule, dateStr: string): boolean {
  if (!schedule.is_active) return false;
  if (schedule.expires_at && schedule.expires_at < dateStr) return false;
  return true;
}

export function buildAgenda(params: {
  date: string; // "YYYY-MM-DD"
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  now?: Date;
}): AgendaGroup[] {
  const { date, entities, schedules, logs, now = new Date() } = params;
  const entityById = new Map(entities.map((e) => [e.id, e]));
  const todayStr = formatDateLocal(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const items: AgendaItem[] = [];

  for (const schedule of schedules) {
    if (!isScheduleActiveOn(schedule, date)) continue;
    const entity = entityById.get(schedule.entity_id);
    if (!entity) continue;

    const slots = [...scheduleSlotMinutes(schedule)].sort((a, b) => a - b);
    if (slots.length === 0) continue;

    const dayLogs = logs
      .filter(
        (l) =>
          l.schedule_id === schedule.id &&
          l.entity_id === entity.id &&
          isSameLocalDay(l.completed_at, date)
      )
      .map((l) => ({ log: l, minutes: localMinutesOfDay(l.completed_at) }))
      .sort((a, b) => a.minutes - b.minutes);

    const claimed = new Set<number>();
    // Interval schedules only claim a log within half the interval window so
    // adjacent slots (e.g. 06:00 / 08:00) never both match the same log.
    const window =
      schedule.frequency_type === "interval" && schedule.interval_hours
        ? (schedule.interval_hours * 60) / 2
        : 180;

    for (const slotMinutes of slots) {
      let bestIdx = -1;
      let bestDiff = Infinity;
      dayLogs.forEach((dl, idx) => {
        if (claimed.has(idx)) return;
        const diff = Math.abs(dl.minutes - slotMinutes);
        if (diff <= window && diff < bestDiff) {
          bestDiff = diff;
          bestIdx = idx;
        }
      });

      const matchedLog = bestIdx >= 0 ? dayLogs[bestIdx].log : null;
      if (bestIdx >= 0) claimed.add(bestIdx);

      let status: AgendaStatus;
      if (matchedLog) {
        status = "completed";
      } else if (date > todayStr) {
        status = "pending";
      } else if (date < todayStr) {
        status = "overdue";
      } else {
        status = slotMinutes <= nowMinutes ? "overdue" : "pending";
      }

      items.push({
        key: `${schedule.id}-${slotMinutes}`,
        scheduleId: schedule.id,
        entityId: entity.id,
        entityName: entity.name,
        entityIcon: entity.icon,
        time: toHHMM(slotMinutes),
        title: displayTitle(schedule),
        module: schedule.module,
        status,
        log: matchedLog,
      });
    }
  }

  items.sort((a, b) =>
    a.time === b.time ? a.entityName.localeCompare(b.entityName) : a.time.localeCompare(b.time)
  );

  const groups = new Map<string, AgendaGroup>();
  for (const item of items) {
    const groupKey = `${item.time}|${item.title}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = { time: item.time, title: item.title, module: item.module, items: [] };
      groups.set(groupKey, group);
    }
    group.items.push(item);
  }

  return Array.from(groups.values()).sort((a, b) => a.time.localeCompare(b.time));
}
