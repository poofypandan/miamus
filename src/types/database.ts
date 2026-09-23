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
// What a household chore is about (migrations/082). Distinct from Module and
// from ScheduleCategoryName: those describe work on a dog, these describe work
// on the house.
export type HouseholdTaskCategory = "cleaning" | "maintenance" | "errand" | "groceries";
// "cancelled" is in the vocabulary but written by nothing yet — it is here so
// retiring a chore later needs no migration. Every read path must still handle
// it rather than assuming pending-or-completed.
export type HouseholdTaskStatus = "pending" | "completed" | "cancelled";
export type AlertStatus = "pending" | "resolved";

// The tenant (migrations/086). One paying household; its people are
// household_members, its staff arrive through staff_invites.
export type Household = {
  id: string;
  name: string;
  // The Google account that created it. Null for Banyuwangi 11, which predates
  // sign-in entirely.
  owner_auth_id: string | null;
  created_at: string;
};

export type HouseholdMember = {
  id: string;
  household_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

export type StaffInvite = {
  id: string;
  household_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

// Plain `type` aliases, not `interface` — interfaces don't structurally
// satisfy `Record<string, unknown>`, which postgrest-js's GenericTable
// requires for Row/Insert/Update.
/** Where a dog physically is. Anything that is not a dog stays "home". */
export type EntityStatus = "home" | "admitted";

export type TaskEntity = {
  id: string;
  // The tenant (migrations/086). Always Banyuwangi 11 until Phase 86B.
  household_id: string;
  entity_type: EntityType;
  name: string;
  icon: string | null;
  metadata: Record<string, unknown>;
  // Optional because PostgREST omits it until the Phase 79 migration is
  // applied; absent reads as "home" everywhere (see lib/pets.ts).
  status?: EntityStatus | null;
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

/**
 * Which part of a task a log records.
 *
 * Every ordinary task writes "complete". A vet visit is the exception: it is
 * logged in two halves, so the dog's whereabouts are known between them.
 */
export type LogSubType = "complete" | "check_in" | "check_out" | "admitted";

export type TaskLog = {
  id: string;
  schedule_id: string | null;
  entity_id: string;
  module: Module;
  photo_url: string | null;
  notes: string | null;
  completed_at: string;
  // Who filed this, as selected on their device (migrations/071). Null for
  // everything logged before staff had identities, and self-declared rather
  // than proven — see the note on StaffProfile.pin.
  staff_id?: string | null;
  // Optional because PostgREST omits it until the Phase 79 migration is
  // applied; absent reads as "complete".
  sub_type?: LogSubType | null;
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
  // The tenant (migrations/086). Always Banyuwangi 11 until Phase 86B.
  household_id: string;
  name: string;
  // Null until the person picks one on first sign-in, and null again after the
  // owner resets it — see migrations/071. Stored as typed and readable by
  // anyone with the public anon key, so it separates household members from
  // each other rather than keeping outsiders out.
  pin: string | null;
  created_at: string;
};

// Note: unlike every other table here, this one's foreign key column is
// literally named `pet_id` (not `entity_id`) in the live database — it
// predates this app's polymorphic entity_id convention, so match it as-is
// rather than "fixing" it to entity_id (which 400s against the real table).
export type InventoryAlert = {
  id: string;
  // The tenant (migrations/086). Always Banyuwangi 11 until Phase 86B.
  household_id: string;
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
  // Who filed this, as selected on their device (migrations/071). Null for
  // everything logged before staff had identities, and self-declared rather
  // than proven — see the note on StaffProfile.pin.
  staff_id?: string | null;
  created_at: string;
};

// One product the household stocks. inventory_alerts reference these by name
// rather than by id — a report is a note about a thing running low, and must
// survive the catalogue entry being removed.
// The four shelves a stock check walks (PRD 02, migrations/083). Distinct from
// ItemType, which is what a staff low-stock *report* is about.
export type StockCategory = "fresh_food" | "pantry" | "household_supplies" | "dog_supplies";

export type InventoryItem = {
  id: string;
  // The tenant (migrations/086). Always Banyuwangi 11 until Phase 86B.
  household_id: string;
  name: string;
  // ItemType for the Phase 60 catalogue rows, StockCategory for the Phase 83
  // stock ledger. The column is unconstrained, so both live in one table.
  category: ItemType | StockCategory;
  created_at: string;
  // Everything below arrived with migrations/083; every column has a default,
  // so a Phase 60 row reads back with them filled in.
  variant: string | null;
  unit_type: string;
  boxes_count: number;
  loose_units_count: number;
  units_per_box: number;
  min_threshold: number;
  audit_frequency_days: number;
  last_audited_at: string | null;
  notes: string | null;
};

// One physical stock check (migrations/083). Append-only: a recount is a new
// row, never an edit.
export type InventoryAuditLog = {
  id: string;
  item_id: string;
  audited_by: string | null;
  boxes_counted: number;
  loose_units_counted: number;
  photo_url: string | null;
  created_at: string;
};

/** An audit with its author's name resolved, as the owner's view shows it. */
export type InventoryAuditWithStaff = InventoryAuditLog & { staff_name: string | null };

// One chore the house needs doing on one day — cleaning, a repair, an errand,
// the shopping. Deliberately not a master_schedules row: that table requires an
// entity_id and the agenda engine renders per-pet, and "mop the terrace"
// belongs to the house rather than to any dog. There is no recurrence; a repeat
// is filed again.
export type HouseholdTask = {
  id: string;
  // The tenant (migrations/086). Always Banyuwangi 11 until Phase 86B.
  household_id: string;
  title: string;
  notes: string | null;
  category: HouseholdTaskCategory;
  // Null means "anyone" — shown to every staff member as "Semua Petugas" until
  // one of them claims it. Nullable rather than cascading so a chore outlives
  // the person it was given to (see migrations/082).
  assigned_to: string | null;
  // "YYYY-MM-DD" as Postgres returns a `date` column. The day this chore
  // belongs to, and what both views filter on.
  due_date: string;
  // "HH:mm", or null for "sometime today".
  due_time: string | null;
  status: HouseholdTaskStatus;
  // Who actually did it, which is not necessarily who it was assigned to.
  completed_by: string | null;
  completed_at: string | null;
  photo_url: string | null;
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
  // Who filed this, as selected on their device (migrations/071). Null for
  // everything proposed before staff had identities, and self-declared rather
  // than proven — see the note on StaffProfile.pin.
  staff_id?: string | null;
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
        Insert: Partial<StaffProfile> & Pick<StaffProfile, "name">;
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
      inventory_audit_logs: {
        Row: InventoryAuditLog;
        Insert: Partial<InventoryAuditLog> & Pick<InventoryAuditLog, "item_id">;
        Update: Partial<InventoryAuditLog>;
        Relationships: [];
      };
      household_tasks: {
        Row: HouseholdTask;
        Insert: Partial<HouseholdTask> & Pick<HouseholdTask, "title">;
        Update: Partial<HouseholdTask>;
        Relationships: [];
      };
      households: {
        Row: Household;
        Insert: Partial<Household> & Pick<Household, "name">;
        Update: Partial<Household>;
        Relationships: [];
      };
      household_members: {
        Row: HouseholdMember;
        Insert: Partial<HouseholdMember> & Pick<HouseholdMember, "household_id" | "user_id">;
        Update: Partial<HouseholdMember>;
        Relationships: [];
      };
      staff_invites: {
        Row: StaffInvite;
        Insert: Partial<StaffInvite> & Pick<StaffInvite, "household_id" | "token" | "expires_at">;
        Update: Partial<StaffInvite>;
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
    Functions: {
      // The staff magic link's only door (migrations/088). Returns the
      // household the token belongs to, or raises.
      use_staff_invite_token: {
        Args: { p_token: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
