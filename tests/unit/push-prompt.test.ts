import { describe, expect, it } from "vitest";
import { shouldShowPushPrompt, snoozeDays, snoozeUntil, type PushStatus } from "@/lib/push-prompt";

const NOW = Date.UTC(2026, 10, 10, 3, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

describe("shouldShowPushPrompt", () => {
  it("asks where push is off, and where it is blocked", () => {
    expect(shouldShowPushPrompt("off", null, NOW, false)).toBe(true);
    expect(shouldShowPushPrompt("denied", null, NOW, false)).toBe(true);
  });

  it("never asks while loading, when on, or where nothing can be done", () => {
    for (const status of ["loading", "on", "unsupported", "unconfigured"] as PushStatus[]) {
      expect(shouldShowPushPrompt(status, null, NOW, false)).toBe(false);
    }
  });

  it("on an iPhone tab, waits for the Add to Home Screen tip to be closed", () => {
    expect(shouldShowPushPrompt("ios-install-first", null, NOW, true)).toBe(false);
    expect(shouldShowPushPrompt("ios-install-first", null, NOW, false)).toBe(true);
  });

  it("stays away while put off, and comes back after", () => {
    const until = snoozeUntil("off", NOW);
    expect(shouldShowPushPrompt("off", until, NOW + 6 * DAY, false)).toBe(false);
    expect(shouldShowPushPrompt("off", until, NOW + 7 * DAY, false)).toBe(true);
  });
});

describe("snooze", () => {
  it("is a week for Not now and a month when blocked", () => {
    expect(snoozeDays("off")).toBe(7);
    expect(snoozeDays("ios-install-first")).toBe(7);
    expect(snoozeDays("denied")).toBe(30);
    expect(snoozeUntil("denied", NOW)).toBe(NOW + 30 * DAY);
  });
});
