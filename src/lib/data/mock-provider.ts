import type {
  TaskEntity,
  MasterSchedule,
  TaskLog,
  MedicalRecord,
  InventoryAlert,
  RoutineProposal,
  InventoryItem,
  StaffProfile,
  HouseholdTask,
} from "@/types/database";
import { MOCK_ENTITIES, MOCK_SCHEDULES } from "./mock-seed";
import type { DataProvider } from "./types";

const STORAGE_KEY = "maimus_mock_db_v1";

interface MockDB {
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  medicalRecords: MedicalRecord[];
  inventoryAlerts: InventoryAlert[];
  routineProposals: RoutineProposal[];
  inventoryItems: InventoryItem[];
  staffProfiles: StaffProfile[];
  householdTasks: HouseholdTask[];
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
    staffProfiles: [],
    householdTasks: [],
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
        inventoryItems: parsed.inventoryItems ?? [],
        staffProfiles: parsed.staffProfiles ?? [],
        householdTasks: parsed.householdTasks ?? [],
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
    const logs: TaskLog[] = input.entries.map((entry) => ({
      id: uid("log"),
      schedule_id: entry.schedule_id ?? null,
      entity_id: entry.entity_id,
      module: input.module,
      photo_url: input.photo_url ?? null,
      notes: input.notes ?? null,
      completed_at: completedAt,
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
      id: uid("alert"),
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
      name: input.name,
      category: input.category,
      created_at: new Date().toISOString(),
    };
    db.inventoryItems.push(item);
    saveDB(db);
    return delay(item);
  },
  async deleteInventoryItem(id) {
    const db = loadDB();
    db.inventoryItems = db.inventoryItems.filter((i) => i.id !== id);
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
  async listHouseholdTasks(dueDate) {
    // Same one-day scope and same ordering as the Supabase provider, so mock
    // mode and the real thing put a "sometime today" chore in the same place.
    const tasks = loadDB()
      .householdTasks.filter((task) => task.due_date === dueDate)
      .sort((a, b) => {
        if (a.due_time !== b.due_time) {
          if (!a.due_time) return 1;
          if (!b.due_time) return -1;
          return a.due_time.localeCompare(b.due_time);
        }
        return a.created_at.localeCompare(b.created_at);
      });
    return delay(tasks);
  },
  async createHouseholdTask(input) {
    const db = loadDB();
    const task: HouseholdTask = {
      id: uid("chore"),
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
    };
    db.householdTasks.push(task);
    saveDB(db);
    return delay(task);
  },
  async updateHouseholdTaskStatus(id, status, patch) {
    const db = loadDB();
    const idx = db.householdTasks.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error(`Household task ${id} not found`);
    const completing = status === "completed";
    const updated: HouseholdTask = {
      ...db.householdTasks[idx],
      status,
      completed_at: completing ? new Date().toISOString() : null,
      completed_by: completing ? (patch?.completed_by ?? null) : null,
      photo_url: completing ? (patch?.photo_url ?? null) : null,
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
  async listStaffProfiles() {
    return delay(loadDB().staffProfiles);
  },
  async createStaffProfile(name) {
    const db = loadDB();
    const profile: StaffProfile = {
      id: uid("staff"),
      name,
      pin: null,
      created_at: new Date().toISOString(),
    };
    db.staffProfiles.push(profile);
    saveDB(db);
    return delay(profile);
  },
  async setStaffPin(id, pin) {
    const db = loadDB();
    const profile = db.staffProfiles.find((s) => s.id === id);
    if (!profile) throw new Error("Staff profile not found");
    profile.pin = pin;
    saveDB(db);
    return delay(profile);
  },
};
