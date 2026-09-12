"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dataProvider, isMockMode } from "@/lib/data";
import type {
  CreateEntityInput,
  CreateLogInput,
  CreateBatchLogInput,
  CreateScheduleInput,
  CreateMedicalRecordInput,
} from "@/lib/data";
import { isActivePet } from "@/lib/pets";
import type { TaskEntity, MasterSchedule, TaskLog, MedicalRecord } from "@/types/database";

export type UserRole = "staff" | "owner";

// Hardcoded for now — there's no auth backend yet, this is a lightweight UI
// gate so staff devices don't casually stumble into owner-only controls.
const OWNER_PIN = "2205";

interface HouseholdContextValue {
  entities: TaskEntity[];
  pets: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  medicalRecords: MedicalRecord[];
  loading: boolean;
  isMockMode: boolean;
  activePetId: string | null;
  setActivePetId: (id: string) => void;
  userRole: UserRole;
  unlockOwner: (pin: string) => boolean;
  lockOwner: () => void;
  refresh: () => Promise<void>;
  createEntity: (input: CreateEntityInput) => Promise<TaskEntity>;
  updateEntity: (id: string, patch: Partial<TaskEntity>) => Promise<TaskEntity>;
  deleteEntity: (id: string) => Promise<void>;
  logTask: (input: CreateLogInput) => Promise<TaskLog>;
  logTasksBatch: (input: CreateBatchLogInput) => Promise<TaskLog[]>;
  createSchedule: (input: CreateScheduleInput) => Promise<MasterSchedule>;
  createSchedulesBatch: (entries: CreateScheduleInput[]) => Promise<MasterSchedule[]>;
  updateSchedule: (id: string, patch: Partial<MasterSchedule>) => Promise<MasterSchedule>;
  deleteSchedule: (id: string) => Promise<void>;
  createMedicalRecord: (input: CreateMedicalRecordInput) => Promise<MedicalRecord>;
  uploadPhoto: (file: File, pathPrefix: string) => Promise<string>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [entities, setEntities] = useState<TaskEntity[]>([]);
  const [schedules, setSchedules] = useState<MasterSchedule[]>([]);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [e, s, l, m] = await Promise.all([
      dataProvider.listEntities(),
      dataProvider.listSchedules(),
      dataProvider.listLogs(),
      dataProvider.listMedicalRecords(),
    ]);
    setEntities(e);
    setSchedules(s);
    setLogs(l);
    setMedicalRecords(m);
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

  const value = useMemo<HouseholdContextValue>(
    () => ({
      entities,
      pets,
      schedules,
      logs,
      medicalRecords,
      loading,
      isMockMode,
      activePetId,
      setActivePetId,
      userRole,
      unlockOwner,
      lockOwner,
      refresh,
      createEntity,
      updateEntity,
      deleteEntity,
      logTask,
      logTasksBatch,
      createSchedule,
      createSchedulesBatch,
      updateSchedule,
      deleteSchedule,
      createMedicalRecord,
      uploadPhoto,
    }),
    [
      entities,
      pets,
      schedules,
      logs,
      medicalRecords,
      loading,
      activePetId,
      userRole,
      unlockOwner,
      lockOwner,
      refresh,
      createEntity,
      updateEntity,
      deleteEntity,
      logTask,
      logTasksBatch,
      createSchedule,
      createSchedulesBatch,
      updateSchedule,
      deleteSchedule,
      createMedicalRecord,
      uploadPhoto,
    ]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used within HouseholdProvider");
  return ctx;
}
