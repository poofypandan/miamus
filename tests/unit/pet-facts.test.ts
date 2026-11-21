import { describe, expect, it } from "vitest";
import { firstName, latestWeight, lookedAfterBy, nextVaccine } from "@/lib/pet-facts";
import type { MasterSchedule, MedicalRecord } from "@/types/database";

let n = 0;
const record = (over: Partial<MedicalRecord>): MedicalRecord => ({
  id: `r${++n}`,
  entity_id: "p",
  record_type: "vaccine",
  title: "Rabies",
  administered_at: null,
  next_due_date: null,
  document_photo_url: null,
  notes: null,
  value: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});
const schedule = (over: Partial<MasterSchedule>) => ({ id: `s${++n}`, entity_id: "p", is_active: true, staff_id: null, ...over }) as MasterSchedule;

describe("a pet's facts that Miamus works out", () => {
  it("takes the newest weight", () => {
    expect(latestWeight([])).toBeNull();
    expect(
      latestWeight([
        record({ record_type: "weight", value: 4.0, administered_at: "2026-09-01" }),
        record({ record_type: "weight", value: 4.2, administered_at: "2026-11-02" }),
        record({ record_type: "vet", administered_at: "2026-11-10" }),
      ])
    ).toEqual({ kg: 4.2, on: "2026-11-02" });
  });

  it("finds the next vaccine from each vaccine's newest record, late once its date has passed", () => {
    const today = "2026-11-21";
    const records = [
      record({ title: "Rabies", administered_at: "2025-01-10", next_due_date: "2026-01-10" }),
      // Renewed: the old due date no longer counts.
      record({ title: "rabies ", administered_at: "2026-01-12", next_due_date: "2027-01-12" }),
      record({ title: "DHPP", administered_at: "2026-03-01", next_due_date: "2027-03-01" }),
    ];
    expect(nextVaccine(records, today)).toEqual({ title: "rabies", due: "2027-01-12", late: false });
    expect(nextVaccine([record({ title: "DHPP", next_due_date: "2026-11-01" })], today)).toEqual({
      title: "DHPP",
      due: "2026-11-01",
      late: true,
    });
    expect(nextVaccine([record({ record_type: "vet", next_due_date: "2026-12-01" })], today)).toBeNull();
  });

  it("names who most of the routines are for, and nobody on a tie or when they are for anyone", () => {
    expect(lookedAfterBy([schedule({ staff_id: "ari" }), schedule({ staff_id: "ari" }), schedule({ staff_id: "syam" })], "p")).toBe("ari");
    expect(lookedAfterBy([schedule({ staff_id: "ari" }), schedule({ staff_id: "syam" })], "p")).toBeNull();
    expect(lookedAfterBy([schedule({}), schedule({ staff_id: "ari", entity_id: "other" })], "p")).toBeNull();
    expect(lookedAfterBy([schedule({ staff_id: "ari", is_active: false })], "p")).toBeNull();
    expect(firstName("Ari Wulandari")).toBe("Ari");
    expect(firstName("  ")).toBeNull();
  });
});
