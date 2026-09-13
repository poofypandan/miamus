"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dataProvider, isMockMode } from "@/lib/data";
import type {
  CreateEntityInput,
  CreateLogInput,
  CreateBatchLogInput,
  CreateScheduleInput,
  CreateMedicalRecordInput,
  CreateInventoryAlertInput,
} from "@/lib/data";
import { isActivePet } from "@/lib/pets";
import type {
  TaskEntity,
  MasterSchedule,
  TaskLog,
  MedicalRecord,
  InventoryAlert,
} from "@/types/database";

export type UserRole = "staff" | "owner";
export type ViewMode = "single" | "all";

// Hardcoded for now — there's no auth backend yet, this is a lightweight UI
// gate so staff devices don't casually stumble into owner-only controls.
const OWNER_PIN = "6033";

interface HouseholdContextValue {
  entities: TaskEntity[];
  pets: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  medicalRecords: MedicalRecord[];
  inventoryAlerts: InventoryAlert[];
  loading: boolean;
  isMockMode: boolean;
  activePetId: string | null;
  setActivePetId: (id: string) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  // The day the Owner Dashboard and Staff "Jadwal" are currently browsing —
  // shared globally so picking a date in one place (e.g. the schedules tab)
  // keeps the Daily Feed and Staff view in sync with it too.
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  userRole: UserRole;
  unlockOwner: (pin: string) => boolean;
  lockOwner: () => void;
  refresh: () => Promise<void>;
  createEntity: (input: CreateEntityInput) => Promise<TaskEntity>;
  updateEntity: (id: string, patch: Partial<TaskEntity>) => Promise<TaskEntity>;
  deleteEntity: (id: string) => Promise<void>;
  logTask: (input: CreateLogInput) => Promise<TaskLog>;
  logTasksBatch: (input: CreateBatchLogInput) => Promise<TaskLog[]>;
  deleteLogWithPhoto: (log: TaskLog) => Promise<void>;
  createSchedule: (input: CreateScheduleInput) => Promise<MasterSchedule>;
  createSchedulesBatch: (entries: CreateScheduleInput[]) => Promise<MasterSchedule[]>;
  updateSchedule: (id: string, patch: Partial<MasterSchedule>) => Promise<MasterSchedule>;
  deleteSchedule: (id: string) => Promise<void>;
  createMedicalRecord: (input: CreateMedicalRecordInput) => Promise<MedicalRecord>;
  uploadPhoto: (file: File, pathPrefix: string) => Promise<string>;
  flagLowStock: (input: CreateInventoryAlertInput) => Promise<InventoryAlert>;
  resolveInventoryAlert: (id: string) => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [entities, setEntities] = useState<TaskEntity[]>([]);
  const [schedules, setSchedules] = useState<MasterSchedule[]>([]);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [e, s, l, m, ia] = await Promise.all([
      dataProvider.listEntities(),
      dataProvider.listSchedules(),
      dataProvider.listLogs(),
      dataProvider.listMedicalRecords(),
      dataProvider.listInventoryAlerts(),
    ]);
    setEntities(e);
    setSchedules(s);
    setLogs(l);
    setMedicalRecords(m);
    setInventoryAlerts(ia);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pets = useMemo(() => entities.filter(isActivePet), [entities]);

  const [activePetId, setActivePetId] = useState<string | null>(null);

  // Default to the first pet whenever there is no valid active selection —
  // covers initial load, the active pet being archived/deleted, and pets
  // loading in after the first render.
  useEffect(() => {
    if (pets.length === 0) {
      if (activePetId !== null) setActivePetId(null);
      return;
    }
    if (!activePetId || !pets.some((p) => p.id === activePetId)) {
      setActivePetId(pets[0].id);
    }
  }, [pets, activePetId]);

  const [viewMode, setViewMode] = useState<ViewMode>("all");

  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const [userRole, setUserRole] = useState<UserRole>("staff");

  const unlockOwner = useCallback((pin: string) => {
    if (pin !== OWNER_PIN) return false;
    setUserRole("owner");
    return true;
  }, []);

  const lockOwner = useCallback(() => {
    setUserRole("staff");
  }, []);

  const createEntity = useCallback(async (input: CreateEntityInput) => {
    const entity = await dataProvider.createEntity(input);
    setEntities((prev) => [...prev, entity]);
    return entity;
  }, []);

  const updateEntity = useCallback(async (id: string, patch: Partial<TaskEntity>) => {
    const updated = await dataProvider.updateEntity(id, patch);
    setEntities((prev) => prev.map((e) => (e.id === id ? updated : e)));
    return updated;
  }, []);

