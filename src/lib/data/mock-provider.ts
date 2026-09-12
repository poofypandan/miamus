import type { TaskEntity, MasterSchedule, TaskLog, MedicalRecord } from "@/types/database";
import { MOCK_ENTITIES, MOCK_SCHEDULES } from "./mock-seed";
import type { DataProvider } from "./types";

const STORAGE_KEY = "maimus_mock_db_v1";

interface MockDB {
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  medicalRecords: MedicalRecord[];
}

function freshDB(): MockDB {
  return { entities: MOCK_ENTITIES, schedules: MOCK_SCHEDULES, logs: [], medicalRecords: [] };
}

function loadDB(): MockDB {
  if (typeof window === "undefined") return freshDB();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDB;
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
      created_at: new Date().toISOString(),
    };
    db.schedules.push(newSchedule);
    saveDB(db);
    return delay(newSchedule);
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
};
