import { describe, expect, it } from "vitest";
import { nextOccurrence, occursOn, previousOccurrence } from "@/lib/chore-recurrence";
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

// Phase 141: skipping a repeat's first day moves its start to the next
// occurrence. That must drop exactly the one day and keep every other.
describe("skipping the first day keeps the pattern", () => {
  it.each([
    ["daily", "2026-11-03"],
    ["weekly", "2026-11-03"],
    ["monthly", "2026-11-14"],
  ] as const)("%s starting %s", (recurrence, start) => {
    const before = task(start, recurrence);
    const after = task(nextOccurrence(before, start)!, recurrence);
    const mismatches: string[] = [];
    for (let i = 0; i < 90; i++) {
      const day = addDay(start, i);
      const was = occursOn(before, day);
      const is = occursOn(after, day);
      if (day === start ? is : was !== is) mismatches.push(`${day}: ${was} -> ${is}`);
    }
    expect(mismatches).toEqual([]);
  });
});
