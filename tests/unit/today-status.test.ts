import { describe, expect, it } from "vitest";
import {
  dayTotals,
  leaveRowLabel,
  slipLabel,
  slipOwners,
  slipRow,
  statusDetail,
  statusTitle,
  waitingRows,
  type WaitingInput,
} from "@/lib/today-status";
import type { PersonProgress, ProgressTask, StaffProgress } from "@/lib/staff-progress";
import { pendingLeave } from "@/lib/leave";

// Today's status line (Phase 175, S3): the day's counts come from the same
// rows as the progress card; "waiting for you" counts rows, not items; one
// row at most for work that slipped; and "All on track" means nothing waits,
// not that the day is finished.

function task(over: Partial<ProgressTask>): ProgressTask {
  return {
    kind: "chore",
    state: "open",
    title: "Task",
    time: null,
    late: false,
    carried: false,
    doneBy: null,
    supervising: null,
    ...over,
  } as ProgressTask;
}

function person(id: string, tasks: ProgressTask[]): PersonProgress {
  return {
    id,
    name: id,
    admin: false,
    house: null,
    pets: null,
    late: tasks.filter((t) => t.late).length,
    couldnt: tasks.filter((t) => t.state === "couldnt").length,
    tone: "neutral",
    onLeave: false,
    busy: null,
    tasks,
  };
}

const NOTHING: WaitingInput = {
  approvals: 0,
  leave: 0,
  medicine: 0,
  late: 0,
  couldnt: 0,
  notDone: 0,
  repairsToReview: 0,
  repairsToCheck: 0,
  foodNeedsDate: 0,
};

describe("dayTotals", () => {
  it("is all zeros until the roster has loaded", () => {
    expect(dayTotals(null)).toEqual({ done: 0, total: 0, late: 0, couldnt: 0 });
  });

  it("takes done and total from the whole day, late and couldn't-do from the rows", () => {
    const progress: StaffProgress = {
      people: [
        person("sari", [task({ state: "done" }), task({ state: "done" }), task({ late: true })]),
        person("budi", [task({ state: "couldnt" }), task({ kind: "routine", state: "done" })]),
      ],
      anyone: { open: 1, late: 0, couldnt: 0, tone: "neutral", tasks: [task({})] },
      day: { done: 3, total: 6 },
    };
    expect(dayTotals(progress)).toEqual({ done: 3, total: 6, late: 1, couldnt: 1 });
  });

  it("counts finished work that is on nobody's row (Codex, PR #105)", () => {
    // One task finished with no name on it, one still open: the rows hold
    // only the open one, the day holds both.
    const progress: StaffProgress = {
      people: [],
      anyone: { open: 1, late: 0, couldnt: 0, tone: "neutral", tasks: [task({})] },
      day: { done: 1, total: 2 },
    };
    expect(dayTotals(progress)).toEqual({ done: 1, total: 2, late: 0, couldnt: 0 });
  });

  it("keeps a carried-over chore out of the day's total, but counts it late", () => {
    const progress: StaffProgress = {
      people: [person("sari", [task({ carried: true, late: true }), task({ state: "done" })])],
      anyone: null,
      day: { done: 1, total: 1 },
    };
    expect(dayTotals(progress)).toEqual({ done: 1, total: 1, late: 1, couldnt: 0 });
  });
});

describe("slipOwners", () => {
  // The late row opens the work it counts (Codex, PR #105).
  it("is nobody until the roster has loaded, or on a calm day", () => {
    expect(slipOwners(null, "anyone")).toEqual([]);
    const calm: StaffProgress = { people: [person("sari", [task({ state: "done" })])], anyone: null, day: { done: 1, total: 1 } };
    expect(slipOwners(calm, "anyone")).toEqual([]);
  });

  it("names the one person whose work slipped, so a tap opens their day", () => {
    const progress: StaffProgress = {
      people: [person("sari", [task({ late: true })]), person("budi", [task({ state: "done" })])],
      anyone: null,
      day: { done: 1, total: 2 },
    };
    expect(slipOwners(progress, "anyone")).toEqual(["sari"]);
  });

  it("lists everyone with late or couldn't-do work, unowned work last", () => {
    const progress: StaffProgress = {
      people: [person("sari", [task({ late: true })]), person("budi", [task({ state: "couldnt" })])],
      anyone: { open: 1, late: 1, couldnt: 0, tone: "red", tasks: [task({ late: true })] },
      day: { done: 0, total: 3 },
    };
    expect(slipOwners(progress, "anyone")).toEqual(["sari", "budi", "anyone"]);
  });

  it("leaves out unowned work that is only still open", () => {
    const progress: StaffProgress = {
      people: [],
      anyone: { open: 1, late: 0, couldnt: 0, tone: "neutral", tasks: [task({})] },
      day: { done: 0, total: 1 },
    };
    expect(slipOwners(progress, "anyone")).toEqual([]);
  });
});

