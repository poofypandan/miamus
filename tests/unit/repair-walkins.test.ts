import { describe, expect, it } from "vitest";
import { expandChores } from "@/lib/chore-recurrence";
import { buildAgenda } from "@/lib/scheduleEngine";
import { buildStaffProgress } from "@/lib/staff-progress";
import { awaitsReview, repairStage, repairsBoard, repairsToday, staffRepairStatus } from "@/lib/repairs";
import {
  DEVELOPER_CHIP,
  isForgotten,
  isOpenWalkIn,
  lastWorkerName,
  openWalkIns,
  ownerSupervisingLine,
  recentWorkerNames,
  recentlyFinished,
  staffDurationWords,
  supervisedByLine,
  supervisingNow,
  supervisionExplains,
  supervisionSpansOn,
  supervisionStretches,
  walkInSpanLabel,
  walkInTime,
  walkInTodayLine,
  type SupervisionStretch,
} from "@/lib/repair-walkins";
import { overlayRepairsOutbox } from "@/lib/repairs-store";
import { jobPhotos, type OfflineQueueItem } from "@/lib/offline-queue";
import type { HouseholdTask, Repair, RepairSupervision, RepairWalkIn } from "@/types/database";

// Phase 174 PR A: walk-ins and supervising. The pure rules every screen
// reads — open and forgotten walk-ins, the name chips, server and phone
// times, the repair's stage with walk-ins, who is supervising now, and which
// missed task a stretch explains (D10 A) — and staff progress filling its
// busy slot.

const TODAY = "2026-11-11";
const at = (hhmm: string, day = TODAY) => new Date(`${day}T${hhmm}:00`).toISOString();
const ARI = "ari";
const SYAM = "syam";

function repair(over: Partial<Repair> = {}): Repair {
  return {
    id: "r1",
    household_id: "h",
    location_id: null,
    spot: null,
    title: "Keran bocor",
    details: null,
    photo_url: null,
    urgent: false,
    status: "open",
    reported_by_staff: null,
    created_by: null,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    decided_by: null,
    decided_at: null,
    dismiss_reason: null,
    fixed_by_name: null,
    closed_at: null,
    ...over,
  };
}

let n = 0;
function walkIn(over: Partial<RepairWalkIn> = {}): RepairWalkIn {
  return {
    id: `v${++n}`,
    household_id: "h",
    repair_id: "r1",
    worker_name: "Pak Budi",
    logged_by_staff: ARI,
    created_by: null,
    arrived_at: at("09:10"),
    arrived_phone_at: at("09:10"),
    before_photo_url: "h/repairs/r1/b.webp",
    left_at: null,
    left_phone_at: null,
    after_photo_url: null,
    outcome: null,
    note: null,
    ...over,
  };
}

function span(visitId: string, staffId: string, start: string, end: string | null): RepairSupervision {
  return { id: `s${++n}`, household_id: "h", visit_id: visitId, staff_id: staffId, user_id: null, started_at: start, ended_at: end };
}

