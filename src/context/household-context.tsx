"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { dataProvider, isMockMode } from "@/lib/data";
import type {
  CreateEntityInput,
  CreateLogInput,
  CreateBatchLogInput,
  CreateScheduleInput,
  CreateMedicalRecordInput,
  CreateInventoryAlertInput,
  CreateRoutineProposalInput,
  CreateHouseholdTaskInput,
} from "@/lib/data";
import { readActiveStaffId } from "@/components/auth/staff-login-gate";
import { isActivePet } from "@/lib/pets";
import { addToOfflineQueue } from "@/lib/offline-queue";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { compressPhoto } from "@/lib/image";
import type {
  TaskEntity,
  MasterSchedule,
  TaskLog,
  MedicalRecord,
  InventoryAlert,
  RoutineProposal,
  InventoryItem,
  InventoryAuditWithStaff,
  ItemType,
  ProposalStatus,
  HouseholdTask,
  HouseholdTaskStatus,
} from "@/types/database";

/**
 * Attaches whoever is signed in on this device to something being filed.
 *
 * One place rather than per call site: every staff action goes through this
 * context, and a payload that skipped the stamp would quietly lose its author.
 * Null when nobody has identified — the owner's own actions, or a device that
 * has never been through the staff gate — which is the honest answer rather
 * than a guess.
 */
function withStaffId<T extends { staff_id?: string | null }>(input: T): T {
  return { ...input, staff_id: input.staff_id ?? readActiveStaffId() };
}


export type UserRole = "staff" | "owner";

// Hardcoded for now — there's no auth backend yet, this is a lightweight UI
// gate so staff devices don't casually stumble into owner-only controls.
const OWNER_PIN = "6033";
const OWNER_STORAGE_KEY = "banyuwangi11:isOwner";

