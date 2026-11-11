import { describe, expect, it } from "vitest";
import {
  firstRunSteps,
  firstRunView,
  isPastFirstRun,
  nextFirstRunMemory,
  nextFirstRunStep,
  parseFirstRunMemory,
  staffOf,
  type FirstRunInput,
  type FirstRunPerson,
} from "@/lib/first-run";
import { STAFF_WHATS_NEW, WHATS_NEW, pickStaffTip, staffTipResting } from "@/lib/whats-new";

// Audit batch B1: the owner's first-run checklist (item 3) and the staff's
// one tip at a time (item 5).

const OWNER: FirstRunPerson = { id: "owner", name: "Owner", user_id: "user-1", archived_at: null };
const SARI: FirstRunPerson = { id: "sari", name: "Sari", user_id: null, archived_at: null };
const GONE: FirstRunPerson = { id: "gone", name: "Rina", user_id: null, archived_at: "2026-10-01T00:00:00Z" };

function input(over: Partial<FirstRunInput> = {}): FirstRunInput {
  return { people: [OWNER], linkedPhones: 0, chores: [], petRoutines: 0, logs: 0, ...over };
}

function doneIds(over: Partial<FirstRunInput>) {
  return firstRunSteps(input(over))
    .filter((step) => step.done)
    .map((step) => step.id);
}

describe("first-run steps", () => {
  it("a brand-new household has only its name", () => {
    expect(doneIds({})).toEqual(["home"]);
    expect(nextFirstRunStep(firstRunSteps(input()))).toBe("staff");
  });

  it("staff means someone on the roster who isn't an admin and isn't archived", () => {
    expect(staffOf([OWNER, SARI, GONE]).map((p) => p.id)).toEqual(["sari"]);
    expect(doneIds({ people: [OWNER, GONE] })).toEqual(["home"]);
    expect(doneIds({ people: [OWNER, SARI] })).toEqual(["home", "staff"]);
    // Still loading: not done, never a crash.
    expect(doneIds({ people: null })).toEqual(["home"]);
  });

  it("a phone is linked once list_linked_phones has one; unknown counts as not yet", () => {
    expect(doneIds({ people: [OWNER, SARI], linkedPhones: 1 })).toEqual(["home", "staff", "phone"]);
    expect(doneIds({ people: [OWNER, SARI], linkedPhones: null })).toEqual(["home", "staff"]);
  });

  it("a first task is a chore that isn't the admin's own, or a pet routine", () => {
    const base = { people: [OWNER, SARI], linkedPhones: 1 };
    expect(doneIds({ ...base, chores: [{ assigned_to: "owner", status: "pending" }] })).not.toContain("task");
    expect(doneIds({ ...base, chores: [{ assigned_to: "sari", status: "pending" }] })).toContain("task");
    expect(doneIds({ ...base, chores: [{ assigned_to: null, status: "pending" }] })).toContain("task");
    expect(doneIds({ ...base, chores: [{ assigned_to: "sari", status: "cancelled" }] })).not.toContain("task");
    expect(doneIds({ ...base, petRoutines: 2 })).toContain("task");
    expect(nextFirstRunStep(firstRunSteps(input({ ...base, petRoutines: 2 })))).toBe("done");
  });

  it("the last step ticks on the first finished task, by anyone", () => {
    expect(doneIds({ people: [OWNER, SARI], linkedPhones: 1, chores: [{ assigned_to: "sari", status: "completed" }] })).toEqual([
      "home",
      "staff",
      "phone",
      "task",
      "done",
    ]);
    expect(isPastFirstRun({ chores: [], logs: 1 })).toBe(true);
    // A chore finished on a day Today hasn't loaded still counts (Claude review, #62).
    expect(isPastFirstRun({ chores: [], logs: 0, finishedChore: true })).toBe(true);
    expect(isPastFirstRun({ chores: [], logs: 0, finishedChore: null })).toBe(false);
    expect(doneIds({ finishedChore: true })).toContain("done");
    expect(isPastFirstRun({ chores: [{ assigned_to: null, status: "pending" }], logs: 0 })).toBe(false);
  });
});