  const deleteEntity = useCallback(async (id: string) => {
    await dataProvider.deleteEntity(id);
    setEntities((prev) => prev.filter((e) => e.id !== id));
    setSchedules((prev) => prev.filter((s) => s.entity_id !== id));
    setLogs((prev) => prev.filter((l) => l.entity_id !== id));
    setMedicalRecords((prev) => prev.filter((m) => m.entity_id !== id));
  }, []);

  const logTask = useCallback(async (input: CreateLogInput) => {
    const log = await dataProvider.createLog(input);
    setLogs((prev) => [log, ...prev]);
    return log;
  }, []);

  const logTasksBatch = useCallback(async (input: CreateBatchLogInput) => {
    const newLogs = await dataProvider.createLogsBatch(input);
    setLogs((prev) => [...newLogs, ...prev]);
    return newLogs;
  }, []);

  // Deletes the completion record first (so the UI reverts to pending
  // immediately) and best-effort cleans up the storage object after — a
  // transient storage failure shouldn't leave the task stuck "done".
  const deleteLogWithPhoto = useCallback(async (log: TaskLog) => {
    await dataProvider.deleteLog(log.id);
    setLogs((prev) => prev.filter((l) => l.id !== log.id));
    if (log.photo_url) {
      try {
        await dataProvider.deletePhoto(log.photo_url);
      } catch (err) {
        console.error("Failed to delete photo from storage", err);
      }
    }
  }, []);

  const createSchedule = useCallback(async (input: CreateScheduleInput) => {
    const newSchedule = await dataProvider.createSchedule(input);
    setSchedules((prev) => [...prev, newSchedule]);
    return newSchedule;
  }, []);

  const createSchedulesBatch = useCallback(async (entries: CreateScheduleInput[]) => {
    const created = await dataProvider.createSchedulesBatch(entries);
    setSchedules((prev) => [...prev, ...created]);
    return created;
  }, []);

  const updateSchedule = useCallback(async (id: string, patch: Partial<MasterSchedule>) => {
    const updated = await dataProvider.updateSchedule(id, patch);
    setSchedules((prev) => prev.map((s) => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const deleteSchedule = useCallback(async (id: string) => {
    await dataProvider.deleteSchedule(id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const createMedicalRecord = useCallback(async (input: CreateMedicalRecordInput) => {
    const record = await dataProvider.createMedicalRecord(input);
    setMedicalRecords((prev) => [record, ...prev]);
    return record;
  }, []);

  const uploadPhoto = useCallback(async (file: File, pathPrefix: string) => {
    return dataProvider.uploadPhoto(file, pathPrefix);
  }, []);

  const flagLowStock = useCallback(async (input: CreateInventoryAlertInput) => {
    const alert = await dataProvider.createInventoryAlert(input);
    setInventoryAlerts((prev) => [alert, ...prev]);
    return alert;
  }, []);

  const resolveInventoryAlert = useCallback(async (id: string) => {
    await dataProvider.resolveInventoryAlert(id);
    setInventoryAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, resolved: true } : a)));
  }, []);

  const value = useMemo<HouseholdContextValue>(
    () => ({
      entities,
      pets,
      schedules,
      logs,
      medicalRecords,
      inventoryAlerts,
      loading,
      isMockMode,
      activePetId,
      setActivePetId,
      viewMode,
      setViewMode,
      selectedDate,
      setSelectedDate,
      userRole,
      unlockOwner,
      lockOwner,
      refresh,
      createEntity,
      updateEntity,
      deleteEntity,
      logTask,
      logTasksBatch,
      deleteLogWithPhoto,
      createSchedule,
      createSchedulesBatch,
      updateSchedule,
      deleteSchedule,
      createMedicalRecord,
      uploadPhoto,
      flagLowStock,
      resolveInventoryAlert,
    }),
    [
      entities,
      pets,
      schedules,
      logs,
      medicalRecords,
      inventoryAlerts,
      loading,
      activePetId,
      viewMode,
      selectedDate,
      userRole,
      unlockOwner,
      lockOwner,
      refresh,
      createEntity,
      updateEntity,
      deleteEntity,
      logTask,
      logTasksBatch,
      deleteLogWithPhoto,
      createSchedule,
      createSchedulesBatch,
      updateSchedule,
      deleteSchedule,
      createMedicalRecord,
      uploadPhoto,
      flagLowStock,
      resolveInventoryAlert,
    ]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used within HouseholdProvider");
  return ctx;
}
