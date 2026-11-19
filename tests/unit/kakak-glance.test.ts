import { describe, expect, it } from "vitest";
import { choreGlance } from "@/lib/kakak/describe";
import type { ChoreSuggestion } from "@/lib/kakak/suggestions";

// Kakak's chore card, short by default (19 Nov, product change #1).

const chore: ChoreSuggestion = {
  kind: "chore",
  title: "Pel teras",
  titleEn: "Mop the terrace",
  category: "cleaning",
  assignedTo: "s1",
  assignToSelf: false,
  assigneeName: "Ari",
  dueDate: "2026-11-16",
  dueTime: "09:00",
  recurrence: "weekly",
  recurrenceUntil: null,
  requiresSupervision: false,
  locationId: "r1",
  roomName: "Teras",
  newRoomName: null,
  newRoomFloorId: null,
  newRoomFloorName: null,
  notes: null,
  remindDaysBefore: null,
};

const labels = (rows: { label: string }[]) => rows.map((r) => r.label);
const value = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)?.value;

describe("choreGlance", () => {
  it("shows What, Who and When, the repeat folded into When, in both languages", () => {
    const en = choreGlance(chore, "en", true);
    expect(labels(en.rows)).toEqual(["What", "Who", "When"]);
    expect(value(en.rows, "What")).toBe("Pel teras (Mop the terrace)");
    expect(value(en.rows, "When")).toBe("Every Monday, 09:00");
    const id = choreGlance(chore, "id", true);
    expect(labels(id.rows)).toEqual(["Apa", "Siapa", "Kapan"]);
    expect(value(id.rows, "Kapan")).toBe("Setiap Senin, 09.00");
  });

  it("keeps the first day, the room the name says, and the rest under Change; being there stays", () => {
    const { rows, more } = choreGlance(
      { ...chore, requiresSupervision: true, notes: "Pakai cairan pel", remindDaysBefore: 1 },
      "en",
      true
    );
    expect(more).toEqual([
      { label: "Starts", value: "Monday 16 Nov" },
      { label: "Room", value: "Teras" },
      { label: "Notes", value: "Pakai cairan pel" },
      { label: "Remind me", value: "1 day before" },
    ]);
    expect(labels(rows)).toEqual(["What", "Who", "When", "You"]);
  });

  it("a one-time chore says its day; an end date comes after the time", () => {
    expect(value(choreGlance({ ...chore, recurrence: "none" }, "en").rows, "When")).toBe("Monday 16 Nov, 09:00");
    expect(choreGlance({ ...chore, recurrence: "none" }, "en").more.map((r) => r.label)).not.toContain("Starts");
    expect(value(choreGlance({ ...chore, recurrence: "daily", dueTime: null }, "id").rows, "Kapan")).toBe("Setiap hari");
    expect(value(choreGlance({ ...chore, recurrenceUntil: "2026-12-21" }, "en").rows, "When")).toBe(
      "Every Monday, 09:00, until Monday 21 Dec"
    );
    expect(value(choreGlance({ ...chore, recurrence: "monthly" }, "en").rows, "When")).toBe("Every month on the 16th, 09:00");
  });

  it("shows the room on the card when the name doesn't say it, and always a new one", () => {
    expect(labels(choreGlance(chore, "en", false).rows)).toEqual(["What", "Who", "When", "Room"]);
    expect(labels(choreGlance(chore, "en", true).rows)).toEqual(["What", "Who", "When"]);
    const created = choreGlance({ ...chore, roomName: null, newRoomName: "Teras", locationId: null }, "id", true);
    expect(value(created.rows, "Ruangan")).toBe("Teras (ruangan baru)");
  });
});
