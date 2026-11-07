import { describe, expect, it } from "vitest";
import {
  expandChores,
  nextOccurrence,
  occursOn,
  previousOccurrence,
  startAfterSkippingFirst,
} from "@/lib/chore-recurrence";
import type { ChoreRecurrence, HouseholdTask } from "@/types/database";

function task(due: string, recurrence: ChoreRecurrence, until: string | null = null) {
  return { id: "t", due_date: due, recurrence, recurrence_until: until } as HouseholdTask;
}

function addDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("nextOccurrence", () => {
  it.each([
    ["daily", "2026-11-03", "2026-11-04"],
    ["weekly", "2026-11-03", "2026-11-10"],
    ["monthly", "2026-11-14", "2026-12-14"],
  ] as const)("%s from %s is %s", (recurrence, start, next) => {
    expect(nextOccurrence(task(start, recurrence), start)).toBe(next);
  });

  it("clamps a monthly 31st to the end of February", () => {
    expect(nextOccurrence(task("2027-01-31", "monthly"), "2027-01-31")).toBe("2027-02-28");
  });

  it("has nothing after a one-off", () => {
    expect(nextOccurrence(task("2026-11-03", "none"), "2026-11-03")).toBeNull();
  });

  it("stops at recurrence_until", () => {
    expect(nextOccurrence(task("2026-11-03", "weekly", "2026-11-05"), "2026-11-03")).toBeNull();
  });

  it("agrees with previousOccurrence", () => {
    expect(previousOccurrence(task("2026-11-03", "weekly"), "2026-11-10")).toBe("2026-11-03");
  });
});

// Phase 141: skipping a repeat's first day moves its start. That must drop
// exactly the one day and keep every other — including a monthly chore on the
// 29th–31st, whose next day can be a shorter month's last day (Codex review,
// PR #1): those days are written as their own rows (clampedDays), and the
// start moves to the next anchor-day occurrence so the 31st stays the 31st.
describe("skipping the first day keeps the pattern", () => {
  it.each([
    ["daily", "2026-11-03"],
    ["weekly", "2026-11-03"],
    ["monthly", "2026-11-14"],
    ["monthly", "2027-01-31"],
    ["monthly", "2027-01-30"],
    ["monthly", "2027-01-29"],
    ["monthly", "2027-03-31"],
  ] as const)("%s starting %s", (recurrence, start) => {
    const before = task(start, recurrence);
    const { start: moved, clampedDays } = startAfterSkippingFirst(before);
    const after = task(moved!, recurrence);
    const mismatches: string[] = [];
    for (let i = 0; i < 400; i++) {
      const day = addDay(start, i);
      const was = occursOn(before, day);
      const is = occursOn(after, day) || clampedDays.includes(day);
      if (day === start ? is : was !== is) mismatches.push(`${day}: ${was} -> ${is}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("a chore on the 31st keeps 28 February as its own day", () => {
    expect(startAfterSkippingFirst(task("2027-01-31", "monthly"))).toEqual({
      start: "2027-03-31",
      clampedDays: ["2027-02-28"],
    });
  });

  it("starts on the next day when the run ends before the anchor day comes round", () => {
    expect(startAfterSkippingFirst(task("2027-01-31", "monthly", "2027-03-15"))).toEqual({
      start: "2027-02-28",
      clampedDays: [],
    });
  });

  it("has no start when no day is left", () => {
    expect(startAfterSkippingFirst(task("2027-01-31", "monthly", "2027-02-10")).start).toBeNull();
  });
});

// Codex review, PR #1: a day's own row governs it, even on the repeat's first
// day. Skipping a first day can move the start onto a day someone already
// finished or called off; the template must not bring it back as pending,
// whichever order the rows arrive in.
describe("a day's own row wins over the repeat's first day", () => {
  const template = {
    ...task("2027-03-31", "monthly"),
    id: "T",
    status: "pending",
    parent_task_id: null,
  } as HouseholdTask;
  const finished = {
    ...task("2027-03-31", "none"),
    id: "M",
    status: "completed",
    parent_task_id: "T",
  } as HouseholdTask;
  const calledOff = { ...finished, id: "C", status: "cancelled" } as HouseholdTask;
  const show = (rows: HouseholdTask[], date: string) =>
    expandChores({ rows, date, today: "2027-04-02" }).map((o) => `${o.task.id}:${o.date}:${o.status}`);

  it.each([
    ["template first", [template, finished]],
    ["row first", [finished, template]],
  ] as const)("finished day stays finished (%s)", (_, rows) => {
    expect(show([...rows], "2027-03-31")).toEqual(["M:2027-03-31:completed"]);
  });

  it.each([
    ["template first", [template, calledOff]],
    ["row first", [calledOff, template]],
  ] as const)("called-off day stays off (%s)", (_, rows) => {
    expect(show([...rows], "2027-03-31")).toEqual([]);
  });

  it("is not carried over to today as missed", () => {
    expect(show([template, finished], "2027-04-02")).toEqual([]);
    expect(show([template, calledOff], "2027-04-02")).toEqual([]);
  });

  it("a first day with no row of its own still shows and carries over", () => {
    expect(show([template], "2027-03-31")).toEqual(["T:2027-03-31:pending"]);
    expect(show([template], "2027-04-02")).toEqual(["T:2027-03-31:pending"]);
  });
});
