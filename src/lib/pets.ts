import { formatDateLocal } from "@/lib/scheduleEngine";
import type { TaskEntity, TaskLog } from "@/types/database";

export interface PetMeta {
  breed?: string;
  /**
   * The square the owner framed (Phase 103), shown in every small avatar.
   */
  avatar_url?: string | null;
  /**
   * The photo that square was cut from (Phase 104), shown full screen.
   *
   * Lives in metadata rather than in a column of its own because
   * task_entities.metadata is jsonb — a new key needs no migration, no
   * backfill and no deploy ordering. Absent on every pet photographed before
   * this phase, and on any upload whose master failed while its thumbnail
   * succeeded, which is why nothing reads it without a fallback.
   */
  full_image_url?: string | null;
  archived?: boolean;
}

/** The framed square, for small avatars. */
export function petAvatarUrl(entity: TaskEntity): string | null {
  return getPetMeta(entity).avatar_url ?? null;
}

/**
 * The photo to open full screen.
 *
 * Falls back to the cropped square, which is the right answer in two
 * different situations: a pet photographed before Phase 104 has no master at
 * all, and one whose master upload failed still has a usable picture. Either
 * way the lightbox opens something rather than nothing — and for the four pets
 * that predate the cropper the "square" is itself the untouched original.
 */
export function petMasterUrl(entity: TaskEntity): string | null {
  const meta = getPetMeta(entity);
  return meta.full_image_url ?? meta.avatar_url ?? null;
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
