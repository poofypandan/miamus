// Staff onboarding (docs/private/staff-onboarding-plan.md). Step 1: the
// guide says how to add, explain to, remove and bring back a staff member,
// and Kakak answers "how do I add her?" from it (no tool yet).
import { describe, expect, it } from "vitest";
import { GUIDE_PLACES, guideEntry, guideForKakak } from "@/lib/guide";
import { KAKAK_SYSTEM_PROMPT } from "@/lib/kakak/prompt";

const STAFF_ENTRIES = ["add-staff", "staff-first-day", "staff-leaves", "staff-back", "kitchen-chores"] as const;

describe("the guide's staff entries", () => {
  it("exist in both languages and point at the screen they are about", () => {
    for (const id of STAFF_ENTRIES) {
      const entry = guideEntry(id);
      expect(entry, id).toBeDefined();
      expect(entry!.where, id).not.toBeNull();
    }
    expect(guideEntry("add-staff")!.where).toBe("settings_staff");
    expect(guideEntry("kitchen-chores")!.where).toBe("home_chores");
  });

  it("use the screens' own names", () => {
    const add = guideEntry("add-staff")!;
    expect(add.body.en).toContain(GUIDE_PLACES.settings_staff.en);
    expect(add.body.id).toContain(GUIDE_PLACES.settings_staff.id);
    expect(add.body.en).toContain("Add Person");
    expect(add.body.id).toContain("Tambah Orang");
    const back = guideEntry("staff-back")!;
    expect(back.body.en).toContain("No longer here");
    expect(back.body.id).toContain("Sudah tidak bekerja");
    const day = guideEntry("staff-first-day")!;
    for (const word of ["Sebelum", "Sesudah", "Selesai"]) {
      expect(day.body.en).toContain(word);
      expect(day.body.id).toContain(word);
    }
  });

  it("say once that staff under 18 need a parent's or guardian's consent (privacy policy, section 9)", () => {
    expect(guideEntry("add-staff")!.body.en).toMatch(/under 18 need a parent's or guardian's consent/);
    expect(guideEntry("add-staff")!.body.id).toMatch(/di bawah 18 tahun perlu izin orang tua atau wali/);
  });

  it("never name a job title (owner decision 8): the area says it", () => {
    for (const id of STAFF_ENTRIES) {
      const entry = guideEntry(id)!;
      expect(`${entry.title.en} ${entry.body.en}`, id).not.toMatch(/\b(cook|maid|chef|driver|nanny)\b/i);
      expect(`${entry.title.id} ${entry.body.id}`, id).not.toMatch(/\b(juru masak|tukang masak|koki|ART|pembantu)\b/i);
    }
  });

  it("reach Kakak", () => {
    expect(guideForKakak("en")).toContain("- Adding a new staff member (Settings → Staff):");
    expect(guideForKakak("id")).toContain("- Kalau staf berhenti (Pengaturan → Staf):");
  });
});

describe("Kakak on adding and removing staff", () => {
  it("says how from the guide: adding or removing someone is done by hand for now", () => {
    const cantDo = KAKAK_SYSTEM_PROMPT.slice(KAKAK_SYSTEM_PROMPT.indexOf("# What you can't do yet"));
    expect(cantDo).toContain("- adding a staff member, or taking one off the list when they leave");
    expect(cantDo).toContain("Pengaturan / Settings → Staf / Staff");
  });
});
