import { describe, expect, it } from "vitest";
import { expandChores } from "@/lib/chore-recurrence";
import { applyLeaveTriage } from "@/lib/leave";
import { buildAgenda, isSlotOwed } from "@/lib/scheduleEngine";
import { dayTotals } from "@/lib/today-status";
import { buildEveningSummary, classifyDay, summaryOpenCount } from "@/lib/couldnt-do";
import { LATE_GRACE_MINUTES, buildStaffProgress, isLate, type StaffBusy } from "@/lib/staff-progress";
import type { HouseholdTask, LeaveRequest, MasterSchedule, TaskEntity, TaskException, TaskLog } from "@/types/database";

// Staff progress on Today (owners, 11 Nov): one row per person, house and
// pets, only the kinds each has, never 0/0; the strip's attribution rule;
// Anyone routines credited to whoever logged them; leave; calm tones; and the
// same open-task reading as the evening summary.

const TODAY = "2026-11-11";
const ARI = "ari";
const SYAM = "syam";
const OWNER_ROW = "owner-row";
const ROSTER = [
  { id: ARI, name: "Ari", user_id: null },
  { id: SYAM, name: "Syam", user_id: null },
  { id: OWNER_ROW, name: "Budi", user_id: "u1" },
];

let n = 0;
function chore(over: Partial<HouseholdTask>): HouseholdTask {
  return {
    id: `t${++n}`,
    household_id: "h",
    title: `Chore ${n}`,
    notes: null,
    category: "cleaning",
    assigned_to: null,
    due_date: TODAY,
    due_time: null,
    status: "pending",
    completed_by: null,
    completed_at: null,
    photo_url: null,
    created_at: "2026-11-01T00:00:00Z",
    recurrence: "none",
    recurrence_until: null,
    parent_task_id: null,
    requires_supervision: false,
    before_photo_url: null,
    after_photo_url: null,
    location_id: null,
    ...over,
  } as HouseholdTask;
}

function pet(id: string, name: string, status: TaskEntity["status"] = "home"): TaskEntity {
  return { id, household_id: "h", entity_type: "pet", name, icon: "dog", metadata: {}, status, created_at: "2026-09-01T00:00:00Z" };
}
const MOCHA = pet("mocha", "Mocha");
const MATCHA = pet("matcha", "Matcha");

