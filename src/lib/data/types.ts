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
  InventoryAuditWithStaff,
  ProposalStatus,
  ScheduleCategoryName,
  StaffProfile,
  LogSubType,
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
  /**
   * Who did it, stamped from the staff identity on the device (Phase 71).
   * Set centrally in HouseholdContext, so callers rarely pass it themselves.
   */
  completed_by?: string | null;
}

/** One stock check as the staff member recorded it (migrations/083). */
export interface CreateInventoryAuditInput {
  item_id: string;
  boxes_counted: number;
  loose_units_counted: number;
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
  createInventoryItem(input: { name: string; category: ItemType }): Promise<InventoryItem>;
  deleteInventoryItem(id: string): Promise<void>;
  /** The most recent stock check per item, keyed by item id. */
  listLatestInventoryAudits(): Promise<Record<string, InventoryAuditWithStaff>>;
  /** Stock photos go to their own bucket, not household-logs. */
  uploadInventoryPhoto(file: File, itemId: string): Promise<string>;
  /**
   * Records a stock check and writes the counted totals back onto the item,
   * so the item row always holds the latest known stock.
   */
  createInventoryAudit(
    input: CreateInventoryAuditInput
  ): Promise<{ audit: InventoryAuditWithStaff; item: InventoryItem }>;
  /** Adds a delivery on top of the item's current counts. */
  addInventoryStock(itemId: string, addedBoxes: number, addedLoose: number): Promise<InventoryItem>;
  listRoutineProposals(): Promise<RoutineProposal[]>;
  createRoutineProposal(input: CreateRoutineProposalInput): Promise<RoutineProposal>;
  createRoutineProposalsBatch(inputs: CreateRoutineProposalInput[]): Promise<RoutineProposal[]>;
  setRoutineProposalsStatus(ids: string[], status: ProposalStatus): Promise<RoutineProposal[]>;
  setRoutineProposalStatus(id: string, status: ProposalStatus): Promise<RoutineProposal>;
  deleteRoutineProposal(id: string): Promise<void>;
  /** This one day's chores. Never fetched in bulk — see migrations/082. */
  listHouseholdTasks(dueDate: string): Promise<HouseholdTask[]>;
  createHouseholdTask(input: CreateHouseholdTaskInput): Promise<HouseholdTask>;
  updateHouseholdTaskStatus(
    id: string,
    status: HouseholdTaskStatus,
    patch?: HouseholdTaskStatusPatch
  ): Promise<HouseholdTask>;
  /** Assigns an unassigned chore to a staff member. */
  claimHouseholdTask(id: string, staffId: string): Promise<HouseholdTask>;
  listStaffProfiles(): Promise<StaffProfile[]>;
  createStaffProfile(name: string): Promise<StaffProfile>;
  /** Sets a staff member's PIN, or clears it (null) so they choose a new one. */
  setStaffPin(id: string, pin: string | null): Promise<StaffProfile>;
}
