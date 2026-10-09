import type {
  TaskEntity,
  MasterSchedule,
  TaskLog,
  MedicalRecord,
  InventoryAlert,
  RoutineProposal,
  InventoryItem,
  InventoryAuditWithStaff,
  StaffProfile,
  HouseholdTask,
  HouseholdLocation,
} from "@/types/database";
import { getActiveHouseholdId } from "@/lib/tenant";
import { MOCK_ENTITIES, MOCK_SCHEDULES } from "./mock-seed";
import type { DataProvider } from "./types";
import { rolloverFloorFor } from "@/lib/chore-recurrence";

const STORAGE_KEY = "maimus_mock_db_v1";

interface MockDB {
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  medicalRecords: MedicalRecord[];
  inventoryAlerts: InventoryAlert[];
  routineProposals: RoutineProposal[];
  inventoryItems: InventoryItem[];
  inventoryAudits: InventoryAuditWithStaff[];
  staffProfiles: StaffProfile[];
  /** Mock-only: PINs are hashed in the real database (migrations/095). */
  staffPins?: Record<string, string | null>;
  householdTasks: HouseholdTask[];
  householdLocations: HouseholdLocation[];
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
    inventoryAudits: [],
    staffProfiles: [],
    householdTasks: [],
    householdLocations: [],
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
        inventoryAudits: parsed.inventoryAudits ?? [],
        staffProfiles: parsed.staffProfiles ?? [],
        householdTasks: parsed.householdTasks ?? [],
        householdLocations: parsed.householdLocations ?? [],
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
      id: uid("alert"),
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
  async listHouseholdTasks(from, to, today) {
    // Mirrors the three reads the Supabase provider issues (Phase 100), so
    // mock mode expands the same rows into the same occurrences: this day's
    // rows, every repeat that could reach it, and — on today only — whatever
    // is still pending from before it (the rollover).
    // Plus, on today, the reads Phase 126 added: repeats that ended within
    // the last month, and the last month's written occurrences of repeats.
    const showsToday = from <= today && today <= to;
    const rolloverFloor = rolloverFloorFor(today);
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
  async materialiseChoreOccurrence(templateId, date) {
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
    const db = loadDB();
    const task: HouseholdTask = {
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
      before_photo_url: null,
      after_photo_url: null,
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
      if (log.module !== "pet" || !inSpan(log.completed_at) || log.sub_type === "check_in") continue;
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
  async listStaffProfiles() {
    return delay(loadDB().staffProfiles);
  },
  async listHouseholdLocations() {
    const household = getActiveHouseholdId();
    return delay(
      loadDB()
        .householdLocations.filter((room) => room.household_id === household)
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  },
  async createHouseholdLocation(name) {
    const db = loadDB();
    const household = getActiveHouseholdId();
    const key = name.trim().toLowerCase();
    const existing = db.householdLocations.find(
      (room) => room.household_id === household && room.name.trim().toLowerCase() === key
    );
    if (existing) return delay(existing);
    const room: HouseholdLocation = {
      id: uid("room"),
      household_id: household,
      name: name.trim(),
      created_at: new Date().toISOString(),
    };
    db.householdLocations.push(room);
    saveDB(db);
    return delay(room);
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
};
