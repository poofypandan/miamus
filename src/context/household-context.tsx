"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { addDays } from "date-fns";
import { toast } from "sonner";
import { dataProvider, isMockMode } from "@/lib/data";
import type {
  CreateEntityInput,
  CreateLogInput,
  CreateBatchLogInput,
  CreateScheduleInput,
  CreateMedicalRecordInput,
  CreateInventoryAlertInput,
  InventoryItemInput,
  CreateRoutineProposalInput,
  CreateHouseholdTaskInput,
  UpdateHouseholdTaskInput,
} from "@/lib/data";
import { readActiveStaffId } from "@/components/auth/staff-login-gate";
import { useToday } from "@/hooks/use-today";
import { isActivePet } from "@/lib/pets";
import { addToOfflineQueue } from "@/lib/offline-queue";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { AGENDA_WEEK_DAYS } from "@/lib/unified-agenda";
import { compressPhoto } from "@/lib/image";
import { readSnapshot, writeSnapshot } from "@/lib/snapshot-cache";
import { warmImagesWhenIdle } from "@/lib/image-warm";
import {
  resolveActiveHouseholdId,
  setActiveHouseholdId,
  getActiveHouseholdId,
  DEFAULT_HOUSEHOLD_ID,
  type ResolvedTenant,
} from "@/lib/tenant";
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

// Where the retired owner PIN used to leave its mark (Phase 108). Read only to
// be deleted: see the role effect below.
const LEGACY_OWNER_FLAG_KEY = "banyuwangi11:isOwner";

