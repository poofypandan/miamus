import type {
  TaskEntity,
  MasterSchedule,
  TaskLog,
  MedicalRecord,
  Module,
  FrequencyType,
  RecordType,
} from "@/types/database";

export interface CreateLogInput {
  schedule_id?: string | null;
  entity_id: string;
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
}

export interface CreateMedicalRecordInput {
  entity_id: string;
  record_type: RecordType;
  title: string;
  administered_at?: string | null;
  next_due_date?: string | null;
  document_photo_url?: string | null;
  notes?: string | null;
}

export interface DataProvider {
  listEntities(): Promise<TaskEntity[]>;
  listSchedules(): Promise<MasterSchedule[]>;
  listLogs(): Promise<TaskLog[]>;
  listMedicalRecords(): Promise<MedicalRecord[]>;
  createLog(input: CreateLogInput): Promise<TaskLog>;
  createSchedule(input: CreateScheduleInput): Promise<MasterSchedule>;
  updateSchedule(id: string, patch: Partial<MasterSchedule>): Promise<MasterSchedule>;
  deleteSchedule(id: string): Promise<void>;
  createMedicalRecord(input: CreateMedicalRecordInput): Promise<MedicalRecord>;
  uploadPhoto(file: File, pathPrefix: string): Promise<string>;
}
