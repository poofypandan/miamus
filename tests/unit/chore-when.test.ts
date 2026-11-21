import { describe, expect, it } from "vitest";
import { choreWhenSummary } from "@/lib/chore-when";

// Saturday 21 November 2026, at noon on the phone.
const NOW = new Date("2026-11-21T12:00:00");
const base = { date: "2026-11-21", time: "", recurrence: "none" as const, interval: 1, until: "" };

describe("Add Chore's When row", () => {
  it("reads a one-off back in words", () => {
    expect(choreWhenSummary(base, "en", NOW)).toBe("Today, once");
    expect(choreWhenSummary(base, "id", NOW)).toBe("Hari ini, sekali");
    expect(choreWhenSummary({ ...base, date: "2026-11-22", time: "09:00:00" }, "en", NOW)).toBe("Tomorrow at 09:00, once");
    expect(choreWhenSummary({ ...base, date: "2026-11-22", time: "09:00" }, "id", NOW)).toBe("Besok pukul 09.00, sekali");
  });

  it("reads a repeat by its day", () => {
    // 23 Nov 2026 is a Monday.
    expect(choreWhenSummary({ ...base, date: "2026-11-23", recurrence: "weekly", time: "09:00" }, "en", NOW)).toBe(
      "Every Monday at 09:00, from Nov 23"
    );
    expect(choreWhenSummary({ ...base, recurrence: "weekly" }, "id", NOW)).toBe("Setiap Sabtu");
    expect(choreWhenSummary({ ...base, recurrence: "daily" }, "en", NOW)).toBe("Every day");
    expect(choreWhenSummary({ ...base, recurrence: "monthly" }, "en", NOW)).toBe("Every month, on the 21st");
    expect(choreWhenSummary({ ...base, recurrence: "monthly" }, "id", NOW)).toBe("Setiap bulan, tanggal 21");
    expect(choreWhenSummary({ ...base, recurrence: "weekly", interval: 2 }, "en", NOW)).toBe("Every 2 weeks");
  });

  it("says when a repeat starts later and when it ends", () => {
    expect(choreWhenSummary({ ...base, date: "2026-11-22", recurrence: "daily", until: "2026-12-30" }, "en", NOW)).toBe(
      "Every day, from tomorrow, until Dec 30"
    );
    expect(choreWhenSummary({ ...base, date: "2026-11-22", recurrence: "daily" }, "id", NOW)).toBe("Setiap hari, mulai besok");
  });
});
