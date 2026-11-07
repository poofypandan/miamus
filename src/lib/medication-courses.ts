import { addDays } from "date-fns";
import { categorizeSchedule, displayTitle } from "@/lib/schedule-categories";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { MasterSchedule, TaskEntity } from "@/types/database";

/**
 * Medicine courses that are about to end, have ended, or never ran (Phase 144).
 *
 * WHY. A course is a set of master_schedules rows — one per dose time — that
 * share a "Medication: " title and an expires_at, the course's last day
 * (inclusive; see isScheduleActiveOn). On the day after, every dose simply
 * stops appearing, on every phone, with nothing said anywhere. In the live
 * household that is how all sixteen of a post-operative dog's medicines
 * stopped: correctly or not, nobody was asked. And one course — a dewormer —
 * never ran a single day, because it was approved after its last day had
 * already passed and so was created already over.
 *
 * This finds those moments so the owner is asked. It never decides anything:
 * ending a course on schedule is usually right, and the answer is theirs.
 *
 * Pure, so it can be tested without a browser.
 */

export interface MedicationCourse {
  /** Stable per course: one pet, one medicine, one last day. */
  key: string;
  entityId: string;
  /** "Albumin" — the title without its "Medication: " prefix. */
  label: string;
  /** The first day any of its doses was active. */
  startDate: string;
  /** Its last day, inclusive. */
  endDate: string;
  /** One row per dose time. */
  schedules: MasterSchedule[];
}

export type CourseAlertKind =
  /** Its last day is today or within the next few. Still running. */
  | "ending"
  /** Its last day has passed. */
  | "ended"
  /** It ended before it began, so not one dose was ever scheduled. */
  | "never_ran";

/**
 * Courses one pet finished — or is finishing — on the same day, shown as one
 * line. They are nearly always one vet visit's prescription, and four lines
 * saying "ended Oct 19" for the same dog said it four times.
 */
export interface CourseAlert {
  key: string;
  kind: CourseAlertKind;
  entityId: string;
  petName: string;
  endDate: string;
  courses: MedicationCourse[];
  /** ending: days after today until the last day (0 = the last dose is today). */
  daysLeft: number;
  /** ended / never_ran: days since the last day. */
  daysAgo: number;
}

/** How far ahead a course counts as "ending soon". */
export const ENDING_WITHIN_DAYS = 3;
/**
 * How long an ended course is mentioned for. Long, deliberately: the case that
 * motivated this was noticed fifteen days late, and a one-week window would
 * have hidden exactly that. Dismissing one clears it sooner.
 */
export const ENDED_WITHIN_DAYS = 30;

function dayKey(value: string): string {
  // expires_at arrives as "YYYY-MM-DD" or a full timestamp; created_at is
  // always a timestamp and is read in local time, as isScheduleActiveOn does.
  return value.length === 10 ? value : formatDateLocal(new Date(value));
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** `days` days after `from`, as a day key. */
export function shiftDay(from: string, days: number): string {
  return formatDateLocal(addDays(new Date(`${from}T00:00:00`), days));
}

/** Every course a schedule list describes, open-ended ones excluded. */
export function medicationCourses(schedules: MasterSchedule[]): MedicationCourse[] {
  const byKey = new Map<string, MedicationCourse>();
  for (const schedule of schedules) {
    if (!schedule.is_active || !schedule.expires_at) continue;
    if (categorizeSchedule(schedule) !== "medication") continue;
    const endDate = dayKey(schedule.expires_at);
    const startDate = dayKey(schedule.created_at);
    const key = `${schedule.entity_id}|${schedule.title}|${endDate}`;
    const course = byKey.get(key);
    if (course) {
      course.schedules.push(schedule);
      if (startDate < course.startDate) course.startDate = startDate;
    } else {
      byKey.set(key, {
        key,
        entityId: schedule.entity_id,
        label: displayTitle(schedule),
        startDate,
        endDate,
        schedules: [schedule],
      });
    }
  }
  return [...byKey.values()];
}

export function medicationCourseAlerts(params: {
  schedules: MasterSchedule[];
  pets: TaskEntity[];
  today: string;
}): CourseAlert[] {
  const { schedules, pets, today } = params;
  const petName = new Map(pets.map((p) => [p.id, p.name]));
  const courses = medicationCourses(schedules).filter((c) => petName.has(c.entityId));

  // Only the latest course of each medicine for each dog speaks. A course
  // that was restarted, extended into a new one or re-prescribed is history
  // the moment its successor exists — without this, "Restart" would leave the
  // old course still announcing that it had ended. An open-ended row of the
  // same medicine (no expires_at) supersedes every dated one.
  const openEnded = new Set(
    schedules
      .filter(
        (s) => s.is_active && !s.expires_at && categorizeSchedule(s) === "medication"
      )
      .map((s) => `${s.entity_id}|${s.title}`)
  );
  const latest = new Map<string, MedicationCourse>();
  for (const course of courses) {
    const medicine = `${course.entityId}|${course.schedules[0].title}`;
    if (openEnded.has(medicine)) continue;
    const seen = latest.get(medicine);
    if (!seen || course.endDate > seen.endDate) latest.set(medicine, course);
  }

  const groups = new Map<string, CourseAlert>();
  for (const course of latest.values()) {
    let kind: CourseAlertKind;
    if (course.endDate < course.startDate) {
      kind = "never_ran";
      // Measured from when it should have started: that is when it went wrong.
      if (daysBetween(course.startDate, today) > ENDED_WITHIN_DAYS) continue;
    } else if (course.endDate >= today) {
      if (daysBetween(today, course.endDate) > ENDING_WITHIN_DAYS) continue;
      kind = "ending";
    } else {
      if (daysBetween(course.endDate, today) > ENDED_WITHIN_DAYS) continue;
      kind = "ended";
    }

    const key = `${kind}|${course.entityId}|${course.endDate}`;
    const group = groups.get(key);
    if (group) {
      group.courses.push(course);
    } else {
      groups.set(key, {
        key,
        kind,
        entityId: course.entityId,
        petName: petName.get(course.entityId)!,
        endDate: course.endDate,
        courses: [course],
        daysLeft: Math.max(0, daysBetween(today, course.endDate)),
        daysAgo: Math.max(0, daysBetween(course.endDate, today)),
      });
    }
  }

  const rank: Record<CourseAlertKind, number> = { never_ran: 0, ending: 1, ended: 2 };
  return [...groups.values()]
    .map((g) => ({ ...g, courses: g.courses.sort((a, b) => a.label.localeCompare(b.label)) }))
    .sort(
      (a, b) =>
        rank[a.kind] - rank[b.kind] ||
        // Soonest to end first; most recently ended first.
        (a.kind === "ending" ? a.daysLeft - b.daysLeft : a.daysAgo - b.daysAgo) ||
        a.petName.localeCompare(b.petName)
    );
}