describe("waitingRows", () => {
  it("is zero when nothing waits", () => {
    expect(waitingRows(NOTHING)).toBe(0);
  });

  it("counts one row per approval and per medicine alert", () => {
    expect(waitingRows({ ...NOTHING, approvals: 2, medicine: 1 })).toBe(3);
  });

  it("counts rows, not items: three repairs to review are one row", () => {
    expect(waitingRows({ ...NOTHING, repairsToReview: 3, repairsToCheck: 2, foodNeedsDate: 4 })).toBe(3);
  });

  it("gives late and couldn't-do one row between them", () => {
    expect(waitingRows({ ...NOTHING, late: 2, couldnt: 1 })).toBe(1);
  });

  it("never counts the evening line and the late row together", () => {
    expect(waitingRows({ ...NOTHING, late: 2, couldnt: 1, notDone: 3 })).toBe(1);
  });

  // Plan section 3, row 3b (Phase 175 check, F2): a leave request needs the
  // owner's answer, so it is a row of its own, one per request.
  it("counts one row per leave request waiting for an answer", () => {
    expect(waitingRows({ ...NOTHING, leave: 1 })).toBe(1);
    expect(waitingRows({ ...NOTHING, leave: 2, approvals: 1, repairsToReview: 3 })).toBe(4);
  });

  it("no longer says All on track on a finished day while leave waits", () => {
    const day = { done: 18, total: 18, late: 0, couldnt: 0 };
    const waiting = waitingRows({ ...NOTHING, leave: 1 });
    expect(statusTitle(waiting, "en")).toBe("1 waiting for you");
    expect(statusTitle(waiting, "id")).toBe("1 menunggu Anda");
    // The day's own count is unchanged: the leave is a decision, not a task.
    expect(statusDetail(day, "id")).toBe("18 dari 18 selesai · tidak ada yang terlambat");
  });
});

describe("pendingLeave", () => {
  const leave = (id: string, status: string, start: string, end: string) =>
    ({ id, status, start_date: start, end_date: end }) as {
      id: string;
      status: "pending" | "approved" | "rejected" | "ended_early";
      start_date: string;
      end_date: string;
    };

  it("keeps only requests still waiting for an answer, soonest first", () => {
    const rows = [
      leave("later", "pending", "2026-11-20", "2026-11-21"),
      leave("approved", "approved", "2026-11-13", "2026-11-14"),
      leave("rejected", "rejected", "2026-11-13", "2026-11-13"),
      leave("soon", "pending", "2026-11-15", "2026-11-16"),
    ];
    expect(pendingLeave(rows, "2026-11-12").map((l) => l.id)).toEqual(["soon", "later"]);
  });

  it("drops a pending request whose days are over, and keeps one under way", () => {
    const rows = [
      leave("past", "pending", "2026-11-01", "2026-11-02"),
      leave("today", "pending", "2026-11-10", "2026-11-12"),
    ];
    expect(pendingLeave(rows, "2026-11-12").map((l) => l.id)).toEqual(["today"]);
  });
});

describe("slipRow", () => {
  it("is the evening line once the summary hour has come", () => {
    expect(slipRow({ notDone: 3, late: 2, couldnt: 0 })).toBe("evening");
  });

  it("is the late row before that", () => {
    expect(slipRow({ notDone: 0, late: 1, couldnt: 0 })).toBe("late");
    expect(slipRow({ notDone: 0, late: 0, couldnt: 2 })).toBe("late");
  });

  it("is nothing on a calm day", () => {
    expect(slipRow({ notDone: 0, late: 0, couldnt: 0 })).toBeNull();
  });
});

describe("the words", () => {
  it("says All on track only when nothing waits", () => {
    expect(statusTitle(0, "en")).toBe("All on track");
    expect(statusTitle(0, "id")).toBe("Semua lancar");
    expect(statusTitle(1, "en")).toBe("1 waiting for you");
    expect(statusTitle(4, "id")).toBe("4 menunggu Anda");
  });

  it("puts the day's count and lateness under it", () => {
    expect(statusDetail({ done: 31, total: 39, late: 0, couldnt: 0 }, "en")).toBe("31 of 39 done · nothing late");
    expect(statusDetail({ done: 25, total: 39, late: 1, couldnt: 0 }, "en")).toBe("25 of 39 done · 1 late");
    expect(statusDetail({ done: 31, total: 39, late: 0, couldnt: 0 }, "id")).toBe(
      "31 dari 39 selesai · tidak ada yang terlambat"
    );
    expect(statusDetail({ done: 25, total: 39, late: 1, couldnt: 0 }, "id")).toBe("25 dari 39 selesai · 1 terlambat");
  });

  it("is on track at seven in the morning with nothing done yet", () => {
    expect(statusDetail({ done: 0, total: 12, late: 0, couldnt: 0 }, "en")).toBe("0 of 12 done · nothing late");
  });

  it("has no second line on a day with no tasks", () => {
    expect(statusDetail({ done: 0, total: 0, late: 0, couldnt: 0 }, "en")).toBeNull();
    // Only carried-over work: nothing falls on the day, but it is late.
    expect(statusDetail({ done: 0, total: 0, late: 2, couldnt: 0 }, "id")).toBe("2 terlambat");
  });

  it("names a leave request as its decision page does", () => {
    expect(leaveRowLabel("Syam", "Nov 15 – Nov 16", "en")).toBe("Syam is asking for leave · Nov 15 – Nov 16");
    expect(leaveRowLabel("Syam", "15 Nov – 16 Nov", "id")).toBe("Syam mengajukan cuti · 15 Nov – 16 Nov");
  });

  it("names what slipped as the progress card does", () => {
    expect(slipLabel({ late: 1, couldnt: 0 }, "en")).toBe("1 late");
    expect(slipLabel({ late: 0, couldnt: 2 }, "id")).toBe("2 tidak bisa dikerjakan");
    expect(slipLabel({ late: 1, couldnt: 2 }, "en")).toBe("1 late · 2 couldn't be done");
    expect(slipLabel({ late: 1, couldnt: 2 }, "id")).toBe("1 terlambat · 2 tidak bisa dikerjakan");
  });
});
