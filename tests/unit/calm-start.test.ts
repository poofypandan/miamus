import { describe, expect, it } from "vitest";
import {
  daysBetween,
  homeScreenTipAllowed,
  laterStage,
  parseSetupStage,
  parseWhatsNewWeek,
  petsQuestionAllowed,
  stageFrom,
  whatsNewDecision,
  type WhatsNewInput,
} from "@/lib/calm-start";

const base: WhatsNewInput = {
  id: "bills-2026-11",
  entryDate: "2026-11-09",
  createdOn: "2026-10-01",
  stage: "past",
  today: "2026-11-20",
  week: null,
};

describe("daysBetween", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-11-01", "2026-11-15")).toBe(14);
    expect(daysBetween("2026-11-15", "2026-11-01")).toBe(-14);
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
    expect(Number.isNaN(daysBetween("soon", "2026-11-01"))).toBe(true);
  });
});

describe("whatsNewDecision", () => {
  it("lets an established household's first card of the week claim it", () => {
    expect(whatsNewDecision(base)).toBe("claim");
  });

  it("rule 1: nothing for a household under 14 days old", () => {
    expect(whatsNewDecision({ ...base, createdOn: "2026-11-10", entryDate: "2026-11-12", today: "2026-11-23" })).toBe("hide");
    expect(whatsNewDecision({ ...base, createdOn: "2026-11-10", entryDate: "2026-11-12", today: "2026-11-24" })).toBe("claim");
  });

  it("rule 1: nothing until the first-run checklist is past, however old", () => {
    expect(whatsNewDecision({ ...base, stage: "task" })).toBe("hide");
    expect(whatsNewDecision({ ...base, stage: "new" })).toBe("hide");
    expect(whatsNewDecision({ ...base, stage: null })).toBe("hide");
  });

  it("rule 1: an unknown age counts as new", () => {
    expect(whatsNewDecision({ ...base, createdOn: null })).toBe("hide");
  });

  it("rule 2: never an entry from before the household existed", () => {
    expect(whatsNewDecision({ ...base, createdOn: "2026-11-01", entryDate: "2026-10-31", today: "2026-12-01" })).toBe("hide");
    expect(whatsNewDecision({ ...base, createdOn: "2026-11-01", entryDate: "2026-11-01", today: "2026-12-01" })).toBe("claim");
  });

  it("rule 3: one card a week; the card holding the week keeps showing until closed", () => {
    const week = { id: "bills-2026-11", on: "2026-11-18" };
    expect(whatsNewDecision({ ...base, week })).toBe("show");
    expect(whatsNewDecision({ ...base, id: "couldnt-do-2026-11", week })).toBe("hide");
    expect(whatsNewDecision({ ...base, id: "couldnt-do-2026-11", week, today: "2026-11-24" })).toBe("hide");
    expect(whatsNewDecision({ ...base, id: "couldnt-do-2026-11", week, today: "2026-11-25" })).toBe("claim");
  });

  it("rule 3: a week remembered in the future (a changed clock) doesn't block forever", () => {
    expect(whatsNewDecision({ ...base, id: "x", week: { id: "y", on: "2026-12-30" } })).toBe("claim");
  });
});

describe("setup stage", () => {
  it("reads what Today saw", () => {
    expect(stageFrom({ past: true, taskGiven: false })).toBe("past");
    expect(stageFrom({ past: false, taskGiven: true })).toBe("task");
    expect(stageFrom({ past: false, taskGiven: false })).toBe("new");
  });

  it("never goes backwards", () => {
    expect(laterStage("past", "new")).toBe("past");
    expect(laterStage("task", "past")).toBe("past");
    expect(laterStage(null, "new")).toBe("new");
  });

  it("parses only what it wrote", () => {
    expect(parseSetupStage("task")).toBe("task");
    expect(parseSetupStage("done")).toBeNull();
    expect(parseSetupStage(null)).toBeNull();
  });
});

describe("homeScreenTipAllowed", () => {
  it("rule 5: waits for the first task", () => {
    expect(homeScreenTipAllowed("new")).toBe(false);
    expect(homeScreenTipAllowed(null)).toBe(false);
    expect(homeScreenTipAllowed("task")).toBe(true);
    expect(homeScreenTipAllowed("past")).toBe(true);
  });
});

describe("petsQuestionAllowed", () => {
  it("rule 6: never for a household made since the sign-up question", () => {
    expect(petsQuestionAllowed("2026-11-08")).toBe(true);
    expect(petsQuestionAllowed("2026-11-09")).toBe(false);
    expect(petsQuestionAllowed(null)).toBe(true);
  });
});

describe("parseWhatsNewWeek", () => {
  it("reads the stored week, or nothing", () => {
    expect(parseWhatsNewWeek('{"id":"a","on":"2026-11-10"}')).toEqual({ id: "a", on: "2026-11-10" });
    expect(parseWhatsNewWeek('{"id":"a","on":"tuesday"}')).toBeNull();
    expect(parseWhatsNewWeek("not json")).toBeNull();
    expect(parseWhatsNewWeek(null)).toBeNull();
  });
});
