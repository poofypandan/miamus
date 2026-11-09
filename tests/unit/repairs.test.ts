import { describe, expect, it } from "vitest";
import {
  canTakeBackNote,
  canUndoReport,
  formatIdr,
  parseIdr,
  repairPeople,
  warrantyLabel,
  repairStage,
  repairsBoard,
  repairsToday,
  repairsTodayLabel,
  staffRepairStatus,
  visitNotes,
  visitTitle,
} from "@/lib/repairs";
import type { HouseholdTask, Repair } from "@/types/database";

const repair = (over: Partial<Repair>): Repair => ({
  id: "r1",
  household_id: "h",
  location_id: null,
  spot: null,
  title: "Dinding retak",
  details: null,
  photo_url: null,
  urgent: false,
  status: "open",
  reported_by_staff: null,
  created_by: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  decided_by: null,
  decided_at: null,
  dismiss_reason: null,
  fixed_by_name: null,
  closed_at: null,
  ...over,
});

const visit = (over: Partial<HouseholdTask>): HouseholdTask =>
  ({
    id: "v1",
    household_id: "h",
    title: "Perbaiki: dinding retak",
    category: "maintenance",
    due_date: "2026-11-12",
    due_time: null,
    status: "pending",
    repair_id: "r1",
    recurrence: "none",
    parent_task_id: null,
    ...over,
  }) as HouseholdTask;

describe("where a repair stands", () => {
  it("is unscheduled with no visits, scheduled with one to come, and to check once visits are done", () => {
    expect(repairStage(repair({}), []).kind).toBe("unscheduled");
    const planned = repairStage(repair({}), [visit({ id: "a", due_date: "2026-11-14" }), visit({ id: "b", due_date: "2026-11-12" })]);
    expect(planned.kind).toBe("scheduled");
    if (planned.kind === "scheduled") expect(planned.next.id).toBe("b");
    expect(repairStage(repair({}), [visit({ status: "completed" })]).kind).toBe("check");
    // A finished visit and another still to come: still scheduled, never closed by a visit.
    expect(repairStage(repair({}), [visit({ id: "a", status: "completed" }), visit({ id: "b" })]).kind).toBe("scheduled");
  });

  it("reads a repeating visit's next day from its recurrence, not its first day's status (Codex, PR #37)", () => {
    // Weekly on Mondays from 2 Nov; the first day is done.
    const series = visit({ id: "t", due_date: "2026-11-02", recurrence: "weekly", status: "completed" });
    const today = "2026-11-09";
    const stage = repairStage(repair({}), [series], today);
    expect(stage.kind).toBe("scheduled");
    if (stage.kind === "scheduled") expect(stage.next.due_date).toBe("2026-11-09");
    // Today's day written as done: the next is a week later.
    const doneToday = visit({ id: "d", parent_task_id: "t", due_date: "2026-11-09", status: "completed" });
    const later = repairStage(repair({}), [series, doneToday], today);
    if (later.kind === "scheduled") expect(later.next.due_date).toBe("2026-11-16");
    else throw new Error(`expected scheduled, got ${later.kind}`);
    // Today's day skipped (written as cancelled): also settled.
    const skipped = visit({ id: "s", parent_task_id: "t", due_date: "2026-11-09", status: "cancelled" });
    const afterSkip = repairStage(repair({}), [series, skipped], today);
    if (afterSkip.kind === "scheduled") expect(afterSkip.next.due_date).toBe("2026-11-16");
    else throw new Error(`expected scheduled, got ${afterSkip.kind}`);
    expect(repairStage(repair({}), [{ ...series, recurrence_until: "2026-11-09" }, skipped], today).kind).toBe("check");
    // The run ended yesterday with that day not done: it's still owed, as
    // Today shows it overdue, so the work isn't done yet.
    const endedYesterday = repairStage(repair({}), [{ ...series, recurrence_until: "2026-11-09" }], "2026-11-10");
    if (endedYesterday.kind === "scheduled") expect(endedYesterday.next.due_date).toBe("2026-11-09");
    else throw new Error(`expected scheduled, got ${endedYesterday.kind}`);
    // The run ends today and today is done: nothing left, so check the work.
    const ended = { ...series, recurrence_until: "2026-11-09" };
    expect(repairStage(repair({}), [ended, doneToday], today).kind).toBe("check");
  });

  it("ignores cancelled visits and other repairs' visits", () => {
    expect(repairStage(repair({}), [visit({ status: "cancelled" }), visit({ repair_id: "other" })]).kind).toBe("unscheduled");
  });

  it("follows the stored status for reported, fixed and dismissed", () => {
    expect(repairStage(repair({ status: "reported" }), [visit({})]).kind).toBe("reported");
    expect(repairStage(repair({ status: "fixed" }), []).kind).toBe("fixed");
    expect(repairStage(repair({ status: "dismissed" }), []).kind).toBe("dismissed");
  });
});

