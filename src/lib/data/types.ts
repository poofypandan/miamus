import type {
  TaskEntity,
  MasterSchedule,
  TaskLog,
  MedicalRecord,
  InventoryAlert,
  Module,
  EntityType,
  FrequencyType,
  RecordType,
  ItemType,
  RoutineProposal,
  ProposalStatus,
  ScheduleCategoryName,
} from "@/types/database";

export interface CreateEntityInput {
  entity_type: EntityType;
  name: string;
  icon?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateLogInput {
  schedule_id?: string | null;
  entity_id: string;
  module: Module;
  photo_url?: string | null;
  notes?: string | null;
  completed_at?: string;
}

export interface CreateBatchLogInput {
  entries: { schedule_id?: string | null; entity_id: string }[];
  module: Module;
  photo_url?: string | null;
  notes?: string | null;
  completed_at?: string;
}

export interface CreateScheduleInput {
  entity_id: string;
  title: string;
  module: Module;
  frequency_type: FrequencyType;
  interval_hours?: number | null;
  fixed_times?: string[] | null;
  start_time?: string | null;
  end_time?: string | null;
  is_active?: boolean;
  expires_at?: string | null;
  // Overrides the default-to-now creation timestamp — used to anchor a
  // single future occurrence (see scheduleEngine's isScheduleActiveOn lower
  // bound) so it doesn't show as due before its actual date.
  created_at?: string;
}

export interface CreateMedicalRecordInput {
  entity_id: string;
  record_type: RecordType;
  title: string;
  administered_at?: string | null;
  next_due_date?: string | null;
  document_photo_url?: string | null;
  notes?: string | null;
  value?: number | null;
}

export interface CreateInventoryAlertInput {
  pet_id: string;
  item_type: ItemType;
  note?: string | null;
}

export interface CreateRoutineProposalInput {
  pet_id: string;
  title: string;
  category: ScheduleCategoryName;
  time: string;
  notes?: string | null;
  created_by?: string | null;
}

export interface DataProvider {
  listEntities(): Promise<TaskEntity[]>;
  listSchedules(): Promise<MasterSchedule[]>;
  listLogs(): Promise<TaskLog[]>;
  listMedicalRecords(): Promise<MedicalRecord[]>;
  createEntity(input: CreateEntityInput): Promise<TaskEntity>;
  updateEntity(id: string, patch: Partial<TaskEntity>): Promise<TaskEntity>;
  deleteEntity(id: string): Promise<void>;
  createLog(input: CreateLogInput): Promise<TaskLog>;
  createLogsBatch(input: CreateBatchLogInput): Promise<TaskLog[]>;
  deleteLog(id: string): Promise<void>;
  createSchedule(input: CreateScheduleInput): Promise<MasterSchedule>;
  createSchedulesBatch(entries: CreateScheduleInput[]): Promise<MasterSchedule[]>;
  updateSchedule(id: string, patch: Partial<MasterSchedule>): Promise<MasterSchedule>;
  deleteSchedule(id: string): Promise<void>;
  createMedicalRecord(input: CreateMedicalRecordInput): Promise<MedicalRecord>;
  uploadPhoto(file: File, pathPrefix: string): Promise<string>;
  deletePhoto(url: string): Promise<void>;
  listInventoryAlerts(): Promise<InventoryAlert[]>;
  createInventoryAlert(input: CreateInventoryAlertInput): Promise<InventoryAlert>;
  resolveInventoryAlert(id: string): Promise<void>;
  listRoutineProposals(): Promise<RoutineProposal[]>;
  createRoutineProposal(input: CreateRoutineProposalInput): Promise<RoutineProposal>;
  setRoutineProposalStatus(id: string, status: ProposalStatus): Promise<RoutineProposal>;
}
