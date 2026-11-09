import { describe, expect, it } from "vitest";
import { exportFileName } from "@/lib/household-export";

describe("exportFileName", () => {
  const day = new Date(2026, 10, 8, 9, 0);

  it("names the file after the household and the day", () => {
    expect(exportFileName("Rumah Kenanga", day)).toBe("miamus-rumah-kenanga-2026-11-08.json");
  });

  it("drops accents and punctuation", () => {
    expect(exportFileName("Café d'Été — Bali!", day)).toBe("miamus-cafe-d-ete-bali-2026-11-08.json");
  });

  it("falls back when the name has nothing usable", () => {
    expect(exportFileName("🏠🐶", day)).toBe("miamus-household-2026-11-08.json");
    expect(exportFileName(null, day)).toBe("miamus-household-2026-11-08.json");
  });

  it("keeps long names short", () => {
    const name = exportFileName("a".repeat(30) + " " + "b".repeat(30), day);
    expect(name.length).toBeLessThanOrEqual("miamus-".length + 40 + "-2026-11-08.json".length);
    expect(name).not.toMatch(/--/);
  });
});
