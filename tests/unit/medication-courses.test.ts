import { describe, expect, it } from "vitest";
import { medicationCourseAlerts, shiftDay } from "@/lib/medication-courses";
import type { MasterSchedule } from "@/types/database";
import { MOCHI, schedule } from "../fixtures/household";

const today = "2026-11-03";

function med(label: string, created: string, expires: string | null, time = "08:00"): MasterSchedule {
  return schedule(MOCHI, `Medication: ${label}`, [time], {
    expires_at: expires,
    created_at: `${created}T09:00:00+07:00`,
  });
}
const run = (schedules: MasterSchedule[]) =>
  medicationCourseAlerts({ schedules, pets: [MOCHI], today });

describe("medicationCourseAlerts (Phase 144)", () => {
  it("a course whose last dose is today is ending, with 0 days left", () => {
    const [alert] = run([med("A", "2026-10-30", "2026-11-03")]);
    expect(alert?.kind).toBe("ending");
    expect(alert?.kind === "ending" && alert.daysLeft).toBe(0);
  });

  it("two dose times of one medicine are one course", () => {
    const [alert] = run([
      med("A", "2026-10-30", "2026-11-03"),
      med("A", "2026-10-30", "2026-11-03", "20:00"),
    ]);
    expect(alert?.courses).toHaveLength(1);
    expect(alert?.courses[0].schedules).toHaveLength(2);
  });

  it("speaks up three days ahead, not four", () => {
    expect(run([med("B", "2026-10-30", "2026-11-07")])).toHaveLength(0);
    expect(run([med("B", "2026-10-30", "2026-11-06")])[0]?.kind).toBe("ending");
  });

  it("a restarted course silences the old one", () => {
    expect(run([med("C", "2026-10-01", "2026-10-25"), med("C", "2026-11-03", "2026-11-20")])).toHaveLength(0);
  });

  it("only the latest course of a medicine speaks", () => {
    const alerts = run([med("D", "2026-10-01", "2026-10-25"), med("D", "2026-11-01", "2026-11-04")]);
    expect(alerts.map((a) => a.kind)).toEqual(["ending"]);
  });

  it("an open-ended course supersedes a dated one", () => {
    expect(run([med("E", "2026-10-01", "2026-10-25"), med("E", "2026-10-26", null)])).toHaveLength(0);
  });

  it("a course approved after its last day never ran, and is listed first", () => {
    expect(run([med("F", "2026-10-20", "2026-10-19")])[0]?.kind).toBe("never_ran");
    expect(
      run([med("G", "2026-10-30", "2026-11-04"), med("F", "2026-10-20", "2026-10-19")])[0]?.kind
    ).toBe("never_ran");
  });

  it("stays quiet about courses that ended more than 30 days ago", () => {
    expect(run([med("H", "2026-09-01", "2026-10-03")])).toHaveLength(0);
    expect(run([med("H", "2026-09-01", "2026-10-04")])[0]?.kind).toBe("ended");
  });

  it("ignores schedules for pets it was not given", () => {
    expect(
      medicationCourseAlerts({ schedules: [med("I", "2026-10-30", "2026-11-03")], pets: [], today })
    ).toHaveLength(0);
  });
});

describe("shiftDay", () => {
  it("crosses a month boundary", () => {
    expect(shiftDay("2026-10-30", 6)).toBe("2026-11-05");
  });
});
