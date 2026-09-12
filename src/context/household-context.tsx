"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dataProvider, isMockMode } from "@/lib/data";
import type {
  CreateLogInput,
  CreateScheduleInput,
  CreateMedicalRecordInput,
} from "@/lib/data";
import type { TaskEntity, MasterSchedule, TaskLog, MedicalRecord } from "@/types/database";

interface HouseholdContextValue {
  entities: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  medicalRecords: MedicalRecord[];
  loading: boolean;
  isMockMode: boolean;
  refresh: () => Promise<void>;
  logTask: (input: CreateLogInput) => Promise<TaskLog>;
  createSchedule: (input: CreateScheduleInput) => Promise<MasterSchedule>;
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

  const logTask = useCallback(async (input: CreateLogInput) => {
    const log = await dataProvider.createLog(input);
    setLogs((prev) => [log, ...prev]);
    return log;
  }, []);

  const createSchedule = useCallback(async (input: CreateScheduleInput) => {
    const newSchedule = await dataProvider.createSchedule(input);
    setSchedules((prev) => [...prev, newSchedule]);
    return newSchedule;
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
      schedules,
      logs,
      medicalRecords,
      loading,
      isMockMode,
      refresh,
      logTask,
      createSchedule,
      updateSchedule,
      deleteSchedule,
      createMedicalRecord,
      uploadPhoto,
    }),
    [
      entities,
      schedules,
      logs,
      medicalRecords,
      loading,
      refresh,
      logTask,
      createSchedule,
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
