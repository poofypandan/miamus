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
  FoodItem,
  FoodOutcome,
  FoodPlace,
  FoodSource,
  StockStatus,
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
  HouseholdLocation,
  OrganiseRoomsMoved,
  OrganiseRoomsPlan,
  HouseholdTaskCategory,
  HouseholdTaskStatus,
  LeaveRequest,
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
  /** The room it is in (Phase 135), or null for none. */
  location_id?: string | null;
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
  location_id?: string | null;
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
/** What a person fills in when adding or editing food (Phase 156). */
export interface FoodItemInput {
  /** Null when there is a photo instead. */
  name: string | null;
  photo_url: string | null;
  kept_in: FoodPlace;
  expires_on: string | null;
  expiry_unknown: boolean;
  source: FoodSource | null;
  from_whom: string | null;
  return_container: boolean;
  notes: string | null;
}

/**
 * Everything a food row may be changed by from the app. The server stamps
 * finished_at and container_returned_at itself (migrations/123).
 */
export type FoodItemPatch = Partial<FoodItemInput> & {
  outcome?: FoodOutcome | null;
  finished_by?: string | null;
  container_returned_at?: string | null;
};

export interface CreateInventoryAuditInput {
  item_id: string;
  /** The count, in the item's unit. */
  quantity_counted: number;
  photo_url: string | null;
  /** Stamped from the staff identity on the device, like every other write. */
  audited_by: string | null;
}

/**
 * One person's finished work over a span (Phase 116), counted by who
 * completed it — see migrations/100. `staffId` null is the work nobody's
 * name is on.
 */
