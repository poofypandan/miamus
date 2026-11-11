"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { addDays } from "date-fns";
import { toast } from "sonner";
import { dataProvider, isMockMode } from "@/lib/data";
import { forgetDeletedChore, refreshRepairs } from "@/lib/repairs-store";
import { refreshBillPayments } from "@/lib/bill-payments";
import { refreshTaskExceptions } from "@/lib/task-exceptions-store";
import { screenLocale } from "@/lib/owner-locale";
import type {
  CreateEntityInput,
  CreateLogInput,
  CreateBatchLogInput,
  CreateScheduleInput,
  CreateMedicalRecordInput,
  CreateInventoryAlertInput,
  InventoryItemInput,
  InventoryItemPatch,
  FoodItemInput,
  CreateRoutineProposalInput,
  CreateHouseholdTaskInput,
  UpdateHouseholdTaskInput,
  LeaveDecision,
} from "@/lib/data";
import { LEAVE_LOOKBACK_DAYS } from "@/lib/leave";
import { readActiveStaffId } from "@/components/auth/staff-login-gate";
import { applyAmountRules } from "@/lib/kitchen-units";
import {
  readCachedMemberProfile,
  setActiveMemberProfile,
  writeCachedMemberProfile,
  type MemberProfile,
} from "@/lib/member-identity";
import { useToday } from "@/hooks/use-today";
import { isActivePet } from "@/lib/pets";
import {
  hydrateOutbox,
  outboxItems,
  submitJob,
  subscribeOutbox,
  SaveStillWaitingError,
  type OfflineQueueItem,
  type SendResult,
} from "@/lib/offline-queue";
import { outboxView, overlay, pendingFood } from "@/lib/outbox-view";
import { discardPhoto, enqueuePhoto } from "@/lib/photo-queue";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { AGENDA_WEEK_DAYS, weekStartOf } from "@/lib/unified-agenda";
import { compressPhoto } from "@/lib/image";
import { readSnapshot, writeSnapshot } from "@/lib/snapshot-cache";
import { readSessionState, waitForSession } from "@/lib/auth/device-session";
import { isConnectionError } from "@/lib/network-errors";
import { refreshFeatures, useFeatureFlagsFor } from "@/hooks/use-feature-flags";
import { visibleChores } from "@/lib/features";
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
  InventoryUnit,
  FoodItem,
  FoodOutcome,
  StockStatus,
  InventoryAuditWithStaff,
  ProposalStatus,
  HouseholdTask,
  BillPayment,
  HouseholdTaskStatus,
  LeaveRequest,
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
/** The queue's server snapshot: nothing waits during prerender. */
const NO_QUEUE: readonly OfflineQueueItem[] = [];

function withStaffId<T extends { staff_id?: string | null }>(input: T): T {
  return { ...input, staff_id: input.staff_id ?? readActiveStaffId() };
}


export type UserRole = "staff" | "owner";

// Where the retired owner PIN used to leave its mark (Phase 108). Read only to
// be deleted: see the role effect below.
const LEGACY_OWNER_FLAG_KEY = "banyuwangi11:isOwner";

