import { describe, expect, it } from "vitest";
import { ownerAlertTimeAllowed, reminderTimeAllowed, switchState } from "@/lib/routine-alerts";
import { draftFromRows, newDraft, planRoutineSave } from "@/lib/routine-groups";
import type { MasterSchedule } from "@/types/database";

// Phase 173 PR C (D7, D15): the sheet's rules must match migrations/150's
// notify_routines_due.

describe("reminderTimeAllowed (staff reminders ring 06:00 to 21:59)", () => {
  it.each([
    ["06:00", true],
    ["21:30", true],
    ["21:59", true],
    ["22:00", false],
    ["23:30", false],
    ["00:00", false],
    ["05:59", false],
  ])("%s → %s", (time, ok) => {
    expect(reminderTimeAllowed(time)).toBe(ok);
  });

  it("reads the database's HH:mm:ss too", () => {
    expect(reminderTimeAllowed("21:30:00")).toBe(true);
  });

  it("is false for something that isn't a time", () => {
    expect(reminderTimeAllowed("")).toBe(false);
  });
});

describe("ownerAlertTimeAllowed (alerts 30 minutes later, 06:00 to 22:30)", () => {
  it.each([
    ["05:29", false],
    ["05:30", true],
    ["21:30", true],
    ["22:00", true],
    ["22:01", false],
    ["23:00", false],
  ])("%s → %s", (time, ok) => {
    expect(ownerAlertTimeAllowed(time)).toBe(ok);
  });
});

describe("switchState", () => {
  it("is ok when every time can use it, some when only some can, none when none can", () => {
    expect(switchState(["21:30"], reminderTimeAllowed)).toBe("ok");
    expect(switchState(["21:30", "22:30"], reminderTimeAllowed)).toBe("some");
    expect(switchState(["22:30"], reminderTimeAllowed)).toBe("none");
    expect(switchState([], reminderTimeAllowed)).toBe("ok");
  });
});

describe("the switches on a routine's rows", () => {
  const MONDAY = "2026-11-09";
  const base = {
    groupId: "g1",
    onceStart: new Date(`${MONDAY}T00:00:00`).toISOString(),
    nowIso: new Date(`${MONDAY}T10:00:00`).toISOString(),
    today: MONDAY,
  };

  it("are off by default", () => {
    const draft = newDraft("lights", ["mocha", "matcha"], MONDAY);
    expect(draft.remindStaff).toBe(false);
    expect(draft.alertOwners).toBe(false);
    const plan = planRoutineSave({ ...base, draft, existing: [] });
    expect(plan.create.every((c) => c.remind_staff === false && c.alert_owners === false)).toBe(true);
  });

  it("go on every row of the group when turned on", () => {
    const draft = { ...newDraft("lights", ["mocha", "matcha"], MONDAY), remindStaff: true, alertOwners: true };
    const plan = planRoutineSave({ ...base, draft, existing: [] });
    expect(plan.create).toHaveLength(2);
    expect(plan.create.every((c) => c.remind_staff === true && c.alert_owners === true)).toBe(true);
  });

  it("are saved off when no time can use them (greyed in the sheet)", () => {
    const draft = { ...newDraft("lights", ["mocha"], MONDAY), times: ["22:30"], remindStaff: true, alertOwners: true };
    const plan = planRoutineSave({ ...base, draft, existing: [] });
    expect(plan.create[0]).toMatchObject({ remind_staff: false, alert_owners: false });
  });

  it("stay on when only some times can use them", () => {
    const draft = { ...newDraft("lights", ["mocha"], MONDAY), times: ["21:30", "22:30"], remindStaff: true };
    const plan = planRoutineSave({ ...base, draft, existing: [] });
    expect(plan.create.every((c) => c.remind_staff === true)).toBe(true);
  });

  it("are read back from the rows for editing, and turned off on every row", () => {
    const rowOf = (id: string, entity_id: string): MasterSchedule => ({
      id,
      entity_id,
      title: "Matikan lampu",
      module: "pet",
      frequency_type: "fixed_time",
      interval_hours: null,
      fixed_times: ["21:30"],
      start_time: null,
      end_time: null,
      is_active: true,
      expires_at: null,
      created_at: "2026-11-01T08:00:00+07:00",
      kind: "lights",
      routine_group_id: "g1",
      proof: "photo",
      remind_staff: true,
      alert_owners: true,
    });
    const rows = [rowOf("r1", "mocha"), rowOf("r2", "matcha")];
    const draft = draftFromRows(rows, MONDAY);
    expect(draft.remindStaff).toBe(true);
    expect(draft.alertOwners).toBe(true);
    const plan = planRoutineSave({ ...base, draft: { ...draft, remindStaff: false }, existing: rows });
    expect(plan.update).toHaveLength(2);
    expect(plan.update.every((u) => u.patch.remind_staff === false && u.patch.alert_owners === true)).toBe(true);
  });

  it("read as off on rows from before the migration", () => {
    const draft = draftFromRows(
      [
        {
          id: "r1",
          entity_id: "mocha",
          title: "Sisir bulu",
          module: "pet",
          frequency_type: "fixed_time",
          interval_hours: null,
          fixed_times: ["08:00"],
          start_time: null,
          end_time: null,
          is_active: true,
          expires_at: null,
          created_at: "2026-11-01T08:00:00+07:00",
        },
      ],
      MONDAY
    );
    expect(draft.remindStaff).toBe(false);
    expect(draft.alertOwners).toBe(false);
  });
});