describe("first-run view", () => {
  const fresh = firstRunSteps(input());
  const finished = firstRunSteps(input({ logs: 3 }));

  it("shows the checklist to a household not past setup, and marks it seen", () => {
    expect(firstRunView(fresh, null)).toBe("checklist");
    expect(nextFirstRunMemory(fresh, "checklist", null)).toBe("shown");
    expect(firstRunView(fresh, "shown")).toBe("checklist");
    expect(nextFirstRunMemory(fresh, "checklist", "shown")).toBeNull();
  });

  it("an existing household (anything finished) never sees it, and is done with on this phone", () => {
    expect(firstRunView(finished, null)).toBe("hidden");
    expect(nextFirstRunMemory(finished, "hidden", null)).toBe("finished");
    // Browsing to a week where last week's completions aren't loaded: still hidden.
    expect(firstRunView(fresh, "finished")).toBe("hidden");
  });

  it("finishing after the checklist was seen: the note once, latched, then gone", () => {
    expect(firstRunView(finished, "shown")).toBe("finished");
    expect(nextFirstRunMemory(finished, "finished", "shown")).toBe("completed");
    // The completion no longer loaded (another day on screen): the note stays.
    expect(firstRunView(fresh, "completed")).toBe("finished");
    expect(nextFirstRunMemory(fresh, "finished", "completed")).toBeNull();
    expect(firstRunView(finished, "finished")).toBe("hidden");
  });

  it("Not now hides it for good", () => {
    expect(firstRunView(fresh, "dismissed")).toBe("hidden");
    expect(firstRunView(finished, "dismissed")).toBe("hidden");
    expect(nextFirstRunMemory(fresh, "hidden", "dismissed")).toBeNull();
  });

  it("reads only the values it writes", () => {
    expect(parseFirstRunMemory("dismissed")).toBe("dismissed");
    expect(parseFirstRunMemory("completed")).toBe("completed");
    expect(parseFirstRunMemory("yes")).toBeNull();
    expect(parseFirstRunMemory(null)).toBeNull();
  });
});

describe("staff tips, one at a time", () => {
  const all = STAFF_WHATS_NEW.map((entry) => ({ id: entry.id, show: true }));
  const none = () => false;

  it("shows the newest that applies", () => {
    expect(pickStaffTip(all, none)).toBe("staff-recipes-2026-11");
  });

  it("then the next newest, keeping the list's order for the same day", () => {
    const seen = new Set(["staff-recipes-2026-11"]);
    expect(pickStaffTip(all, (id) => seen.has(id))).toBe("staff-kitchen-amounts-2026-11");
    seen.add("staff-kitchen-amounts-2026-11");
    expect(pickStaffTip(all, (id) => seen.has(id))).toBe("staff-couldnt-do-2026-11");
    seen.add("staff-couldnt-do-2026-11");
    expect(pickStaffTip(all, (id) => seen.has(id))).toBe("staff-feedback-2026-11");
    seen.add("staff-feedback-2026-11");
    expect(pickStaffTip(all, (id) => seen.has(id))).toBe("staff-rooms-inside-2026-11");
    seen.add("staff-rooms-inside-2026-11");
    expect(pickStaffTip(all, (id) => seen.has(id))).toBe("staff-weak-signal-2026-11");
    seen.add("staff-weak-signal-2026-11");
    expect(pickStaffTip(all, (id) => seen.has(id))).toBe("staff-floors-2026-11");
  });

  it("skips a tip whose feature isn't on this phone yet, and unknown ids", () => {
    const tips = [
      { id: "staff-floors-2026-11", show: false },
      { id: "staff-repairs-2026-11", show: true },
      { id: "no-such-tip", show: true },
    ];
    expect(pickStaffTip(tips, none)).toBe("staff-repairs-2026-11");
  });

  it("rests only on the day a tip was closed, so the next comes back after midnight", () => {
    expect(staffTipResting("2026-11-10", "2026-11-10")).toBe(true);
    expect(staffTipResting("2026-11-10", "2026-11-11")).toBe(false);
    expect(staffTipResting(null, "2026-11-10")).toBe(false);
  });

  it("nothing left: none", () => {
    expect(pickStaffTip(all, () => true)).toBeNull();
    expect(pickStaffTip([], none)).toBeNull();
  });
});

describe("What's new", () => {
  it("has the checklist's owner line in both languages, and no emoji", () => {
    const entry = WHATS_NEW.find((e) => e.id === "first-run-2026-11");
    expect(entry?.steps.en).toHaveLength(1);
    expect(entry?.steps.id).toHaveLength(1);
    const text = JSON.stringify(entry);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
