import { describe, expect, it } from "vitest";
import { CANCELLED_NOTE_PREFIX, displayLogNote } from "@/lib/log-notes";
import { describeLog } from "@/lib/schedule-categories";

describe("displayLogNote", () => {
  it("drops the emoji from cancellation notices written before it was removed", () => {
    expect(displayLogNote("❌ Jadwal Dibatalkan: Grooming")).toBe("Jadwal Dibatalkan: Grooming");
    expect(displayLogNote("❌️ Jadwal Dibatalkan: Grooming")).toBe("Jadwal Dibatalkan: Grooming");
  });

  it("leaves new notices and staff notes as they are", () => {
    expect(displayLogNote(`${CANCELLED_NOTE_PREFIX} Grooming`)).toBe("Jadwal Dibatalkan: Grooming");
    expect(displayLogNote("Pipis Ekstra — ❌ muntah sedikit")).toBe("Pipis Ekstra — ❌ muntah sedikit");
    expect(displayLogNote(null)).toBeNull();
  });

  it("gives old and new cancellation rows the same title in the feed", () => {
    const old = describeLog({ schedule_id: null, notes: "❌ Jadwal Dibatalkan: Grooming" }, []);
    const now = describeLog({ schedule_id: null, notes: "Jadwal Dibatalkan: Grooming" }, []);
    expect(old).toEqual(now);
    expect(now.title).toBe("Jadwal Dibatalkan: Grooming");
  });
});
