import type { TaskEntity, MasterSchedule } from "@/types/database";

// Pets are managed dynamically at runtime via /dashboard/pets — the mock
// database starts with no pets and no schedules seeded.
export const MOCK_ENTITIES: TaskEntity[] = [];

export const MOCK_SCHEDULES: MasterSchedule[] = [];
