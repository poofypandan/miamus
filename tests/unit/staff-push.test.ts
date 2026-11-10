import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PushStatus } from "@/lib/push-prompt";
import {
  STAFF_PUSH_MAX_LATER,
  snoozeAfter,
  staffPushCardKind,
  staffPushStatusLabel,
  type PhonePushPeople,
  type StaffPushSnooze,
} from "@/lib/staff-push";
import { WHATS_NEW } from "@/lib/whats-new";

const NOW = Date.UTC(2026, 10, 10, 3, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const SARI = "sari";
const FRESH: StaffPushSnooze = { until: null, later: 0 };

function phone(names: string[] = [], extra: Partial<PhonePushPeople> = {}): PhonePushPeople {
  return {
    people: names.map((id) => ({ staff_id: id, name: id })),
    shared: names.length > 1,
    household_on: true,
    ...extra,
  };
}

function kind(status: PushStatus, overrides: Partial<Parameters<typeof staffPushCardKind>[0]> = {}) {
  return staffPushCardKind({
    status,
    isAdmin: false,
    people: phone(),
    staffId: SARI,
    snooze: FRESH,
    now: NOW,
    ...overrides,
  });
}

describe("staffPushCardKind (D9)", () => {
  it("asks staff to turn notifications on where the phone can", () => {
    expect(kind("off")).toBe("turn-on");
  });

  it("asks the person on duty when the phone already notifies someone else", () => {
    expect(kind("on", { people: phone(["wati"]) })).toBe("turn-on");
    expect(kind("on", { people: phone([SARI]) })).toBeNull();
  });

  it("explains a blocked phone, an iPhone tab and a browser that can't", () => {
    expect(kind("denied")).toBe("blocked");
    expect(kind("ios-install-first")).toBe("ios");
    expect(kind("unsupported")).toBe("unsupported");
  });

  it("never shows to an admin in staff view, before the list loads, or with the switch off", () => {
    expect(kind("off", { isAdmin: true })).toBeNull();
    expect(kind("off", { people: null })).toBeNull();
    expect(kind("off", { staffId: null })).toBeNull();
    expect(kind("off", { people: phone([], { household_on: false }) })).toBeNull();
  });

  it("never shows while loading or where push isn't set up", () => {
    expect(kind("loading")).toBeNull();
    expect(kind("unconfigured")).toBeNull();
  });

  it("'Nanti saja' rests it 14 days; after three, only settings offer it", () => {
    const once = snoozeAfter("off", FRESH, NOW);
    expect(once.later).toBe(1);
    expect(kind("off", { snooze: once, now: NOW + 13 * DAY })).toBeNull();
    expect(kind("off", { snooze: once, now: NOW + 14 * DAY })).toBe("turn-on");
    const third: StaffPushSnooze = { until: NOW, later: STAFF_PUSH_MAX_LATER };
    expect(kind("off", { snooze: third, now: NOW + 100 * DAY })).toBeNull();
  });

  it("'Mengerti' on a blocked phone rests it 30 days without counting as 'Nanti saja'", () => {
    const rested = snoozeAfter("denied", FRESH, NOW);
    expect(rested.later).toBe(0);
    expect(kind("denied", { snooze: rested, now: NOW + 29 * DAY })).toBeNull();
    expect(kind("denied", { snooze: rested, now: NOW + 30 * DAY })).toBe("blocked");
  });
});

describe("staffPushStatusLabel", () => {
  it("says Aktif only when this phone notifies the person on duty", () => {
    expect(staffPushStatusLabel("on", true)).toBe("Aktif");
    expect(staffPushStatusLabel("on", false)).toBe("Mati");
    expect(staffPushStatusLabel("off", false)).toBe("Mati");
    expect(staffPushStatusLabel("denied", false)).toBe("Diblokir");
    expect(staffPushStatusLabel("loading", false)).toBeNull();
  });
});

describe("staff push wording", () => {
  const files = [
    "src/components/staff/staff-push-card.tsx",
    "src/components/staff/staff-push-sheet.tsx",
    "supabase/migrations/141_staff_push.sql",
  ].map((path) => readFileSync(path, "utf8"));

  it("has no emoji in staff screens or push text", () => {
    for (const text of files) expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("follows the glossary: HP and staf, never ponsel or pembantu", () => {
    for (const text of files) {
      expect(text).not.toMatch(/ponsel|pembantu/i);
    }
  });

  it("has an owner What's new entry in both languages", () => {
    const entry = WHATS_NEW.find((e) => e.id === "staff-notifications-2026-11");
    expect(entry?.steps.en.length).toBeGreaterThan(0);
    expect(entry?.steps.id.length).toBe(entry?.steps.en.length);
  });
});