/** Track amount as an owner sets it (Phase 170 PR A). Off keeps the numbers, unshown. */
export type TrackAmountSettings =
  | { track: false }
  | { track: true; unit: InventoryUnit; quantity: number; lowAt: number };

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
  /**
   * Leave whose last day is within LEAVE_LOOKBACK_DAYS (Phase 140): pending,
   * approved and past. Read by the chore hooks, which apply the triage.
   */
  leaveRequests: LeaveRequest[];
  inventoryItems: InventoryItem[];
  /**
   * Food on the list, plus finished food whose container still has to go
   * back (Phase 156, migrations/123).
   */
  foodItems: FoodItem[];
  /** The newest stock check per inventory item, keyed by item id. */
  latestInventoryAudits: Record<string, InventoryAuditWithStaff>;
  /**
   * The chores filed for the week `selectedDate` is in — never the whole
   * table. Fetched per week rather than in bulk (see migrations/082), so this
   * array changes when the browsed week does.
   */
  householdTasks: HouseholdTask[];
  loading: boolean;
  /**
   * The latest attempt to load the household failed — no connection, or one
   * too slow to wait for (Phase 146). Whatever is on screen stays; the
   * provider keeps retrying by itself, and this goes false when one lands.
   */
  syncFailed: boolean;
  /**
   * Something real is on screen: this device's cached copy, or a load that
   * succeeded. When syncFailed is true and this is false, the empty lists
   * mean "not loaded", not "nothing today", and must not be shown as the
   * latter.
   */
  hasData: boolean;
  /**
   * The latest load found no session on this device at all, so it sent
   * nothing (every query would have been refused). A staff phone in this
   * state has to be linked again; the provider loads by itself once a
   * session arrives.
   */
  signedOut: boolean;
  /** Tries the load again now, without skeletons. Never rejects. */
  retrySync: () => Promise<void>;
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
  /**
   * The header's Today button (Phase 115): back to today, and a fresh view of
   * it — `todayJumps` counts the taps, and the Agenda keys its view on it, so
   * a tap re-centres the date strip and the week grid even when today was
   * already the selected day.
   */
  jumpToToday: () => void;
  todayJumps: number;
  /** "owner" exactly when isHouseholdMember — a Google-authenticated member. */
  userRole: UserRole;
  /**
   * An admin's own row on the roster (Phase 139): who they are when a chore
   * is assigned to them, and in Action Mode. Null for a staff phone, and for
   * an admin whose row could not be had (offline on first launch; a database
   * without migrations/106).
   */
  memberProfile: MemberProfile | null;
  /**
   * False while an admin's row is still being looked up for the first time on
   * this device. Action Mode waits for it rather than showing every chore and
   * then narrowing to theirs. Always true for a staff phone.
   */
  memberProfileReady: boolean;
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
  /**
   * Pet routines and extra notes. Kept on the phone first and sent from
   * there (Phase 161): on a weak signal the log waits and a toast says so.
   */
  logTask: (input: CreateLogInput) => Promise<TaskLog>;
  logTasksBatch: (input: CreateBatchLogInput) => Promise<TaskLog[]>;
  /**
   * Saves still waiting on this phone (Phase 161, lib/offline-queue.ts): how
   * many, and the ids of the rows on screen that are waiting.
   */
  outboxCount: number;
  pendingIds: ReadonlySet<string>;
  /**
   * Finishing a chore (Phase 161): kept on the phone and sent, or left
   * waiting when there is no answer. `queued` says which; `task` is the saved
   * row when it was sent. Throws only when the server refuses it.
   *
   * Photos are both or none. None is for an admin finishing their own chore
   * from Today (Phase 163; migrations/136); staff always send both.
   */
  finishChore: (input: {
    templateId: string;
    date: string;
    rowId: string | null;
    assignedTo: string | null;
    before: string | null;
    after: string | null;
    title: string;
    /** Leave cover: take the stored row over first (see ChoreFinishJob). */
    takeOverAs?: string | null;
  }) => Promise<{ queued: boolean; task?: HouseholdTask }>;
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
  /** Anyone in the household: enough, running low or out (Phase 154). */
  setInventoryStatus: (id: string, status: StockStatus) => Promise<InventoryItem>;
  removeInventoryItem: (id: string) => Promise<void>;
  /**
   * Food at home (Phase 156). Anyone in the household adds, edits and
   * finishes food; only admins delete it (the database decides). A photo is
   * uploaded first and filed under <household>/food/.
   */
  addFood: (input: Omit<FoodItemInput, "photo_url">, photo: File | null) => Promise<FoodItem>;
  /**
   * The food form's add (Phase 161): the photo and the row kept on the phone
   * first, so a weak signal leaves it waiting rather than lost. `queued`: it
   * has not reached the server yet. Kakak keeps addFood, whose undo needs the
   * saved row.
   */
  addFoodFromForm: (
    input: Omit<FoodItemInput, "photo_url">,
    photo: File | null
  ) => Promise<{ item: FoodItem; queued: boolean }>;
  /** `photo`: a new File replaces the photo, null removes it, undefined keeps it. */
  editFood: (id: string, input: Omit<FoodItemInput, "photo_url">, photo?: File | null) => Promise<FoodItem>;
  /**
   * Eaten, given away or thrown away. The photo stays until the caller says
   * Undo is no longer offered (releaseFinishedFoodPhoto, from the toast's
   * close), with FOOD_PHOTO_FALLBACK_MS as a backstop; the nightly clean-up
   * catches any the phone never got to.
   */
  finishFood: (id: string, outcome: FoodOutcome) => Promise<void>;
  /** Undo for finishFood: back on the list, photo kept. */
  unfinishFood: (id: string) => Promise<void>;
  /** Undo is gone (its toast closed): remove the finished food's photo now. */
  releaseFinishedFoodPhoto: (id: string) => void;
  returnFoodContainer: (id: string) => Promise<void>;
  /** Portions left on a food (Phase 170 PR A, D7); anyone in the household. */
  setFoodPortions: (id: string, portions: number | null) => Promise<void>;
  /** Admins only: food added by mistake. Takes its photo with it. */
  removeFood: (id: string) => Promise<void>;
  /**
   * One tap of an item's +/- stepper (Phase 110). Applied to the screen at
   * once; sent to the server in a batch — see the implementation.
   */
  adjustInventoryQuantity: (id: string, delta: number) => void;
  /**
   * Kitchen amounts (Phase 170 PR A, migrations/148). Anyone in the
   * household: Set amount (the number typed), and Bought with how much
   * (null = ticked without a number). Each shows at once and is put back if
   * the save fails; the server's answer, with the status it derived, wins.
   */
  setInventoryAmount: (id: string, quantity: number) => Promise<InventoryItem>;
  recordPurchase: (id: string, amount: number | null) => Promise<InventoryItem>;
  /** The Bought toast's Undo: takes the amount back off and restores the status and pre-fill. */
  undoPurchase: (before: InventoryItem, amount: number | null) => Promise<void>;
  /** Owner only (the guard refuses staff): switch Track amount, with unit, amount and low level. */
  setTrackAmount: (id: string, settings: TrackAmountSettings) => Promise<InventoryItem>;
  /**
   * Records a stock check: uploads the shelf photo, files the audit under
   * whoever is signed in on this device, and writes the count back onto the
   * item as its quantity — which is what takes it off today's checklist.
   */
  submitInventoryAudit: (itemId: string, quantity: number, photoFile: File) => Promise<void>;
  submitRoutineProposal: (input: CreateRoutineProposalInput) => Promise<RoutineProposal>;
  /** Files a pending leave request for someone on the roster (Phase 140). */
  requestLeave: (input: { staff_id: string; start_date: string; end_date: string }) => Promise<LeaveRequest>;
  /** An admin's approval (with its fallback) or rejection. */
  decideLeave: (id: string, decision: LeaveDecision) => Promise<LeaveRequest>;
  /** "I'm back early": chores return to their owner from today. */
  endLeaveEarly: (id: string) => Promise<LeaveRequest>;
  submitRoutineProposalsBatch: (inputs: CreateRoutineProposalInput[]) => Promise<RoutineProposal[]>;
  decideRoutineProposals: (
    ids: string[],
    status: Exclude<ProposalStatus, "pending">
  ) => Promise<void>;
  createHouseholdTask: (input: CreateHouseholdTaskInput) => Promise<HouseholdTask>;
  /** Several chores at once, all or none (one per room, Phase 158). */
  createHouseholdTasks: (inputs: CreateHouseholdTaskInput[]) => Promise<HouseholdTask[]>;
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
  /**
   * Owner-only. A paid bill's day marked not paid: payment and completion go
   * together (migrations/138). Returns the removed payment, if any.
   */
  reopenBillDay: (id: string) => Promise<BillPayment | null>;
  /** Owner-only. Edits a chore's own fields; never its completion state. */
  updateHouseholdTask: (id: string, patch: UpdateHouseholdTaskInput) => Promise<HouseholdTask>;
  /** Owner-only. Skips a repeat's first day; null if it was finished or moved meanwhile. */
  advanceChoreStart: (id: string, fromDate: string, toDate: string) => Promise<HouseholdTask | null>;
  /** Owner-only. Calls off one pending day of a repeat; null if it was finished meanwhile. */
  skipChoreOccurrence: (id: string) => Promise<HouseholdTask | null>;
  /** Owner-only. Deleting a repeat takes its materialised occurrences with it. */
  deleteHouseholdTask: (id: string) => Promise<void>;
  /**
   * Gives a virtual occurrence of a repeat a real row for `date`, so it can be
   * claimed or completed. Returns the row that owns that day — this call's, or
   * the one another phone wrote first.
   */
  materialiseChoreOccurrence: (
    templateId: string,
    date: string,
    assignedTo?: string | null
  ) => Promise<HouseholdTask>;
  /** Takes an unassigned chore for whoever is signed in on this device. */
  claimHouseholdTask: (id: string) => Promise<HouseholdTask>;
  undoInventoryAlert: (id: string) => Promise<void>;
  undoRoutineProposal: (id: string) => Promise<void>;
  decideRoutineProposal: (id: string, status: Exclude<ProposalStatus, "pending">) => Promise<void>;
}

