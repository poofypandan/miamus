// "Who lives here?" (Phase 162): the answer decides the tabs, a stale
// ?module=pets falls back to Today, and Kakak drops pet routines only for a
// household that said it has no pets.

import { describe, expect, it } from "vitest";
import { enabledModules, moduleFromParam } from "@/lib/dashboard-modules";
import { moduleFlagsFrom, petsOnFrom } from "@/hooks/use-household-profile";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { toolsFor } from "@/lib/kakak/engine";
import { renderHouseholdBlock } from "@/lib/kakak/household";

const OWNER = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("pets on or off", () => {
  it("counts only an explicit no as off", () => {
    expect(petsOnFrom(true)).toBe(true);
    expect(petsOnFrom(null)).toBe(true);
    expect(petsOnFrom(false)).toBe(false);
  });

  it("shows four tabs without pets, five otherwise", () => {
    expect(enabledModules(moduleFlagsFrom(false))).toEqual(["agenda", "chores", "inventory", "access"]);
    expect(enabledModules(moduleFlagsFrom(null))).toEqual(["agenda", "chores", "pets", "inventory", "access"]);
    expect(enabledModules(moduleFlagsFrom(true))).toEqual(["agenda", "chores", "pets", "inventory", "access"]);
  });

  it("opens Today for ?module=pets when pets are off", () => {
    expect(moduleFromParam("pets", moduleFlagsFrom(false))).toBe("agenda");
    expect(moduleFromParam("pets", moduleFlagsFrom(null))).toBe("pets");
    expect(moduleFromParam("chores", moduleFlagsFrom(false))).toBe("chores");
  });
});

describe("Kakak and pets switched off", () => {
  const rows: ContextRows = {
    staff: [{ id: id(1), name: "Ari", created_at: "2026-01-01", user_id: null, archived_at: null }],
    pets: [],
    schedules: [],
    rooms: [],
    items: [],
  };
  const opts = { today: "2026-11-11", now: "08:30", ownerLocale: "en" as const, callerUserId: OWNER };

  it("keeps every tool and the same block for a household that never answered or has pets", () => {
    for (const hasPets of [undefined, null, true]) {
      const { household } = buildContext({ ...rows, hasPets }, opts);
      expect(household.petsOff).toBeUndefined();
      expect(toolsFor(household).map((t) => t.name)).toContain("add_pet_routine");
      expect(renderHouseholdBlock(household)).toContain("Pets (current daily times):");
    }
    // Byte-for-byte the block it was before this phase.
    expect(renderHouseholdBlock(buildContext({ ...rows, hasPets: true }, opts).household)).toBe(
      renderHouseholdBlock(buildContext(rows, opts).household)
    );
  });

  it("drops pet routines and says so when the owner switched pets off", () => {
    const { household } = buildContext({ ...rows, hasPets: false }, opts);
    expect(household.petsOff).toBe(true);
    const names = toolsFor(household).map((t) => t.name);
    expect(names).not.toContain("add_pet_routine");
    expect(names).toContain("create_chore");
    const block = renderHouseholdBlock(household);
    expect(block).toContain("Pets: switched off for this household");
    expect(block).not.toContain("Pets (current daily times):");
  });
});