describe("walk-ins", () => {
  it("is open until Selesai, and forgotten when open from an earlier day (D6)", () => {
    const open = walkIn();
    const done = walkIn({ left_at: at("11:40"), after_photo_url: "a.webp" });
    const yesterday = walkIn({ arrived_at: at("16:00", "2026-11-10") });
    expect(isOpenWalkIn(open)).toBe(true);
    expect(isOpenWalkIn(done)).toBe(false);
    // A Selesai still waiting on the phone has its photo, not yet left_at.
    expect(isOpenWalkIn({ left_at: null, after_photo_url: "a.webp" })).toBe(false);
    expect(isForgotten(open, TODAY)).toBe(false);
    expect(isForgotten(yesterday, TODAY)).toBe(true);
    expect(openWalkIns([open, done, yesterday]).map((v) => v.id)).toEqual([yesterday.id, open.id]);
  });

  it("lists what was finished in the last 7 days, newest first", () => {
    const now = new Date(at("12:00"));
    const a = walkIn({ left_at: at("11:40"), after_photo_url: "a" });
    const b = walkIn({ left_at: at("10:00", "2026-11-08"), after_photo_url: "a" });
    const old = walkIn({ left_at: at("10:00", "2026-11-01"), after_photo_url: "a" });
    expect(recentlyFinished([b, old, a], now).map((v) => v.id)).toEqual([a.id, b.id]);
  });

  it("offers recent names (90 days, most used, up to 6), never Tim developer twice (D3)", () => {
    const now = new Date(at("12:00"));
    const list = [
      walkIn({ worker_name: "Pak Budi" }),
      walkIn({ worker_name: "pak budi " }),
      walkIn({ worker_name: "Pak Ujang", arrived_at: at("08:00") }),
      walkIn({ worker_name: DEVELOPER_CHIP }),
      walkIn({ worker_name: "Old name", arrived_at: "2026-07-01T00:00:00Z" }),
      walkIn({ worker_name: null }),
      ...["A", "B", "C", "D", "E"].map((x) => walkIn({ worker_name: x, arrived_at: at("07:00") })),
    ];
    const names = recentWorkerNames(list, now);
    expect(names[0].toLowerCase().trim()).toBe("pak budi");
    expect(names).toHaveLength(6);
    expect(names).not.toContain(DEVELOPER_CHIP);
    expect(names).not.toContain("Old name");
    expect(lastWorkerName("r1", [walkIn({ worker_name: "Pak Joko", arrived_at: at("08:00") }), walkIn({ worker_name: "Pak Budi" })])).toBe(
      "Pak Budi"
    );
    expect(lastWorkerName("r2", list)).toBeNull();
  });

  it("shows the server's times, or the phone's (flagged) for a save sent later", () => {
    const onTime = walkIn({ arrived_at: at("09:11"), arrived_phone_at: at("09:10") });
    expect(walkInTime(onTime, "in")).toEqual({ at: at("09:11"), phoneTime: false });
    const late = walkIn({ arrived_at: at("13:00"), arrived_phone_at: at("09:10") });
    expect(walkInTime(late, "in")).toEqual({ at: at("09:10"), phoneTime: true });
    const waiting = walkIn({ left_at: null, left_phone_at: at("11:40") });
    expect(walkInTime(waiting, "out")).toEqual({ at: at("11:40"), phoneTime: true });
    expect(walkInTime(walkIn(), "out")).toBeNull();
    expect(walkInSpanLabel(walkIn({ arrived_at: at("09:10") }), "id")).toBe("sejak 09.10");
    expect(walkInSpanLabel(walkIn({ arrived_at: at("09:10"), left_at: at("11:40"), after_photo_url: "a" }), "id")).toBe(
      "09.10–11.40"
    );
  });

  it("words the staff strip's running time as people say it", () => {
    expect(staffDurationWords(30_000)).toBe("kurang dari 1 menit");
    expect(staffDurationWords(45 * 60_000)).toBe("45 menit");
    expect(staffDurationWords(80 * 60_000)).toBe("1 jam 20 menit");
    expect(staffDurationWords(120 * 60_000)).toBe("2 jam");
  });

  it("says who is here on owners' Today", () => {
    expect(walkInTodayLine(walkIn(), "Leaking tap", "LT2", "en")).toBe("Pak Budi is here · Leaking tap, LT2");
    expect(walkInTodayLine(walkIn(), "Keran bocor", "LT2", "id")).toBe("Pak Budi sedang bekerja · Keran bocor, LT2");
    expect(walkInTodayLine(walkIn({ worker_name: null }), "Keran bocor", null, "id")).toBe(
      "Tukang sedang bekerja · Keran bocor"
    );
  });
});

