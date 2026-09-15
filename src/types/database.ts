export type EntityType = "pet" | "room" | "general";
export type Module = "pet" | "cleaning" | "laundry";
export type FrequencyType = "interval" | "fixed_time" | "weekly";
export type RecordType = "vaccine" | "vet" | "medication" | "weight";
// `medicine` and `treats` were retired from the picker in Phase 57 but stay in
// the union: the column has no CHECK constraint, so any historical or
// hand-entered row carrying them must still resolve to a label rather than
// rendering blank.
export type ItemType = "food" | "medicine" | "treats" | "shampoo" | "pee_pad" | "other";
export type ProposalStatus = "pending" | "approved" | "rejected";
export type AlertStatus = "pending" | "resolved";

// Plain `type` aliases, not `interface` — interfaces don't structurally
// satisfy `Record<string, unknown>`, which postgrest-js's GenericTable
// requires for Row/Insert/Update.
export type TaskEntity = {
  id: string;
  entity_type: EntityType;
  name: string;
  icon: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type MasterSchedule = {
  id: string;
  entity_id: string;
  title: string;
  module: Module;
  frequency_type: FrequencyType;
  interval_hours: number | null;
  fixed_times: string[] | null;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
};

export type TaskLog = {
  id: string;
  schedule_id: string | null;
  entity_id: string;
  module: Module;
  photo_url: string | null;
  notes: string | null;
  completed_at: string;
};

export type MedicalRecord = {
  id: string;
  entity_id: string;
  record_type: RecordType;
  title: string;
  administered_at: string | null;
  next_due_date: string | null;
  document_photo_url: string | null;
  notes: string | null;
  // Weight logs only, in kg — null for every other record_type.
  value: number | null;
  created_at: string;
};

export type StaffProfile = {
  id: string;
  created_at: string;
};

// Note: unlike every other table here, this one's foreign key column is
// literally named `pet_id` (not `entity_id`) in the live database — it
// predates this app's polymorphic entity_id convention, so match it as-is
// rather than "fixing" it to entity_id (which 400s against the real table).
export type InventoryAlert = {
  id: string;
  // Null for a shared household item (floor cleaner, communal shampoo) that
  // isn't any one dog's. See migrations/049.
  pet_id: string | null;
  item_type: ItemType;
  note: string | null;
  // Predates `status`. Kept in sync by resolveInventoryAlert so older code
  // paths and any row written before Phase 50 still read correctly — see
  // lib/inventory-status.ts for how the two are reconciled.
  resolved: boolean;
  // Optional because PostgREST simply omits both fields until the Phase 50
  // migration has been applied.
  status?: AlertStatus | null;
  resolved_at?: string | null;
  created_at: string;
};

// One product the household stocks. inventory_alerts reference these by name
// rather than by id — a report is a note about a thing running low, and must
// survive the catalogue entry being removed.
export type InventoryItem = {
  id: string;
  name: string;
  category: ItemType;
  created_at: string;
};

// A staff-submitted request for a new routine, awaiting the owner's decision.
// Approving one is what creates the real master_schedules row — this table
// never drives the agenda itself.
export type RoutineProposal = {
  id: string;
  pet_id: string;
  title: string;
  category: ScheduleCategoryName;
  // "HH:mm:ss" as Postgres returns a `time` column.
  time: string;
  notes: string | null;
  status: ProposalStatus;
  created_by: string | null;
  // Groups the rows of one multi-dose submission. Optional because PostgREST
  // omits it until the Phase 52 migration is applied, and null for proposals
  // filed before it existed.
  batch_id?: string | null;
  // The day this proposal is for. Its meaning varies by category — see
  // migrations/062. Optional because PostgREST omits it until that migration
  // is applied, and null for proposals filed before it existed.
  scheduled_date?: string | null;
  created_at: string;
};

// Mirrors ScheduleCategory in lib/schedule-categories, kept here as a plain
// union so types/database.ts stays free of app-layer imports.
export type ScheduleCategoryName =
  | "meal"
  | "potty"
  | "medication"
  | "grooming"
  | "temporary"
  | "vet";

export interface Database {
  public: {
    Tables: {
      task_entities: {
        Row: TaskEntity;
        Insert: Partial<TaskEntity> & Pick<TaskEntity, "entity_type" | "name">;
        Update: Partial<TaskEntity>;
        Relationships: [];
      };
      master_schedules: {
        Row: MasterSchedule;
        Insert: Partial<MasterSchedule> &
          Pick<MasterSchedule, "entity_id" | "title" | "module" | "frequency_type">;
        Update: Partial<MasterSchedule>;
        Relationships: [];
      };
      task_logs: {
        Row: TaskLog;
        Insert: Partial<TaskLog> & Pick<TaskLog, "entity_id" | "module">;
        Update: Partial<TaskLog>;
        Relationships: [];
      };
      medical_records: {
        Row: MedicalRecord;
        Insert: Partial<MedicalRecord> &
          Pick<MedicalRecord, "entity_id" | "record_type" | "title">;
        Update: Partial<MedicalRecord>;
        Relationships: [];
      };
      staff_profiles: {
        Row: StaffProfile;
        Insert: Partial<StaffProfile>;
        Update: Partial<StaffProfile>;
        Relationships: [];
      };
      inventory_alerts: {
        Row: InventoryAlert;
        Insert: Partial<InventoryAlert> & Pick<InventoryAlert, "item_type">;
        Update: Partial<InventoryAlert>;
        Relationships: [];
      };
      inventory_items: {
        Row: InventoryItem;
        Insert: Partial<InventoryItem> & Pick<InventoryItem, "name">;
        Update: Partial<InventoryItem>;
        Relationships: [];
      };
      routine_proposals: {
        Row: RoutineProposal;
        Insert: Partial<RoutineProposal> &
          Pick<RoutineProposal, "pet_id" | "title" | "category" | "time">;
        Update: Partial<RoutineProposal>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