function routine(entity: TaskEntity, title: string, times: string[], over: Partial<MasterSchedule> = {}): MasterSchedule {
  return {
    id: `s${++n}`,
    entity_id: entity.id,
    title,
    module: "pet",
    frequency_type: "fixed_time",
    interval_hours: null,
    fixed_times: times,
    start_time: null,
    end_time: null,
    is_active: true,
    expires_at: null,
    created_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

function logOf(s: MasterSchedule, time: string, staffId: string | null, over: Partial<TaskLog> = {}): TaskLog {
  return {
    id: `l${++n}`,
    schedule_id: s.id,
    entity_id: s.entity_id,
    module: "pet",
    photo_url: null,
    notes: null,
    completed_at: `${TODAY}T${time}:00+07:00`,
    staff_id: staffId,
    ...over,
  };
}

function exception(over: Partial<TaskException>): TaskException {
  return {
    id: `x${++n}`,
    household_id: "h",
    chore_id: null,
    schedule_id: null,
    entity_id: null,
    occurs_on: TODAY,
    slot_time: null,
    reason: "out_of_stock",
    note: null,
    photo_url: null,
    inventory_item_id: null,
    staff_id: SYAM,
    created_at: `${TODAY}T03:00:00Z`,
    ...over,
  };
}

function leave(staffId: string, over: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: `lv${++n}`,
    household_id: "h",
    staff_id: staffId,
    start_date: TODAY,
    end_date: TODAY,
    status: "approved",
    fallback_action: "unassign",
    fallback_assignee_id: null,
    ended_on: null,
    decided_by: null,
    decided_at: null,
    created_at: "2026-11-01T00:00:00Z",
    ...over,
  };
}

function build(params: {
  rows?: HouseholdTask[];
  schedules?: MasterSchedule[];
  logs?: TaskLog[];
  exceptions?: TaskException[];
  leaves?: LeaveRequest[];
  pets?: TaskEntity[];
  /** "HH:MM" now, today. */
  now?: string;
  date?: string;
  busy?: Map<string, StaffBusy>;
  features?: { pets: boolean; repairs: boolean };
}) {
  const { rows = [], schedules = [], logs = [], exceptions = [], leaves = [], pets = [MOCHA, MATCHA], now = "12:00", date = TODAY, busy, features } = params;
  const chores = applyLeaveTriage(expandChores({ rows, date, today: TODAY }), leaves);
  const groups = buildAgenda({ date, entities: pets, schedules, logs, now: new Date(`${TODAY}T${now}:00+07:00`) });
  const [h, m] = now.split(":").map(Number);
  return buildStaffProgress({
    date,
    today: TODAY,
    nowMinutes: h * 60 + m,
    chores,
    groups,
    exceptions,
    leaves,
    admittedIds: new Set(pets.filter((p) => p.status === "admitted").map((p) => p.id)),
    logs,
    roster: ROSTER,
    busy,
    features,
  });
}

describe("buildStaffProgress", () => {
  it("shows only the kinds each person has: a chores-only maid and a pets-only maid, never 0/0", () => {
    const walk = routine(MOCHA, "Jalan-jalan", ["07:00"], { kind: "walk", staff_id: SYAM });
    const dinner = routine(MATCHA, "Makan Malam", ["18:00"], { staff_id: SYAM });
    const progress = build({
      rows: [
        chore({ title: "Sapu", assigned_to: ARI, status: "completed", completed_by: ARI }),
        chore({ title: "Pel", assigned_to: ARI }),
      ],
      schedules: [walk, dinner],
      logs: [logOf(walk, "07:20", SYAM)],
    });
    const ari = progress.people.find((p) => p.id === ARI)!;
    const syam = progress.people.find((p) => p.id === SYAM)!;
    expect(ari.house).toEqual({ done: 1, total: 2 });
    expect(ari.pets).toBeNull();
    expect(syam.house).toBeNull();
    expect(syam.pets).toEqual({ done: 1, total: 2 });
    // The admin has nothing today, so no row.
    expect(progress.people.map((p) => p.id)).toEqual([ARI, SYAM]);
    expect(progress.anyone).toBeNull();
  });

  it("credits a chore to whoever it is assigned to, else whoever finished it", () => {
    const progress = build({
      rows: [
        chore({ title: "A", assigned_to: ARI, status: "completed", completed_by: SYAM }),
        chore({ title: "B", assigned_to: null, status: "completed", completed_by: SYAM }),
      ],
    });
    expect(progress.people.find((p) => p.id === ARI)!.house).toEqual({ done: 1, total: 1 });
    expect(progress.people.find((p) => p.id === SYAM)!.house).toEqual({ done: 1, total: 1 });
    // Someone else did Ari's: said on the row in her day.
    expect(progress.people.find((p) => p.id === ARI)!.tasks[0].doneBy).toBe(SYAM);
  });

  it("credits an Anyone routine to whoever logged it, and leaves an open one on the Anyone row", () => {
    const lunch = routine(MOCHA, "Makan Siang", ["12:00"]);
    const lunch2 = routine(MATCHA, "Makan Siang", ["12:00"]);
    const progress = build({ schedules: [lunch, lunch2], logs: [logOf(lunch, "12:05", ARI)], now: "12:30" });
    expect(progress.people.find((p) => p.id === ARI)!.pets).toEqual({ done: 1, total: 1 });
    expect(progress.people.find((p) => p.id === SYAM)!.pets).toBeNull();
    expect(progress.anyone).toMatchObject({ open: 1, late: 0, tone: "neutral" });
    expect(progress.anyone!.tasks[0].petName).toBe("Matcha");
  });

  it("drops an Anyone routine logged with no name (the owner's own phone) from every count", () => {
    const lunch = routine(MOCHA, "Makan Siang", ["12:00"]);
    const progress = build({ schedules: [lunch], logs: [logOf(lunch, "12:05", null)] });
    expect(progress.anyone).toBeNull();
    expect(progress.people.every((p) => p.pets === null)).toBe(true);
  });

  it("is neutral while on track, amber for couldn't-do, red only when late", () => {
    const walk = routine(MOCHA, "Jalan-jalan", ["07:00"], { kind: "walk", staff_id: SYAM });
    const water = routine(MATCHA, "Ganti air minum", ["11:30"], { kind: "water", staff_id: SYAM });
    // 11:45: the 11:30 is within the grace; nothing late.
    let syam = build({ schedules: [walk, water], logs: [logOf(walk, "07:10", SYAM)], now: "11:45" }).people.find((p) => p.id === SYAM)!;
    expect(syam.tone).toBe("neutral");

    // A couldn't-do record: amber.
    syam = build({
      schedules: [walk, water],
      logs: [logOf(walk, "07:10", SYAM)],
      exceptions: [exception({ schedule_id: water.id, entity_id: MATCHA.id, slot_time: "11:30:00" })],
      now: "11:45",
    }).people.find((p) => p.id === SYAM)!;
    expect(syam).toMatchObject({ tone: "amber", couldnt: 1, late: 0 });

    // Past the grace: red, and red wins over amber.
    syam = build({
      schedules: [walk, water],
      exceptions: [exception({ schedule_id: water.id, entity_id: MATCHA.id, slot_time: "11:30:00" })],
      now: `${String(7 + Math.ceil(LATE_GRACE_MINUTES / 60)).padStart(2, "0")}:01`,
    }).people.find((p) => p.id === SYAM)!;
    expect(syam).toMatchObject({ tone: "red", late: 1, couldnt: 1 });
  });

  it("puts carried-over chores on the row as late, outside the day's fraction", () => {
    const old = chore({ title: "Lap kaca", assigned_to: ARI, due_date: "2026-11-09" });
    const today = chore({ title: "Sapu", assigned_to: ARI });
    const ari = build({ rows: [old, today] }).people.find((p) => p.id === ARI)!;
    expect(ari.house).toEqual({ done: 0, total: 1 });
    expect(ari.late).toBe(1);
    expect(ari.tone).toBe("red");
    expect(ari.tasks[0]).toMatchObject({ title: "Lap kaca", carried: true, late: true });
  });

  it("keeps a couldn't-do record on a carried-over chore: amber with its reason, not late", () => {
    const old = chore({ title: "Lap kaca", assigned_to: null, due_date: "2026-11-09" });
    const progress = build({
      rows: [old],
      exceptions: [exception({ chore_id: old.id, occurs_on: "2026-11-09", staff_id: ARI })],
    });
    const ari = progress.people.find((p) => p.id === ARI)!;
    expect(ari).toMatchObject({ tone: "amber", couldnt: 1, late: 0 });
    expect(ari.tasks[0]).toMatchObject({ title: "Lap kaca", carried: true, state: "couldnt", late: false });
    expect(ari.tasks[0].exception?.reason).toBe("out_of_stock");
    expect(progress.anyone).toBeNull();
  });

  it("shows someone on approved leave as on leave; their open chip routines go to Anyone", () => {
    const walk = routine(MOCHA, "Jalan-jalan", ["07:00"], { kind: "walk", staff_id: SYAM });
    const progress = build({
      rows: [chore({ title: "Sapu", assigned_to: SYAM })],
      schedules: [walk],
      leaves: [leave(SYAM)],
    });
    const syam = progress.people.find((p) => p.id === SYAM)!;
    expect(syam.onLeave).toBe(true);
    // The leave triage unassigned her chore; her walk waits for anyone.
    expect(syam.house).toBeNull();
    expect(syam.pets).toBeNull();
    expect(progress.anyone!.tasks.map((t) => t.title).sort()).toEqual(["Jalan-jalan", "Sapu"]);
  });

  it("credits a leave person's chip routine to whoever logged it", () => {
    const walk = routine(MOCHA, "Jalan-jalan", ["07:00"], { kind: "walk", staff_id: SYAM });
    const progress = build({ schedules: [walk], logs: [logOf(walk, "07:30", ARI)], leaves: [leave(SYAM)] });
    expect(progress.people.find((p) => p.id === ARI)!.pets).toEqual({ done: 1, total: 1 });
    expect(progress.anyone).toBeNull();
  });

  it("credits a chore someone finished while its assignee was on leave to whoever finished it", () => {
    const progress = build({
      rows: [chore({ title: "Setrika", assigned_to: SYAM, status: "completed", completed_by: ARI })],
      leaves: [leave(SYAM, { fallback_action: "pause" })],
    });
    expect(progress.people.find((p) => p.id === ARI)!.house).toEqual({ done: 1, total: 1 });
    expect(progress.people.find((p) => p.id === SYAM)!.house).toBeNull();
  });

  it("puts an unowned couldn't-do on the person who said so", () => {
    const lunch = routine(MOCHA, "Makan Siang", ["12:00"]);
    const progress = build({
      schedules: [lunch],
      exceptions: [exception({ schedule_id: lunch.id, entity_id: MOCHA.id, slot_time: "12:00:00", staff_id: ARI, reason: "pet_refused" })],
    });
    expect(progress.people.find((p) => p.id === ARI)).toMatchObject({ couldnt: 1, tone: "amber", pets: { done: 0, total: 1 } });
    expect(progress.anyone).toBeNull();
  });

  it("follows the evening summary's reading: pets at the clinic and three-photo walks", () => {
    const clinic = pet("bento", "Bento", "admitted");
    const dinner = routine(clinic, "Makan Malam", ["18:00"], { staff_id: SYAM });
    const walk = routine(MOCHA, "Jalan-jalan", ["07:00"], { kind: "walk", staff_id: SYAM, proof: "three" });
    const started = [logOf(walk, "07:02", SYAM, { sub_type: "check_in" }), logOf(walk, "07:15", SYAM, { sub_type: "arrived" })];
    const progress = build({ schedules: [dinner, walk], logs: started, pets: [MOCHA, clinic], now: "07:30" });
    // The clinic pet's dinner doesn't count; the walk is open until its end photo.
    expect(progress.people.find((p) => p.id === SYAM)!.pets).toEqual({ done: 0, total: 1 });

    const done = build({
      schedules: [dinner, walk],
      logs: [...started, logOf(walk, "07:40", SYAM, { sub_type: "check_out" })],
      pets: [MOCHA, clinic],
      now: "07:45",
    });
    expect(done.people.find((p) => p.id === SYAM)!.pets).toEqual({ done: 1, total: 1 });
  });

  it("counts the same open tasks as the evening summary", () => {
    const lunch = routine(MOCHA, "Makan Siang", ["12:00"]);
    const walk = routine(MATCHA, "Jalan-jalan", ["17:00"], { kind: "walk", staff_id: SYAM });
    const rows = [
      chore({ title: "Sapu", assigned_to: ARI, status: "completed", completed_by: ARI }),
      chore({ title: "Pel", assigned_to: ARI }),
      chore({ title: "Lap", assigned_to: null }),
    ];
    const schedules = [lunch, walk];
    const logs = [logOf(lunch, "12:10", ARI)];
    const exceptions = [exception({ chore_id: rows[1].id, staff_id: ARI })];
    const progress = build({ rows, schedules, logs, exceptions, now: "21:00" });

    const chores = expandChores({ rows, date: TODAY, today: TODAY });
    const groups = buildAgenda({ date: TODAY, entities: [MOCHA, MATCHA], schedules, logs });
    const summary = buildEveningSummary({
      date: TODAY,
      chores,
      groups,
      exceptions,
      leaves: [],
      proposals: [],
      admittedIds: new Set(),
      untilMinutes: null,
      logs,
    });
    const notDone = [...progress.people.flatMap((p) => p.tasks), ...(progress.anyone?.tasks ?? [])].filter(
      (t) => t.state !== "done"
    ).length;
    expect(notDone).toBe(summaryOpenCount(summary));
    const done = progress.people.flatMap((p) => p.tasks).filter((t) => t.state === "done").length;
    expect(done).toBe(summary.done);
    expect(classifyDay({ date: TODAY, chores, groups, exceptions, admittedIds: new Set(), logs })).toHaveLength(5);
  });

  it("keeps a place for a busy state, which nothing fills yet", () => {
    const plain = build({}).people.find((p) => p.id === ARI)!;
    expect(plain.busy).toBeNull();
    const busy = new Map([[ARI, { label: "Mengawasi perbaikan", since: "10:00" }]]);
    expect(build({ busy }).people.find((p) => p.id === ARI)!.busy).toEqual({ label: "Mengawasi perbaikan", since: "10:00" });
  });

  it("follows the Features switches: Pets off counts no routines, Repairs off shows no busy line", () => {
    const walk = routine(MOCHA, "Jalan-jalan", ["07:00"], { kind: "walk", staff_id: SYAM });
    const rows = [chore({ title: "Sapu", assigned_to: ARI }), chore({ title: "Tukang AC datang", assigned_to: ARI, repair_id: "r1" } as Partial<HouseholdTask>)];
    const busy = new Map([[ARI, { label: "Mengawasi perbaikan", since: "10:00" }]]);
    const off = build({ rows, schedules: [walk], busy, features: { pets: false, repairs: false } });
    expect(off.people.find((p) => p.id === SYAM)!.pets).toBeNull();
    expect(off.anyone).toBeNull();
    const ari = off.people.find((p) => p.id === ARI)!;
    expect(ari.busy).toBeNull();
    // A scheduled repair visit is still a chore on Today's list.
    expect(ari.house).toEqual({ done: 0, total: 2 });
    const on = build({ rows, schedules: [walk], busy, features: { pets: true, repairs: true } });
    expect(on.people.find((p) => p.id === SYAM)!.pets).toEqual({ done: 0, total: 1 });
    expect(on.people.find((p) => p.id === ARI)!.busy).not.toBeNull();
  });

  it("lists an admin's row only on a day they have work, after the staff", () => {
    const progress = build({ rows: [chore({ title: "Bayar listrik", assigned_to: OWNER_ROW })] });
    expect(progress.people.map((p) => p.id)).toEqual([ARI, SYAM, OWNER_ROW]);
    expect(progress.people[2].admin).toBe(true);
  });

  it("hands a removed person's open work to Anyone and forgets what they finished", () => {
    const progress = build({
      rows: [
        chore({ title: "Open", assigned_to: "gone" }),
        chore({ title: "Done", assigned_to: "gone", status: "completed", completed_by: "gone" }),
      ],
    });
    expect(progress.anyone!.tasks.map((t) => t.title)).toEqual(["Open"]);
  });

  // The household's whole day (Phase 175, Today's status line): counted
  // before any row is dropped, so work that belongs to no row still counts.
  it("counts the whole day, including finished work that no row is credited with", () => {
    const lunch = routine(MOCHA, "Makan Siang", ["12:00"]);
    const progress = build({
      schedules: [lunch],
      // Logged with no name: on nobody's row, but done.
      logs: [logOf(lunch, "12:05", null)],
      rows: [
        chore({ title: "Open", assigned_to: ARI }),
        // Finished by someone no longer on the roster: forgotten by the rows, still done today.
        chore({ title: "Done", assigned_to: "gone", status: "completed", completed_by: "gone" }),
      ],
    });
    expect(progress.day).toEqual({ done: 2, total: 3 });
  });

  it("keeps carried-over chores out of the whole day's count", () => {
    const old = chore({ title: "Lap kaca", assigned_to: ARI, due_date: "2026-11-09" });
    const today = chore({ title: "Sapu", assigned_to: ARI, status: "completed", completed_by: ARI });
    expect(build({ rows: [old, today] }).day).toEqual({ done: 1, total: 1 });
  });

  it("counts no pet routines in the whole day with Pets off", () => {
    const lunch = routine(MOCHA, "Makan Siang", ["12:00"]);
    const progress = build({
      schedules: [lunch],
      rows: [chore({ title: "Sapu", assigned_to: ARI })],
      features: { pets: false, repairs: true },
    });
    expect(progress.day).toEqual({ done: 0, total: 1 });
  });
});

describe("isLate", () => {
  it("is never late ahead, always late behind, and gives a timed task the grace today", () => {
    expect(isLate({ date: "2026-11-12", today: TODAY, nowMinutes: 1439, time: "07:00" })).toBe(false);
    expect(isLate({ date: "2026-11-10", today: TODAY, nowMinutes: 0, time: null })).toBe(true);
    expect(isLate({ date: TODAY, today: TODAY, nowMinutes: 1439, time: null })).toBe(false);
    expect(isLate({ date: TODAY, today: TODAY, nowMinutes: 7 * 60 + LATE_GRACE_MINUTES, time: "07:00" })).toBe(false);
    expect(isLate({ date: TODAY, today: TODAY, nowMinutes: 7 * 60 + LATE_GRACE_MINUTES + 1, time: "07:00" })).toBe(true);
  });
});

// A slot is owed only if the routine existed, with that time, before the
// slot's time (owner, 13 Nov): a walk added at 22.37 for 15.00 isn't late
// today, isn't in Today's counts or the evening summary, and starts tomorrow.
describe("a routine made today owes only the slots after it was made", () => {
  const madeAt = (time: string, day = TODAY) => `${day}T${time}:00+07:00`;

  it("isSlotOwed: made after the slot is not owed that day; any other day is", () => {
    const s = { created_at: madeAt("22:37") };
    expect(isSlotOwed(s, TODAY, 15 * 60)).toBe(false);
    expect(isSlotOwed(s, TODAY, 22 * 60 + 36)).toBe(false);
    expect(isSlotOwed(s, TODAY, 22 * 60 + 37)).toBe(true);
    expect(isSlotOwed(s, TODAY, 23 * 60)).toBe(true);
    expect(isSlotOwed(s, "2026-11-12", 15 * 60)).toBe(true);
    // Made before the slot: owed as usual.
    expect(isSlotOwed({ created_at: madeAt("09:00") }, TODAY, 15 * 60)).toBe(true);
    // A one-off anchored at its day's midnight owes every slot.
    expect(isSlotOwed({ created_at: new Date(`${TODAY}T00:00:00`).toISOString() }, TODAY, 7 * 60)).toBe(true);
  });

  it("leaves a slot made after its time off today's list, and shows it from tomorrow", () => {
    const walk = routine(MATCHA, "Jalan-jalan", ["15:00"], { kind: "walk", staff_id: SYAM, created_at: madeAt("22:37") });
    const now = new Date(madeAt("22:40"));
    expect(buildAgenda({ date: TODAY, entities: [MATCHA], schedules: [walk], logs: [], now })).toEqual([]);
    const tomorrow = buildAgenda({ date: "2026-11-12", entities: [MATCHA], schedules: [walk], logs: [], now });
    expect(tomorrow.map((g) => [g.time, g.items[0].status])).toEqual([["15:00", "pending"]]);
  });

  it("keeps a later slot of the same routine, and a slot someone did anyway", () => {
    const twice = routine(MATCHA, "Jalan-jalan", ["07:00", "23:00"], { kind: "walk", created_at: madeAt("12:00") });
    const groups = buildAgenda({ date: TODAY, entities: [MATCHA], schedules: [twice], logs: [], now: new Date(madeAt("12:05")) });
    expect(groups.map((g) => g.time)).toEqual(["23:00"]);
    const once = routine(MATCHA, "Jalan-jalan", ["15:00"], { kind: "walk", created_at: madeAt("22:37") });
    const done = buildAgenda({
      date: TODAY,
      entities: [MATCHA],
      schedules: [once],
      logs: [logOf(once, "22:50", SYAM)],
      now: new Date(madeAt("22:55")),
    });
    expect(done.map((g) => [g.time, g.items[0].status])).toEqual([["15:00", "completed"]]);
  });

  it("isn't late, isn't in the day's counts and isn't in the evening summary", () => {
    const old = routine(MOCHA, "Makan Malam", ["18:00"]);
    const fresh = routine(MATCHA, "Jalan-jalan", ["15:00"], { kind: "walk", staff_id: SYAM, created_at: madeAt("22:37") });
    const schedules = [old, fresh];
    const progress = build({ schedules, logs: [logOf(old, "18:05", ARI)], now: "22:40" });
    expect(dayTotals(progress)).toEqual({ done: 1, total: 1, late: 0, couldnt: 0 });
    expect(progress.people.find((p) => p.id === SYAM)?.late ?? 0).toBe(0);
    expect(progress.anyone).toBeNull();

    const groups = buildAgenda({ date: TODAY, entities: [MOCHA, MATCHA], schedules, logs: [], now: new Date(madeAt("22:40")) });
    const summary = buildEveningSummary({
      date: TODAY,
      chores: [],
      groups,
      exceptions: [],
      leaves: [],
      proposals: [],
      admittedIds: new Set(),
      untilMinutes: 22 * 60 + 40,
      logs: [],
    });
    // Only the old dinner is open; the new walk isn't owed.
    expect(summaryOpenCount(summary)).toBe(1);
  });

  it("made before its time today, it is owed and late as usual", () => {
    const walk = routine(MATCHA, "Jalan-jalan", ["15:00"], { kind: "walk", staff_id: SYAM, created_at: madeAt("09:00") });
    expect(dayTotals(build({ schedules: [walk], now: "22:40" }))).toEqual({ done: 0, total: 1, late: 1, couldnt: 0 });
  });

  it("a time edited today to one already past still counts: no timestamp says when it moved", () => {
    // Made two days ago, moved today to 16:00 at 22:37: the row keeps its
    // created_at (planRoutineSave), so the 16:00 slot is owed and late.
    const walk = routine(MATCHA, "Jalan-jalan", ["16:00"], { kind: "walk", staff_id: SYAM, created_at: madeAt("10:00", "2026-11-09") });
    expect(dayTotals(build({ schedules: [walk], now: "22:40" })).late).toBe(1);
  });
});
