import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGETS,
  atLeast,
  atMost,
  formatMinutes,
  parseNorthStar,
  percent,
  share,
  signalTiles,
} from "@/lib/north-star";

// What platform_north_star() answers (migrations/142), trimmed to two weeks.
const answer = {
  as_of: "2026-11-10",
  weeks_requested: 2,
  targets: { s1_setup_minutes: 10, s2_typed_fields: 10, s3_share: 0.9, s4_share: 0.7, s5_share: 0.5 },
  summary: {
    households: 4,
    first_finish_minutes: 135.5,
    same_day: 3,
    same_day_of: 4,
    signup_minutes: 600,
    setup_households: 2,
    setup_minutes: 7.5,
    typed_fields: 8,
    hand_items_14d: 64,
    hand_items_14d_of: 2,
    s3_due: 200,
    s3_closed: 170,
    s4_active: 1,
    s4_of: 2,
    s5_repeat: 0,
    s5_of: 0,
  },
  weeks: [
    { week_start: "2026-11-02", households: 3, paths: { template: 2, kakak: 0, manual: 0, mixed: 0 }, s3_due: 90, s3_closed: 80 },
    { week_start: "2026-11-09", households: 1, paths: {}, s3_due: 10, s3_closed: 9 },
  ],
};

describe("parseNorthStar", () => {
  it("reads the database's answer", () => {
    const report = parseNorthStar(answer);
    expect(report).not.toBeNull();
    expect(report!.asOf).toBe("2026-11-10");
    expect(report!.summary).toMatchObject({ households: 4, firstFinishMinutes: 135.5, typedFields: 8, s3Due: 200 });
    expect(report!.targets).toEqual(DEFAULT_TARGETS);
  });

  it("puts the newest week first and fills missing numbers with zero", () => {
    const report = parseNorthStar(answer)!;
    expect(report.weeks.map((w) => w.weekStart)).toEqual(["2026-11-09", "2026-11-02"]);
    expect(report.weeks[0].paths).toEqual({ template: 0, kakak: 0, manual: 0, mixed: 0 });
    expect(report.weeks[0].firstFinishMinutes).toBeNull();
    expect(report.weeks[1].paths.template).toBe(2);
  });

  it("reads Postgres numerics sent as text", () => {
    const report = parseNorthStar({ ...answer, summary: { ...answer.summary, setup_minutes: "7.5", households: "4" } })!;
    expect(report.summary.setupMinutes).toBe(7.5);
    expect(report.summary.households).toBe(4);
  });

  it("refuses what isn't a report, and drops broken weeks", () => {
    expect(parseNorthStar(null)).toBeNull();
    expect(parseNorthStar([])).toBeNull();
    expect(parseNorthStar({ summary: {} })).toBeNull();
    expect(parseNorthStar({ ...answer, as_of: "yesterday" })).toBeNull();
    const report = parseNorthStar({ ...answer, weeks: [{ households: 1 }, "x", ...answer.weeks] })!;
    expect(report.weeks).toHaveLength(2);
  });

  it("never lets a count go negative or fractional", () => {
    const report = parseNorthStar({ ...answer, summary: { ...answer.summary, households: -3, s3_due: 9.7 } })!;
    expect(report.summary.households).toBe(0);
    expect(report.summary.s3Due).toBe(9);
  });

  it("falls back to the evaluation's targets", () => {
    const report = parseNorthStar({ ...answer, targets: { s3_share: 0.95 } })!;
    expect(report.targets).toEqual({ ...DEFAULT_TARGETS, s3Share: 0.95 });
  });
});

describe("share and percent", () => {
  it("divides, or says there is nothing to divide", () => {
    expect(share(170, 200)).toBe(0.85);
    expect(share(0, 0)).toBeNull();
    expect(share(5, 4)).toBe(1);
    expect(percent(0.854)).toBe("85%");
    expect(percent(null)).toBeNull();
  });
});

describe("atLeast and atMost", () => {
  it("compares with the target, and says when there's no data", () => {
    expect(atLeast(0.9, 0.9)).toBe("met");
    expect(atLeast(0.89, 0.9)).toBe("below");
    expect(atLeast(null, 0.9)).toBe("none");
    expect(atMost(10, 10)).toBe("met");
    expect(atMost(11, 10)).toBe("below");
    expect(atMost(null, 10)).toBe("none");
  });
});

describe("formatMinutes", () => {
  it("says minutes the way people do", () => {
    expect(formatMinutes(0.4)).toBe("< 1 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(125)).toBe("2 h 5 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(60 * 24 * 3 + 60 * 4)).toBe("3 d 4 h");
    expect(formatMinutes(60 * 24 * 2)).toBe("2 d");
    expect(formatMinutes(125, "id")).toBe("2 j 5 mnt");
    expect(formatMinutes(null)).toBeNull();
    expect(formatMinutes(-5)).toBeNull();
  });
});

describe("signalTiles", () => {
  it("makes the five tiles from the summary", () => {
    const tiles = signalTiles(parseNorthStar(answer)!);
    expect(tiles.map((t) => t.key)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(tiles[0]).toMatchObject({ value: "75%", status: "met", part: 3, whole: 4 });
    expect(tiles[1]).toMatchObject({ value: "8", status: "met", part: 2, whole: 4 });
    expect(tiles[2]).toMatchObject({ value: "85%", status: "below", part: 170, whole: 200 });
    expect(tiles[3]).toMatchObject({ value: "50%", status: "below" });
    expect(tiles[4]).toMatchObject({ value: null, status: "none" });
  });

  it("has no S2 number until setup rows exist", () => {
    const tiles = signalTiles(parseNorthStar({ ...answer, summary: { ...answer.summary, typed_fields: null } })!);
    expect(tiles[1]).toMatchObject({ value: null, status: "none" });
  });
});
