import { describe, expect, it } from "vitest";
import {
  QUICK_ITEMS,
  alreadyAdded,
  defaultFirstDue,
  quickItem,
  quickSubline,
  savedTitle,
  type QuickChore,
} from "@/lib/bills-upkeep";
import { comingUpLabel, comingUpReminders, remindLabel, remindOf } from "@/lib/chore-reminders";
import type { HouseholdTask, InventoryItem } from "@/types/database";

const chore = (key: Parameters<typeof quickItem>[0]) => quickItem(key) as QuickChore;

function task(fields: Partial<HouseholdTask>): HouseholdTask {
  return {
    id: "t",
    household_id: "h",
    title: "Chore",
    notes: null,
    category: "bill",
    assigned_to: null,
    due_date: "2026-11-20",
    due_time: null,
    status: "pending",
    completed_by: null,
    completed_at: null,
    photo_url: null,
    created_at: "2026-11-01T00:00:00Z",
    recurrence: "none",
    recurrence_until: null,
    parent_task_id: null,
    ...fields,
  } as HouseholdTask;
}

describe("the checklist's defaults (Phase 164)", () => {
  it("bills are the owner's, with a reminder; upkeep repeats every 3 or 6 months", () => {
    expect(chore("electricity")).toMatchObject({ who: "me", category: "bill", remind: 3, recurrence: "monthly", interval: 1 });
    expect(chore("pbb")).toMatchObject({ interval: 12, remind: 7 });
    expect(chore("ac")).toMatchObject({ category: "maintenance", interval: 3, who: "anyone", remind: 1 });
    expect(chore("toren")).toMatchObject({ interval: 6, remind: null });
    expect(quickItem("gas").kind).toBe("supply");
  });

  it("has the roadmap's nine plus BPJS and vehicle tax (D8)", () => {
    const keys = QUICK_ITEMS.map((i) => i.key);
    for (const key of ["electricity", "water", "internet", "iuran", "pbb", "ac", "toren", "gas", "pest", "bpjs", "stnk"]) {
      expect(keys).toContain(key);
    }
  });

  it("is first due this month's day if it hasn't passed, otherwise next month's", () => {
    expect(defaultFirstDue(chore("electricity"), "2026-11-10")).toBe("2026-11-20");
    expect(defaultFirstDue(chore("electricity"), "2026-11-20")).toBe("2026-11-20");
    expect(defaultFirstDue(chore("electricity"), "2026-11-21")).toBe("2026-12-20");
    expect(defaultFirstDue(chore("iuran"), "2026-12-15")).toBe("2027-01-01");
  });

  it("PBB this year's 31 August, or next year's; vehicle tax is picked", () => {
    expect(defaultFirstDue(chore("pbb"), "2026-08-01")).toBe("2026-08-31");
    expect(defaultFirstDue(chore("pbb"), "2026-11-10")).toBe("2027-08-31");
    expect(defaultFirstDue(chore("stnk"), "2026-11-10")).toBeNull();
    expect(defaultFirstDue(chore("ac"), "2026-11-10")).toBe("2026-11-17");
  });

  it("reads its repeat and day in both languages", () => {
    expect(quickSubline(chore("electricity"), "2026-11-20", "en")).toBe("Monthly · 20th");
    expect(quickSubline(chore("electricity"), "2026-11-20", "id")).toBe("Setiap bulan · tgl 20");
    expect(quickSubline(chore("bpjs"), "2026-12-01", "en")).toBe("Monthly · 1st");
    expect(quickSubline(chore("stnk"), null, "id")).toBe("Setiap tahun · pilih tanggalnya");
    expect(quickSubline(chore("ac"), "2026-11-17", "en")).toMatch(/^Every 3 months · next /);
  });

  it("is saved in Indonesian when staff or anyone may do it", () => {
    expect(savedTitle(chore("toren"), false, "en")).toBe("Kuras toren");
    expect(savedTitle(chore("toren"), true, "en")).toBe("Clean the water tank (toren)");
    expect(savedTitle(chore("electricity"), true, "id")).toBe("Listrik PLN");
  });

  it("knows what's already set up, by its title", () => {
    const today = "2026-11-10";
    const chores = [
      task({ title: "Bayar listrik PLN", recurrence: "monthly" }),
      task({ id: "x", title: "Servis AC", parent_task_id: "p" }),
      // Paid once last week: history, not a bill set up.
      task({ id: "y", title: "Internet", due_date: "2026-11-05", status: "completed" }),
      // A repeat that has ended.
      task({ id: "z", title: "BPJS Kesehatan", recurrence: "monthly", recurrence_until: "2026-10-31" }),
    ];
    expect(alreadyAdded(chore("electricity"), chores, [], today)).toBe(true);
    expect(alreadyAdded(chore("electricity-token"), chores, [], today)).toBe(true);
    // A written day isn't a chore set up.
    expect(alreadyAdded(chore("ac"), chores, [], today)).toBe(false);
    expect(alreadyAdded(chore("internet"), chores, [], today)).toBe(false);
    expect(alreadyAdded(chore("bpjs"), chores, [], today)).toBe(false);
    const gas = { scope: "home", name: "Gas LPG 12 kg" } as InventoryItem;
    expect(alreadyAdded(quickItem("gas"), [], [gas], today)).toBe(true);
    expect(alreadyAdded(quickItem("gallon"), [], [gas], today)).toBe(false);
  });
});

