import { describe, expect, it } from "vitest";
import { finishedEntries, routinePart } from "@/lib/unified-agenda";
import type { AgendaGroup, AgendaItem } from "@/lib/scheduleEngine";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import type { TaskLog } from "@/types/database";

// Latest (Today v3) lists what the status ring counts as finished: every
// completed chore, the admin's own too, and every pet a routine has been
// through, even while the rest of its group waits (Codex, PR #181).

function item(entityId: string, status: AgendaItem["status"], title = "Feeding"): AgendaItem {
  return { key: `k-${entityId}-${title}`, entityId, entityName: entityId, status, log: null, title } as AgendaItem;
}

function group(items: AgendaItem[]): AgendaGroup {
  const titles = [...new Set(items.map((i) => i.title))];
  return { time: "08:00", title: titles[0], titles, items, kind: null } as unknown as AgendaGroup;
}

function chore(key: string, status: ChoreOccurrence["status"]): ChoreOccurrence {
  return { key, status, task: { title: key, due_time: null } } as unknown as ChoreOccurrence;
}

describe("finishedEntries (what Latest shows)", () => {
  it("keeps a routine's finished pets while another in the group still waits", () => {
    const entries = finishedEntries({ groups: [group([item("Mocha", "completed"), item("Matcha", "pending")])], chores: [] });
    expect(entries).toHaveLength(1);
    const [only] = entries;
    if (only.kind !== "routine") throw new Error("expected a routine");
    expect(only.group.items.map((i) => i.entityName)).toEqual(["Mocha"]);
  });

  it("names a medicine group for the medicines given, not the first one scheduled", () => {
    const noon = group([item("Mocha", "pending", "Antibiotic"), item("Mocha", "completed", "Eye drops")]);
    const [only] = finishedEntries({ groups: [noon], chores: [] });
    if (only.kind !== "routine") throw new Error("expected a routine");
    expect(only.group.titles).toEqual(["Eye drops"]);
    expect(only.group.title).toBe("Eye drops");
  });

  it("leaves out a routine nobody has started", () => {
    expect(finishedEntries({ groups: [group([item("Mocha", "pending"), item("Matcha", "overdue")])], chores: [] })).toEqual([]);
  });

  it("takes every completed chore it is given and nothing still open", () => {
    const entries = finishedEntries({
      groups: [],
      chores: [chore("mine-bill", "completed"), chore("laundry", "completed"), chore("mop", "pending")],
    });
    // Order is latestRows's job (by finish time), not this one's.
    expect(entries.map((e) => e.key).sort()).toEqual(["chore|laundry", "chore|mine-bill"]);
  });
});

describe("routinePart (Next names what is left)", () => {
  it("names a medicine group for the medicines still to give", () => {
    const noon = group([item("Mocha", "completed", "Antibiotic"), item("Mocha", "pending", "Eye drops"), item("Mocha", "overdue", "Ear wash")]);
    const left = routinePart(noon, false);
    expect(left?.titles).toEqual(["Eye drops", "Ear wash"]);
    expect(left?.title).toBe("Eye drops");
  });

  it("returns the group itself when nothing was split off, and null when nothing is left", () => {
    const open = group([item("Mocha", "pending"), item("Matcha", "pending")]);
    expect(routinePart(open, false)).toBe(open);
    expect(routinePart(open, true)).toBeNull();
  });
});

describe("routinePart counts as the status ring does (classifyDay)", () => {
  it("leaves a pet at the clinic out of Next and Latest, apart from its vet visit", () => {
    const feeding = group([item("Mocha", "pending"), item("Matcha", "pending")]);
    const admittedIds = new Set(["Mocha"]);
    expect(routinePart(feeding, false, { admittedIds })?.items.map((i) => i.entityName)).toEqual(["Matcha"]);
    const vet = { ...group([item("Mocha", "pending", "Vet")]), category: "vet" } as AgendaGroup;
    expect(routinePart(vet, false, { admittedIds })?.items).toHaveLength(1);
  });

  it("keeps a vet visit checked in but not closed open", () => {
    const at = new Date().toISOString();
    const checkIn = { schedule_id: "vet-1", entity_id: "Mocha", sub_type: "check_in", completed_at: at } as TaskLog;
    const visitItem = { ...item("Mocha", "completed", "Vet"), scheduleId: "vet-1", log: checkIn } as AgendaItem;
    const vet = { ...group([visitItem]), category: "vet" } as AgendaGroup;
    expect(routinePart(vet, true, { logs: [checkIn] })).toBeNull();
    expect(routinePart(vet, false, { logs: [checkIn] })).not.toBeNull();
    const out = { ...checkIn, sub_type: "check_out" } as TaskLog;
    expect(routinePart(vet, true, { logs: [checkIn, out] })).not.toBeNull();
  });
});
