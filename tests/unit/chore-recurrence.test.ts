import { describe, expect, it } from "vitest";
import {
  expandChores,
  nextOccurrence,
  occursOn,
  previousOccurrence,
  repeatLabel,
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

// Phase 164 (migrations/137): every N weeks or months. Mirrors the SQL
// twin's checks in supabase/tests/137_chore_repeats_and_reminders.sql.
describe("every N weeks or months", () => {
  const every = (due: string, recurrence: ChoreRecurrence, n: number) =>
    ({ ...task(due, recurrence), recurrence_interval: n }) as HouseholdTask;

  it.each([
    ["2027-04-30", true],
    ["2027-07-31", true],
    ["2027-10-31", true],
    ["2027-02-28", false],
    ["2027-03-31", false],
  ])("every 3 months from 31 Jan: %s is %s", (day, expected) => {
    expect(occursOn(every("2027-01-31", "monthly", 3), day)).toBe(expected);
  });

  it("every year from 29 Feb lands on 28 Feb, then 29 Feb in a leap year", () => {
    const pbb = every("2028-02-29", "monthly", 12);
    expect(nextOccurrence(pbb, "2028-02-29")).toBe("2029-02-28");
    expect(occursOn(pbb, "2032-02-29")).toBe(true);
    expect(occursOn(pbb, "2028-03-29")).toBe(false);
  });

  it("every 2 weeks across a year end", () => {
    const gardener = every("2026-12-30", "weekly", 2);
    expect(nextOccurrence(gardener, "2026-12-30")).toBe("2027-01-13");
    expect(occursOn(gardener, "2027-01-06")).toBe(false);
  });

  it("daily ignores the interval; an out-of-range interval reads as 1", () => {
    expect(occursOn(every("2026-12-30", "daily", 3), "2026-12-31")).toBe(true);
    expect(occursOn(every("2026-11-14", "monthly", 40), "2026-12-14")).toBe(true);
  });

  it("previousOccurrence reaches back a year for a yearly chore", () => {
    expect(previousOccurrence(every("2025-08-31", "monthly", 12), "2026-08-30")).toBe("2025-08-31");
    expect(previousOccurrence(every("2026-08-31", "monthly", 12), "2026-10-15")).toBe("2026-08-31");
  });

  it("a missed 3-monthly day is carried over until the next one, then not", () => {
    const ac = { ...every("2026-09-21", "monthly", 3), id: "AC", status: "pending", parent_task_id: null } as HouseholdTask;
    const show = (rows: HouseholdTask[], today: string) =>
      expandChores({ rows, date: today, today }).map((o) => `${o.task.id}:${o.date}`);
    expect(show([ac], "2026-11-10")).toEqual(["AC:2026-09-21"]);
    expect(show([ac], "2026-12-21")).toEqual(["AC:2026-12-21"]);
    // Done on its day: not shown as missed two months later.
    const done = { ...task("2026-12-21", "none"), id: "D", status: "completed", parent_task_id: "AC" } as HouseholdTask;
    expect(show([ac, done], "2027-02-15")).toEqual([]);
  });

  it("skipping a 3-monthly chore's first day keeps the 31st", () => {
    const { start, clampedDays } = startAfterSkippingFirst(every("2027-01-31", "monthly", 3));
    expect(clampedDays).toEqual(["2027-04-30"]);
    expect(start).toBe("2027-07-31");
  });
});

describe("repeatLabel", () => {
  it.each([
    ["monthly", 1, "en", "Monthly"],
    ["monthly", 3, "en", "Every 3 months"],
    ["monthly", 6, "id", "Setiap 6 bulan"],
    ["monthly", 12, "en", "Every year"],
    ["monthly", 12, "id", "Setiap tahun"],
    ["weekly", 2, "en", "Every 2 weeks"],
    ["weekly", 2, "id", "Setiap 2 minggu"],
    ["daily", 3, "en", "Daily"],
    ["none", 1, "id", "Sekali saja"],
  ] as const)("%s ×%i in %s is %s", (recurrence, n, locale, label) => {
    expect(repeatLabel(recurrence, n, locale)).toBe(label);
  });
});
