import { describe, expect, it } from "vitest";
import {
  AREAS,
  areaHasNobody,
  effectiveAreas,
  hiddenAreasOf,
  sees,
  showsChore,
  showsRoutine,
  staffVisibility,
  withArea,
} from "@/lib/staff-areas";
import type { LeaveRequest, StaffProfile } from "@/types/database";

// What each staff member sees (Phase 178, step 1). The rules are in
// docs/phase-178-staff-areas-plan.md, section 3, and lib/staff-areas.ts.

const DAY = "2026-11-14";

function person(id: string, over: Partial<StaffProfile> = {}): StaffProfile {
  return {
    id,
    household_id: "h",
    name: id,
    has_pin: true,
    created_at: "2026-10-01T00:00:00Z",
    user_id: null,
    archived_at: null,
    hidden_areas: [],
    ...over,
  };
}

function leave(staffId: string, over: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: `leave-${staffId}`,
    household_id: "h",
    staff_id: staffId,
    start_date: "2026-11-13",
    end_date: "2026-11-15",
    status: "approved",
    fallback_action: "unassign",
    fallback_assignee_id: null,
    ended_on: null,
    decided_by: null,
    decided_at: null,
    created_at: "2026-11-01T00:00:00Z",
    ...over,
  };
}

const ari = person("ari"); // chores and kitchen: everything on
const syam = person("syam", { hidden_areas: ["home", "kitchen", "repairs"] }); // pets only
const owner = person("owner", { user_id: "auth-owner", hidden_areas: ["home", "pets", "kitchen", "repairs"] });

const list = (set: Set<string>) => AREAS.filter((a) => set.has(a));

describe("areas a person has", () => {
  it("nothing hidden sees all four", () => {
    expect(list(effectiveAreas(ari, [ari, syam], [], DAY))).toEqual(["home", "pets", "kitchen", "repairs"]);
    expect(staffVisibility(ari, [ari, syam], [], DAY)).toEqual({
      home: true, pets: true, kitchen: true, repairs: true, lapor: true,
    });
  });

  it.each(AREAS)("only %s off hides only that area", (area) => {
    const p = person("p", { hidden_areas: [area] });
    // Ari keeps everything on, so rule 3 never steps in here.
    const v = staffVisibility(p, [p, ari], [], DAY);
    for (const other of AREAS) expect(v[other]).toBe(other !== area);
  });

  it("a row without the column (an older build's cache) sees everything", () => {
    const old = { id: "old", household_id: "h", name: "Old", has_pin: true, created_at: "" } as StaffProfile;
    expect(hiddenAreasOf(old)).toEqual([]);
    expect(list(effectiveAreas(old, [old], [], DAY))).toEqual([...AREAS]);
  });

  it("unknown stored values are ignored", () => {
    expect(hiddenAreasOf(person("x", { hidden_areas: ["garden", "kitchen"] }))).toEqual(["kitchen"]);
  });

  it("an owner's roster row sees everything, whatever is stored on it", () => {
    expect(hiddenAreasOf(owner)).toEqual([]);
    expect(staffVisibility(owner, [owner, syam], [], DAY)).toMatchObject({
      home: true, pets: true, kitchen: true, repairs: true,
    });
  });
});

describe("rule 1: what you give someone by name always shows", () => {
  it("a chore assigned to the person shows with home off", () => {
    const v = staffVisibility(syam, [ari, syam], [], DAY);
    expect(v.home).toBe(false);
    expect(showsChore("syam", "syam", v)).toBe(true);
  });

  it("a chore assigned to someone else never shows (as before)", () => {
    const v = staffVisibility(ari, [ari, syam], [], DAY);
    expect(showsChore("syam", "ari", v)).toBe(false);
  });

  it("a routine set for the person shows with pets off", () => {
    const v = staffVisibility(ari, [ari, person("budi")], [], DAY);
    const ariNoPets = person("ari", { hidden_areas: ["pets"] });
    const v2 = staffVisibility(ariNoPets, [ariNoPets, syam], [], DAY);
    expect(v.pets).toBe(true);
    expect(v2.pets).toBe(false);
    expect(showsRoutine("ari", "ari", v2)).toBe(true);
  });
});

describe("rule 2: work for Anyone goes to the people with that area on", () => {
  it("a chore for Anyone shows only with home", () => {
    expect(showsChore(null, "ari", staffVisibility(ari, [ari, syam], [], DAY))).toBe(true);
    expect(showsChore(null, "syam", staffVisibility(syam, [ari, syam], [], DAY))).toBe(false);
  });

  it("a routine for nobody in particular, or for someone else, shows only with pets", () => {
    const ariNoPets = person("ari", { hidden_areas: ["pets"] });
    const staff = [ariNoPets, syam];
    expect(showsRoutine(null, "syam", staffVisibility(syam, staff, [], DAY))).toBe(true);
    expect(showsRoutine(null, "ari", staffVisibility(ariNoPets, staff, [], DAY))).toBe(false);
    expect(showsRoutine("syam", "ari", staffVisibility(ariNoPets, staff, [], DAY))).toBe(false);
  });
});

