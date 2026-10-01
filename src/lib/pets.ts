import { formatDateLocal } from "@/lib/scheduleEngine";
import type { TaskEntity, TaskLog } from "@/types/database";

export interface PetMeta {
  breed?: string;
  avatar_url?: string | null;
  archived?: boolean;
}

export function getPetMeta(entity: TaskEntity): PetMeta {
  return (entity.metadata ?? {}) as PetMeta;
}

export function isPet(entity: TaskEntity): boolean {
  return entity.entity_type === "pet";
}

export function isActivePet(entity: TaskEntity): boolean {
  return isPet(entity) && !getPetMeta(entity).archived;
}

/**
 * Whether the dog is currently staying at the clinic.
 *
 * Reads a missing column as "home" on purpose: until the Phase 79 migration is
 * applied PostgREST omits `status` entirely, and the honest default is that
 * nobody is admitted — which leaves every routine working exactly as before.
 */
export function isAdmitted(entity: TaskEntity | undefined | null): boolean {
  return entity?.status === "admitted";
}

/**
 * The photo-worthy logs for one day that genuinely belong to a pet (Phase 102).
 *
 * WHY THIS IS A FILTER AND NOT AN ASSERTION. Household chores keep their proof
 * on `household_tasks` (before_photo_url / after_photo_url, migrations/097),
 * which is a different table that never reaches this grid — a photo of a
 * mopped floor cannot arrive here by the route people expect. The real leak is
 * narrower: `task_logs.module` is "pet" | "cleaning" | "laundry", and a log
 * carries whatever module its schedule had. Nothing writes the other two
 * today, so this filter is what keeps that true rather than lucky.
 *
 * `entity_id` is checked as well as `module`: a log whose pet has been deleted
 * or archived has no name, avatar or profile to open, so it would render as an
 * anonymous tile nobody can act on.
 */
export function petPhotoLogs(params: {
  logs: TaskLog[];
  entities: TaskEntity[];
  /** "YYYY-MM-DD", compared in local time. */
  date: string;
}): TaskLog[] {
  const { logs, entities, date } = params;
  const petIds = new Set(entities.filter(isPet).map((e) => e.id));
  return logs.filter(
    (log) =>
      log.module === "pet" &&
      petIds.has(log.entity_id) &&
      formatDateLocal(new Date(log.completed_at)) === date
  );
}
