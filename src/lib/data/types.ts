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
  InventoryItem,
  InventoryCategory,
  InventoryScope,
  InventoryUnit,
  InventoryAuditWithStaff,
  ProposalStatus,
  ScheduleCategoryName,
  StaffProfile,
  LogSubType,
  ChoreRecurrence,
  HouseholdTask,
  HouseholdTaskCategory,
  HouseholdTaskStatus,
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
  /**
   * Who filed this, stamped from the staff identity on the device (Phase 71).
   * Set centrally in HouseholdContext, so callers rarely pass it themselves.
   */
  staff_id?: string | null;
  /**
   * Which half of a vet visit this records (Phase 79). Omitted for ordinary
   * tasks, which the column defaults to "complete".
   */
  sub_type?: LogSubType;
}

export interface CreateBatchLogInput {
  entries: { schedule_id?: string | null; entity_id: string }[];
  module: Module;
  photo_url?: string | null;
  notes?: string | null;
  completed_at?: string;
  /**
   * Who filed this, stamped from the staff identity on the device (Phase 71).
   * Set centrally in HouseholdContext, so callers rarely pass it themselves.
   */
  staff_id?: string | null;
  /**
   * Which half of a vet visit this records (Phase 79). Omitted for ordinary
   * tasks, which the column defaults to "complete".
   */
  sub_type?: LogSubType;
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
  pet_id?: string | null;
  item_type: ItemType;
  note?: string | null;
  /**
   * Who filed this, stamped from the staff identity on the device (Phase 71).
   * Set centrally in HouseholdContext, so callers rarely pass it themselves.
   */
  staff_id?: string | null;
}

export interface CreateRoutineProposalInput {
  pet_id: string;
  title: string;
  category: ScheduleCategoryName;
  time: string;
  notes?: string | null;
  created_by?: string | null;
  batch_id?: string | null;
  scheduled_date?: string | null;
  /**
   * Who filed this, stamped from the staff identity on the device (Phase 71).
   * Set centrally in HouseholdContext, so callers rarely pass it themselves.
   */
  staff_id?: string | null;
}

export interface CreateHouseholdTaskInput {
  title: string;
  category: HouseholdTaskCategory;
  /** Omitted or null means "anyone" — see HouseholdTask.assigned_to. */
  assigned_to?: string | null;
  /** "YYYY-MM-DD". The day the chore belongs to. */
  due_date: string;
  /** "HH:mm", or null for "sometime today". */
  due_time?: string | null;
  notes?: string | null;
  /** How often it comes back. Omitted is a one-off (migrations/097). */
  recurrence?: ChoreRecurrence | null;
  /** Last day of the repeat, or null for "keep going". */
  recurrence_until?: string | null;
  /** The owner has to be there for this one. */
  requires_supervision?: boolean | null;
}

/**
 * The editable half of a chore.
 *
 * Deliberately not Partial<HouseholdTask>: completion state, tenancy and the
 * parent link are not the owner's to edit from a form, and allowing them
 * through would make the editor able to silently re-home or un-complete a
 * chore.
 */
export interface UpdateHouseholdTaskInput {
  title?: string;
  category?: HouseholdTaskCategory;
  assigned_to?: string | null;
  due_date?: string;
  due_time?: string | null;
  notes?: string | null;
  recurrence?: ChoreRecurrence | null;
  recurrence_until?: string | null;
  requires_supervision?: boolean | null;
}

/**
 * What a status change carries with it.
 *
 * Completion is never just a status: a chore is closed by producing proof, so
 * the photo and the author travel with the flip rather than in a second write
 * that could fail on its own and leave a chore done by nobody.
 */
export interface HouseholdTaskStatusPatch {
  photo_url?: string | null;
  /** Proof, in two halves since Phase 100. Both optional. */
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  /**
   * Who did it, stamped from the staff identity on the device (Phase 71).
   * Set centrally in HouseholdContext, so callers rarely pass it themselves.
   */
  completed_by?: string | null;
}

/** Everything the owner's item form sets (Phase 110). */
export interface InventoryItemInput {
  scope: InventoryScope;
  name: string;
  category: InventoryCategory;
  quantity: number;
  unit: InventoryUnit;
  min_threshold: number;
  photo_url: string | null;
  audit_frequency_days: number;
}