// How long a load may run before the screen stops waiting for it (Phase 146).
// A normal one is well under two seconds even on a phone's mobile data; past
// this, the house's Wi-Fi is the likelier explanation than a big household.
const REFRESH_SLOW_MS = 10_000;
// Backstop for a finished food's photo (Phase 156). Normally it goes when
// the Undo toast closes (releaseFinishedFoodPhoto); this covers a toast that
// never reports closing. Far past FOOD_UNDO_TOAST_MS, so a toast held open by
// a finger still has its photo behind it (Codex review, PR #10).
const FOOD_PHOTO_FALLBACK_MS = 120_000;
// Between automatic retries after a failed load; the last repeats.
const SYNC_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000];

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [entities, setEntities] = useState<TaskEntity[]>([]);
  const [schedules, setSchedules] = useState<MasterSchedule[]>([]);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
  const [routineProposals, setRoutineProposals] = useState<RoutineProposal[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [foodItems, setFoodItems] = useState<FoodItem[]>([]);
  const [latestInventoryAudits, setLatestInventoryAudits] = useState<
    Record<string, InventoryAuditWithStaff>
  >({});
  const [householdTasks, setHouseholdTasks] = useState<HouseholdTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncFailed, setSyncFailed] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  // Resolved before anything is fetched (Phase 86C). Every query is scoped to
  // this, so loading first would show one household's data and then swap it.
  const [activeHouseholdId, setActiveHouseholdIdState] = useState(DEFAULT_HOUSEHOLD_ID);
  const [tenantReady, setTenantReady] = useState(false);
  // Starts false and is set after resolution, never read during render from
  // storage — the server HTML and the first client render must agree.
  const [isHouseholdMember, setIsHouseholdMember] = useState(false);
  const [memberProfile, setMemberProfile] = useState<MemberProfile | null>(null);
  const [memberProfileReady, setMemberProfileReady] = useState(false);
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
    // The admin's roster row, from this device's last lookup (Phase 139). The
    // effect below confirms it with the server; a first launch waits for that.
    const cachedMember = isMember ? readCachedMemberProfile(householdId) : null;
    setActiveMemberProfile(isMember ? cachedMember : undefined);
    setMemberProfile(cachedMember);
    setMemberProfileReady(!isMember || !!cachedMember);
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
      setLeaveRequests(cached.leaveRequests ?? []);
      setInventoryItems(cached.inventoryItems);
      setFoodItems(cached.foodItems ?? []);
      setLatestInventoryAudits(cached.latestInventoryAudits);
      setHydratedFromCache(true);
      setLoading(false);
    }
    // Per household: a switch to one this device has never loaded starts
    // with nothing worth showing, whatever the previous one had.
    setHasData(!!cached);
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

  // Confirms (or, on a first launch, finds) the admin's own roster row
  // (Phase 139). Failure keeps whatever the device had: offline, the cached
  // row is still right; with no cache, the admin is simply nobody on the
  // roster until next launch, which is how every admin was before 106.
  useEffect(() => {
    if (!tenantReady || !isHouseholdMember) return;
    let cancelled = false;
    dataProvider
      .ensureMyMemberProfile(activeHouseholdId)
      .then((profile) => {
        if (cancelled) return;
        setActiveMemberProfile(profile);
        setMemberProfile(profile);
        writeCachedMemberProfile(activeHouseholdId, profile);
      })
      .catch((err) => console.error("Could not resolve the admin's roster row", err))
      .finally(() => {
        if (!cancelled) setMemberProfileReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantReady, isHouseholdMember, activeHouseholdId]);

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

  // The Sunday-to-Saturday week the selected day is in — the Agenda's week
  // (Phase 112, calendar-aligned since 115). Always the whole week, in Day
  // view too: it is one request either way, and it means flipping Day ⇄ Week
  // never has to wait for a fetch.
  const loadHouseholdTasks = useCallback(async (dueDate: string) => {
    const start = weekStartOf(new Date(`${dueDate}T00:00:00`));
    const from = formatDateLocal(start);
    const to = formatDateLocal(addDays(start, AGENDA_WEEK_DAYS - 1));
    try {
      setHouseholdTasks(await dataProvider.listHouseholdTasks(from, to, todayRef.current));
    } catch (err) {
      // No connection is not "no chores" (Phase 146). Emptying the list here
      // wiped a staff phone's chores off the screen every time the Wi-Fi
      // dropped. The chores already shown stay, and the failure goes up to
      // refresh(), which reports it and retries.
      if (isConnectionError(err)) throw err;
      // Same degraded state as routine_proposals and inventory_items below:
      // household_tasks arrives with the Phase 82 migration, and until it is
      // applied the request 404s. An empty chore list is the correct answer —
      // letting it bubble would take the whole dashboard down with it.
      console.warn("household_tasks unavailable — run the Phase 82 migration", err);
      setHouseholdTasks([]);
    }
  }, []);

  // Numbers each refresh, so one that lands late cannot overwrite what a
  // newer one already put on screen (Phase 146) — see refresh().
  const refreshCount = useRef(0);
  const appliedRefresh = useRef(0);
  // How many are still waiting on the network. The retry loop below adds
  // none while one is: on Wi-Fi that hangs rather than fails, stacking more
  // requests on the same dead line only slows the one that might get through.
  const refreshesInFlight = useRef(0);

  // The fetch itself, split out of refresh() below so the bookkeeping around
  // it reads on one screen. `pass` is that refresh's number.
  const loadEverything = useCallback(async (pass: number) => {
    const [e, s, l, m, ia, rp, ii, audits, , leave, food] = await Promise.all([
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
      // Leave (Phase 140), from far enough back to cover anything that can
      // still roll over. Same degraded state as above until migrations/108
      // is applied: no leave, so every chore stays with its owner.
      dataProvider
        .listLeaveRequests(formatDateLocal(addDays(new Date(), -LEAVE_LOOKBACK_DAYS)))
        .catch((err) => {
          console.warn("leave_requests unavailable — run migrations/108", err);
          return [] as LeaveRequest[];
        }),
      // Food at home (Phase 156). Same degraded state until migrations/123
      // is applied: an empty list rather than a broken dashboard.
      dataProvider.listFoodItems().catch((err) => {
        console.warn("food_items unavailable — run migrations/123", err);
        return [] as FoodItem[];
      }),
    ]);
    // A newer refresh already landed: its answer is the more recent one.
    if (pass < appliedRefresh.current) return;
    appliedRefresh.current = pass;
    setEntities(e);
    setSchedules(s);
    setLogs(l);
    setMedicalRecords(m);
    setInventoryAlerts(ia);
    setRoutineProposals(rp);
    setLeaveRequests(leave);
    setInventoryItems(ii);
    setFoodItems(food);
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
      leaveRequests: leave,
      inventoryItems: ii,
      foodItems: food,
      latestInventoryAudits: audits,
    });
    setHasData(true);
    setSyncFailed(false);
    // Silent or not: if skeletons are up, real data has just arrived to
    // replace them. When they are not, this changes nothing.
    setLoading(false);
  }, [loadHouseholdTasks]);

  const refresh = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    // Repairs live in their own cache (src/lib/repairs-store.ts); catch it
    // up with everything else (Codex, PR #37).
    refreshRepairs();
    // Bill payments too (owners only; only while a screen shows them).
    refreshBillPayments();
    // Couldn't-do records (Phase 165), likewise only while a screen shows them.
    refreshTaskExceptions();
    // Household → Features (Phase 171): an owner may have switched something
    // on another phone since this one opened.
    refreshFeatures();
    // A silent pass never *puts up* skeletons. It matters more than it looks:
    // flipping `loading` on re-renders the staff list as skeletons, which
    // unmounts the card holding an open photo-tagging dialog — exactly what a
    // refresh triggered by returning from the camera would do. Taking them
    // down is another matter; see below.
    if (!silent) setLoading(true);
    const pass = ++refreshCount.current;
    refreshesInFlight.current += 1;

    // Too slow to wait for: stop holding the screen (Phase 146). Bad Wi-Fi
    // rarely fails outright — the request just hangs — and until now the
    // skeletons stayed up for as long as it did. The request is not
    // abandoned: if it lands after this, it is applied like any other.
    const slow = setTimeout(() => {
      if (pass <= appliedRefresh.current) return;
      setSyncFailed(true);
      setLoading(false);
    }, REFRESH_SLOW_MS);

    try {
      // A session the phone still holds but cannot renew right now (the token
      // ran out overnight, the Wi-Fi is down) reads to supabase-js as no
      // session at all, and every query below would then go out with only the
      // public key. RLS answers those with empty lists — which, written to
      // state and to the snapshot, replace the household with nothing. That
      // looks exactly like being signed out, and is how a working phone ended
      // up being sent a fresh invite. Report it as what it is instead.
      const state = await readSessionState();
      if (state === "unreachable") {
        throw new Error("Session could not be renewed — no connection");
      }
      // No session at all: nothing to load, and every query would be refused
      // by RLS (a phone before its invite, an owner before Google, a bot).
      // Nothing is sent; the listener below loads the moment a session
      // arrives. Not a failure — there is no connection problem to report or
      // retry — but skeletons must not stay up waiting for it.
      if (state === "none") {
        setSignedOut(true);
        if (pass > appliedRefresh.current) setLoading(false);
        return;
      }
      setSignedOut(false);
      await loadEverything(pass);
    } catch (err) {
      // Only if nothing newer has already succeeded: a stale failure must not
      // put a warning over data that is current.
      if (pass > appliedRefresh.current) {
        setSyncFailed(true);
        // Always, silent or not: a load that failed must never leave
        // skeletons up. Before Phase 146 a failed first load did exactly that,
        // and no later silent refresh took them down — the staff screen stayed
        // grey until the app was killed and reopened.
        setLoading(false);
      }
      throw err;
    } finally {
      clearTimeout(slow);
      refreshesInFlight.current -= 1;
    }
  }, [loadEverything]);

  useEffect(() => {
    // Gated on the tenant: `loading` starts true, so the app shows skeletons
    // through this window rather than an empty household. Silent when the
    // cache already painted — the revalidation must not replace cards the
    // user is reading with skeletons.
    //
    // A failure is already on screen (syncFailed) and retried below; all
    // that is left to do with it here is not leave it unhandled.
    if (tenantReady) {
      refresh({ silent: hydratedFromCache }).catch((err) =>
        console.warn("Household load failed — retrying", err)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydratedFromCache decides how this fetch renders, not whether to run it again
  }, [refresh, tenantReady]);

  // Keeps trying after a failed load until one lands (Phase 146).
  //
  // Nothing did before. AutoRefresh only fires when the app comes back to the
  // foreground and the browser claims to be online, and use-offline-sync only
  // when it has queued logs to send — so a phone that opened on a dead
  // connection stayed on whatever it first showed. Backing off to once a
  // minute, and paused while the app is in the background. "online" and
  // coming back to the foreground both retry at once and restart the
  // back-off: iOS often never fires the first on a Wi-Fi handover, which is
  // what the timer is for.
  useEffect(() => {
    if (!syncFailed) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      clearTimeout(timer);
      const delay = SYNC_RETRY_DELAYS_MS[Math.min(attempt, SYNC_RETRY_DELAYS_MS.length - 1)];
      attempt += 1;
      timer = setTimeout(tryNow, delay);
    };
    function tryNow() {
      if (cancelled) return;
      if (document.visibilityState !== "visible" || refreshesInFlight.current > 0) {
        schedule();
        return;
      }
      // Success sets syncFailed false, which tears this effect down.
      refresh({ silent: true }).catch(() => {
        if (!cancelled) schedule();
      });
    }
    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      attempt = 0;
      clearTimeout(timer);
      tryNow();
    };

    schedule();
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [syncFailed, refresh]);

  const retrySync = useCallback(
    () =>
      refresh({ silent: true }).catch((err) => {
        console.warn("Manual retry failed", err);
      }),
    [refresh]
  );

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
  //
  // Keyed on the week rather than the day: every day of a week shares one
  // window, so moving between them needs no request.
  const choresLoadedOnce = useRef(false);
  const selectedWeekStr = formatDateLocal(weekStartOf(selectedDate));
  useEffect(() => {
    if (!choresLoadedOnce.current) {
      choresLoadedOnce.current = true;
      return;
    }
    // Offline, the week browsed to keeps the chores already loaded; the
    // retry loop in refresh() fetches the right ones once it reconnects.
    loadHouseholdTasks(selectedWeekStr).catch((err) =>
      console.warn("Chores for the browsed week did not load", err)
    );
  }, [selectedWeekStr, loadHouseholdTasks]);

  const [todayJumps, setTodayJumps] = useState(0);
  const jumpToToday = useCallback(() => {
    setSelectedDate(new Date());
    setTodayJumps((n) => n + 1);
  }, []);

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
  // the flakiest connectivity. Since Phase 161 every log goes through the
  // save queue (lib/offline-queue.ts): kept on the phone, then sent. Answered,
  // it lands in state as the server returned it. No answer — offline, or a
  // weak signal that times out while the phone still says it is online — it
  // stays queued and is shown from there (see `shownLogs` below) under the
  // id it will have on the server, and useOfflineSync sends it later.
  const logTasksBatch = useCallback(async (rawInput: CreateBatchLogInput) => {
    // Stamped here rather than at insert time, so a batch sent later keeps the
    // author who actually took the photo instead of whoever happens to be on
    // duty when the signal comes back. The time too: when it was done.
    const input = withStaffId(rawInput);
    const payload: CreateBatchLogInput = { ...input, completed_at: input.completed_at ?? new Date().toISOString() };
    const ids = input.entries.map(() => crypto.randomUUID());
    const outcome = await submitJob<Extract<SendResult, { kind: "logs" }>>(
      { kind: "logs", payload, ids },
      ({ logs: saved }) => {
        // Empty when an earlier, timed-out try had landed: the refresh after
        // the next sync brings those rows.
        if (saved.length > 0) setLogs((prev) => [...saved, ...prev.filter((l) => !ids.includes(l.id))]);
      }
    );
    if (outcome.status === "sent" && outcome.result.logs.length > 0) return outcome.result.logs;
    if (outcome.status === "waiting") {
      toast.warning(
        screenLocale() === "id"
          ? "Disimpan di HP. Akan dikirim otomatis saat sinyal bagus."
          : "Saved on this phone. It will send by itself when the signal is back."
      );
    }
    return input.entries.map(
      (entry, i): TaskLog => ({
        id: ids[i],
        schedule_id: entry.schedule_id ?? null,
        entity_id: entry.entity_id,
        module: payload.module,
        photo_url: payload.photo_url ?? null,
        notes: payload.notes ?? null,
        completed_at: payload.completed_at!,
        staff_id: payload.staff_id ?? null,
        sub_type: payload.sub_type ?? "complete",
      })
    );
  }, []);

  // A single log is a one-entry batch: one path to the queue and back.
  const logTask = useCallback(
    async (input: CreateLogInput) => {
      const [log] = await logTasksBatch({
        entries: [{ schedule_id: input.schedule_id ?? null, entity_id: input.entity_id }],
        module: input.module,
        photo_url: input.photo_url ?? null,
        notes: input.notes ?? null,
        completed_at: input.completed_at,
        staff_id: input.staff_id,
        sub_type: input.sub_type,
      });
      return log;
    },
    [logTasksBatch]
  );

  // --- The save queue on screen (Phase 161) ---------------------------------
  const queued = useSyncExternalStore(subscribeOutbox, outboxItems, () => NO_QUEUE);
  useEffect(() => {
    void hydrateOutbox();
  }, []);
  const waiting = useMemo(
    () => outboxView(queued, activeHouseholdId, householdTasks),
    [queued, activeHouseholdId, householdTasks]
  );
  const shownLogs = useMemo(() => overlay(logs, waiting.logs), [logs, waiting.logs]);
  const shownFoods = useMemo(() => overlay(foodItems, waiting.foods), [foodItems, waiting.foods]);
  // Bills and upkeep switched off (Phase 171, migrations/145): its chores
  // hide from every screen, owners' and staff phones alike, and come back
  // with the switch. Saved rows are untouched; only what's shown changes.
  const { flags: featureFlags } = useFeatureFlagsFor(activeHouseholdId, tenantReady);
  const shownTasks = useMemo(
    () => visibleChores(overlay(householdTasks, waiting.tasks, false), featureFlags),
    [householdTasks, waiting.tasks, featureFlags]
  );

  const finishChore = useCallback(
    async (input: {
      templateId: string;
      date: string;
      rowId: string | null;
      assignedTo: string | null;
      before: string | null;
      after: string | null;
      title: string;
      takeOverAs?: string | null;
    }) => {
      const outcome = await submitJob<Extract<SendResult, { kind: "chore" }>>(
        {
          kind: "chore",
          ...input,
          // Stamped now, for the same reason as every write here: whoever
          // holds the phone when the signal returns may be someone else.
          completedBy: readActiveStaffId(),
          completedAt: new Date().toISOString(),
        },
        ({ task }) =>
          setHouseholdTasks((prev) =>
            prev.some((t) => t.id === task.id) ? prev.map((t) => (t.id === task.id ? task : t)) : [...prev, task]
          )
      );
      return outcome.status === "waiting"
        ? { queued: true }
        : { queued: false, task: outcome.result.task };
    },
    []
  );

  // Deletes the completion record first (so the UI reverts to pending
  // immediately) and best-effort cleans up the storage object after — a
  // transient storage failure shouldn't leave the task stuck "done".
  const deleteLogWithPhoto = useCallback(async (log: TaskLog) => {
    // Every caller, one guard: a log still in the save queue is not deleted
    // (see SaveStillWaitingError).
    // Read from the queue itself at the moment of the tap, not from a render.
    if (outboxView(outboxItems(), getActiveHouseholdId(), []).pendingIds.has(log.id)) {
      throw new SaveStillWaitingError();
    }
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

  const setInventoryStatus = useCallback(async (id: string, status: StockStatus) => {
    // Shown at once; put back if the save fails.
    let previous: InventoryItem | undefined;
    setInventoryItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        previous = i;
        // On a tracked item, Out also empties it (migrations/148).
        return applyAmountRules(i, { ...i, stock_status: status, stock_status_by: readActiveStaffId() });
      })
    );
    try {
      const item = await dataProvider.setInventoryStatus(id, status, readActiveStaffId());
      setInventoryItems((prev) => prev.map((i) => (i.id === id ? item : i)));
      return item;
    } catch (err) {
      if (previous) {
        const restore = previous;
        setInventoryItems((prev) => prev.map((i) => (i.id === id ? restore : i)));
      }
      throw err;
    }
  }, []);

  // The stepper's taps not yet sent, per item, and the timer that will send
  // them. Refs, not state: nothing renders from them.
  const pendingStock = useRef(new Map<string, { delta: number; timer: ReturnType<typeof setTimeout> }>());

  // Kitchen amounts (Phase 170 PR A): one optimistic write, mirrored
  // through the amount rules (lib/kitchen-units, as migrations/148's
  // trigger), put back if it fails.
  const writeInventoryItem = useCallback(
    async (id: string, patch: InventoryItemPatch, send: () => Promise<InventoryItem>) => {
      let previous: InventoryItem | undefined;
      setInventoryItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          previous = i;
          return applyAmountRules(i, { ...i, ...patch });
        })
      );
      try {
        const item = await send();
        setInventoryItems((prev) => prev.map((i) => (i.id === id ? item : i)));
        return item;
      } catch (err) {
        if (previous) {
          const restore = previous;
          setInventoryItems((prev) => prev.map((i) => (i.id === id ? restore : i)));
        }
        throw err;
      }
    },
    []
  );

  const setInventoryAmount = useCallback(
    (id: string, quantity: number) => {
      // The typed amount replaces any minus/plus taps not sent yet; sent
      // after it, they'd land on top of the number the person typed.
      const pending = pendingStock.current.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        pendingStock.current.delete(id);
      }
      const patch: InventoryItemPatch = { quantity: Math.max(0, quantity), amount_set_by: readActiveStaffId() };
      return writeInventoryItem(id, patch, () => dataProvider.updateInventoryItem(id, patch));
    },
    [writeInventoryItem]
  );

  const recordPurchase = useCallback(
    (id: string, amount: number | null) => {
      const staffId = readActiveStaffId();
      const current = inventoryItemsRef.current.find((i) => i.id === id);
      const adds = current?.track_amount === true && amount !== null;
      const patch: InventoryItemPatch = {
        stock_status: "ok",
        stock_status_by: staffId,
        ...(adds && current
          ? { quantity: current.quantity + amount!, last_bought_amount: amount, amount_set_by: staffId }
          : {}),
      };
      return writeInventoryItem(id, patch, () => dataProvider.recordPurchase(id, amount, staffId));
    },
    [writeInventoryItem]
  );

  const undoPurchase = useCallback(
    async (before: InventoryItem, amount: number | null) => {
      const staffId = readActiveStaffId();
      // Taken back off as an increment, so another phone's change in the
      // meantime is kept; then the status and pre-fill as they were.
      if (before.track_amount === true && amount !== null) {
        const item = await dataProvider.adjustInventoryQuantity(before.id, -amount, staffId);
        setInventoryItems((prev) => prev.map((i) => (i.id === before.id ? item : i)));
      }
      // The status back, credited to whoever undid it: the earlier marker
      // may have been removed since, and 148 refuses a removed person's id.
      const patch: InventoryItemPatch = {
        stock_status: before.stock_status ?? "ok",
        stock_status_by: staffId,
        last_bought_amount: before.last_bought_amount ?? null,
      };
      await writeInventoryItem(before.id, patch, () => dataProvider.updateInventoryItem(before.id, patch));
    },
    [writeInventoryItem]
  );

  const setTrackAmount = useCallback(
    (id: string, settings: TrackAmountSettings) => {
      const patch: InventoryItemPatch = settings.track
        ? {
            track_amount: true,
            unit: settings.unit,
            quantity: Math.max(0, settings.quantity),
            // Blank "Running low at" is 0: only Out, at nothing left. The
            // Phase 110 default of 2 is never kept by accident (D14).
            min_threshold: Math.max(0, settings.lowAt),
            amount_set_by: readActiveStaffId(),
          }
        : { track_amount: false };
      return writeInventoryItem(id, patch, () => dataProvider.updateInventoryItem(id, patch));
    },
    [writeInventoryItem]
  );

  const removeInventoryItem = useCallback(async (id: string) => {
    await dataProvider.deleteInventoryItem(id);
    setInventoryItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  // --- Food at home (Phase 156) ---------------------------------------------
  const foodItemsRef = useRef(foodItems);
  useEffect(() => {
    foodItemsRef.current = foodItems;
  }, [foodItems]);
  // Photos of finished food waiting for Undo to lapse, by food id.
  const foodPhotoTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const putFood = useCallback((item: FoodItem) => {
    setFoodItems((prev) =>
      prev.some((f) => f.id === item.id) ? prev.map((f) => (f.id === item.id ? item : f)) : [item, ...prev]
    );
  }, []);

  // Best effort: a photo left behind is removed by the nightly clean-up
  // (migrations/123), so a failure here is logged, not shown.
  const dropPhoto = useCallback(async (url: string | null) => {
    if (!url) return;
    try {
      await dataProvider.deletePhoto(url);
    } catch (err) {
      console.warn("Food photo not removed; the nightly clean-up will", err);
    }
  }, []);

  const addFood = useCallback(
    async (input: Omit<FoodItemInput, "photo_url">, photo: File | null) => {
      const photoUrl = photo ? await dataProvider.uploadPhoto(photo, "food") : null;
      try {
        const item = await dataProvider.createFoodItem({ ...input, photo_url: photoUrl }, readActiveStaffId());
        putFood(item);
        return item;
      } catch (err) {
        void dropPhoto(photoUrl);
        throw err;
      }
    },
    [putFood, dropPhoto]
  );

  const addFoodFromForm = useCallback(
    async (input: Omit<FoodItemInput, "photo_url">, photo: File | null) => {
      // The photo is kept on the phone and uploads first; the row is not
      // sent until it has (lib/offline-queue.ts).
      const photoUrl = photo ? await enqueuePhoto(photo, "food") : null;
      const full: FoodItemInput = { ...input, photo_url: photoUrl };
      const id = crypto.randomUUID();
      const addedBy = readActiveStaffId();
      const local = pendingFood(id, full, addedBy, getActiveHouseholdId(), new Date().toISOString());
      try {
        const outcome = await submitJob<Extract<SendResult, { kind: "food" }>>(
          { kind: "food", id, input: full, addedBy },
          ({ food }) => putFood(food ?? local)
        );
        if (outcome.status === "waiting") return { item: local, queued: true };
        return { item: outcome.result.food ?? local, queued: false };
      } catch (err) {
        // Refused: nothing will point at the photo.
        if (photoUrl) {
          void discardPhoto(photoUrl);
          void dropPhoto(photoUrl);
        }
        throw err;
      }
    },
    [putFood, dropPhoto]
  );

  const editFood = useCallback(
    async (id: string, input: Omit<FoodItemInput, "photo_url">, photo?: File | null) => {
      const before = foodItemsRef.current.find((f) => f.id === id);
      const newUrl = photo ? await dataProvider.uploadPhoto(photo, "food") : null;
      const photoPatch = photo === undefined ? {} : { photo_url: newUrl };
      try {
        const item = await dataProvider.updateFoodItem(id, { ...input, ...photoPatch });
        putFood(item);
        if (photo !== undefined && before?.photo_url && before.photo_url !== item.photo_url) {
          void dropPhoto(before.photo_url);
        }
        return item;
      } catch (err) {
        void dropPhoto(newUrl);
        throw err;
      }
    },
    [putFood, dropPhoto]
  );

  // Removes a finished food's photo — unless it was put back meanwhile.
  // Undo marks the id synchronously (foodUndone), before its own save, so a
  // toast closing in the same moment as an Undo tap never deletes.
  const foodUndone = useRef(new Set<string>());
  const deleteFinishedPhoto = useCallback(
    (id: string) => {
      const timer = foodPhotoTimers.current.get(id);
      if (!timer) return; // Already released, or never had a photo.
      clearTimeout(timer);
      foodPhotoTimers.current.delete(id);
      if (foodUndone.current.has(id)) return;
      const item = foodItemsRef.current.find((f) => f.id === id);
      const url = item?.photo_url;
      if (!item || item.outcome === null || !url) return;
      void (async () => {
        await dropPhoto(url);
        try {
          putFood(await dataProvider.updateFoodItem(id, { photo_url: null }));
        } catch (err) {
          // Deleted meanwhile, or no signal: the nightly clean-up clears it.
          console.warn("Food photo link not cleared", err);
        }
      })();
    },
    [putFood, dropPhoto]
  );

  const finishFood = useCallback(
    async (id: string, outcome: FoodOutcome) => {
      const before = foodItemsRef.current.find((f) => f.id === id);
      if (!before) return;
      foodUndone.current.delete(id);
      // Off the list at once; back if the save fails.
      putFood({ ...before, outcome, finished_at: new Date().toISOString() });
      try {
        const item = await dataProvider.updateFoodItem(id, { outcome, finished_by: readActiveStaffId() });
        putFood(item);
        if (item.photo_url) {
          foodPhotoTimers.current.set(
            id,
            setTimeout(() => deleteFinishedPhoto(id), FOOD_PHOTO_FALLBACK_MS)
          );
        }
      } catch (err) {
        putFood(before);
        throw err;
      }
    },
    [putFood, deleteFinishedPhoto]
  );

  const setFoodPortions = useCallback(
    async (id: string, portions: number | null) => {
      const before = foodItemsRef.current.find((f) => f.id === id);
      if (!before) return;
      putFood({ ...before, portions });
      try {
        putFood(await dataProvider.updateFoodItem(id, { portions }));
      } catch (err) {
        putFood(before);
        throw err;
      }
    },
    [putFood]
  );

  const releaseFinishedFoodPhoto = useCallback(
    (id: string) => deleteFinishedPhoto(id),
    [deleteFinishedPhoto]
  );

  const unfinishFood = useCallback(
    async (id: string) => {
      foodUndone.current.add(id);
      const timer = foodPhotoTimers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        foodPhotoTimers.current.delete(id);
      }
      const item = await dataProvider.updateFoodItem(id, { outcome: null });
      putFood(item);
    },
    [putFood]
  );

  const returnFoodContainer = useCallback(
    async (id: string) => {
      const before = foodItemsRef.current.find((f) => f.id === id);
      if (before) putFood({ ...before, container_returned_at: new Date().toISOString() });
      try {
        const item = await dataProvider.updateFoodItem(id, { container_returned_at: new Date().toISOString() });
        // Done with: it leaves the list on the next load anyway.
        setFoodItems((prev) => prev.filter((f) => f.id !== item.id));
      } catch (err) {
        if (before) putFood(before);
        throw err;
      }
    },
    [putFood]
  );

  const removeFood = useCallback(
    async (id: string) => {
      const before = foodItemsRef.current.find((f) => f.id === id);
      await dataProvider.deleteFoodItem(id);
      setFoodItems((prev) => prev.filter((f) => f.id !== id));
      void dropPhoto(before?.photo_url ?? null);
    },
    [dropPhoto]
  );

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

  // The load that found no session sent nothing; this is the other half. When
  // a session does arrive without a page load, the household is worked out
  // again (with no session it fell back to a guess) and loaded, silently.
  // Every sign-in today ends in a full page load, which loads anyway, so this
  // is the safety net, not the main path.
  useEffect(() => {
    if (!signedOut) return;
    const stop = new AbortController();
    void waitForSession(stop.signal).then(() => {
      reloadTenant().catch((err) => console.warn("Household load after sign-in failed — retrying", err));
    });
    return () => stop.abort();
  }, [signedOut, reloadTenant]);

  // What the stepper reads its starting point from; see adjustInventoryQuantity.
  const inventoryItemsRef = useRef(inventoryItems);
  useEffect(() => {
    inventoryItemsRef.current = inventoryItems;
  }, [inventoryItems]);
  // Read by the stepper's failure path, which runs from a timer long after
  // the render that created it.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);


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
    // A tracked item's status follows its amount (migrations/148), shown at once.
    const staffId = readActiveStaffId();
    const moved = (item: InventoryItem) => applyAmountRules(item, { ...item, quantity, amount_set_by: staffId });
    inventoryItemsRef.current = inventoryItemsRef.current.map((item) => (item.id === id ? moved(item) : item));
    setInventoryItems((prev) => prev.map((item) => (item.id === id ? moved(item) : item)));

    const pending = pendingStock.current;
    const entry = pending.get(id);
    if (entry) clearTimeout(entry.timer);
    const total = (entry?.delta ?? 0) + applied;
    const timer = setTimeout(async () => {
      pending.delete(id);
      if (total === 0) return;
      try {
        const item = await dataProvider.adjustInventoryQuantity(id, total, staffId);
        // Only if no newer taps landed while this was in flight: those are
        // already on screen and on their way, and this answer predates them.
        if (!pending.has(id)) {
          setInventoryItems((prev) => prev.map((i) => (i.id === id ? item : i)));
        }
      } catch (err) {
        console.error(err);
        toast.error(
          screenLocale() === "id" ? "Gagal memperbarui stok" : "Couldn't update the stock"
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

  const createHouseholdTasks = useCallback(async (inputs: CreateHouseholdTaskInput[]) => {
    const created = await dataProvider.createHouseholdTasks(inputs);
    setHouseholdTasks((prev) => [...prev, ...created]);
    return created;
  }, []);

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

  const reopenBillDay = useCallback(async (id: string) => {
    const { task, payment } = await dataProvider.reopenBillDay(id);
    setHouseholdTasks((prev) => prev.map((row) => (row.id === id ? task : row)));
    return payment;
  }, []);

  const updateHouseholdTask = useCallback(
    async (id: string, patch: UpdateHouseholdTaskInput) => {
      const updated = await dataProvider.updateHouseholdTask(id, patch);
      // Replaced in place rather than refetched: editing a repeat's cadence or
      // moving a one-off to another day changes which occurrences this row
      // generates, and expandChores recomputes that from the row itself.
      // Added when it isn't there (Phase 158): the Rooms view edits chores
      // outside the week this cache holds, and one moved into it has to show
      // on Today at once. A row outside the week is harmless here.
      setHouseholdTasks((prev) =>
        prev.some((task) => task.id === id)
          ? prev.map((task) => (task.id === id ? updated : task))
          : [...prev, updated]
      );
      return updated;
    },
    []
  );

  const advanceChoreStart = useCallback(
    async (id: string, fromDate: string, toDate: string) => {
      const updated = await dataProvider.advanceChoreStart(id, fromDate, toDate);
      if (updated) {
        setHouseholdTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
      }
      return updated;
    },
    []
  );

  const skipChoreOccurrence = useCallback(async (id: string) => {
    const updated = await dataProvider.skipChoreOccurrence(id);
    if (updated) {
      setHouseholdTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
    }
    return updated;
  }, []);

  const deleteHouseholdTask = useCallback(async (id: string) => {
    await dataProvider.deleteHouseholdTask(id);
    // Drops the row and anything that hung off it, matching the cascade on
    // parent_task_id so the list does not keep showing occurrences of a repeat
    // that no longer exists.
    setHouseholdTasks((prev) =>
      prev.filter((task) => task.id !== id && task.parent_task_id !== id)
    );
    // A repair's visit leaves the repairs cache too (Phase 159).
    forgetDeletedChore(id);
  }, []);

  const materialiseChoreOccurrence = useCallback(
    async (templateId: string, date: string, assignedTo?: string | null) => {
      const row = await dataProvider.materialiseChoreOccurrence(templateId, date, assignedTo);
      setHouseholdTasks((prev) =>
        prev.some((task) => task.id === row.id)
          ? prev.map((task) => (task.id === row.id ? row : task))
          : [...prev, row]
      );
      return row;
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

  // Leave (Phase 140). Each replaces the row in place, so the chore triage
  // re-renders from the new state without waiting for a refresh.
  const upsertLeave = useCallback((row: LeaveRequest) => {
    setLeaveRequests((prev) =>
      prev.some((l) => l.id === row.id) ? prev.map((l) => (l.id === row.id ? row : l)) : [...prev, row]
    );
  }, []);

  const requestLeave = useCallback(
    async (input: { staff_id: string; start_date: string; end_date: string }) => {
      const row = await dataProvider.createLeaveRequest(input);
      upsertLeave(row);
      return row;
    },
    [upsertLeave]
  );

  const decideLeave = useCallback(
    async (id: string, decision: LeaveDecision) => {
      const row = await dataProvider.decideLeaveRequest(id, decision);
      upsertLeave(row);
      return row;
    },
    [upsertLeave]
  );

  const endLeaveEarly = useCallback(
    async (id: string) => {
      // The phone's day, not the server's: see end_leave_early.
      const row = await dataProvider.endLeaveEarly(id, formatDateLocal(new Date()));
      upsertLeave(row);
      return row;
    },
    [upsertLeave]
  );

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
      logs: shownLogs,
      medicalRecords,
      inventoryAlerts,
      routineProposals,
      leaveRequests,
      requestLeave,
      decideLeave,
      endLeaveEarly,
      inventoryItems,
      foodItems: shownFoods,
      latestInventoryAudits,
      householdTasks: shownTasks,
      loading,
      syncFailed,
      hasData,
      signedOut,
      retrySync,
      isMockMode,
      activePetId,
      setActivePetId,
      selectedDate,
      setSelectedDate,
      jumpToToday,
      todayJumps,
      userRole,
      roleHydrated,
      memberProfile,
      memberProfileReady,
      refresh,
      createEntity,
      updateEntity,
      deleteEntity,
      logTask,
      logTasksBatch,
      outboxCount: queued.length,
      pendingIds: waiting.pendingIds,
      finishChore,
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
      setInventoryStatus,
      removeInventoryItem,
      addFood,
      addFoodFromForm,
      editFood,
      finishFood,
      unfinishFood,
      releaseFinishedFoodPhoto,
      returnFoodContainer,
      setFoodPortions,
      removeFood,
      adjustInventoryQuantity,
      setInventoryAmount,
      recordPurchase,
      undoPurchase,
      setTrackAmount,
      reloadTenant,
      submitInventoryAudit,
      submitRoutineProposal,
      submitRoutineProposalsBatch,
      decideRoutineProposals,
      createHouseholdTask,
      createHouseholdTasks,
      updateHouseholdTask,
      advanceChoreStart,
      skipChoreOccurrence,
      deleteHouseholdTask,
      materialiseChoreOccurrence,
      updateHouseholdTaskStatus,
      reopenBillDay,
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
      shownLogs,
      medicalRecords,
      inventoryAlerts,
      routineProposals,
      leaveRequests,
      requestLeave,
      decideLeave,
      endLeaveEarly,
      inventoryItems,
      shownFoods,
      latestInventoryAudits,
      shownTasks,
      loading,
      syncFailed,
      hasData,
      signedOut,
      retrySync,
      activePetId,
      selectedDate,
      jumpToToday,
      todayJumps,
      userRole,
      roleHydrated,
      memberProfile,
      memberProfileReady,
      refresh,
      createEntity,
      updateEntity,
      deleteEntity,
      logTask,
      logTasksBatch,
      queued.length,
      waiting.pendingIds,
      finishChore,
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
      setInventoryStatus,
      removeInventoryItem,
      addFood,
      addFoodFromForm,
      editFood,
      finishFood,
      unfinishFood,
      releaseFinishedFoodPhoto,
      returnFoodContainer,
      setFoodPortions,
      removeFood,
      adjustInventoryQuantity,
      setInventoryAmount,
      recordPurchase,
      undoPurchase,
      setTrackAmount,
      reloadTenant,
      submitInventoryAudit,
      submitRoutineProposal,
      submitRoutineProposalsBatch,
      decideRoutineProposals,
      createHouseholdTask,
      createHouseholdTasks,
      updateHouseholdTask,
      advanceChoreStart,
      skipChoreOccurrence,
      deleteHouseholdTask,
      materialiseChoreOccurrence,
      updateHouseholdTaskStatus,
      reopenBillDay,
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