interface HouseholdContextValue {
  entities: TaskEntity[];
  pets: TaskEntity[];
  schedules: MasterSchedule[];
  logs: TaskLog[];
  medicalRecords: MedicalRecord[];
  inventoryAlerts: InventoryAlert[];
  routineProposals: RoutineProposal[];
  inventoryItems: InventoryItem[];
  /** The newest stock check per inventory item, keyed by item id. */
  latestInventoryAudits: Record<string, InventoryAuditWithStaff>;
  /**
   * The chores filed for whichever day `selectedDate` is on — never the whole
   * table. Fetched per day rather than in bulk (see migrations/082), so this
   * array changes when the browsed date does.
   */
  householdTasks: HouseholdTask[];
  loading: boolean;
  isMockMode: boolean;
  // null = Unified Overview; a pet id = that pet's detail view. This is the
  // sole source of truth for master-detail navigation across the dashboard.
  activePetId: string | null;
  setActivePetId: (id: string | null) => void;
  // The day the Owner Dashboard and Staff "Jadwal" are currently browsing —
  // shared globally so picking a date in one place (e.g. the schedules tab)
  // keeps the Daily Feed and Staff view in sync with it too.
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  userRole: UserRole;
  // False only during the brief window between mount and the localStorage
  // hydration effect below — lets owner-only route guards avoid bouncing a
  // returning owner to the Daily Feed before their session is restored.
  roleHydrated: boolean;
  unlockOwner: (pin: string) => boolean;
  lockOwner: () => void;
  /**
   * Refetches every collection from the server. `silent` skips the global
   * loading flag, so a background sync doesn't replace the screen with
   * skeletons under someone's hands.
   */
  refresh: (options?: { silent?: boolean }) => Promise<void>;
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
  addInventoryItem: (input: { name: string; category: ItemType }) => Promise<InventoryItem>;
  removeInventoryItem: (id: string) => Promise<void>;
  /**
   * Records a stock check: uploads the shelf photo, files the audit under
   * whoever is signed in on this device, and writes the counts back onto the
   * item — which is what takes it off today's checklist.
   */
  submitInventoryAudit: (
    itemId: string,
    boxes: number,
    looseUnits: number,
    photoFile: File
  ) => Promise<void>;
  submitRoutineProposal: (input: CreateRoutineProposalInput) => Promise<RoutineProposal>;
  submitRoutineProposalsBatch: (inputs: CreateRoutineProposalInput[]) => Promise<RoutineProposal[]>;
  decideRoutineProposals: (
    ids: string[],
    status: Exclude<ProposalStatus, "pending">
  ) => Promise<void>;
  createHouseholdTask: (input: CreateHouseholdTaskInput) => Promise<HouseholdTask>;
  /**
   * Flips a chore's status. Completing one stamps the clock and the staff
   * member on the device, and carries the proof photo in the same write — a
   * chore is closed by producing proof, so the two cannot come apart.
   */
  updateHouseholdTaskStatus: (
    id: string,
    status: HouseholdTaskStatus,
    patch?: { photo_url?: string | null }
  ) => Promise<HouseholdTask>;
  /** Takes an unassigned chore for whoever is signed in on this device. */
  claimHouseholdTask: (id: string) => Promise<HouseholdTask>;
  undoInventoryAlert: (id: string) => Promise<void>;
  undoRoutineProposal: (id: string) => Promise<void>;
  decideRoutineProposal: (id: string, status: Exclude<ProposalStatus, "pending">) => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [entities, setEntities] = useState<TaskEntity[]>([]);
  const [schedules, setSchedules] = useState<MasterSchedule[]>([]);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
  const [routineProposals, setRoutineProposals] = useState<RoutineProposal[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [latestInventoryAudits, setLatestInventoryAudits] = useState<
    Record<string, InventoryAuditWithStaff>
  >({});
  const [householdTasks, setHouseholdTasks] = useState<HouseholdTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Declared up here, ahead of `refresh`, because the chore fetch is scoped to
  // the day being browsed and `refresh` has to know which day that is.
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const selectedDateStr = formatDateLocal(selectedDate);

  // Read through a ref rather than taken as a dependency: making `refresh`
  // depend on the date would give it a new identity on every date tap, which
  // re-fires the mount effect below and turns picking a day into a full reload
  // with skeletons — exactly what the silent-sync design exists to avoid.
  const selectedDateRef = useRef(selectedDateStr);
  useEffect(() => {
    selectedDateRef.current = selectedDateStr;
  }, [selectedDateStr]);

  const loadHouseholdTasks = useCallback(async (dueDate: string) => {
    try {
      setHouseholdTasks(await dataProvider.listHouseholdTasks(dueDate));
    } catch (err) {
      // Same degraded state as routine_proposals and inventory_items below:
      // household_tasks arrives with the Phase 82 migration, and until it is
      // applied the request 404s. An empty chore list is the correct answer —
      // letting it bubble would take the whole dashboard down with it.
      console.warn("household_tasks unavailable — run the Phase 82 migration", err);
      setHouseholdTasks([]);
    }
  }, []);

  const refresh = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    // A silent pass leaves `loading` alone. It matters more than it looks:
    // flipping it re-renders the staff list as skeletons, which unmounts the
    // card holding an open photo-tagging dialog — exactly what a refresh
    // triggered by returning from the camera would do.
    if (!silent) setLoading(true);
    const [e, s, l, m, ia, rp, ii, audits] = await Promise.all([
      dataProvider.listEntities(),
      dataProvider.listSchedules(),
      dataProvider.listLogs(),
      dataProvider.listMedicalRecords(),
      dataProvider.listInventoryAlerts(),
      // Deliberately not allowed to reject the whole load. routine_proposals
      // arrived in Phase 46 and needs a migration run by hand; until then the
      // request 404s, and letting that bubble would take pets, schedules and
      // logs down with it. An empty queue is the correct degraded state.
      dataProvider.listRoutineProposals().catch((err) => {
        console.warn("routine_proposals unavailable — run the Phase 46 migration", err);
        return [] as RoutineProposal[];
      }),
      // Same treatment: inventory_items arrives with the Phase 60 migration,
      // and a missing table must not take the whole dashboard down with it.
      dataProvider.listInventoryItems().catch((err) => {
        console.warn("inventory_items unavailable — run the Phase 60 migration", err);
        return [] as InventoryItem[];
      }),
      // And again for the Phase 83 audit log: no history just means every
      // item reads "never checked", which is true of a fresh ledger anyway.
      dataProvider.listLatestInventoryAudits().catch((err) => {
        console.warn("inventory_audit_logs unavailable — run the Phase 83 migration", err);
        return {} as Record<string, InventoryAuditWithStaff>;
      }),
      // Chores for the day on screen, so a pull-to-refresh or a reconnect sync
      // picks up anything the owner delegated from their own phone. Swallows
      // its own failure inside loadHouseholdTasks.
      loadHouseholdTasks(selectedDateRef.current),
    ]);
    setEntities(e);
    setSchedules(s);
    setLogs(l);
    setMedicalRecords(m);
    setInventoryAlerts(ia);
    setRoutineProposals(rp);
    setInventoryItems(ii);
    setLatestInventoryAudits(audits);
    if (!silent) setLoading(false);
  }, [loadHouseholdTasks]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pets = useMemo(() => entities.filter(isActivePet), [entities]);

