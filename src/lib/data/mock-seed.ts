import type { TaskEntity, MasterSchedule } from "@/types/database";

const seedTimestamp = new Date().toISOString();

export const MOCK_ENTITIES: TaskEntity[] = [
  { id: "entity-mocha", entity_type: "pet", name: "Mocha", icon: "dog", metadata: {}, created_at: seedTimestamp },
  { id: "entity-matcha", entity_type: "pet", name: "Matcha", icon: "dog", metadata: {}, created_at: seedTimestamp },
  { id: "entity-zz", entity_type: "pet", name: "ZZ", icon: "dog", metadata: {}, created_at: seedTimestamp },
  { id: "entity-millo", entity_type: "pet", name: "Millo", icon: "dog", metadata: {}, created_at: seedTimestamp },
];

type ScheduleSeed = Pick<
  MasterSchedule,
  "id" | "entity_id" | "title" | "module" | "frequency_type"
> &
  Partial<
    Pick<
      MasterSchedule,
      "interval_hours" | "fixed_times" | "start_time" | "end_time" | "expires_at" | "is_active"
    >
  >;

function schedule(seed: ScheduleSeed): MasterSchedule {
  return {
    interval_hours: null,
    fixed_times: null,
    start_time: null,
    end_time: null,
    expires_at: null,
    is_active: true,
    created_at: seedTimestamp,
    ...seed,
  };
}

const DOG_SLUGS = ["mocha", "matcha", "zz", "millo"] as const;

export const MOCK_SCHEDULES: MasterSchedule[] = [
  schedule({
    id: "sched-mocha-potty",
    entity_id: "entity-mocha",
    title: "Pipis & Pup",
    module: "pet",
    frequency_type: "interval",
    interval_hours: 2,
    start_time: "06:00",
    end_time: "21:00",
  }),
  schedule({
    id: "sched-matcha-potty",
    entity_id: "entity-matcha",
    title: "Pipis & Pup",
    module: "pet",
    frequency_type: "interval",
    interval_hours: 2,
    start_time: "06:00",
    end_time: "21:00",
  }),
  schedule({
    id: "sched-zz-potty",
    entity_id: "entity-zz",
    title: "Pipis & Pup",
    module: "pet",
    frequency_type: "interval",
    interval_hours: 3,
    start_time: "06:00",
    end_time: "21:00",
  }),
  schedule({
    id: "sched-millo-potty",
    entity_id: "entity-millo",
    title: "Pipis & Pup",
    module: "pet",
    frequency_type: "interval",
    interval_hours: 3,
    start_time: "06:00",
    end_time: "21:00",
  }),
  ...DOG_SLUGS.flatMap((slug) => [
    schedule({
      id: `sched-${slug}-lunch`,
      entity_id: `entity-${slug}`,
      title: "Makan Siang",
      module: "pet",
      frequency_type: "fixed_time",
      fixed_times: ["12:00"],
    }),
    schedule({
      id: `sched-${slug}-dinner`,
      entity_id: `entity-${slug}`,
      title: "Makan Malam",
      module: "pet",
      frequency_type: "fixed_time",
      fixed_times: ["18:00"],
    }),
  ]),
];