describe("a repair's stage with walk-ins", () => {
  it("a staff report with a walk-in skips To review and reads as open", () => {
    const report = repair({ status: "reported" });
    const visit = walkIn();
    expect(awaitsReview(report, [])).toBe(true);
    expect(awaitsReview(report, [visit])).toBe(false);
    const board = repairsBoard([report], [], new Date(at("12:00")), [visit]);
    expect(board.toReview).toHaveLength(0);
    expect(board.open.map((r) => r.id)).toEqual(["r1"]);
    expect(repairsToday([report], [], [visit]).toReview).toBe(0);
  });

  it("is working while a walk-in is open, then work done, unless coming back", () => {
    const open = walkIn();
    expect(repairStage(repair(), [], TODAY, [open]).kind).toBe("working");
    expect(staffRepairStatus(repair(), [], [open])).toBe("Sedang dikerjakan");
    const fixed = walkIn({ left_at: at("11:40"), after_photo_url: "a", outcome: "fixed" });
    const stage = repairStage(repair(), [], TODAY, [fixed]);
    expect(stage.kind).toBe("check");
    if (stage.kind === "check") expect(stage.last.after_photo_url).toBe("a");
    const comeBack = walkIn({ left_at: at("11:40"), after_photo_url: "a", outcome: "come_back" });
    expect(repairStage(repair(), [], TODAY, [comeBack]).kind).toBe("unscheduled");
    // A scheduled visit still to come wins over a finished walk-in.
    const visit = { id: "c1", repair_id: "r1", status: "pending", due_date: "2026-11-12", due_time: null, parent_task_id: null, recurrence: "none" } as unknown as HouseholdTask;
    expect(repairStage(repair(), [visit], TODAY, [fixed]).kind).toBe("scheduled");
  });
});

describe("supervising (D10, D11)", () => {
  const repairs = [repair(), repair({ id: "r2", title: "AC menetes" })];
  const v1 = walkIn({ id: "v1" });
  const v2 = walkIn({ id: "v2", repair_id: "r2", logged_by_staff: SYAM, arrived_at: at("13:00") });
  const spans = [
    span("v1", ARI, at("10:00"), at("13:30")),
    span("v2", SYAM, at("13:00"), null),
  ];
  const stretches = supervisionStretches(spans, [v1, v2], repairs);
  const now = new Date(at("14:00"));

  it("joins stretches to their walk-in and repair", () => {
    expect(stretches.map((s) => [s.staffId, s.repairTitle])).toEqual([
      [ARI, "Keran bocor"],
      [SYAM, "AC menetes"],
    ]);
    expect(supervisionStretches([span("gone", ARI, at("10:00"), null)], [v1], repairs)).toEqual([]);
  });

  it("knows who is supervising now: an open stretch on an open walk-in", () => {
    const current = supervisingNow(stretches, [v1, v2]);
    expect([...current.keys()]).toEqual([SYAM]);
    expect(current.get(SYAM)?.repairTitle).toBe("AC menetes");
    // Selesai still waiting on this phone closes it on screen.
    expect(supervisingNow(stretches, [v1, { ...v2, after_photo_url: "a" }]).size).toBe(0);
  });

  it("clips a day's stretches to the day", () => {
    const overnight = supervisionStretches([span("v1", ARI, at("22:00", "2026-11-10"), at("01:00"))], [v1], repairs);
    const today = supervisionSpansOn(overnight, TODAY, now).get(ARI)!;
    expect(today).toHaveLength(1);
    expect(today[0].from).toBe(new Date(`${TODAY}T00:00:00`).getTime());
    expect(supervisionSpansOn(overnight, "2026-11-09", now).size).toBe(0);
  });

  it("explains a person's open task due inside their stretch, from 15 minutes before", () => {
    const due = (time: string | null, staffId: string | null = ARI, state?: "open" | "done" | "couldnt") =>
      supervisionExplains({ staffId, date: TODAY, time, state }, stretches, [ARI, SYAM], now);
    expect(due("10:30")?.visitId).toBe("v1");
    expect(due("09:50")?.visitId).toBe("v1");
    expect(due("09:40")).toBeNull();
    expect(due("13:45")).toBeNull();
    expect(due(null)).toBeNull();
    // Done wins; a couldn't-do says it itself.
    expect(due("10:30", ARI, "done")).toBeNull();
    expect(due("10:30", ARI, "couldnt")).toBeNull();
    // Syam's stretch is still open: explained up to now, not a task due later.
    expect(due("13:50", SYAM)?.visitId).toBe("v2");
    expect(supervisionExplains({ staffId: SYAM, date: TODAY, time: "15:00" }, stretches, [], now)).toBeNull();
  });

  it("explains a task for anyone (and a pet routine) only when everyone on duty was supervising", () => {
    expect(supervisionExplains({ staffId: null, date: TODAY, time: "10:30" }, stretches, [ARI, SYAM], now)).toBeNull();
    expect(supervisionExplains({ staffId: null, date: TODAY, time: "13:15" }, stretches, [ARI, SYAM], now)?.staffId).toBe(ARI);
    // Syam on leave: Ari alone was on duty.
    expect(supervisionExplains({ staffId: null, date: TODAY, time: "10:30" }, stretches, [ARI], now)?.staffId).toBe(ARI);
    expect(supervisionExplains({ staffId: null, date: TODAY, time: "10:30" }, stretches, [], now)).toBeNull();
  });

  it("words the owner's lines in both languages", () => {
    const s = stretches[0] as SupervisionStretch;
    expect(ownerSupervisingLine(s, "Ari", "en")).toBe("Ari was supervising a repair, 10:00 AM–1:30 PM");
    expect(ownerSupervisingLine(s, "Ari", "id")).toBe("Ari mengawasi perbaikan 10.00–13.30");
    expect(ownerSupervisingLine({ start: s.start, end: null }, "Ari", "id")).toBe("Ari mengawasi perbaikan sejak 10.00");
    const handed = supervisionStretches(
      [span("v1", ARI, at("09:10"), at("10:30")), span("v1", SYAM, at("10:30"), at("11:40"))],
      [v1],
      repairs
    );
    const names: Record<string, string> = { [ARI]: "Ari", [SYAM]: "Syam" };
    expect(supervisedByLine(handed, "v1", (id) => names[id ?? ""] ?? "", "id")).toBe(
      "Diawasi Ari 09.10–10.30, lalu Syam 10.30–11.40"
    );
    expect(supervisedByLine(handed, "v1", (id) => names[id ?? ""] ?? "", "en")).toBe(
      "Supervised by Ari 9:10 AM–10:30 AM, then Syam 10:30 AM–11:40 AM"
    );
    expect(supervisedByLine([], "v1", () => "", "en")).toBeNull();
  });
});

