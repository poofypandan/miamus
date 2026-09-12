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