export interface StaffWorkload {
  staffId: string | null;
  name: string | null;
  totalCompleted: number;
  petsCompleted: number;
  choresCompleted: number;
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
  /**
   * The storage key and stored URL a photo will have, worked out on the
   * device with no request (Phase 138) — so a photo taken offline has its
   * final reference at once, and only the bytes wait for a connection.
   */
  reservePhotoPath(file: File, pathPrefix: string): { path: string; url: string };
  /**
   * Uploads to a key from reservePhotoPath. Safe to repeat: an object that is
   * already there counts as uploaded, which is what a retry after a reply
   * lost mid-flight finds.
   */
  uploadPhotoAt(path: string, file: File): Promise<void>;
  deletePhoto(url: string): Promise<void>;
  listInventoryAlerts(): Promise<InventoryAlert[]>;
  createInventoryAlert(input: CreateInventoryAlertInput): Promise<InventoryAlert>;
  resolveInventoryAlert(id: string): Promise<void>;
  deleteInventoryAlert(id: string): Promise<void>;
  listInventoryItems(): Promise<InventoryItem[]>;
  createInventoryItem(input: InventoryItemInput): Promise<InventoryItem>;
  updateInventoryItem(id: string, patch: Partial<InventoryItemInput>): Promise<InventoryItem>;
  /**
   * Any household session: marks an item enough, running low or out
   * (migrations/122). `staffId` is who is on duty on this phone, or null.
   */
  setInventoryStatus(id: string, status: StockStatus, staffId: string | null): Promise<InventoryItem>;
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
  /**
   * Food still on the list, plus finished food whose container has not gone
   * back yet (Phase 156, migrations/123).
   */
  listFoodItems(): Promise<FoodItem[]>;
  createFoodItem(input: FoodItemInput, addedBy: string | null): Promise<FoodItem>;
  updateFoodItem(id: string, patch: FoodItemPatch): Promise<FoodItem>;
  /** Admins only (the delete policy); for food added by mistake. */
  deleteFoodItem(id: string): Promise<void>;
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
  /**
   * Every chore that is set up, whatever week the Agenda is on (Phase 158):
   * repeats that haven't ended and one-offs not yet done, due today or later.
   * The Rooms view's source; listHouseholdTasks only covers the week on
   * screen, so a chore set up for later would look missing (Codex, PR #30).
   * Never materialised days of a repeat.
   */
  listSetUpChores(today: string): Promise<HouseholdTask[]>;
  createHouseholdTask(input: CreateHouseholdTaskInput): Promise<HouseholdTask>;
  /** Owner-only edit of a chore's own fields. */
  updateHouseholdTask(id: string, patch: UpdateHouseholdTaskInput): Promise<HouseholdTask>;
  /**
   * Owner-only. Moves a repeat's start from `fromDate` to `toDate` (skipping
   * its first day) — only if that first day is still unfinished and still
   * the start. Null when another phone finished or moved it meanwhile; the
   * row is then left exactly as it is.
   */
  advanceChoreStart(id: string, fromDate: string, toDate: string): Promise<HouseholdTask | null>;
  /**
   * Owner-only. Calls off one day of a repeat (its materialised row) — only
   * while it is still pending. Null when another phone finished it
   * meanwhile; the row, with its photos and author, is then left as it is.
   */
  skipChoreOccurrence(id: string): Promise<HouseholdTask | null>;
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
  /**
   * `assignedTo`, when given, replaces the template's assignee on the written
   * row — how a chore covered during someone's leave is filed under the
   * person actually covering it (Phase 140).
   */
  materialiseChoreOccurrence(
    templateId: string,
    date: string,
    assignedTo?: string | null
  ): Promise<HouseholdTask>;
  /** Leave whose last day is on or after `sinceDate`, oldest first (Phase 140). */
  listLeaveRequests(sinceDate: string): Promise<LeaveRequest[]>;
  getLeaveRequest(id: string): Promise<LeaveRequest | null>;
  createLeaveRequest(input: { staff_id: string; start_date: string; end_date: string }): Promise<LeaveRequest>;
  decideLeaveRequest(id: string, decision: LeaveDecision): Promise<LeaveRequest>;
  endLeaveEarly(id: string, today: string): Promise<LeaveRequest>;
  /** Assigns an unassigned chore to a staff member. */
  claimHouseholdTask(id: string, staffId: string): Promise<HouseholdTask>;
  listStaffProfiles(): Promise<StaffProfile[]>;
  /**
   * The signed-in admin's own row on the roster (Phase 139) — who they are
   * when they assign themselves a chore or work in Action Mode. Null where
   * there is none to be had (mock mode; a database without migrations/106).
   */
  ensureMyMemberProfile(householdId: string): Promise<{ id: string; name: string } | null>;
  /** The household's floors and rooms, in their order (Phase 135, 158). */
  listHouseholdLocations(): Promise<HouseholdLocation[]>;
  /**
   * Owner-only: adds a room (or, with kind "floor", a floor), on a floor when
   * parentId is given. A name already on that floor (in any case) returns
   * that place instead of failing, so "Create" never makes a twin.
   */
  createHouseholdLocation(
    name: string,
    options?: { kind?: "room" | "floor"; parentId?: string | null }
  ): Promise<HouseholdLocation>;
  /** Owner-only: rename, move to another floor, or reorder (migrations/129). */
  updateHouseholdLocation(
    id: string,
    patch: { name?: string; parent_id?: string | null; sort_order?: number }
  ): Promise<HouseholdLocation>;
  /**
   * Owner-only: deletes a room or floor. Its chores keep going without a
   * room; a floor's rooms move to "no floor" (renamed if a name clashes).
   */
  deleteHouseholdLocation(id: string): Promise<void>;
  /**
   * Owner-only: "Sort your rooms into floors" or its Undo, in one step.
   * Returns the chores a merge moved, as they were, for an exact Undo.
   */
  organiseRooms(plan: OrganiseRoomsPlan): Promise<OrganiseRoomsMoved[]>;
  /**
   * Owner-only: finished pet routines and chores per staff member between
   * two instants (`from` inclusive, `to` exclusive), most first. The server
   * refuses a caller who is not a household member.
   */
  getStaffWorkload(from: Date, to: Date): Promise<StaffWorkload[]>;
  createStaffProfile(name: string): Promise<StaffProfile>;
  /**
   * Sets a staff member's PIN, or clears it (null) so they choose a new one.
   * The value is hashed server-side; nothing here ever holds a stored PIN.
   */
  setStaffPin(id: string, pin: string | null): Promise<void>;
  /**
   * Takes someone off the active roster without deleting them, so their name
   * stays on the work they finished (migrations/109). Also revokes their PIN
   * and releases any pending chore still assigned to them.
   */
  archiveStaffProfile(id: string): Promise<StaffProfile>;
  /** Puts an archived person back on the roster. They re-choose a PIN. */
  restoreStaffProfile(id: string): Promise<StaffProfile>;
  /** Checks a PIN against its hash (migrations/095). */
  verifyStaffPin(id: string, pin: string): Promise<boolean>;
  /** The same check with the reason when it fails: tries left, or locked (migrations/115). */
  checkStaffPin(id: string, pin: string): Promise<PinCheck>;

  // House code (Phase 151, migrations/115).
  /** The names behind a house code; empty for a wrong code. Throws "too_many_attempts". */
  houseCodeRoster(code: string): Promise<HouseCodePerson[]>;
  /** Code, name and PIN together; on "ok" this phone is linked to the household. */
  signInWithHouseCode(code: string, staffId: string, pin: string): Promise<HouseCodeSignIn>;
  /** Admins only, for the active household. */
  getHouseCode(): Promise<string | null>;
  rotateHouseCode(): Promise<string>;
  listLinkedPhones(): Promise<LinkedPhone[]>;
  removeLinkedPhone(id: string): Promise<boolean>;
}

/** A PIN check's answer (migrations/115). */
export type PinCheck =
  | { status: "ok" }
  | { status: "wrong_pin"; attempts_left: number }
  | { status: "locked"; locked_until: string }
  | { status: "no_pin" };

export type HouseCodePerson = { id: string; name: string; has_pin: boolean };

export type HouseCodeSignIn =
  | Exclude<PinCheck, { status: "ok" }>
  | { status: "ok"; household_id: string }
  | { status: "wrong_code" }
  | { status: "too_many_attempts" };

/** A staff phone linked to the household (device_sessions). */
export type LinkedPhone = { id: string; linked_at: string; last_seen_at: string };

/** An admin's answer to a leave request (Phase 140). */
export type LeaveDecision =
  | { status: "rejected" }
  | {
      status: "approved";
      fallback_action: "reassign" | "unassign" | "pause";
      fallback_assignee_id: string | null;
    };