  const [activePetId, setActivePetId] = useState<string | null>(null);

  // Fall back to the Overview if the pet currently being viewed stops being
  // valid (archived/deleted out from under the viewer) — but otherwise never
  // auto-select a pet. Overview (null) is the dashboard's resting state.
  useEffect(() => {
    if (activePetId && !pets.some((p) => p.id === activePetId)) {
      setActivePetId(null);
    }
  }, [pets, activePetId]);

  // Reloads the chore list when the browsed day changes. Skips its own first
  // run because the mount pass of `refresh()` above already loaded today —
  // without the guard every page load would issue the same query twice.
  const choresLoadedOnce = useRef(false);
  useEffect(() => {
    if (!choresLoadedOnce.current) {
      choresLoadedOnce.current = true;
      return;
    }
    void loadHouseholdTasks(selectedDateStr);
  }, [selectedDateStr, loadHouseholdTasks]);

  const [userRole, setUserRole] = useState<UserRole>("staff");
  const [roleHydrated, setRoleHydrated] = useState(false);

  // Restores owner mode after a page refresh so the owner-only tabs don't
  // momentarily vanish. Deliberately a mount effect (not a lazy useState
  // initializer) so the client's first render still matches the
  // server-rendered "staff" HTML — reading localStorage during render would
  // produce a hydration mismatch instead.
  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem(OWNER_STORAGE_KEY) === "true") {
      setUserRole("owner");
    }
    setRoleHydrated(true);
  }, []);

  const unlockOwner = useCallback((pin: string) => {
    if (pin !== OWNER_PIN) return false;
    setUserRole("owner");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OWNER_STORAGE_KEY, "true");
    }
    return true;
  }, []);

  const lockOwner = useCallback(() => {
    setUserRole("staff");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(OWNER_STORAGE_KEY);
    }
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

  // Staff logging potty breaks / meals in the field is exactly the case with
  // the flakiest connectivity, so both logging paths below check
  // navigator.onLine before touching Supabase: offline, the write goes to
  // an IndexedDB queue instead, and a locally-built log is applied to state
  // immediately so the checkmark appears right away regardless of
  // connectivity. The reconnect listener in dashboard/layout.tsx drains
  // that queue and then calls `refresh()`, which replaces these optimistic,
  // client-generated ids with the real synced rows.
  const logTask = useCallback(async (input: CreateLogInput) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const completedAt = input.completed_at ?? new Date().toISOString();
      await addToOfflineQueue("task_logs", {
        entries: [{ schedule_id: input.schedule_id ?? null, entity_id: input.entity_id }],
        module: input.module,
        photo_url: input.photo_url ?? null,
        notes: input.notes ?? null,
        completed_at: completedAt,
      });
      const optimisticLog: TaskLog = {
        id: `offline-${crypto.randomUUID()}`,
        schedule_id: input.schedule_id ?? null,
        entity_id: input.entity_id,
        module: input.module,
        photo_url: input.photo_url ?? null,
        notes: input.notes ?? null,
        completed_at: completedAt,
      };
      setLogs((prev) => [optimisticLog, ...prev]);
      toast.warning("Saved offline. Will sync when reconnected.");
      return optimisticLog;
    }
    const log = await dataProvider.createLog(withStaffId(input));
    setLogs((prev) => [log, ...prev]);
    return log;
  }, []);

  const logTasksBatch = useCallback(async (rawInput: CreateBatchLogInput) => {
    // Stamped here rather than at insert time, so a batch queued offline keeps
    // the author who actually took the photo instead of whoever happens to be
    // on duty when the signal comes back.
    const input = withStaffId(rawInput);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const completedAt = input.completed_at ?? new Date().toISOString();
      await addToOfflineQueue("task_logs", { ...input, completed_at: completedAt });
      const optimisticLogs: TaskLog[] = input.entries.map((entry) => ({
        id: `offline-${crypto.randomUUID()}`,
        schedule_id: entry.schedule_id ?? null,
        entity_id: entry.entity_id,
        module: input.module,
        photo_url: input.photo_url ?? null,
        notes: input.notes ?? null,
        completed_at: completedAt,
      }));
      setLogs((prev) => [...optimisticLogs, ...prev]);
      toast.warning("Saved offline. Will sync when reconnected.");
      return optimisticLogs;
    }
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
    const alert = await dataProvider.createInventoryAlert(withStaffId(input));
    setInventoryAlerts((prev) => [alert, ...prev]);
    return alert;
  }, []);

  const addInventoryItem = useCallback(async (input: { name: string; category: ItemType }) => {
    const item = await dataProvider.createInventoryItem(input);
    setInventoryItems((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
    return item;
  }, []);

  const removeInventoryItem = useCallback(async (id: string) => {
    await dataProvider.deleteInventoryItem(id);
    setInventoryItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // Online only, unlike task logging: the photo is the audit, and the offline
  // queue carries URLs rather than files — queueing it would mean holding the
  // image in IndexedDB until reconnect. A failure surfaces to the card, which
  // keeps the counts and the photo so the retry is one tap.
  const submitInventoryAudit = useCallback(
    async (itemId: string, boxes: number, looseUnits: number, photoFile: File) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("Offline — stock checks need a connection to upload the photo");
      }
      const photoUrl = await dataProvider.uploadInventoryPhoto(
        await compressPhoto(photoFile),
        itemId
      );
      const { audit, item } = await dataProvider.createInventoryAudit({
        item_id: itemId,
        boxes_counted: boxes,
        loose_units_counted: looseUnits,
        photo_url: photoUrl,
        audited_by: readActiveStaffId(),
      });
      setInventoryItems((prev) => prev.map((i) => (i.id === itemId ? item : i)));
      setLatestInventoryAudits((prev) => ({ ...prev, [itemId]: audit }));
    },
    []
  );

  const submitRoutineProposalsBatch = useCallback(async (inputs: CreateRoutineProposalInput[]) => {
    const created = await dataProvider.createRoutineProposalsBatch(inputs.map(withStaffId));
    setRoutineProposals((prev) => [...created, ...prev]);
    return created;
  }, []);

  const decideRoutineProposals = useCallback(
    async (ids: string[], status: Exclude<ProposalStatus, "pending">) => {
      await dataProvider.setRoutineProposalsStatus(ids, status);
      const decided = new Set(ids);
      setRoutineProposals((prev) => prev.map((r) => (decided.has(r.id) ? { ...r, status } : r)));
    },
    []
  );

  // Applied to local state only when the new chore belongs to the day on
  // screen. The owner can file a chore for tomorrow from today's panel, and
  // pushing it into this array would show it on the wrong date until the next
  // fetch dropped it again.
  const createHouseholdTask = useCallback(
    async (input: CreateHouseholdTaskInput) => {
      const task = await dataProvider.createHouseholdTask(input);
      if (task.due_date === selectedDateRef.current) {
        setHouseholdTasks((prev) => [...prev, task]);
      }
      return task;
    },
    []
  );

  const updateHouseholdTaskStatus = useCallback(
    async (
      id: string,
      status: HouseholdTaskStatus,
      patch?: { photo_url?: string | null }
    ) => {
      // Stamped here rather than at the call site, for the same reason every
      // other write in this file is: the component knows it took a photo, not
      // who is holding the phone.
      const updated = await dataProvider.updateHouseholdTaskStatus(id, status, {
        ...patch,
        completed_by: status === "completed" ? readActiveStaffId() : null,
      });
      setHouseholdTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
      return updated;
    },
    []
  );

  const claimHouseholdTask = useCallback(async (id: string) => {
    const staffId = readActiveStaffId();
    // Nobody has been through the staff gate on this device, so there is no
    // name to claim it under. Refused rather than written as null, which is
    // the value that already means "unassigned".
    if (!staffId) throw new Error("No staff member is signed in on this device");
    const updated = await dataProvider.claimHouseholdTask(id, staffId);
    setHouseholdTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
    return updated;
  }, []);

  const undoInventoryAlert = useCallback(async (id: string) => {
    await dataProvider.deleteInventoryAlert(id);
    setInventoryAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const undoRoutineProposal = useCallback(async (id: string) => {
    await dataProvider.deleteRoutineProposal(id);
    setRoutineProposals((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const submitRoutineProposal = useCallback(async (input: CreateRoutineProposalInput) => {
    const proposal = await dataProvider.createRoutineProposal(withStaffId(input));
    setRoutineProposals((prev) => [proposal, ...prev]);
    return proposal;
  }, []);

  const decideRoutineProposal = useCallback(
    async (id: string, status: Exclude<ProposalStatus, "pending">) => {
      const updated = await dataProvider.setRoutineProposalStatus(id, status);
      setRoutineProposals((prev) => prev.map((r) => (r.id === id ? updated : r)));
    },
    []
  );

  const resolveInventoryAlert = useCallback(async (id: string) => {
    await dataProvider.resolveInventoryAlert(id);
    setInventoryAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, resolved: true, status: "resolved" as const, resolved_at: new Date().toISOString() }
          : a
      )
    );
  }, []);

  const value = useMemo<HouseholdContextValue>(
    () => ({
      entities,
      pets,
      schedules,
      logs,
      medicalRecords,
      inventoryAlerts,
      routineProposals,
      inventoryItems,
      latestInventoryAudits,
      householdTasks,
      loading,
      isMockMode,
      activePetId,
      setActivePetId,
      selectedDate,
      setSelectedDate,
      userRole,
      roleHydrated,
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
      addInventoryItem,
      removeInventoryItem,
      submitInventoryAudit,
      submitRoutineProposal,
      submitRoutineProposalsBatch,
      decideRoutineProposals,
      createHouseholdTask,
      updateHouseholdTaskStatus,
      claimHouseholdTask,
      undoInventoryAlert,
      undoRoutineProposal,
      decideRoutineProposal,
    }),
    [
      entities,
      pets,
      schedules,
      logs,
      medicalRecords,
      inventoryAlerts,
      routineProposals,
      inventoryItems,
      latestInventoryAudits,
      householdTasks,
      loading,
      activePetId,
      selectedDate,
      userRole,
      roleHydrated,
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
      addInventoryItem,
      removeInventoryItem,
      submitInventoryAudit,
      submitRoutineProposal,
      submitRoutineProposalsBatch,
      decideRoutineProposals,
      createHouseholdTask,
      updateHouseholdTaskStatus,
      claimHouseholdTask,
      undoInventoryAlert,
      undoRoutineProposal,
      decideRoutineProposal,
    ]
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used within HouseholdProvider");
  return ctx;
}