describe("the owners' board", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  const repairs = [
    repair({ id: "rev-old", status: "reported", created_at: "2026-11-01T00:00:00Z" }),
    repair({ id: "rev-urgent", status: "reported", urgent: true, created_at: "2026-11-10T00:00:00Z" }),
    repair({ id: "open-plain", created_at: "2026-11-02T00:00:00Z" }),
    repair({ id: "open-check", created_at: "2026-11-05T00:00:00Z" }),
    repair({ id: "open-urgent", urgent: true, created_at: "2026-11-09T00:00:00Z" }),
    repair({ id: "fixed-recent", status: "fixed", closed_at: "2026-11-18T00:00:00Z" }),
    repair({ id: "fixed-old", status: "fixed", closed_at: "2026-09-01T00:00:00Z" }),
    repair({ id: "dismissed", status: "dismissed", closed_at: "2026-11-18T00:00:00Z" }),
  ];
  const visits = [visit({ repair_id: "open-check", status: "completed" })];

  it("puts urgent first, then work to check, then by age; fixed only for 30 days", () => {
    const board = repairsBoard(repairs, visits, now);
    expect(board.toReview.map((r) => r.id)).toEqual(["rev-urgent", "rev-old"]);
    expect(board.open.map((r) => r.id)).toEqual(["open-urgent", "open-check", "open-plain"]);
    expect(board.fixed.map((r) => r.id)).toEqual(["fixed-recent"]);
  });

  it("counts what Today mentions, in both languages", () => {
    expect(repairsToday(repairs, visits)).toEqual({ toReview: 2, toCheck: 1 });
    expect(repairsTodayLabel("review", 2, "en")).toBe("2 repairs to review");
    expect(repairsTodayLabel("review", 1, "id")).toBe("1 laporan kerusakan perlu dicek");
    expect(repairsTodayLabel("check", 1, "en")).toBe("1 repair done — check the photos");
    expect(repairsTodayLabel("check", 1, "id")).toBe("1 perbaikan selesai — cek fotonya");
  });
});

describe("staff screens", () => {
  it("say what happened to a report, in Indonesian", () => {
    expect(staffRepairStatus(repair({ status: "reported" }), [])).toBe("Menunggu dicek");
    expect(staffRepairStatus(repair({}), [])).toBe("Diterima");
    expect(staffRepairStatus(repair({}), [visit({})])).toBe("Dijadwalkan");
    expect(staffRepairStatus(repair({ status: "fixed" }), [])).toBe("Sudah diperbaiki");
    expect(staffRepairStatus(repair({ status: "dismissed", dismiss_reason: "Sudah diganti" }), [])).toBe(
      "Tidak perlu: Sudah diganti"
    );
  });

  it("let a phone take back its own waiting report for 5 minutes only", () => {
    const sent = repair({ status: "reported", reported_by_staff: "s1", created_at: "2026-11-09T10:00:00Z" });
    const at = (minutes: number) => new Date("2026-11-09T10:00:00Z").getTime() + minutes * 60_000;
    expect(canUndoReport(sent, "s1", at(4))).toBe(true);
    expect(canUndoReport(sent, "s1", at(6))).toBe(false);
    expect(canUndoReport(sent, "s2", at(1))).toBe(false);
    expect(canUndoReport({ ...sent, status: "open" }, "s1", at(1))).toBe(false);
  });

  it("start a visit's title and notes in Indonesian", () => {
    expect(visitTitle(repair({ title: " Dinding retak " }))).toBe("Perbaiki: Dinding retak");
    expect(visitTitle(repair({ title: "x".repeat(120) }))).toHaveLength(120);
    expect(visitNotes(repair({ fixed_by_name: "Pak Budi" }))).toBe("Tukang: Pak Budi");
    expect(visitNotes(repair({}))).toBeNull();
  });
});

describe("PR B: cost, warranty, notes, repair people", () => {
  it("reads a cost however it was typed, in whole rupiah", () => {
    expect(parseIdr("350.000")).toBe(350000);
    expect(parseIdr("Rp 350.000")).toBe(350000);
    expect(parseIdr("350000")).toBe(350000);
    expect(parseIdr("350rb")).toBe(350000);
    expect(parseIdr("1,5 jt")).toBe(1500000);
    expect(parseIdr("")).toBeNull();
    expect(parseIdr("murah")).toBeNull();
    expect(formatIdr(350000)).toBe("Rp350.000");
  });

  it("says whether a warranty still runs, in both languages", () => {
    expect(warrantyLabel("2027-03-03", "en", "2026-11-09")).toBe("Under warranty until 3 Mar 2027");
    expect(warrantyLabel("2027-03-03", "id", "2026-11-09")).toBe("Garansi sampai 3 Mar 2027");
    expect(warrantyLabel("2026-10-01", "en", "2026-11-09")).toBe("Warranty ended 1 Oct 2026");
    expect(warrantyLabel(null, "en")).toBeNull();
  });

  it("suggests repair people named before, most used first, one per name whatever the case", () => {
    const people = repairPeople([
      repair({ id: "a", fixed_by_name: "Pak Budi" }),
      repair({ id: "b", fixed_by_name: "pak budi" }),
      repair({ id: "c", fixed_by_name: "Pak Joko" }),
      repair({ id: "d", fixed_by_name: null }),
    ]);
    expect(people).toEqual(["Pak Budi", "Pak Joko"]);
  });

  it("lets a phone take back its own note for 5 minutes only", () => {
    const note = { staff_id: "s1", created_at: "2026-11-09T10:00:00Z" };
    const at = (minutes: number) => new Date("2026-11-09T10:00:00Z").getTime() + minutes * 60_000;
    expect(canTakeBackNote(note, "s1", at(4))).toBe(true);
    expect(canTakeBackNote(note, "s1", at(6))).toBe(false);
    expect(canTakeBackNote(note, "s2", at(1))).toBe(false);
    expect(canTakeBackNote({ ...note, staff_id: null }, null, at(1))).toBe(false);
  });
});
