import type {
  TaskEntity,
  MasterSchedule,
  TaskLog,
  MedicalRecord,
  InventoryAlert,
  RoutineProposal,
  InventoryItem,
  FoodItem,
  InventoryAuditWithStaff,
  StaffProfile,
  HouseholdTask,
  HouseholdLocation,
  LeaveRequest,
  Repair,
  RepairCost,
  BillPayment,
  TaskException,
  NotificationPrefs,
  RepairNote,
} from "@/types/database";
import { getActiveHouseholdId } from "@/lib/tenant";
import { MOCK_ENTITIES, MOCK_SCHEDULES } from "./mock-seed";
import type { CreateScheduleInput, DataProvider } from "./types";
import { isTemplate, longRepeatFloorFor } from "@/lib/chore-recurrence";
import { isSetUp } from "@/lib/rooms-view";

const STORAGE_KEY = "maimus_mock_db_v1";
// The preview household's house code, as an admin would read it out: MIA-M23.
const MOCK_HOUSE_CODE = "MIAM23";

interface MockDB {
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  medicalRecords: MedicalRecord[];
  inventoryAlerts: InventoryAlert[];
  routineProposals: RoutineProposal[];
  inventoryItems: InventoryItem[];
  foodItems: FoodItem[];
  inventoryAudits: InventoryAuditWithStaff[];
  staffProfiles: StaffProfile[];
  /** Mock-only: PINs are hashed in the real database (migrations/095). */
  staffPins?: Record<string, string | null>;
  // The house code (Phase 151); MOCK_HOUSE_CODE until "Change code" is used.
  houseCode?: string;
  householdTasks: HouseholdTask[];
  householdLocations: HouseholdLocation[];
  leaveRequests: LeaveRequest[];
  /** Phase 159. Optional: a stored demo database from before it has none. */
  repairs?: Repair[];
  repairCosts?: RepairCost[];
  repairNotes?: RepairNote[];
  /** Phase 164 PR B. Optional, as above. */
  billPayments?: BillPayment[];
  /** Phase 165. Optional, as above. */
  taskExceptions?: TaskException[];
  notificationPrefs?: NotificationPrefs;
}

function freshDB(): MockDB {
  return {
    entities: MOCK_ENTITIES,
    schedules: MOCK_SCHEDULES,
    logs: [],
    medicalRecords: [],
    inventoryAlerts: [],
    routineProposals: [],
    inventoryItems: [],
    foodItems: [],
    inventoryAudits: [],
    staffProfiles: [],
    householdTasks: [],
    householdLocations: [],
    leaveRequests: [],
  };
}

function loadDB(): MockDB {
  if (typeof window === "undefined") return freshDB();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDB;
      // Guards against a DB saved before these collections existed.
      return {
        ...parsed,
        inventoryAlerts: parsed.inventoryAlerts ?? [],
        routineProposals: parsed.routineProposals ?? [],
        // Items from before Phase 110 have no scope or quantity; dropped
        // rather than half-rendered.
        inventoryItems: (parsed.inventoryItems ?? []).filter((item) => item.scope),
        foodItems: parsed.foodItems ?? [],
        inventoryAudits: parsed.inventoryAudits ?? [],
        staffProfiles: parsed.staffProfiles ?? [],
        householdTasks: parsed.householdTasks ?? [],
        householdLocations: parsed.householdLocations ?? [],
        leaveRequests: parsed.leaveRequests ?? [],
      };
    }
  } catch {
    // corrupt storage — fall through to a fresh seed below
  }
  const db = freshDB();
  saveDB(db);
  return db;
}

function saveDB(db: MockDB) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The Add routine sheet's fields (Phase 173), with the database's defaults. */
function routineFields(input: CreateScheduleInput) {
  return {
    kind: input.kind ?? null,
    routine_group_id: input.routine_group_id ?? null,
    days_of_week: input.days_of_week ?? null,
    note: input.note ?? null,
    staff_id: input.staff_id ?? null,
    proof: input.proof ?? "photo",
  };
}