/** One stock check as the staff member recorded it (migrations/083, 099). */
export interface CreateInventoryAuditInput {
  item_id: string;
  /** The count, in the item's unit. */
  quantity_counted: number;
  photo_url: string | null;
  /** Stamped from the staff identity on the device, like every other write. */
  audited_by: string | null;
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
  deleteInventoryAlert(id: string): Promise<void>;
  listInventoryItems(): Promise<InventoryItem[]>;
  createInventoryItem(input: InventoryItemInput): Promise<InventoryItem>;
  updateInventoryItem(id: string, patch: Partial<InventoryItemInput>): Promise<InventoryItem>;
  deleteInventoryItem(id: string): Promise<void>;
  /**
   * The +/- stepper: adds `delta` (negative to consume) on the server, floored
   * at zero, and returns the item as it now stands. An increment rather than a
   * write of the total, so two phones tapping at once both count.
   */
  adjustInventoryQuantity(id: string, delta: number): Promise<InventoryItem>;
  /** The most recent stock check per item, keyed by item id. */
  listLatestInventoryAudits(): Promise<Record<string, InventoryAuditWithStaff>>;
  /** Stock photos go to their own bucket, not household-logs. */
  uploadInventoryPhoto(file: File, itemId: string): Promise<string>;
  /**
   * Records a stock check and writes the count back onto the item as its
   * quantity, so the item row always holds the latest known stock.
   */
  createInventoryAudit(
    input: CreateInventoryAuditInput
  ): Promise<{ audit: InventoryAuditWithStaff; item: InventoryItem }>;
  listRoutineProposals(): Promise<RoutineProposal[]>;
  createRoutineProposal(input: CreateRoutineProposalInput): Promise<RoutineProposal>;
  createRoutineProposalsBatch(inputs: CreateRoutineProposalInput[]): Promise<RoutineProposal[]>;
  setRoutineProposalsStatus(ids: string[], status: ProposalStatus): Promise<RoutineProposal[]>;
  setRoutineProposalStatus(id: string, status: ProposalStatus): Promise<RoutineProposal>;
  deleteRoutineProposal(id: string): Promise<void>;
  /**
   * Everything needed to render the chores of the days from `from` to `to`
   * inclusive (one day, or the Agenda's week): the rows dated in that span,
   * the repeating templates that reach it, and — when the span includes
   * today — whatever is still pending from the recent past. Never the whole
   * table.
   */
  listHouseholdTasks(from: string, to: string, today: string): Promise<HouseholdTask[]>;
  createHouseholdTask(input: CreateHouseholdTaskInput): Promise<HouseholdTask>;
  /** Owner-only edit of a chore's own fields. */
  updateHouseholdTask(id: string, patch: UpdateHouseholdTaskInput): Promise<HouseholdTask>;
  /** Owner-only. Deleting a template takes its materialised occurrences with it. */
  deleteHouseholdTask(id: string): Promise<void>;
  updateHouseholdTaskStatus(
    id: string,
    status: HouseholdTaskStatus,
    patch?: HouseholdTaskStatusPatch
  ): Promise<HouseholdTask>;
  /**
   * Writes the row a virtual occurrence of `templateId` on `date` would have
   * had, so it can be claimed or completed like any other. Returns the row
   * that now owns that day, whether this call created it or lost the race to
   * another phone.
   */
  materialiseChoreOccurrence(templateId: string, date: string): Promise<HouseholdTask>;
  /** Assigns an unassigned chore to a staff member. */
  claimHouseholdTask(id: string, staffId: string): Promise<HouseholdTask>;
  listStaffProfiles(): Promise<StaffProfile[]>;
  createStaffProfile(name: string): Promise<StaffProfile>;
  /**
   * Sets a staff member's PIN, or clears it (null) so they choose a new one.
   * The value is hashed server-side; nothing here ever holds a stored PIN.
   */
  setStaffPin(id: string, pin: string | null): Promise<void>;
  /** Checks a PIN against its hash (migrations/095). */
  verifyStaffPin(id: string, pin: string): Promise<boolean>;
}
