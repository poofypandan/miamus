import { describe, expect, it } from "vitest";
import {
  firstRunFacts,
  firstRunSteps,
  firstRunView,
  isPastFirstRun,
  nextFirstRunMemory,
  nextFirstRunStep,
  notifyStepShown,
  parseFirstRunMemory,
  staffOf,
  type FirstRunInput,
  type FirstRunPerson,
} from "@/lib/first-run";
import { STAFF_WHATS_NEW, WHATS_NEW, pickStaffTip, staffTipResting } from "@/lib/whats-new";

// Audit batch B1: the owner's first-run checklist (item 3), as Phase 175 S2
// made it the first page, and the staff's one tip at a time (item 5).

const OWNER: FirstRunPerson = { id: "owner", name: "Owner", user_id: "user-1", archived_at: null };
const SARI: FirstRunPerson = { id: "sari", name: "Sari", user_id: null, archived_at: null };
const GONE: FirstRunPerson = { id: "gone", name: "Rina", user_id: null, archived_at: "2026-10-01T00:00:00Z" };
const TASK = { assigned_to: "sari", status: "pending" };

function input(over: Partial<FirstRunInput> = {}): FirstRunInput {
  return { people: [OWNER], linkedPhones: 0, chores: [], petRoutines: 0, logs: 0, push: "off", ...over };
}

function doneIds(over: Partial<FirstRunInput>) {
  return firstRunSteps(input(over))
    .filter((step) => step.done)
    .map((step) => step.id);
}

describe("first-run steps", () => {
  it("has five rows in the plan's order, and a brand-new household has only its name", () => {
    expect(firstRunSteps(input()).map((step) => step.id)).toEqual(["home", "setup", "phone", "notify", "done"]);
    expect(doneIds({})).toEqual(["home"]);
    expect(nextFirstRunStep(firstRunSteps(input()))).toBe("setup");
  });

  it("staff means someone on the roster who isn't an admin and isn't archived", () => {
    expect(staffOf([OWNER, SARI, GONE]).map((p) => p.id)).toEqual(["sari"]);
    expect(firstRunFacts(input({ people: [OWNER, GONE] })).staff).toBe(false);
    expect(firstRunFacts(input({ people: [OWNER, SARI] })).staff).toBe(true);
    // Still loading: not done, never a crash.
    expect(firstRunFacts(input({ people: null })).staff).toBe(false);
  });

  it("Set up your home is ticked only when there are staff and a first task", () => {
    expect(doneIds({ people: [OWNER, SARI] })).toEqual(["home"]);
    expect(doneIds({ chores: [{ assigned_to: null, status: "pending" }] })).toEqual(["home"]);
    expect(doneIds({ people: [OWNER, SARI], chores: [TASK] })).toEqual(["home", "setup"]);
    // Whichever is missing is what the open row offers.
    expect(firstRunFacts(input({ people: [OWNER, SARI] }))).toMatchObject({ staff: true, task: false });
    expect(firstRunFacts(input({ chores: [{ assigned_to: null, status: "pending" }] }))).toMatchObject({
      staff: false,
      task: true,
    });
    expect(nextFirstRunStep(firstRunSteps(input({ people: [OWNER, SARI], chores: [TASK] })))).toBe("phone");
  });

  it("a first task is a chore that isn't the admin's own, or a pet routine", () => {
    const facts = (over: Partial<FirstRunInput>) => firstRunFacts(input({ people: [OWNER, SARI], ...over }));
    expect(facts({ chores: [{ assigned_to: "owner", status: "pending" }] }).task).toBe(false);
    expect(facts({ chores: [TASK] }).task).toBe(true);
    expect(facts({ chores: [{ assigned_to: null, status: "pending" }] }).task).toBe(true);
    expect(facts({ chores: [{ assigned_to: "sari", status: "cancelled" }] }).task).toBe(false);
    expect(facts({ petRoutines: 2 }).task).toBe(true);
  });

  it("a phone is linked once list_linked_phones has one; unknown counts as not yet", () => {
    const base = { people: [OWNER, SARI], chores: [TASK] };
    expect(doneIds({ ...base, linkedPhones: 1 })).toEqual(["home", "setup", "phone"]);
    expect(doneIds({ ...base, linkedPhones: null })).toEqual(["home", "setup"]);
  });

  it("notifications come before the last step, and tick only when on for this phone", () => {
    const base = { people: [OWNER, SARI], chores: [TASK], linkedPhones: 1 };
    expect(nextFirstRunStep(firstRunSteps(input({ ...base, push: "off" })))).toBe("notify");
    expect(nextFirstRunStep(firstRunSteps(input({ ...base, push: "ios-install-first" })))).toBe("notify");
    expect(nextFirstRunStep(firstRunSteps(input({ ...base, push: "denied" })))).toBe("notify");
    expect(doneIds({ ...base, push: "on" })).toEqual(["home", "setup", "phone", "notify"]);
    expect(nextFirstRunStep(firstRunSteps(input({ ...base, push: "on" })))).toBe("done");
  });

  it("no notifications row where nothing can be done; still loading keeps the row", () => {
    expect(notifyStepShown("unsupported")).toBe(false);
    expect(notifyStepShown("unconfigured")).toBe(false);
    expect(notifyStepShown("loading")).toBe(true);
    expect(notifyStepShown(undefined)).toBe(true);
    const steps = firstRunSteps(input({ people: [OWNER, SARI], chores: [TASK], linkedPhones: 1, push: "unsupported" }));
    expect(steps.map((step) => step.id)).toEqual(["home", "setup", "phone", "done"]);
    expect(nextFirstRunStep(steps)).toBe("done");
  });

  it("the last step ticks on the first finished task, by anyone, even with notifications off", () => {
    expect(
      doneIds({ people: [OWNER, SARI], linkedPhones: 1, chores: [{ assigned_to: "sari", status: "completed" }] })
    ).toEqual(["home", "setup", "phone", "done"]);
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
    expect(pickStaffTip(all, none)).toBe("staff-kitchen-places-2026-11");
  });

  it("then the next newest, keeping the list's order for the same day", () => {
    const seen = new Set(["staff-kitchen-places-2026-11"]);
    expect(pickStaffTip(all, (id) => seen.has(id))).toBe("staff-menu-2026-11");
    seen.add("staff-menu-2026-11");
    expect(pickStaffTip(all, (id) => seen.has(id))).toBe("staff-recipes-2026-11");
    seen.add("staff-recipes-2026-11");
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