function delay<T>(value: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export const mockProvider: DataProvider = {
  async listEntities() {
    return delay(loadDB().entities);
  },
  async listSchedules() {
    return delay(loadDB().schedules);
  },
  async listLogs() {
    return delay(loadDB().logs);
  },
  async listMedicalRecords() {
    return delay(loadDB().medicalRecords);
  },
  async createEntity(input) {
    const db = loadDB();
    const entity: TaskEntity = {
      id: uid("entity"),
      household_id: getActiveHouseholdId(),
      entity_type: input.entity_type,
      name: input.name,
      icon: input.icon ?? null,
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
    };
    db.entities.push(entity);
    saveDB(db);
    return delay(entity);
  },
  async updateEntity(id, patch) {
    const db = loadDB();
    const idx = db.entities.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error(`Entity ${id} not found`);
    db.entities[idx] = { ...db.entities[idx], ...patch };
    saveDB(db);
    return delay(db.entities[idx]);
  },
  async deleteEntity(id) {
    const db = loadDB();
    db.entities = db.entities.filter((e) => e.id !== id);
    db.schedules = db.schedules.filter((s) => s.entity_id !== id);
    db.logs = db.logs.filter((l) => l.entity_id !== id);
    db.medicalRecords = db.medicalRecords.filter((m) => m.entity_id !== id);
    saveDB(db);
    return delay(undefined);
  },
  async createLog(input) {
    const db = loadDB();
    const log: TaskLog = {
      id: uid("log"),
      schedule_id: input.schedule_id ?? null,
      entity_id: input.entity_id,
      module: input.module,
      photo_url: input.photo_url ?? null,
      notes: input.notes ?? null,
      completed_at: input.completed_at ?? new Date().toISOString(),
    };
    db.logs.push(log);
    saveDB(db);
    return delay(log);
  },
  async createLogsBatch(input) {
    const db = loadDB();
    const completedAt = input.completed_at ?? new Date().toISOString();
    // The primary key's refusal of a retried save, as Postgres words it (Phase 161).
    if (input.ids?.some((id) => db.logs.some((l) => l.id === id))) {
      throw { code: "23505", message: 'duplicate key value violates unique constraint "task_logs_pkey"' };
    }
    const logs: TaskLog[] = input.entries.map((entry, i) => ({
      id: input.ids?.[i] ?? uid("log"),
      schedule_id: entry.schedule_id ?? null,
      entity_id: entry.entity_id,
      module: input.module,
      photo_url: input.photo_url ?? null,
      notes: input.notes ?? null,
      completed_at: completedAt,
      staff_id: input.staff_id ?? null,
      sub_type: input.sub_type ?? "complete",
      // The database stamps this on arrival (migrations/144).
      received_at: new Date().toISOString(),
    }));
    db.logs.push(...logs);
    saveDB(db);
    return delay(logs);
  },
  async deleteLog(id) {
    const db = loadDB();
    db.logs = db.logs.filter((l) => l.id !== id);
    saveDB(db);
    return delay(undefined);
  },
  async createSchedule(input) {
    const db = loadDB();
    const newSchedule: MasterSchedule = {
      id: uid("sched"),
      entity_id: input.entity_id,
      title: input.title,
      module: input.module,
      frequency_type: input.frequency_type,
      interval_hours: input.interval_hours ?? null,
      fixed_times: input.fixed_times ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      is_active: input.is_active ?? true,
      expires_at: input.expires_at ?? null,
      created_at: input.created_at ?? new Date().toISOString(),
      ...routineFields(input),
    };
    db.schedules.push(newSchedule);
    saveDB(db);
    return delay(newSchedule);
  },
  async createSchedulesBatch(entries) {
    const db = loadDB();
    const created: MasterSchedule[] = entries.map((input) => ({
      id: uid("sched"),
      entity_id: input.entity_id,
      title: input.title,
      module: input.module,
      frequency_type: input.frequency_type,
      interval_hours: input.interval_hours ?? null,
      fixed_times: input.fixed_times ?? null,
      start_time: input.start_time ?? null,
      end_time: input.end_time ?? null,
      is_active: input.is_active ?? true,
      expires_at: input.expires_at ?? null,
      created_at: input.created_at ?? new Date().toISOString(),
      ...routineFields(input),
    }));
    db.schedules.push(...created);
    saveDB(db);
    return delay(created);
  },
  async updateSchedule(id, patch) {
    const db = loadDB();
    const idx = db.schedules.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`Schedule ${id} not found`);
    db.schedules[idx] = { ...db.schedules[idx], ...patch };
    saveDB(db);
    return delay(db.schedules[idx]);
  },
  async deleteSchedule(id) {
    const db = loadDB();
    db.schedules = db.schedules.filter((s) => s.id !== id);
    saveDB(db);
    return delay(undefined);
  },
  async schedulesWithLogs(ids) {
    const db = loadDB();
    return delay(new Set(db.logs.filter((l) => l.schedule_id && ids.includes(l.schedule_id)).map((l) => l.schedule_id!)));
  },
  async createMedicalRecord(input) {
    const db = loadDB();
    const record: MedicalRecord = {
      id: uid("med"),
      entity_id: input.entity_id,
      record_type: input.record_type,
      title: input.title,
      administered_at: input.administered_at ?? null,
      next_due_date: input.next_due_date ?? null,
      document_photo_url: input.document_photo_url ?? null,
      notes: input.notes ?? null,
      value: input.value ?? null,
      created_at: new Date().toISOString(),
    };
    db.medicalRecords.push(record);
    saveDB(db);
    return delay(record);
  },
  async uploadPhoto(file) {
    // No real storage in mock mode — an object URL is enough to preview
    // within this browser session.
    return delay(URL.createObjectURL(file), 300);
  },
  reservePhotoPath(file) {
    // The object URL is the whole "upload" here, so it is ready at once.
    return { path: "", url: URL.createObjectURL(file) };
  },
  async uploadPhotoAt() {
    return delay(undefined, 300);
  },
  async deletePhoto(url) {
    // Mirrors uploadPhoto: nothing persisted server-side in mock mode, but
    // release the blob: URL so the browser can free the memory.
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    return delay(undefined);
  },
  async listInventoryAlerts() {
    return delay(loadDB().inventoryAlerts);
  },
  async createInventoryAlert(input) {
    const db = loadDB();
    const alert: InventoryAlert = {
      id: input.id ?? uid("alert"),
      household_id: getActiveHouseholdId(),
      pet_id: input.pet_id ?? null,
      item_type: input.item_type,
      note: input.note ?? null,
      resolved: false,
      status: "pending",
      resolved_at: null,
      created_at: new Date().toISOString(),
    };
    db.inventoryAlerts.push(alert);
    saveDB(db);
    return delay(alert);
  },
  async resolveInventoryAlert(id) {
    const db = loadDB();
    const idx = db.inventoryAlerts.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Inventory alert ${id} not found`);
    db.inventoryAlerts[idx] = {
      ...db.inventoryAlerts[idx],
      resolved: true,
      status: "resolved",
      resolved_at: new Date().toISOString(),
    };
    saveDB(db);
    return delay(undefined);
  },
  async deleteInventoryAlert(id) {
    const db = loadDB();
    db.inventoryAlerts = db.inventoryAlerts.filter((a) => a.id !== id);
    saveDB(db);
    return delay(undefined);
  },
  async listInventoryItems() {
    return delay(loadDB().inventoryItems);
  },
  async createInventoryItem(input) {
    const db = loadDB();
    const item: InventoryItem = {
      id: uid("item"),
      household_id: getActiveHouseholdId(),
      ...input,
      created_at: new Date().toISOString(),
      variant: null,
      last_audited_at: null,
      notes: null,
    };
    db.inventoryItems.push(item);
    saveDB(db);
    return delay(item);
  },
  async updateInventoryItem(id, patch) {
    const db = loadDB();
    const index = db.inventoryItems.findIndex((i) => i.id === id);
    if (index === -1) throw new Error("Item not found");
    const item: InventoryItem = { ...db.inventoryItems[index], ...patch };
    db.inventoryItems[index] = item;
    saveDB(db);
    return delay(item);
  },
  async setInventoryStatus(id, status, staffId) {
    const db = loadDB();
    const index = db.inventoryItems.findIndex((i) => i.id === id);
    if (index === -1) throw new Error("Item not found");
    const item: InventoryItem = {
      ...db.inventoryItems[index],
      stock_status: status,
      stock_status_by: staffId,
      stock_status_at: new Date().toISOString(),
    };
    db.inventoryItems[index] = item;
    saveDB(db);
    return delay(item);
  },
  async adjustInventoryQuantity(id, delta) {
    const db = loadDB();
    const index = db.inventoryItems.findIndex((i) => i.id === id);
    if (index === -1) throw new Error("Item not found");
    // Floored at zero, like the RPC in migrations/099.
    const current = db.inventoryItems[index];
    const item: InventoryItem = { ...current, quantity: Math.max(0, current.quantity + delta) };
    db.inventoryItems[index] = item;
    saveDB(db);
    return delay(item);
  },
  async deleteInventoryItem(id) {
    const db = loadDB();
    db.inventoryItems = db.inventoryItems.filter((i) => i.id !== id);
    saveDB(db);
    return delay(undefined);
  },
  async listLatestInventoryAudits() {
    const latest: Record<string, InventoryAuditWithStaff> = {};
    // Stored oldest-first, so the last write per item wins.
    for (const audit of loadDB().inventoryAudits) latest[audit.item_id] = audit;
    return delay(latest);
  },
  async uploadInventoryPhoto(file) {
    return delay(URL.createObjectURL(file), 300);
  },
  async createInventoryAudit(input) {
    const db = loadDB();
    const staffName = db.staffProfiles.find((p) => p.id === input.audited_by)?.name ?? null;
    const audit: InventoryAuditWithStaff = {
      id: uid("audit"),
      ...input,
      // The column defaults for the Phase 83 split.
      boxes_counted: 0,
      loose_units_counted: 0,
      created_at: new Date().toISOString(),
      staff_name: staffName,
    };
    db.inventoryAudits.push(audit);
    const index = db.inventoryItems.findIndex((i) => i.id === input.item_id);
    if (index === -1) throw new Error("Item not found");
    const item: InventoryItem = {
      ...db.inventoryItems[index],
      quantity: input.quantity_counted,
      last_audited_at: audit.created_at,
    };
    db.inventoryItems[index] = item;
    saveDB(db);
    return delay({ audit, item });
  },
  async listFoodItems() {
    return delay(
      loadDB().foodItems.filter(
        (f) => f.outcome === null || (f.return_container && !f.container_returned_at)
      )
    );
  },
  async createFoodItem(input, addedBy) {
    const db = loadDB();
    const now = new Date().toISOString();
    if (input.id && db.foodItems.some((f) => f.id === input.id)) {
      throw { code: "23505", message: 'duplicate key value violates unique constraint "food_items_pkey"' };
    }
    const item: FoodItem = {
      household_id: getActiveHouseholdId(),
      ...input,
      id: input.id ?? uid("food"),
      name: input.name?.trim() || null,
      added_by: addedBy,
      created_by: null,
      created_at: now,
      updated_at: now,
      container_returned_at: null,
      outcome: null,
      finished_at: null,
      finished_by: null,
    };
    db.foodItems.push(item);
    saveDB(db);
    return delay(item);
  },
  async updateFoodItem(id, patch) {
    const db = loadDB();
    const index = db.foodItems.findIndex((f) => f.id === id);
    if (index === -1) throw new Error("Food not found");
    const before = db.foodItems[index];
    const now = new Date().toISOString();
    const item: FoodItem = { ...before, ...patch, updated_at: now };
    // The server's rules (migrations/123), so mock mode behaves the same.
    if ("outcome" in patch && patch.outcome !== before.outcome) {
      item.finished_at = patch.outcome ? now : null;
      if (!patch.outcome) item.finished_by = null;
    }
    if ("container_returned_at" in patch) item.container_returned_at = patch.container_returned_at ? now : null;
    if (item.expires_on) item.expiry_unknown = false;
    db.foodItems[index] = item;
    saveDB(db);
    return delay(item);
  },
  async deleteFoodItem(id) {
    const db = loadDB();
    db.foodItems = db.foodItems.filter((f) => f.id !== id);
    saveDB(db);
    return delay(undefined);
  },
  async listRoutineProposals() {
    return delay(loadDB().routineProposals);
  },
  async createRoutineProposal(input) {
    const db = loadDB();
    const proposal: RoutineProposal = {
      id: uid("proposal"),
      pet_id: input.pet_id,
      title: input.title,
      category: input.category,
      time: input.time,
      notes: input.notes ?? null,
      status: "pending",
      created_by: input.created_by ?? null,
      created_at: new Date().toISOString(),
    };
    db.routineProposals.unshift(proposal);
    saveDB(db);
    return delay(proposal);
  },
  async deleteRoutineProposal(id) {
    const db = loadDB();
    db.routineProposals = db.routineProposals.filter((r) => r.id !== id);
    saveDB(db);
    return delay(undefined);
  },
  async createRoutineProposalsBatch(inputs) {
    const db = loadDB();
    const created: RoutineProposal[] = inputs.map((input) => ({
      id: uid("proposal"),
      pet_id: input.pet_id,
      title: input.title,
      category: input.category,
      time: input.time,
      notes: input.notes ?? null,
      status: "pending",
      created_by: input.created_by ?? null,
      batch_id: input.batch_id ?? null,
      scheduled_date: input.scheduled_date ?? null,
      created_at: new Date().toISOString(),
    }));
    db.routineProposals.unshift(...created);
    saveDB(db);
    return delay(created);
  },
  async setRoutineProposalsStatus(ids, status) {
    const db = loadDB();
    const updated: RoutineProposal[] = [];
    db.routineProposals = db.routineProposals.map((r) => {
      if (!ids.includes(r.id)) return r;
      const next = { ...r, status };
      updated.push(next);
      return next;
    });
    saveDB(db);
    return delay(updated);
  },
  async setRoutineProposalStatus(id, status) {
    const db = loadDB();
    const idx = db.routineProposals.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Routine proposal ${id} not found`);
    const updated = { ...db.routineProposals[idx], status };
    db.routineProposals[idx] = updated;
    saveDB(db);
    return delay(updated);
  },
  async listWrittenOccurrences(from, to) {
    return delay(
      loadDB().householdTasks.filter((t) => !!t.parent_task_id && t.due_date >= from && t.due_date <= to)
    );
  },
  async listSetUpChores(today) {
    // Same rows listHouseholdTasks reads from, filtered the way the Rooms
    // view's isSetUp does.
    return delay(loadDB().householdTasks.filter((task) => isSetUp(task, today)));
  },
  async listHouseholdTasks(from, to, today) {
    // Mirrors the three reads the Supabase provider issues (Phase 100), so
    // mock mode expands the same rows into the same occurrences: this day's
    // rows, every repeat that could reach it, and — on today only — whatever
    // is still pending from before it (the rollover).
    // Plus, on today, the reads Phase 126 added: repeats that ended within
    // the last month, and the last month's written occurrences of repeats.
    // Reaching back a year for every repeat's written days is cheap in
    // memory; the Supabase provider reads that far only for long repeats
    // (every 3 months, every year; migrations/137).
    const showsToday = from <= today && today <= to;
    const rolloverFloor = longRepeatFloorFor(today);
    const repeatsFrom = showsToday && rolloverFloor < from ? rolloverFloor : from;
    const tasks = loadDB().householdTasks.filter((task) => {
      if (task.due_date >= from && task.due_date <= to) return true;
      const repeats = !!task.recurrence && task.recurrence !== "none";
      if (
        repeats &&
        task.due_date <= to &&
        (!task.recurrence_until || task.recurrence_until >= repeatsFrom)
      ) {
        return true;
      }
      if (
        showsToday &&
        task.parent_task_id &&
        task.due_date >= rolloverFloor &&
        task.due_date < today
      ) {
        return true;
      }
      return showsToday && task.status === "pending" && task.due_date < today;
    });
    return delay(
      [...tasks].sort((a, b) => {
        if (a.due_time !== b.due_time) {
          if (!a.due_time) return -1;
          if (!b.due_time) return 1;
          return a.due_time.localeCompare(b.due_time);
        }
        return a.created_at.localeCompare(b.created_at);
      })
    );
  },
  async updateHouseholdTask(id, patch) {
    const db = loadDB();
    const idx = db.householdTasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Household task ${id} not found`);
    const updated: HouseholdTask = { ...db.householdTasks[idx], ...patch };
    db.householdTasks[idx] = updated;
    saveDB(db);
    return delay(updated);
  },
  async advanceChoreStart(id, fromDate, toDate) {
    const db = loadDB();
    const idx = db.householdTasks.findIndex(
      (t) => t.id === id && t.due_date === fromDate && t.status === "pending"
    );
    if (idx === -1) return delay(null);
    const updated: HouseholdTask = { ...db.householdTasks[idx], due_date: toDate };
    db.householdTasks[idx] = updated;
    saveDB(db);
    return delay(updated);
  },
  async skipChoreOccurrence(id) {
    const db = loadDB();
    const idx = db.householdTasks.findIndex((t) => t.id === id && t.status === "pending");
    if (idx === -1) return delay(null);
    const updated: HouseholdTask = { ...db.householdTasks[idx], status: "cancelled" };
    db.householdTasks[idx] = updated;
    saveDB(db);
    return delay(updated);
  },
  async deleteHouseholdTask(id) {
    const db = loadDB();
    // Mirrors `on delete cascade` on parent_task_id (migrations/097): removing
    // a repeat takes its materialised occurrences with it.
    db.householdTasks = db.householdTasks.filter(
      (t) => t.id !== id && t.parent_task_id !== id
    );
    saveDB(db);
    return delay(undefined);
  },
  async materialiseChoreOccurrence(templateId, date, assignedTo) {
    const db = loadDB();
    const existing = db.householdTasks.find(
      (t) => t.parent_task_id === templateId && t.due_date === date
    );
    if (existing) return delay(existing);
    const template = db.householdTasks.find((t) => t.id === templateId);
    if (!template) throw new Error(`Household task ${templateId} not found`);
    const occurrence: HouseholdTask = {
      ...template,
      id: uid("chore"),
      parent_task_id: template.id,
      assigned_to: assignedTo === undefined ? template.assigned_to : assignedTo,
      due_date: date,
      recurrence: "none",
      recurrence_until: null,
      status: "pending",
      completed_by: null,
      completed_at: null,
      photo_url: null,
      before_photo_url: null,
      after_photo_url: null,
      created_at: new Date().toISOString(),
    };
    db.householdTasks.push(occurrence);
    saveDB(db);
    return delay(occurrence);
  },
  async createHouseholdTask(input) {
    const [task] = await mockProvider.createHouseholdTasks([input]);
    return task;
  },
  async listRepairs() {
    const household = getActiveHouseholdId();
    return delay(
      (loadDB().repairs ?? [])
        .filter((r) => r.household_id === household)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    );
  },
  async listRepairVisits() {
    const household = getActiveHouseholdId();
    return delay(loadDB().householdTasks.filter((t) => t.household_id === household && !!t.repair_id));
  },
  async createRepair(input) {
    const db = loadDB();
    const now = new Date().toISOString();
    const repair: Repair = {
      id: uid("repair"),
      household_id: getActiveHouseholdId(),
      location_id: input.location_id ?? null,
      spot: input.spot?.trim() || null,
      title: input.title.trim(),
      details: input.details?.trim() || null,
      photo_url: input.photo_url ?? null,
      urgent: input.urgent ?? false,
      status: input.status,
      reported_by_staff: input.reported_by_staff ?? null,
      created_by: null,
      created_at: now,
      updated_at: now,
      decided_by: null,
      decided_at: null,
      dismiss_reason: null,
      fixed_by_name: null,
      closed_at: null,
    };
    db.repairs = [...(db.repairs ?? []), repair];
    saveDB(db);
    return delay(repair);
  },
  async updateRepair(id, patch) {
    const db = loadDB();
    const repairs = db.repairs ?? [];
    const idx = repairs.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Repair ${id} not found`);
    const before = repairs[idx];
    const now = new Date().toISOString();
    const next: Repair = { ...before, ...patch, updated_at: now };
    // As migrations/130's guard: decided once, closed while fixed or dismissed.
    if (patch.status && patch.status !== before.status) {
      if (before.status === "reported") next.decided_at = now;
      next.closed_at = patch.status === "fixed" || patch.status === "dismissed" ? now : null;
    }
    if (next.status !== "dismissed") next.dismiss_reason = null;
    repairs[idx] = next;
    db.repairs = repairs;
    saveDB(db);
    return delay(next);
  },
  async deleteRepair(id) {
    const db = loadDB();
    db.repairs = (db.repairs ?? []).filter((r) => r.id !== id);
    // As the cascade: its cost and notes go too.
    db.repairCosts = (db.repairCosts ?? []).filter((c) => c.repair_id !== id);
    db.repairNotes = (db.repairNotes ?? []).filter((n) => n.repair_id !== id);
    // As the foreign key's "set null": visits stay, unlinked.
    db.householdTasks = db.householdTasks.map((t) => (t.repair_id === id ? { ...t, repair_id: null } : t));
    saveDB(db);
    return delay(undefined);
  },
  async getRepairCost(repairId) {
    return delay((loadDB().repairCosts ?? []).find((c) => c.repair_id === repairId) ?? null);
  },
  async saveRepairCost(repairId, cost) {
    const db = loadDB();
    const row: RepairCost = {
      repair_id: repairId,
      household_id: getActiveHouseholdId(),
      amount_idr: cost.amount_idr,
      receipt_url: cost.receipt_url,
      note: cost.note?.trim() || null,
      created_by: null,
      updated_at: new Date().toISOString(),
    };
    db.repairCosts = [...(db.repairCosts ?? []).filter((c) => c.repair_id !== repairId), row];
    saveDB(db);
    return delay(row);
  },
  async uploadReceipt(file) {
    // Demo mode keeps photos as object URLs, like uploadPhoto.
    return delay(URL.createObjectURL(file));
  },
  async listBillPayments() {
    const household = getActiveHouseholdId();
    return delay(
      (loadDB().billPayments ?? [])
        .filter((p) => p.household_id === household)
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    );
  },
  async saveBillPayment(taskId, payment) {
    const db = loadDB();
    const existing = (db.billPayments ?? []).find((p) => p.task_id === taskId);
    const task = db.householdTasks.find((t) => t.id === taskId);
    const now = new Date().toISOString();
    const row: BillPayment = {
      id: existing?.id ?? `bill-payment-${Date.now()}`,
      household_id: getActiveHouseholdId(),
      task_id: taskId,
      series_id: existing?.series_id ?? (task ? (task.parent_task_id ?? task.id) : null),
      amount_idr: payment.amount_idr,
      receipt_url: payment.receipt_url,
      paid_at: existing?.paid_at ?? now,
      created_by: null,
      updated_at: now,
    };
    db.billPayments = [...(db.billPayments ?? []).filter((p) => p.task_id !== taskId), row];
    saveDB(db);
    return delay(row);
  },
  async reopenBillDay(taskId) {
    const db = loadDB();
    const payment = (db.billPayments ?? []).find((p) => p.task_id === taskId) ?? null;
    const idx = db.householdTasks.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error(`Household task ${taskId} not found`);
    const task: HouseholdTask = {
      ...db.householdTasks[idx],
      status: "pending",
      completed_at: null,
      completed_by: null,
      photo_url: null,
      before_photo_url: null,
      after_photo_url: null,
    };
    db.householdTasks[idx] = task;
    db.billPayments = (db.billPayments ?? []).filter((p) => p.task_id !== taskId);
    saveDB(db);
    return delay({ task, payment });
  },
  async deleteBillPayment(taskId) {
    const db = loadDB();
    const existing = (db.billPayments ?? []).find((p) => p.task_id === taskId) ?? null;
    db.billPayments = (db.billPayments ?? []).filter((p) => p.task_id !== taskId);
    saveDB(db);
    return delay(existing);
  },
  async deleteReceipt() {
    return delay(undefined);
  },
  async listRepairNotes() {
    const household = getActiveHouseholdId();
    return delay((loadDB().repairNotes ?? []).filter((n) => n.household_id === household));
  },
  async addRepairNote(note) {
    const db = loadDB();
    const row: RepairNote = {
      id: uid("note"),
      household_id: getActiveHouseholdId(),
      repair_id: note.repair_id,
      body: note.body.trim(),
      photo_url: note.photo_url ?? null,
      staff_id: note.staff_id ?? null,
      created_by: null,
      created_at: new Date().toISOString(),
    };
    db.repairNotes = [...(db.repairNotes ?? []), row];
    saveDB(db);
    return delay(row);
  },
  async deleteRepairNote(id) {
    const db = loadDB();
    db.repairNotes = (db.repairNotes ?? []).filter((n) => n.id !== id);
    saveDB(db);
    return delay(undefined);
  },
  async listTaskExceptions(since) {
    const household = getActiveHouseholdId();
    return delay(
      (loadDB().taskExceptions ?? []).filter((x) => x.household_id === household && x.occurs_on >= since)
    );
  },
  async createTaskException(input) {
    const db = loadDB();
    const row: TaskException = {
      chore_id: null,
      schedule_id: null,
      entity_id: null,
      slot_time: null,
      note: null,
      photo_url: null,
      inventory_item_id: null,
      staff_id: null,
      ...input,
      household_id: getActiveHouseholdId(),
      created_at: new Date().toISOString(),
    };
    db.taskExceptions = [...(db.taskExceptions ?? []).filter((x) => x.id !== row.id), row];
    saveDB(db);
    return delay(row);
  },
  async deleteTaskException(id) {
    const db = loadDB();
    const before = (db.taskExceptions ?? []).length;
    db.taskExceptions = (db.taskExceptions ?? []).filter((x) => x.id !== id);
    saveDB(db);
    return delay(db.taskExceptions.length < before);
  },
  async getNotificationPrefs() {
    return delay(loadDB().notificationPrefs ?? { evening_summary_hour: 19, staff_request_pushes: true });
  },
  async setNotificationPrefs(prefs) {
    const db = loadDB();
    db.notificationPrefs = prefs;
    saveDB(db);
    return delay(prefs);
  },
  async requestsPushOn() {
    return delay(false);
  },
  async createHouseholdTasks(inputs) {
    const db = loadDB();
    const created = inputs.map(
      (input): HouseholdTask => ({
        id: uid("chore"),
        household_id: getActiveHouseholdId(),
        title: input.title,
        notes: input.notes ?? null,
        category: input.category,
        assigned_to: input.assigned_to ?? null,
        due_date: input.due_date,
        due_time: input.due_time ?? null,
        status: "pending",
        completed_by: null,
        completed_at: null,
        photo_url: null,
        created_at: new Date().toISOString(),
        recurrence: input.recurrence ?? "none",
        recurrence_until: input.recurrence_until ?? null,
        parent_task_id: null,
        requires_supervision: input.requires_supervision ?? false,
        location_id: input.location_id ?? null,
        spot: input.spot ?? null,
        repair_id: input.repair_id ?? null,
        before_photo_url: null,
        after_photo_url: null,
      })
    );
    db.householdTasks.push(...created);
    saveDB(db);
    return delay(created);
  },
  async updateHouseholdTaskStatus(id, status, patch) {
    const db = loadDB();
    const idx = db.householdTasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Household task ${id} not found`);
    const completing = status === "completed";
    const updated: HouseholdTask = {
      ...db.householdTasks[idx],
      status,
      completed_at: completing ? (patch?.completed_at ?? new Date().toISOString()) : null,
      completed_by: completing ? (patch?.completed_by ?? null) : null,
      photo_url: completing ? (patch?.photo_url ?? null) : null,
      before_photo_url: completing ? (patch?.before_photo_url ?? null) : null,
      after_photo_url: completing ? (patch?.after_photo_url ?? null) : null,
    };
    db.householdTasks[idx] = updated;
    saveDB(db);
    return delay(updated);
  },
  async claimHouseholdTask(id, staffId) {
    const db = loadDB();
    const idx = db.householdTasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Household task ${id} not found`);
    // Mirrors the `is("assigned_to", null)` guard in the Supabase provider so
    // the losing half of a double-claim fails the same way in mock mode.
    if (db.householdTasks[idx].assigned_to) {
      throw new Error("Chore was already claimed by someone else.");
    }
    const updated: HouseholdTask = { ...db.householdTasks[idx], assigned_to: staffId };
    db.householdTasks[idx] = updated;
    saveDB(db);
    return delay(updated);
  },
  async getStaffWorkload(from, to) {
    // The same counting as migrations/100: by completer, pet logs per dog,
    // a vet check-in not counted, unattributed work as one null row.
    const db = loadDB();
    const inSpan = (iso: string | null) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= from.getTime() && t < to.getTime();
    };
    const tally = new Map<string | null, { pets: number; chores: number }>();
    const bump = (who: string | null, key: "pets" | "chores") => {
      const row = tally.get(who) ?? { pets: 0, chores: 0 };
      row[key] += 1;
      tally.set(who, row);
    };
    for (const log of db.logs) {
      if (log.module !== "pet" || !inSpan(log.completed_at) || log.sub_type === "check_in" || log.sub_type === "arrived") continue;
      bump(log.staff_id ?? null, "pets");
    }
    for (const task of db.householdTasks) {
      if (task.status !== "completed" || !inSpan(task.completed_at)) continue;
      bump(task.completed_by, "chores");
    }
    const rows = db.staffProfiles.map((s) => ({ staffId: s.id as string | null, name: s.name as string | null }));
    if (tally.has(null)) rows.push({ staffId: null, name: null });
    const result = rows.map(({ staffId, name }) => {
      const { pets, chores } = tally.get(staffId) ?? { pets: 0, chores: 0 };
      return { staffId, name, totalCompleted: pets + chores, petsCompleted: pets, choresCompleted: chores };
    });
    result.sort(
      (a, b) =>
        b.totalCompleted - a.totalCompleted ||
        (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name))
    );
    return delay(result);
  },
  async listLeaveRequests(sinceDate) {
    return delay(
      loadDB()
        .leaveRequests.filter((l) => l.end_date >= sinceDate)
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
    );
  },
  async getLeaveRequest(id) {
    return delay(loadDB().leaveRequests.find((l) => l.id === id) ?? null);
  },
  async createLeaveRequest(input) {
    const db = loadDB();
    const leave: LeaveRequest = {
      id: uid("leave"),
      household_id: getActiveHouseholdId(),
      ...input,
      status: "pending",
      fallback_action: null,
      fallback_assignee_id: null,
      ended_on: null,
      decided_by: null,
      decided_at: null,
      created_at: new Date().toISOString(),
    };
    db.leaveRequests.push(leave);
    saveDB(db);
    return delay(leave);
  },
  async decideLeaveRequest(id, decision) {
    const db = loadDB();
    const idx = db.leaveRequests.findIndex((l) => l.id === id);
    if (idx === -1) throw new Error("Leave request not found");
    const approved = decision.status === "approved";
    const updated: LeaveRequest = {
      ...db.leaveRequests[idx],
      status: decision.status,
      fallback_action: approved ? decision.fallback_action : null,
      fallback_assignee_id:
        approved && decision.fallback_action === "reassign" ? decision.fallback_assignee_id : null,
      decided_at: new Date().toISOString(),
    };
    db.leaveRequests[idx] = updated;
    saveDB(db);
    return delay(updated);
  },
  async endLeaveEarly(id, today) {
    const db = loadDB();
    const idx = db.leaveRequests.findIndex((l) => l.id === id && l.status === "approved");
    if (idx === -1) throw new Error("leave_not_active");
    const leave = db.leaveRequests[idx];
    const dayAfterEnd = new Date(`${leave.end_date}T00:00:00`);
    dayAfterEnd.setDate(dayAfterEnd.getDate() + 1);
    const cap = `${dayAfterEnd.getFullYear()}-${String(dayAfterEnd.getMonth() + 1).padStart(2, "0")}-${String(dayAfterEnd.getDate()).padStart(2, "0")}`;
    const endedOn = [leave.start_date, today < cap ? today : cap].sort().at(-1)!;
    const updated: LeaveRequest = { ...leave, status: "ended_early", ended_on: endedOn };
    db.leaveRequests[idx] = updated;
    saveDB(db);
    return delay(updated);
  },
  async ensureMyMemberProfile() {
    // No accounts in mock mode, so no admin to be.
    return delay(null);
  },
  async listStaffProfiles() {
    return delay(loadDB().staffProfiles);
  },
  async listHouseholdLocations() {
    const household = getActiveHouseholdId();
    return delay(
      loadDB()
        .householdLocations.filter((room) => room.household_id === household)
        .sort(
          (a, b) =>
            (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
        )
    );
  },
  async createHouseholdLocation(name, options) {
    const db = loadDB();
    const household = getActiveHouseholdId();
    const parentId = options?.parentId ?? null;
    const key = name.trim().toLowerCase();
    const existing = db.householdLocations.find(
      (room) =>
        room.household_id === household &&
        room.name.trim().toLowerCase() === key &&
        (room.parent_id ?? null) === parentId
    );
    if (existing) {
      if ((existing.kind ?? "room") !== (options?.kind ?? "room")) {
        throw Object.assign(new Error("A place with this name exists"), { code: "23505" });
      }
      return delay(existing);
    }
    const room: HouseholdLocation = {
      id: uid("room"),
      household_id: household,
      name: name.trim(),
      created_at: new Date().toISOString(),
      kind: options?.kind ?? "room",
      parent_id: parentId,
      sort_order: 0,
    };
    db.householdLocations.push(room);
    saveDB(db);
    return delay(room);
  },
  async updateHouseholdLocation(id, patch) {
    const db = loadDB();
    const room = db.householdLocations.find((r) => r.id === id);
    if (!room) throw new Error("Room not found");
    Object.assign(room, patch);
    saveDB(db);
    return delay(room);
  },
  async deleteHouseholdLocation(id) {
    const db = loadDB();
    const room = db.householdLocations.find((r) => r.id === id);
    // A floor's rooms move to "no floor", as migrations/129 does (renaming
    // clashes is the database's job; mock mode keeps names as they are). A
    // room's rooms inside move to where it was, with its name in front
    // ("GB1 Bathroom"), as the rooms-inside-rooms migration does.
    for (const r of db.householdLocations) {
      if (r.parent_id !== id || !room) continue;
      if (room.kind === "floor") {
        r.parent_id = null;
      } else {
        r.parent_id = room.parent_id ?? null;
        r.name = `${room.name.trim()} ${r.name.trim()}`.slice(0, 60).trim();
      }
    }
    for (const t of db.householdTasks) if (t.location_id === id) t.location_id = null;
    db.householdLocations = db.householdLocations.filter((r) => r !== room);
    saveDB(db);
    return delay(undefined);
  },
  async organiseRooms(plan) {
    const db = loadDB();
    for (const place of plan.places) {
      const room = db.householdLocations.find((r) => r.id === place.id);
      if (room) {
        if (place.name !== undefined) room.name = place.name;
        if (place.kind !== undefined) room.kind = place.kind;
        if ("parent_id" in place) room.parent_id = place.parent_id ?? null;
        if (place.sort_order !== undefined) room.sort_order = place.sort_order;
      } else {
        db.householdLocations.push({
          id: place.id,
          household_id: plan.household_id,
          name: place.name ?? "",
          created_at: new Date().toISOString(),
          kind: place.kind ?? "room",
          parent_id: place.parent_id ?? null,
          sort_order: place.sort_order ?? 0,
        });
      }
    }
    const moved: { id: string; location_id: string | null; spot: string | null }[] = [];
    for (const merge of plan.merges ?? []) {
      for (const task of db.householdTasks) {
        if (task.location_id !== merge.from) continue;
        moved.push({ id: task.id, location_id: task.location_id ?? null, spot: task.spot ?? null });
        task.location_id = merge.into;
        task.spot = task.spot ?? merge.spot;
      }
    }
    for (const chore of plan.chores) {
      const task = db.householdTasks.find((t) => t.id === chore.id);
      if (!task) continue;
      if ("location_id" in chore) task.location_id = chore.location_id ?? null;
      if ("spot" in chore) task.spot = chore.spot ?? null;
      if (chore.title !== undefined) task.title = chore.title;
    }
    db.householdLocations = db.householdLocations.filter((r) => !plan.delete.includes(r.id));
    saveDB(db);
    return delay(moved);
  },
  async createStaffProfile(name) {
    const db = loadDB();
    const profile: StaffProfile = {
      id: uid("staff"),
      household_id: getActiveHouseholdId(),
      name,
      has_pin: false,
      created_at: new Date().toISOString(),
    };
    db.staffProfiles.push(profile);
    saveDB(db);
    return delay(profile);
  },
  async archiveStaffProfile(id) {
    const db = loadDB();
    const profile = db.staffProfiles.find((s) => s.id === id);
    if (!profile) throw new Error("Staff profile not found");
    if (profile.user_id) throw new Error("This person is an admin");
    // Mirrors archive_staff_profile (migrations/109, /118): mark, revoke the
    // PIN, and release their unfinished chores and every repeating chore
    // they hold, keeping who did a repeat's first day.
    profile.archived_at = new Date().toISOString();
    profile.has_pin = false;
    db.staffPins = { ...(db.staffPins ?? {}), [id]: null };
    db.householdTasks = db.householdTasks.map((task) => {
      if (task.assigned_to !== id) return task;
      if (task.status === "pending") return { ...task, assigned_to: null };
      if (task.status === "completed" && isTemplate(task)) {
        return { ...task, assigned_to: null, completed_by: task.completed_by ?? id };
      }
      return task;
    });
    saveDB(db);
    return delay(profile);
  },
  async restoreStaffProfile(id) {
    const db = loadDB();
    const profile = db.staffProfiles.find((s) => s.id === id);
    if (!profile) throw new Error("Staff profile not found");
    profile.archived_at = null;
    saveDB(db);
    return delay(profile);
  },
  async setStaffPin(id, pin) {
    const db = loadDB();
    const profile = db.staffProfiles.find((s) => s.id === id);
    if (!profile) throw new Error("Staff profile not found");
    profile.has_pin = pin !== null;
    // Mock mode has no database and no crypt(); the PIN lives beside the
    // profile purely so the gate can be walked through offline.
    db.staffPins = { ...(db.staffPins ?? {}), [id]: pin };
    saveDB(db);
    return delay(undefined);
  },
  async verifyStaffPin(id, pin) {
    const db = loadDB();
    return delay((db.staffPins ?? {})[id] === pin);
  },
  // House code (Phase 151): enough to walk the screens offline. No limits or
  // locks here; those live in the database (migrations/115).
  async checkStaffPin(id, pin) {
    const db = loadDB();
    return delay(
      (db.staffPins ?? {})[id] === pin
        ? { status: "ok" as const }
        : { status: "wrong_pin" as const, attempts_left: 4 }
    );
  },
  async houseCodeRoster(code) {
    const db = loadDB();
    if (code.replace(/[^a-z0-9]/gi, "").toUpperCase() !== (db.houseCode ?? MOCK_HOUSE_CODE)) return delay([]);
    return delay(
      db.staffProfiles
        .filter((p) => !p.user_id)
        .map((p) => ({ id: p.id, name: p.name, has_pin: p.has_pin, claimable: !p.has_pin }))
    );
  },
  async signInWithHouseCode(code, staffId, pin) {
    const db = loadDB();
    if (code.replace(/[^a-z0-9]/gi, "").toUpperCase() !== (db.houseCode ?? MOCK_HOUSE_CODE)) {
      return delay({ status: "wrong_code" as const });
    }
    if ((db.staffPins ?? {})[staffId] !== pin) {
      return delay({ status: "wrong_pin" as const, attempts_left: 4 });
    }
    return delay({ status: "ok" as const, household_id: getActiveHouseholdId() });
  },
  async claimStaffWithHouseCode(code, staffId, pin, claim) {
    const db = loadDB();
    if (code.replace(/[^a-z0-9]/gi, "").toUpperCase() !== (db.houseCode ?? MOCK_HOUSE_CODE)) {
      return delay({ status: "wrong_code" as const });
    }
    if (!claim) return delay({ status: "no_claim_link" as const });
    const person = db.staffProfiles.find((p) => p.id === staffId && !p.user_id && !p.has_pin);
    if (!person) return delay({ status: "not_claimable" as const });
    if (!/^\d{4}$/.test(pin)) return delay({ status: "bad_pin" as const });
    person.has_pin = true;
    db.staffPins = { ...(db.staffPins ?? {}), [staffId]: pin };
    saveDB(db);
    return delay({ status: "ok" as const, household_id: getActiveHouseholdId() });
  },
  async getHouseCode() {
    return delay(loadDB().houseCode ?? MOCK_HOUSE_CODE);
  },
  async rotateHouseCode() {
    const db = loadDB();
    const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    db.houseCode = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
    saveDB(db);
    return delay(db.houseCode);
  },
  async listLinkedPhones() {
    return delay([]);
  },
  async hasFinishedChore() {
    return delay(loadDB().householdTasks.some((task) => task.status === "completed"));
  },
  async removeLinkedPhone() {
    return delay(false);
  },
};
