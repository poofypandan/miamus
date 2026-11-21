import { describe, expect, it } from "vitest";
import { finishedEntries } from "@/lib/unified-agenda";
import type { AgendaGroup, AgendaItem } from "@/lib/scheduleEngine";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";

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
