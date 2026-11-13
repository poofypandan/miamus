import { categorizeSchedule, displayTitle, type ScheduleCategory } from "@/lib/schedule-categories";
import { isoWeekday, proofOf, strongestProof } from "@/lib/pet-routine-kinds";
import type { MasterSchedule, TaskEntity, TaskLog, Module, RoutineKind, RoutineProof } from "@/types/database";

export type AgendaStatus = "pending" | "completed" | "overdue";

export interface AgendaItem {
  key: string;
  scheduleId: string;
  entityId: string;
  entityName: string;
  entityIcon: string | null;
  time: string; // "HH:mm"
  title: string;
  category: ScheduleCategory;
  module: Module;
  status: AgendaStatus;
  log: TaskLog | null;
  // Phase 173: what the Add routine sheet saved (null on old rows).
  kind: RoutineKind | null;
  proof: RoutineProof;
  note: string | null;
  staffId: string | null;
}

export interface AgendaGroup {
  time: string;
  title: string;
  category: ScheduleCategory;
  module: Module;
  items: AgendaItem[];
  /** Phase 173: the routine's kind (its icon), or null for the old kinds. */
  kind: RoutineKind | null;
  /** The proof the card follows: three over photo over tick (D4, D14). */
  proof: RoutineProof;
  /** The owner's note and the person it is for; the same on every item. */
  note: string | null;
  staffId: string | null;
  /**
   * Every distinct task title in this group, in the order they were scheduled.
   * One entry for an ordinary group; several when a dog takes three medicines
   * at noon and they have been rolled into one block.
   *
   * Deliberately a list rather than a joined string: the staff view renders it
   * in Bahasa Indonesia and the owner's in English, so the wording around it
   * belongs to them, not to the engine.
   */
  titles: string[];
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

export function isScheduleActiveOn(schedule: MasterSchedule, dateStr: string): boolean {
  if (!schedule.is_active) return false;
  // Lower bound: lets a single-occurrence row (e.g. a generated grooming
  // visit, anchored via an explicit future `created_at`) stay invisible
  // until its day arrives instead of showing as due from the moment it's
  // inserted. A no-op for ordinary rows, whose created_at is "now".
  if (formatDateLocal(new Date(schedule.created_at)) > dateStr) return false;
  if (schedule.expires_at && schedule.expires_at < dateStr) return false;
  // Some days only (Phase 173): the weekday of the calendar date itself, which
  // is already the Jakarta day the screen shows (routine_slots_open reads the
  // same). Null, or an empty list from a bad write, means every day.
  const days = schedule.days_of_week;
  if (days && days.length > 0 && !days.includes(isoWeekday(dateStr))) return false;
  return true;
}

/**
 * Whether a slot is owed (owner, 13 Nov): only if the routine existed, with
 * that time, before the slot's time. A walk added at 22.37 for 15.00 starts
 * tomorrow: on the day it is made, its earlier slots aren't on the list at
 * all, so they are never late, never in Today's counts or the evening
 * summary, and never on a staff phone. Hidden rather than shown as "starts
 * tomorrow": every list, count and summary reads buildAgenda, so one rule
 * here keeps them all agreeing, and the routine itself stays in the pet's
 * routines, where it is edited.
 *
 * Read from created_at, on this phone's clock (the app runs on Jakarta
 * time). A one-off or a generated visit is anchored at its day's midnight,
 * so every slot of it is owed, as before.
 *
 * Moving a routine's time keeps its row and its created_at (planRoutineSave),
 * and master_schedules has no "times changed" timestamp, so a time edited
 * today to one already past still counts today. Only the day it is made is
 * covered.
 *
 * The server's routine_slots_open (migrations/144), which the evening push
 * and the routine reminders and alerts read, doesn't know this rule yet.
 */
export function isSlotOwed(schedule: Pick<MasterSchedule, "created_at">, dateStr: string, slotMinutes: number): boolean {
  if (!isSameLocalDay(schedule.created_at, dateStr)) return true;
  return slotMinutes >= localMinutesOfDay(schedule.created_at);
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

    const proof = proofOf(schedule);
    const dayLogs = logs
      .filter(
        (l) =>
          l.schedule_id === schedule.id &&
          l.entity_id === entity.id &&
          isSameLocalDay(l.completed_at, date) &&
          // A three-photo routine (Phase 173, D14) is done at its end photo:
          // the start and arrived photos leave it open, as routine_slots_open
          // reads it (migrations/144). The card reads those steps from the
          // day's logs itself (threePhotoState).
          (proof !== "three" || l.sub_type === "check_out")
      )
      .map((l) => ({ log: l, minutes: localMinutesOfDay(l.completed_at) }))
      .sort((a, b) => a.minutes - b.minutes);

    const claimed = new Set<number>();
    // `dayLogs` is already scoped to this exact schedule_id, so a single-slot
    // schedule (every fixed_time row created by the app today — meals,
    // potty, medication, grooming each get their own row) has no ambiguity
    // to resolve: any same-day log for it completes it, no matter how far
    // its timestamp drifts from the nominal slot (staff logging a morning
    // walk that evening is normal, not a non-match). The time window only
    // still matters for a schedule that expands to *multiple* slots (an
    // interval-frequency row), where it disambiguates which slot a given
    // log fulfills.
    const window =
      slots.length <= 1
        ? Infinity
        : schedule.frequency_type === "interval" && schedule.interval_hours
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
      // Not owed (made after its time, on its first day): left out, unless
      // someone did it anyway, which stays on the list as done.
      if (!matchedLog && !isSlotOwed(schedule, date, slotMinutes)) continue;

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
        category: categorizeSchedule(schedule),
        module: schedule.module,
        status,
        log: matchedLog,
        kind: schedule.kind ?? null,
        proof,
        note: schedule.note?.trim() || null,
        staffId: schedule.staff_id ?? null,
      });
    }
  }

  items.sort((a, b) =>
    a.time === b.time ? a.entityName.localeCompare(b.entityName) : a.time.localeCompare(b.time)
  );

  const groups = new Map<string, AgendaGroup>();
  for (const item of items) {
    // Medicines roll up per dog: three supplements at noon are one trip to the
    // cupboard and one photo, so they read as one block instead of three
    // near-identical cards. Everything else groups by time + title across dogs,
    // which is what lets one photo of four dogs settle the whole potty round.
    //
    // The two keys are deliberately different shapes: medicines drop the title
    // (that is the thing being merged) and add the entity (Mocha's noon
    // medicines are not Matcha's), while the rest keep the title and ignore the
    // entity.
    //
    // Routines from the Add routine sheet (Phase 173) also key on their note
    // and person: Matcha's 07:00 walk with Yanti and a note, and Mocha's with
    // Sari, stay two cards, each with its own note and name. Old rows (no
    // kind) group exactly as before.
    const groupKey =
      item.category === "medication"
        ? `${item.time}|medication|${item.entityId}`
        : item.kind
          ? // A three-photo routine is one card per pet: each pet's walk is
            // its own sequence (multi-pet walks are a follow-up, plan
            // "Multi-pet walks"; Codex, PR #85).
            `${item.time}|${item.title}|routine|${item.note ?? ""}|${item.staffId ?? ""}${item.proof === "three" ? `|${item.entityId}` : ""}`
          : `${item.time}|${item.title}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        time: item.time,
        title: item.title,
        category: item.category,
        module: item.module,
        items: [],
        titles: [],
        kind: item.kind,
        proof: item.proof,
        note: item.note,
        staffId: item.staffId,
      };
      groups.set(groupKey, group);
    }
    group.items.push(item);
    group.proof = strongestProof(group.items.map((i) => i.proof));
    if (!group.titles.includes(item.title)) group.titles.push(item.title);
  }

  return Array.from(groups.values()).sort((a, b) => a.time.localeCompare(b.time));
}
