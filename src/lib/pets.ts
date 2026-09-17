import type { TaskEntity } from "@/types/database";

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
