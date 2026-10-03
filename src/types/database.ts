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
// How often a chore comes back (migrations/097). "none" is a one-off, which is
// every chore filed before Phase 100. A repeating chore stays a single row and
// is expanded for the date on screen — see lib/chore-recurrence.ts.
export type ChoreRecurrence = "none" | "daily" | "weekly" | "monthly";
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

// A staff phone's own identity (migrations/089): an anonymous auth user bound
// to exactly one household. This is what makes RLS possible for devices that
// have no Google account.
export type DeviceSession = {
  id: string;
  user_id: string;
  household_id: string;
  created_at: string;
  last_seen_at: string;
};

// A co-owner's way in (migrations/091): redeems into household_members, so
// the person arrives with their own Google identity. StaffInvite is the same
// shape but redeems into device_sessions — a phone, not a person.
export type OwnerInvite = {
  id: string;
  household_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
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
  // Whether a PIN has been chosen yet — the gate needs to tell "enter yours"
  // from "pick one". The PIN itself is a bcrypt hash in a column no client
  // role may read (migrations/095-096); it is reachable only through
  // verify_staff_pin and set_staff_pin.
  has_pin: boolean;
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

// One product the household stocks (migrations/099, Phase 110). Low-stock
// reports (inventory_alerts) reference items by name rather than by id — a
// report is a note about a thing running low, and must survive the item being
// removed.

/** Which half of the inventory an item lives in. */
export type InventoryScope = "pet" | "home";

/** A shelf. Each scope has its own; the database pairs them (migrations/099). */
// Where things live in the house rather than an ERP taxonomy (Phase 110.1):
// the keys of the Phase 83 shelves, plus dog food split out of dog supplies.
export type PetInventoryCategory = "dog_food" | "dog_supplies" | "medicine";
export type HomeInventoryCategory = "fresh_food" | "pantry" | "household_supplies";
export type InventoryCategory = PetInventoryCategory | HomeInventoryCategory;

export type InventoryUnit =
  | "pcs"
  | "pack"
  | "box"
  | "bottle"
  | "roll"
  | "tube"
  | "kg"
  | "g"
  | "L"
  | "ml";

export type InventoryItem = {
  id: string;
  // The tenant (migrations/086).
  household_id: string;
  scope: InventoryScope;
  name: string;
  category: InventoryCategory;
  /** On the shelf now, in `unit`. Fractional for kg, L and the like. */
  quantity: number;
  unit: InventoryUnit;
  /** At or below this, the item is low (see isLowStock). */
  min_threshold: number;
  /** Optional reference photo of the exact product, so the right brand is bought. */
  photo_url: string | null;
  created_at: string;
  variant: string | null;
  /** How often staff are asked to count it on the staff view's "Stok". */
  audit_frequency_days: number;
  last_audited_at: string | null;
  notes: string | null;
  // The Phase 83 box/loose ledger. Still in the table so a phone on the
  // previous build keeps working through the deploy; nothing reads them now.
  unit_type?: string;
  boxes_count?: number;
  loose_units_count?: number;
  units_per_box?: number;
};

// One physical stock check (migrations/083). Append-only: a recount is a new
// row, never an edit.
export type InventoryAuditLog = {
  id: string;
  item_id: string;
  audited_by: string | null;
  /** The count, in the item's unit (migrations/099). Null on pre-Phase-110 rows. */
  quantity_counted: number | null;
  // The Phase 83 split, kept for the rows written before quantity_counted.
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
  // The single proof photo every chore completed before Phase 100 carries.
  // Kept rather than migrated: the UI falls back to it when after_photo_url is
  // null, so old completions keep showing their evidence.
  photo_url: string | null;
  created_at: string;
  // --- Phase 100 (migrations/097). All optional because PostgREST omits them
  // until that migration is applied, and the app degrades to one-off chores
  // with a single photo rather than breaking.
  //
  // A row with recurrence other than "none" is a template: its own due_date is
  // its first occurrence, and every later one is generated on the fly.
  recurrence?: ChoreRecurrence | null;
  // Last day of the repeat, or null for "keep going".
  recurrence_until?: string | null;
  // Set on a materialised occurrence, naming the template it came from.
  parent_task_id?: string | null;
  // The owner has to be present for this one.
  requires_supervision?: boolean | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
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

// One device that agreed to push notifications (migrations/103). Stored as
// the browser's PushSubscription.toJSON(), trimmed to endpoint + keys; the
// endpoint is pulled out as its own unique column so a device has one row.
export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  household_id: string;
  subscription: PushSubscriptionJSON;
  endpoint: string;
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
      device_sessions: {
        Row: DeviceSession;
        Insert: Partial<DeviceSession> & Pick<DeviceSession, "user_id" | "household_id">;
        Update: Partial<DeviceSession>;
        Relationships: [];
      };
      owner_invites: {
        Row: OwnerInvite;
        Insert: Partial<OwnerInvite> & Pick<OwnerInvite, "household_id" | "token" | "expires_at">;
        Update: Partial<OwnerInvite>;
        Relationships: [];
      };
      staff_invites: {
        Row: StaffInvite;
        Insert: Partial<StaffInvite> & Pick<StaffInvite, "household_id" | "token" | "expires_at">;
        Update: Partial<StaffInvite>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        // Registering goes through save_push_subscription; the table itself
        // is read and deleted directly, under own-device RLS.
        Insert: Pick<PushSubscriptionRow, "household_id" | "subscription">;
        Update: never;
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
      // The staff magic link's only door (migrations/089): redeems the token
      // AND binds this device to the household, or raises.
      redeem_staff_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      // The staff gate's login check. True only for the right PIN, on a staff
      // member this caller's household actually has.
      verify_staff_pin: {
        Args: { p_staff_id: string; p_pin: string };
        Returns: boolean;
      };
      // The +/- stepper (migrations/099): an atomic increment, floored at 0.
      adjust_inventory_quantity: {
        Args: { p_item_id: string; p_delta: number };
        Returns: InventoryItem[];
      };
      // Finished work per staff member over a span, by completer
      // (migrations/100). Owner-only: refuses non-members.
      staff_workload: {
        Args: { p_household_id: string; p_from: string; p_to: string };
        Returns: {
          staff_id: string | null;
          name: string | null;
          total_completed: number;
          pets_completed: number;
          chores_completed: number;
        }[];
      };
      // Hashes and stores a PIN, or clears it when given null.
      set_staff_pin: {
        Args: { p_staff_id: string; p_pin: string | null };
        Returns: undefined;
      };
      // Who has co-owner access, with emails — the table itself only ever
      // shows you your own row (migrations/094).
      list_household_members: {
        Args: Record<string, never>;
        Returns: {
          user_id: string;
          email: string;
          role: string;
          joined_at: string;
          is_founder: boolean;
          is_self: boolean;
        }[];
      };
      // Takes a co-owner's access back. Refuses yourself and the founder.
      remove_household_member: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      // Admits a signed-in Google account to the household as a co-owner.
      use_owner_invite_token: {
        Args: { p_token: string };
        Returns: string;
      };
      // Registers this device for push, or moves an existing endpoint to the
      // caller (migrations/103). Refuses non-push-service endpoints.
      save_push_subscription: {
        Args: { p_household_id: string; p_subscription: PushSubscriptionJSON };
        Returns: undefined;
      };
      // The VAPID public key from Vault; null until push is configured.
      get_push_public_key: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      // Queues a test push to every device of the caller's; returns how many.
      send_test_push: {
        Args: Record<string, never>;
        Returns: number;
      };
      // Every RLS policy's question: which households may auth.uid() touch.
      get_user_household_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
