import { describe, expect, it } from "vitest";
import { dayTotals, slipLabel, slipRow, statusDetail, statusTitle, waitingRows, type WaitingInput } from "@/lib/today-status";
import type { PersonProgress, ProgressTask, StaffProgress } from "@/lib/staff-progress";

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

  it("names what slipped as the progress card does", () => {
    expect(slipLabel({ late: 1, couldnt: 0 }, "en")).toBe("1 late");
    expect(slipLabel({ late: 0, couldnt: 2 }, "id")).toBe("2 tidak bisa dikerjakan");
    expect(slipLabel({ late: 1, couldnt: 2 }, "en")).toBe("1 late · 2 couldn't be done");
    expect(slipLabel({ late: 1, couldnt: 2 }, "id")).toBe("1 terlambat · 2 tidak bisa dikerjakan");
  });
});
