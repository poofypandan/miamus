import { describe, expect, it } from "vitest";
import { expandChores, myOccurrences, myTasksMode } from "@/lib/chore-recurrence";
import { jobPhotos, type ChoreFinishJob } from "@/lib/offline-queue";
import type { HouseholdTask } from "@/types/database";

// "My tasks" on Today (Phase 163): which chores are an admin's own, in what
// order, and on which days they can be finished.

const ME = "me-profile";
const ARI = "ari-profile";
const TODAY = "2026-11-10";

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

function day(rows: HouseholdTask[], date = TODAY) {
  return expandChores({ rows, date, today: TODAY });
}

describe("myOccurrences", () => {
  it("is the chores assigned to me, not anyone else's or unclaimed ones", () => {
    const rows = [
      chore({ title: "Water the plants", assigned_to: ME }),
      chore({ title: "Mop", assigned_to: ARI }),
      chore({ title: "Vacuum", assigned_to: null }),
    ];
    expect(myOccurrences(day(rows), ME).map((o) => o.task.title)).toEqual(["Water the plants"]);
  });

  it("keeps an unassigned chore I finished, so finishing never drops a row", () => {
    const rows = [
      chore({ title: "Take out the trash", status: "completed", completed_by: ME }),
      chore({ title: "Done by Ari", status: "completed", completed_by: ARI }),
    ];
    expect(myOccurrences(day(rows), ME).map((o) => o.task.title)).toEqual(["Take out the trash"]);
  });

  it("puts carried-over first (oldest first), then open, then done", () => {
    const rows = [
      chore({ title: "Done one", assigned_to: ME, status: "completed", completed_by: ME }),
      chore({ title: "Open today", assigned_to: ME }),
      chore({ title: "From yesterday", assigned_to: ME, due_date: "2026-11-09" }),
      chore({ title: "From last week", assigned_to: ME, due_date: "2026-11-03" }),
    ];
    expect(myOccurrences(day(rows), ME).map((o) => o.task.title)).toEqual([
      "From last week",
      "From yesterday",
      "Open today",
      "Done one",
    ]);
  });

  it("leaves out a cancelled day", () => {
    const rows = [chore({ title: "Skipped", assigned_to: ME, status: "cancelled" })];
    expect(myOccurrences(day(rows), ME)).toEqual([]);
  });

  it("is empty without a roster row, rather than everybody's", () => {
    const rows = [chore({ assigned_to: ME }), chore({ assigned_to: null })];
    expect(myOccurrences(day(rows), null)).toEqual([]);
    expect(myOccurrences(day(rows), undefined)).toEqual([]);
  });

  it("follows a repeat onto other days", () => {
    const rows = [chore({ title: "Water the plants", assigned_to: ME, recurrence: "daily", due_date: "2026-11-01" })];
    expect(myOccurrences(day(rows, "2026-11-12"), ME).map((o) => o.date)).toEqual(["2026-11-12"]);
  });
});

describe("myTasksMode", () => {
  it("finishes today, and reads other days only", () => {
    expect(myTasksMode(TODAY, TODAY)).toBe("today");
    expect(myTasksMode("2026-11-11", TODAY)).toBe("future");
    expect(myTasksMode("2026-11-09", TODAY)).toBe("past");
  });
});

describe("a chore save with no photos", () => {
  const job: ChoreFinishJob = {
    kind: "chore",
    templateId: "t",
    date: TODAY,
    rowId: "t",
    assignedTo: ME,
    before: null,
    after: null,
    completedBy: ME,
    completedAt: `${TODAY}T03:00:00Z`,
    title: "Water the plants",
  };

  it("waits on no photo upload", () => {
    expect(jobPhotos(job)).toEqual([]);
  });

  it("still waits on both when it has them", () => {
    expect(jobPhotos({ ...job, before: "b.jpg", after: "a.jpg" })).toEqual(["b.jpg", "a.jpg"]);
  });
});