describe("staff progress reads supervising", () => {
  const chore = (id: string, time: string, assigned: string | null) =>
    ({
      id,
      household_id: "h",
      title: id,
      notes: null,
      category: "cleaning",
      assigned_to: assigned,
      due_date: TODAY,
      due_time: time,
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
    }) as unknown as HouseholdTask;

  it("fills the busy slot and keeps an explained task out of 'late'", () => {
    const rows = [chore("mop", "10:30", ARI), chore("iron", "08:00", ARI)];
    const chores = expandChores({ rows, date: TODAY, today: TODAY });
    const stretches: SupervisionStretch[] = [
      { id: "s", visitId: "v1", repairId: "r1", repairTitle: "AC", staffId: ARI, start: at("10:00"), end: null },
    ];
    const progress = buildStaffProgress({
      date: TODAY,
      today: TODAY,
      nowMinutes: 13 * 60,
      chores,
      groups: buildAgenda({ date: TODAY, entities: [], schedules: [], logs: [] }),
      exceptions: [],
      leaves: [],
      admittedIds: new Set(),
      roster: [{ id: ARI, name: "Ari", user_id: null }],
      busy: new Map([[ARI, { label: "Mengawasi perbaikan", since: "10:00" }]]),
      supervision: { stretches, now: new Date(at("13:00")) },
    });
    const ari = progress.people[0];
    expect(ari.busy).toEqual({ label: "Mengawasi perbaikan", since: "10:00" });
    const mop = ari.tasks.find((t) => t.title === "mop")!;
    const iron = ari.tasks.find((t) => t.title === "iron")!;
    expect(mop.supervising?.visitId).toBe("v1");
    expect(mop.late).toBe(false);
    expect(mop.state).toBe("open");
    // Before the stretch: still late, plainly.
    expect(iron.supervising).toBeNull();
    expect(iron.late).toBe(true);
    expect(ari.late).toBe(1);
  });

  it("with Repairs off, no busy line and nothing explained", () => {
    const chores = expandChores({ rows: [chore("mop", "10:30", ARI)], date: TODAY, today: TODAY });
    const progress = buildStaffProgress({
      date: TODAY,
      today: TODAY,
      nowMinutes: 13 * 60,
      chores,
      groups: [],
      exceptions: [],
      leaves: [],
      admittedIds: new Set(),
      roster: [{ id: ARI, name: "Ari", user_id: null }],
      busy: new Map([[ARI, { label: "x", since: "10:00" }]]),
      supervision: {
        stretches: [{ id: "s", visitId: "v1", repairId: "r1", repairTitle: "AC", staffId: ARI, start: at("10:00"), end: null }],
        now: new Date(at("13:00")),
      },
      features: { pets: true, repairs: false },
    });
    expect(progress.people[0].busy).toBeNull();
    expect(progress.people[0].tasks[0].late).toBe(true);
  });
});