describe("Remind me", () => {
  it("labels", () => {
    expect(remindLabel(null, "en")).toBe("Off");
    expect(remindLabel(3, "id")).toBe("3 hari sebelumnya");
    expect(remindLabel(7, "en")).toBe("1 week before");
  });

  it("ignores a value this build doesn't know", () => {
    expect(remindOf(task({ remind_days_before: 2 }))).toBeNull();
    expect(remindOf(task({ remind_days_before: 0 }))).toBe(0);
  });
});

describe("Coming up on Today", () => {
  const me = "me";
  const other = "other-owner";
  const owners = new Set([me, other]);
  const show = (rows: HouseholdTask[], today = "2026-11-17") =>
    comingUpReminders({ rows, today, memberId: me, ownerRows: owners }).map((c) => `${c.task.title}:${c.date}`);

  it("shows a bill inside its window, not before, not on the day", () => {
    const pln = task({ title: "PLN", recurrence: "monthly", due_date: "2026-10-20", remind_days_before: 3, assigned_to: me });
    expect(show([pln], "2026-11-16")).toEqual([]);
    expect(show([pln], "2026-11-17")).toEqual(["PLN:2026-11-20"]);
    expect(show([pln], "2026-11-19")).toEqual(["PLN:2026-11-20"]);
    expect(show([pln], "2026-11-20")).toEqual([]);
  });

  it("another owner's bill isn't mine; staff and anyone's are every owner's", () => {
    const theirs = task({ id: "a", title: "Theirs", due_date: "2026-11-18", remind_days_before: 1, assigned_to: other });
    const staffs = task({ id: "b", title: "AC", due_date: "2026-11-18", remind_days_before: 1, assigned_to: "staff-ari" });
    const anyone = task({ id: "c", title: "Toren", due_date: "2026-11-18", remind_days_before: 1, assigned_to: null });
    expect(show([theirs, staffs, anyone])).toEqual(["AC:2026-11-18", "Toren:2026-11-18"]);
  });

  it("nothing without a reminder, on the day only, done or skipped", () => {
    const none = task({ id: "a", title: "None", due_date: "2026-11-18" });
    const onDay = task({ id: "b", title: "OnDay", due_date: "2026-11-18", remind_days_before: 0 });
    const done = task({ id: "c", title: "Done", due_date: "2026-11-18", remind_days_before: 3, status: "completed" });
    const template = task({ id: "d", title: "Skipped", recurrence: "monthly", due_date: "2026-10-18", remind_days_before: 3 });
    const skipped = task({ id: "e", title: "Skipped", parent_task_id: "d", due_date: "2026-11-18", status: "cancelled" });
    expect(show([none, onDay, done, template, skipped])).toEqual([]);
  });

  it("a kept short-month day off the pattern still comes up (Codex, PR #60)", () => {
    const rent = task({ id: "R", title: "Rent", recurrence: "monthly", due_date: "2027-03-31", remind_days_before: 3, assigned_to: me });
    const feb = task({ id: "F", title: "Rent", parent_task_id: "R", due_date: "2027-02-28", assigned_to: me });
    expect(show([rent, feb], "2027-02-26")).toEqual(["Rent:2027-02-28"]);
    expect(show([rent, { ...feb, status: "completed" }], "2027-02-26")).toEqual([]);
  });

  it("a daily chore with a reminder isn't also coming up (code review, PR #60)", () => {
    const plants = task({ title: "Plants", recurrence: "daily", due_date: "2026-11-01", remind_days_before: 1, assigned_to: me });
    expect(show([plants])).toEqual([]);
  });

  it("a yearly bill a week out", () => {
    const stnk = task({ title: "STNK", recurrence: "monthly", recurrence_interval: 12, due_date: "2025-11-24", remind_days_before: 7, assigned_to: me });
    expect(show([stnk])).toEqual(["STNK:2026-11-24"]);
  });

  it("reads as one line", () => {
    const items = [
      { task: task({ title: "PBB" }), date: "2026-11-18" },
      { task: task({ title: "AC service" }), date: "2026-11-20" },
      { task: task({ title: "Internet" }), date: "2026-11-20" },
    ];
    expect(comingUpLabel(items.slice(0, 1), "2026-11-17", "en")).toBe("Coming up: PBB · Tomorrow");
    expect(comingUpLabel(items.slice(0, 1), "2026-11-17", "id")).toBe("Segera: PBB · Besok");
    expect(comingUpLabel(items.slice(0, 2), "2026-11-17", "en")).toBe("Coming up: PBB and AC service");
    expect(comingUpLabel(items, "2026-11-17", "id")).toBe("Segera: PBB, AC service, dan 1 lagi");
  });
});
