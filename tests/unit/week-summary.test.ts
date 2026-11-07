import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { expandChores } from "@/lib/chore-recurrence";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import { buildUnifiedAgenda, weekStartOf } from "@/lib/unified-agenda";
import { summarizeWeek } from "@/lib/week-summary";
import { BENTO, MOCHI, SCHEDULES, chore, logFor } from "../fixtures/household";

// Tuesday 3 November 2026, midday, in the household's zone (vitest.config).
const now = new Date("2026-11-03T12:00:00");
const today = formatDateLocal(now);

const mochiPotty = SCHEDULES.find((s) => s.entity_id === MOCHI.id && s.title === "Pipis & Pup")!;
const LOGS = [
  // Monday: every one of Mochi's potty breaks, none of Bento's.
  ...["07:00", "11:00", "15:00", "19:00"].map((t) => logFor(mochiPotty, "2026-11-02", t)),
  // Today so far: Mochi's two morning breaks.
  logFor(mochiPotty, "2026-11-03", "07:00"),
  logFor(mochiPotty, "2026-11-03", "11:00"),
];
const CHORES = [
  chore("c-sweep", "Sapu Teras", "2026-10-20", { recurrence: "daily" }),
  chore("c-vacuum", "Vacuum", "2026-10-27", { recurrence: "weekly" }), // Tuesdays
  chore("c-oneoff", "Cuci Gorden", "2026-11-05"),
];

// What useAgendaWeek assembles (leave triage aside: no leave here).
const days = Array.from({ length: 7 }, (_, offset) => {
  const date = formatDateLocal(addDays(weekStartOf(now), offset));
  const groups = buildAgenda({ date, entities: [MOCHI, BENTO], schedules: SCHEDULES, logs: LOGS, now });
  const chores = expandChores({ rows: CHORES, date, today });
  return { date, entries: buildUnifiedAgenda({ groups, chores }) };
});
const summary = summarizeWeek({ days, today, schedules: SCHEDULES });
const day = (date: string) => summary.days.find((d) => d.date === date)!;
const row = (group: string, title: string) =>
  summary.rhythm.find((r) => r.group === group && r.title === title)!;
const index = (date: string) => summary.days.findIndex((d) => d.date === date);

describe("summarizeWeek (Phase 143)", () => {
  it("covers Sunday to Saturday", () => {
    expect(summary.days.map((d) => d.date)).toEqual([
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07",
    ]);
  });

  it("folds the daily routine into one row per pet and task, plus the daily chore", () => {
    // Mochi 4 (lunch, dinner, potty, medicine) + Bento 3 + House 1.
    expect(summary.rhythm).toHaveLength(8);
    expect(row("House", "Sapu Teras")).toBeDefined();
    // 13 routine slots and one daily chore.
    expect(summary.rhythmTotals.perDay).toBe(14);
  });

  it("keeps four potty slots in one row, every day", () => {
    expect(row("Mochi", "Pipis & Pup").cells.map((c) => c?.total)).toEqual([4, 4, 4, 4, 4, 4, 4]);
  });

  it("counts every owed item once, on its own day", () => {
    // 14 a day, plus the weekly vacuum on Tuesday and the one-off on Thursday.
    expect(summary.days.map((d) => d.total)).toEqual([14, 14, 15, 14, 15, 14, 14]);
  });

  it("marks a finished past row done and an unfinished one missed", () => {
    const monday = index("2026-11-02");
    expect(row("Mochi", "Pipis & Pup").cells[monday]?.state).toBe("done");
    expect(row("Bento", "Pipis & Pup").cells[monday]?.state).toBe("missed");
    expect(day("2026-11-02")).toMatchObject({ done: 4, missed: 10 });
  });

  it("calls today's overdue slots late, not missed", () => {
    const tuesday = index(today);
    expect(row("Mochi", "Pipis & Pup").cells[tuesday]).toMatchObject({ done: 2, state: "partial" });
    expect(row("Bento", "Pipis & Pup").cells[tuesday]).toMatchObject({ missed: 2, state: "late" });
  });

  it("never calls a future day missed", () => {
    for (const d of summary.days.filter((d) => d.when === "future")) expect(d.missed).toBe(0);
    for (const r of summary.rhythm) {
      r.cells.forEach((c, i) => {
        if (c && summary.days[i].when === "future") expect(c.state).toBe("upcoming");
      });
    }
  });

  it("lists only what changes week to week below the rhythm", () => {
    const listed = summary.beyond.flatMap((d) =>
      d.entries.map((e) => `${d.date} ${e.kind === "chore" ? e.occurrence.template.title : e.group.category}`)
    );
    expect(listed).toEqual(["2026-11-03 Vacuum", "2026-11-05 Cuci Gorden"]);
  });
});