describe("rule 3: nothing is hidden from everybody", () => {
  const ariNoPets = person("ari", { hidden_areas: ["pets"] });

  it("nobody has pets on: pet routines show to all staff", () => {
    const syamNoPets = person("syam", { hidden_areas: ["pets", "home"] });
    const staff = [ariNoPets, syamNoPets];
    expect(areaHasNobody("pets", staff, [], DAY)).toBe(true);
    expect(sees("pets", ariNoPets, staff, [], DAY)).toBe(true);
    expect(sees("pets", syamNoPets, staff, [], DAY)).toBe(true);
  });

  it("the only person with pets on is on leave that day: everyone sees them that day only", () => {
    const staff = [ariNoPets, syam];
    const away = [leave("syam")];
    expect(sees("pets", ariNoPets, staff, away, DAY)).toBe(true);
    expect(sees("pets", ariNoPets, staff, away, "2026-11-16")).toBe(false);
  });

  it("the only person with home on is archived: chores for Anyone show to all", () => {
    const gone = person("ari", { archived_at: "2026-11-01T00:00:00Z" });
    const staff = [gone, syam];
    expect(areaHasNobody("home", staff, [], DAY)).toBe(true);
    expect(staffVisibility(syam, staff, [], DAY).home).toBe(true);
  });

  it("an owner's row does not count as someone with the area", () => {
    const staff = [owner, syam];
    expect(areaHasNobody("home", staff, [], DAY)).toBe(true);
  });

  it("does not apply to kitchen or repairs", () => {
    const a = person("a", { hidden_areas: ["kitchen", "repairs"] });
    const b = person("b", { hidden_areas: ["kitchen", "repairs"] });
    expect(areaHasNobody("kitchen", [a, b], [], DAY)).toBe(false);
    expect(areaHasNobody("repairs", [a, b], [], DAY)).toBe(false);
    expect(staffVisibility(a, [a, b], [], DAY)).toMatchObject({ kitchen: false, repairs: false });
  });

  it("someone covering brings the area, so it is not 'nobody'", () => {
    // Syam (pets only) covers Ari (everything): Syam brings home that day.
    const staff = [ari, syam];
    const away = [leave("ari", { fallback_action: "reassign", fallback_assignee_id: "syam" })];
    expect(areaHasNobody("home", staff, away, DAY)).toBe(false);
  });
});

describe("rule 4: covering someone brings their areas, for those days only", () => {
  const away = [leave("ari", { fallback_action: "reassign", fallback_assignee_id: "syam" })];

  it("the cover person sees what the absent person sees during the leave", () => {
    const v = staffVisibility(syam, [ari, syam], away, DAY);
    expect(v).toMatchObject({ home: true, pets: true, kitchen: true, repairs: true });
  });

  it("not before or after the leave", () => {
    expect(staffVisibility(syam, [ari, syam], away, "2026-11-12").kitchen).toBe(false);
    expect(staffVisibility(syam, [ari, syam], away, "2026-11-16").kitchen).toBe(false);
  });

  it("not after coming back early", () => {
    const back = [{ ...away[0], status: "ended_early" as const, ended_on: DAY }];
    expect(staffVisibility(syam, [ari, syam], back, DAY).kitchen).toBe(false);
  });

  it("only for a leave that gives the work to this person", () => {
    const toBudi = [leave("ari", { fallback_action: "reassign", fallback_assignee_id: "budi" })];
    const unassigned = [leave("ari", { fallback_action: "unassign" })];
    const pending = [leave("ari", { status: "pending", fallback_action: "reassign", fallback_assignee_id: "syam" })];
    for (const l of [toBudi, unassigned, pending]) {
      expect(staffVisibility(syam, [ari, syam, person("budi")], l, DAY).kitchen).toBe(false);
    }
  });
});

describe("rule 5: a shared phone follows whoever is signed in", () => {
  it("the same data gives each person their own view", () => {
    const staff = [ari, syam];
    const forAri = staffVisibility(ari, staff, [], DAY);
    const forSyam = staffVisibility(syam, staff, [], DAY);
    expect(forAri).toMatchObject({ kitchen: true, repairs: true, home: true });
    expect(forSyam).toMatchObject({ kitchen: false, repairs: false, home: false, pets: true });
  });

  it("nobody signed in yet: everything, as the staff app always showed", () => {
    expect(staffVisibility(null, [ari, syam], [], DAY)).toMatchObject({
      home: true, pets: true, kitchen: true, repairs: true,
    });
  });
});

describe("rule 6 (owner's list): Lapor stays whole for everyone", () => {
  it("with all four off, Lapor is still there", () => {
    const none = person("n", { hidden_areas: [...AREAS] });
    expect(staffVisibility(none, [none, ari], [], DAY).lapor).toBe(true);
  });
});

describe("withArea: the stored list after a switch", () => {
  it("adds and removes in AREAS order, dropping unknown values", () => {
    expect(withArea([], "repairs", false)).toEqual(["repairs"]);
    expect(withArea(["repairs"], "home", false)).toEqual(["home", "repairs"]);
    expect(withArea(["home", "repairs", "garden"], "home", true)).toEqual(["repairs"]);
    expect(withArea(null, "pets", true)).toEqual([]);
  });
});

describe("occurrencesForStaff with the home switch (Phase 178)", () => {
  it("keeps the person's own chores and drops Anyone's only when home is off", async () => {
    const { occurrencesForStaff } = await import("@/lib/chore-recurrence");
    const occ = (assigned_to: string | null) =>
      ({ task: { assigned_to } }) as unknown as Parameters<typeof occurrencesForStaff>[0][number];
    const all = [occ("ari"), occ(null), occ("syam")];
    expect(occurrencesForStaff(all, "ari").map((o) => o.task.assigned_to)).toEqual(["ari", null]);
    expect(occurrencesForStaff(all, "ari", true).map((o) => o.task.assigned_to)).toEqual(["ari", null]);
    expect(occurrencesForStaff(all, "ari", false).map((o) => o.task.assigned_to)).toEqual(["ari"]);
  });
});