describe("walk-ins waiting on the phone", () => {
  const item = (job: OfflineQueueItem["job"], timestamp = Date.parse(at("09:10"))): OfflineQueueItem => ({
    id: `q${++n}`,
    job,
    householdId: "h",
    timestamp,
  });
  const visit = {
    id: "wv",
    repair_id: "new-r",
    worker_name: null,
    logged_by_staff: ARI,
    arrived_phone_at: at("09:10"),
    before_photo_url: "h/repairs/new-r/b.webp",
  };

  it("shows a walk-in logged with no signal, its repair and its stretch, then its Selesai", () => {
    const start = item({
      kind: "walkin_start",
      repair: { id: "new-r", title: "Stopkontak", status: "reported", reported_by_staff: ARI },
      visit,
    });
    const finish = item({
      kind: "walkin_finish",
      visitId: "wv",
      finish: { after_photo_url: "h/repairs/new-r/a.webp", left_phone_at: at("11:00"), outcome: "fixed", note: null },
    });
    const empty = { repairs: [], walkIns: [], supervision: [] };
    const started = overlayRepairsOutbox(empty, [start], "h");
    expect(started.repairs.map((r) => r.id)).toEqual(["new-r"]);
    expect(started.walkIns[0].arrived_at).toBe(at("09:10"));
    expect(started.supervision[0]).toMatchObject({ visit_id: "wv", staff_id: ARI, ended_at: null });
    expect(started.pendingIds.has("wv")).toBe(true);
    // Its repair isn't waiting for an owner: it has a walk-in.
    expect(awaitsReview(started.repairs[0], started.walkIns)).toBe(false);

    const finished = overlayRepairsOutbox(empty, [start, finish], "h");
    expect(isOpenWalkIn(finished.walkIns[0])).toBe(false);
    expect(finished.supervision[0].ended_at).toBe(at("11:00"));
    // Saved for another household: not shown here.
    expect(overlayRepairsOutbox(empty, [{ ...start, householdId: "other" }], "h").walkIns).toHaveLength(0);
  });

  it("a hand-over closes the open stretch and opens the next", () => {
    const base = { repairs: [], walkIns: [walkIn({ id: "v1" })], supervision: [span("v1", ARI, at("09:10"), null)] };
    const handed = overlayRepairsOutbox(
      base,
      [item({ kind: "supervision_handover", input: { id: "h1", visit_id: "v1", staff_id: SYAM } }, Date.parse(at("10:30")))],
      "h"
    );
    expect(handed.supervision.map((s) => [s.staff_id, s.ended_at])).toEqual([
      [ARI, at("10:30")],
      [SYAM, null],
    ]);
  });

  it("a walk-in's photos go up before it is sent", () => {
    expect(jobPhotos({ kind: "walkin_start", repair: null, visit })).toEqual(["h/repairs/new-r/b.webp"]);
    expect(
      jobPhotos({
        kind: "walkin_finish",
        visitId: "wv",
        finish: { after_photo_url: "a.webp", left_phone_at: at("11:00"), outcome: null, note: null },
      })
    ).toEqual(["a.webp"]);
    expect(jobPhotos({ kind: "supervision_handover", input: { id: "x", visit_id: "v", staff_id: ARI } })).toEqual([]);
  });
});