interface HouseholdContextValue {
  /**
   * The tenant every query is scoped to (migrations/086): the signed-in
   * owner's household, the one a staff phone was invited to, or the default.
   * Resolved once at startup — see lib/tenant.ts, which the data provider
   * reads directly.
   */
  activeHouseholdId: string;
  /**
   * False until activeHouseholdId has actually been resolved. Before that it
   * holds DEFAULT_HOUSEHOLD_ID as a placeholder, so anything that shows the
   * household to a person — its name in the header — waits for this rather
   * than briefly naming someone else's household (Phase 107).
   */
  tenantReady: boolean;
  /**
   * True when this session belongs to a household_members row — an owner or
   * co-owner signed in with Google. False for a bound staff device, which has
   * an anonymous session and no membership.
   *
   * Since Phase 108 this is also the only thing that makes `userRole` "owner".
   */
  isHouseholdMember: boolean;
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
  /** "owner" exactly when isHouseholdMember — a Google-authenticated member. */
  userRole: UserRole;
  // False until household membership has been resolved — lets owner-only
  // route guards avoid bouncing a returning owner to the Daily Feed before
  // their session is read back.
  roleHydrated: boolean;
  /**
   * Refetches every collection from the server. `silent` skips the global
   * loading flag, so a background sync doesn't replace the screen with
   * skeletons under someone's hands.
   */
  refresh: (options?: { silent?: boolean }) => Promise<void>;
  /** Re-resolves which household this device belongs to; see the implementation. */
  reloadTenant: () => Promise<void>;
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
  /** Owner only — the database refuses item edits from staff devices (migrations/099). */
  addInventoryItem: (input: InventoryItemInput) => Promise<InventoryItem>;
  updateInventoryItem: (id: string, patch: Partial<InventoryItemInput>) => Promise<InventoryItem>;
  removeInventoryItem: (id: string) => Promise<void>;
  /**
   * One tap of an item's +/- stepper (Phase 110). Applied to the screen at
   * once; sent to the server in a batch — see the implementation.
   */
  adjustInventoryQuantity: (id: string, delta: number) => void;
  /**
   * Records a stock check: uploads the shelf photo, files the audit under
   * whoever is signed in on this device, and writes the count back onto the
   * item as its quantity — which is what takes it off today's checklist.
   */
  submitInventoryAudit: (itemId: string, quantity: number, photoFile: File) => Promise<void>;
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
    patch?: {
      photo_url?: string | null;
      before_photo_url?: string | null;
      after_photo_url?: string | null;
    }
  ) => Promise<HouseholdTask>;
  /** Owner-only. Edits a chore's own fields; never its completion state. */
  updateHouseholdTask: (id: string, patch: UpdateHouseholdTaskInput) => Promise<HouseholdTask>;
  /** Owner-only. Deleting a repeat takes its materialised occurrences with it. */
  deleteHouseholdTask: (id: string) => Promise<void>;
  /**
   * Gives a virtual occurrence of a repeat a real row for `date`, so it can be
   * claimed or completed. Returns the row that owns that day — this call's, or
   * the one another phone wrote first.
   */
  materialiseChoreOccurrence: (templateId: string, date: string) => Promise<HouseholdTask>;
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

  // Resolved before anything is fetched (Phase 86C). Every query is scoped to
  // this, so loading first would show one household's data and then swap it.
  const [activeHouseholdId, setActiveHouseholdIdState] = useState(DEFAULT_HOUSEHOLD_ID);
  const [tenantReady, setTenantReady] = useState(false);
  // Starts false and is set after resolution, never read during render from
  // storage — the server HTML and the first client render must agree.
  const [isHouseholdMember, setIsHouseholdMember] = useState(false);
  // Whether this mount painted from the cache; decides if the first fetch is
  // allowed to put skeletons back over data the user can already see.
  const [hydratedFromCache, setHydratedFromCache] = useState(false);

  // Puts a resolved tenant into effect: the data provider's copy, the state
  // components read, the role, and the cached snapshot for that household.
  // Shared by the first resolution on mount and by reloadTenant.
  const applyTenant = useCallback(({ householdId, isMember }: ResolvedTenant) => {
    // The module-level copy is what the data provider reads; the state copy
    // is for components. Set together so they can never disagree.
    setActiveHouseholdId(householdId);
    setActiveHouseholdIdState(householdId);
    // A signed-in member of this household IS the owner: the dashboard sits
    // behind Google auth (middleware), and since Phase 87 the PIN only
    // blurs the screen. Without this, owner-only tabs bounced to the feed
    // while the app lock was still up, because nothing had set the role yet.
    setIsHouseholdMember(isMember);
    if (isMember) setUserRole("owner");
    // Paint whatever this device last saw for this household before the
    // network is consulted at all. `loading` goes false with it, so the
    // screen shows real cards rather than skeletons while the refresh below
    // runs silently (Phase 92).
    const cached = readSnapshot(householdId);
    if (cached) {
      setEntities(cached.entities);
      setSchedules(cached.schedules);
      setLogs(cached.logs);
      setMedicalRecords(cached.medicalRecords);
      setInventoryAlerts(cached.inventoryAlerts);
      setRoutineProposals(cached.routineProposals);
      setInventoryItems(cached.inventoryItems);
      setLatestInventoryAudits(cached.latestInventoryAudits);
      setHydratedFromCache(true);
      setLoading(false);
    }
    setTenantReady(true);
    // Both sources have now been read: localStorage above, membership here.
    setRoleHydrated(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void resolveActiveHouseholdId().then((resolved) => {
      if (!cancelled) applyTenant(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [applyTenant]);

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

  // Follow the calendar over midnight (Phase 98).
  //
  // selectedDate was seeded once from `new Date()` and then never moved, so a
  // phone left open overnight was still browsing yesterday in the morning —
  // yesterday's agenda, yesterday's chores, the ribbon parked a day behind.
  // Relabelling that "Yesterday" is accurate and still wrong: nobody left the
  // app open in order to keep reading the previous day.
  //
  // Only the view that *was* on today follows the clock. Someone who
  // deliberately browsed back to last Tuesday is left where they put
  // themselves, because having the app yank the date out from under them would
  // be the more annoying bug of the two.
  const today = useToday();
  const todayStr = formatDateLocal(today);
  const lastTodayRef = useRef(todayStr);
  useEffect(() => {
    const previous = lastTodayRef.current;
    if (previous === todayStr) return;
    lastTodayRef.current = todayStr;
    setSelectedDate((current) => (formatDateLocal(current) === previous ? today : current));
  }, [today, todayStr]);

  // `today` as well as the browsed day since Phase 100: rendering one day now
  // needs the repeats that reach it and, on today, whatever is still pending
  // from earlier. Read from a ref so the callback keeps a stable identity —
  // taking it as a dependency would re-fire the mount effect at every
  // midnight. See the same reasoning on selectedDateRef.
  const todayRef = useRef(todayStr);
  useEffect(() => {
    todayRef.current = todayStr;
  }, [todayStr]);

  // The selected day and the six after it — the Agenda's week (Phase 112).
  // Always the whole window, in Day view too: it is one request either way,
  // and it means flipping Day ⇄ Week never has to wait for a fetch.
  const loadHouseholdTasks = useCallback(async (dueDate: string) => {
    const to = formatDateLocal(addDays(new Date(`${dueDate}T00:00:00`), AGENDA_WEEK_DAYS - 1));
    try {
      setHouseholdTasks(await dataProvider.listHouseholdTasks(dueDate, to, todayRef.current));
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
    // Kept for the next mount, so the following page load paints immediately
    // (Phase 92). Written after the state, never before: a snapshot is only
    // worth keeping once it is what the user is actually looking at.
    writeSnapshot(getActiveHouseholdId(), {
      entities: e,
      schedules: s,
      logs: l,
      medicalRecords: m,
      inventoryAlerts: ia,
      routineProposals: rp,
      inventoryItems: ii,
      latestInventoryAudits: audits,
    });
    if (!silent) setLoading(false);
  }, [loadHouseholdTasks]);

  useEffect(() => {
    // Gated on the tenant: `loading` starts true, so the app shows skeletons
    // through this window rather than an empty household. Silent when the
    // cache already painted — the revalidation must not replace cards the
    // user is reading with skeletons.
    if (tenantReady) void refresh({ silent: hydratedFromCache });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydratedFromCache decides how this fetch renders, not whether to run it again
  }, [refresh, tenantReady]);

  // Pulls the recent feed's photos into the browser cache once the screen has
  // settled (Phase 95). Driven by state rather than by the fetch, so a mount
  // that painted from the snapshot warms its images immediately — before the
  // network has answered — and a later refresh tops up whatever is new. The
  // warm itself dedupes, so re-running on each change is cheap.
  useEffect(() => {
    if (!tenantReady) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentLogPhotos = logs
      .filter((log) => log.photo_url && new Date(log.completed_at).getTime() > cutoff)
      .map((log) => log.photo_url);
    warmImagesWhenIdle([
      // Newest first: logs arrive sorted descending, and the cap should spend
      // itself on what the feed shows today.
      ...recentLogPhotos,
      ...householdTasks.map((task) => task.photo_url),
      ...Object.values(latestInventoryAudits).map((audit) => audit.photo_url),
    ]);
  }, [tenantReady, logs, householdTasks, latestInventoryAudits]);

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

  // The owner PIN is gone (Phase 108). It was a constant shipped in this
  // bundle — readable by anyone who opened devtools — and typing it set a
  // localStorage flag that made ANY device, a staff phone included, "owner"
  // for every check that reads userRole: the staff gate's bypass, pet
  // editing, deleting other people's photo logs. Owners now prove who they
  // are with Google, and the role follows membership alone (set in the
  // tenant effect above).
  //
  // The flag is removed from devices that still carry it rather than merely
  // ignored, so nothing later can mistake it for meaning something again.
  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_OWNER_FLAG_KEY);
    } catch {
      // Blocked storage holds nothing to clean up.
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

  const addInventoryItem = useCallback(async (input: InventoryItemInput) => {
    const item = await dataProvider.createInventoryItem(input);
    setInventoryItems((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
    return item;
  }, []);

  const updateInventoryItem = useCallback(
    async (id: string, patch: Partial<InventoryItemInput>) => {
      const item = await dataProvider.updateInventoryItem(id, patch);
      setInventoryItems((prev) => prev.map((i) => (i.id === id ? item : i)));
      return item;
    },
    []
  );

  const removeInventoryItem = useCallback(async (id: string) => {
    await dataProvider.deleteInventoryItem(id);
    setInventoryItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  /**
   * Works the tenant out again, for the one moment it changes under a mounted
   * app: onboarding (Phase 111). The provider lives in the root layout, so it
   * resolved once — as "no household" — when the new owner landed on
   * /onboarding, and a client-side hop to /dashboard keeps that answer. The
   * owner guard then saw a non-member and rendered nothing: a brand-new
   * household's first screen was blank until a manual reload.
   */
  const reloadTenant = useCallback(async () => {
    applyTenant(await resolveActiveHouseholdId());
    await refresh({ silent: true });
  }, [applyTenant, refresh]);

  // What the stepper reads its starting point from; see adjustInventoryQuantity.
  const inventoryItemsRef = useRef(inventoryItems);
  useEffect(() => {
    inventoryItemsRef.current = inventoryItems;
  }, [inventoryItems]);
  // Read by the stepper's failure path, which runs from a timer long after
  // the render that created it.
  const refreshRef = useRef(refresh);
  const userRoleRef = useRef(userRole);
  useEffect(() => {
    refreshRef.current = refresh;
    userRoleRef.current = userRole;
  }, [refresh, userRole]);

  // The stepper's taps not yet sent, per item, and the timer that will send
  // them. Refs, not state: nothing renders from them.
  const pendingStock = useRef(new Map<string, { delta: number; timer: ReturnType<typeof setTimeout> }>());

  /**
   * A stepper tap (Phase 110).
   *
   * The screen moves on the tap; the network does not. Taps on one item are
   * summed and sent as a single increment once they stop for a moment, so
   * counting in ten packs of food is one request rather than ten racing ones.
   * The server adds the sum to whatever it holds — not a total computed here —
   * so another phone's taps in the same moment are kept, not overwritten.
   *
   * What is summed is the change the screen actually showed, not the taps:
   * "-" on an empty shelf shows no change and sends none. Summing raw taps
   * would let 1 → "-", "-", "+" (shown as 0, 0, 1) reach the server as -1,
   * which floors at 0 — a different answer from the one on screen.
   *
   * Fire-and-forget for the caller: a failure is reported here, and the list
   * is refetched so the screen goes back to what the server really holds.
   */
  const adjustInventoryQuantity = useCallback((id: string, delta: number) => {
    // Read from the ref, not from a setState updater: React runs updaters
    // during the next render, not here, so a value computed inside one is not
    // available to the batching below. The ref is also written here, at once,
    // so a second tap before that render starts from the first tap's result.
    const current = inventoryItemsRef.current.find((item) => item.id === id);
    if (!current) return;
    const quantity = Math.max(0, current.quantity + delta);
    const applied = quantity - current.quantity;
    if (applied === 0) return;
    inventoryItemsRef.current = inventoryItemsRef.current.map((item) =>
      item.id === id ? { ...item, quantity } : item
    );
    setInventoryItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity } : item)));

    const pending = pendingStock.current;
    const entry = pending.get(id);
    if (entry) clearTimeout(entry.timer);
    const total = (entry?.delta ?? 0) + applied;
    const timer = setTimeout(async () => {
      pending.delete(id);
      if (total === 0) return;
      try {
        const item = await dataProvider.adjustInventoryQuantity(id, total);
        // Only if no newer taps landed while this was in flight: those are
        // already on screen and on their way, and this answer predates them.
        if (!pending.has(id)) {
          setInventoryItems((prev) => prev.map((i) => (i.id === id ? item : i)));
        }
      } catch (err) {
        console.error(err);
        toast.error(
          userRoleRef.current === "owner" ? "Couldn't update the stock" : "Gagal memperbarui stok"
        );
        void refreshRef.current({ silent: true });
      }
    }, 600);
    pending.set(id, { delta: total, timer });
  }, []);

  // Online only, unlike task logging: the photo is the audit, and the offline
  // queue carries URLs rather than files — queueing it would mean holding the
  // image in IndexedDB until reconnect. A failure surfaces to the card, which
  // keeps the counts and the photo so the retry is one tap.
  const submitInventoryAudit = useCallback(
    async (itemId: string, quantity: number, photoFile: File) => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("Offline — stock checks need a connection to upload the photo");
      }
      const photoUrl = await dataProvider.uploadInventoryPhoto(
        await compressPhoto(photoFile),
        itemId
      );
      const { audit, item } = await dataProvider.createInventoryAudit({
        item_id: itemId,
        quantity_counted: quantity,
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
      // Added whatever its date (Phase 100). The old guard — only keep it if
      // it is dated the day on screen — predates repeats and carry-over: a
      // weekly chore filed to start next Monday, or a one-off backdated to
      // yesterday, would both be dropped here and not reappear until a
      // refetch. expandChores decides what belongs on the day being browsed,
      // so a row that does not is simply not rendered, which is cheaper than
      // being wrong about it.
      setHouseholdTasks((prev) => [...prev, task]);
      return task;
    },
    []
  );

  const updateHouseholdTaskStatus = useCallback(
    async (
      id: string,
      status: HouseholdTaskStatus,
      patch?: {
        photo_url?: string | null;
        before_photo_url?: string | null;
        after_photo_url?: string | null;
      }
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

  const updateHouseholdTask = useCallback(
    async (id: string, patch: UpdateHouseholdTaskInput) => {
      const updated = await dataProvider.updateHouseholdTask(id, patch);
      // Replaced in place rather than refetched: editing a repeat's cadence or
      // moving a one-off to another day changes which occurrences this row
      // generates, and expandChores recomputes that from the row itself.
      setHouseholdTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
      return updated;
    },
    []
  );

  const deleteHouseholdTask = useCallback(async (id: string) => {
    await dataProvider.deleteHouseholdTask(id);
    // Drops the row and anything that hung off it, matching the cascade on
    // parent_task_id so the list does not keep showing occurrences of a repeat
    // that no longer exists.
    setHouseholdTasks((prev) =>
      prev.filter((task) => task.id !== id && task.parent_task_id !== id)
    );
  }, []);

  const materialiseChoreOccurrence = useCallback(async (templateId: string, date: string) => {
    const row = await dataProvider.materialiseChoreOccurrence(templateId, date);
    setHouseholdTasks((prev) =>
      prev.some((task) => task.id === row.id)
        ? prev.map((task) => (task.id === row.id ? row : task))
        : [...prev, row]
    );
    return row;
  }, []);

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
      activeHouseholdId,
      tenantReady,
      isHouseholdMember,
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
      updateInventoryItem,
      removeInventoryItem,
      adjustInventoryQuantity,
      reloadTenant,
      submitInventoryAudit,
      submitRoutineProposal,
      submitRoutineProposalsBatch,
      decideRoutineProposals,
      createHouseholdTask,
      updateHouseholdTask,
      deleteHouseholdTask,
      materialiseChoreOccurrence,
      updateHouseholdTaskStatus,
      claimHouseholdTask,
      undoInventoryAlert,
      undoRoutineProposal,
      decideRoutineProposal,
    }),
    [
      activeHouseholdId,
      tenantReady,
      isHouseholdMember,
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
      updateInventoryItem,
      removeInventoryItem,
      adjustInventoryQuantity,
      reloadTenant,
      submitInventoryAudit,
      submitRoutineProposal,
      submitRoutineProposalsBatch,
      decideRoutineProposals,
      createHouseholdTask,
      updateHouseholdTask,
      deleteHouseholdTask,
      materialiseChoreOccurrence,
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
