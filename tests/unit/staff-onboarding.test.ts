// Staff onboarding (docs/private/staff-onboarding-plan.md). Step 1: the
// guide says how to add, explain to, remove and bring back a staff member,
// and Kakak answers "how do I add her?" from it (no tool yet).
import { describe, expect, it } from "vitest";
import { GUIDE_PLACES, guideEntry, guideForKakak } from "@/lib/guide";
import { KAKAK_SYSTEM_PROMPT } from "@/lib/kakak/prompt";

// Step 2: the Add staff sheet's pure parts (src/lib/staff-onboarding.ts).
import { CHORES } from "@/lib/setup-templates";
import {
  NEW_STAFF_KEY,
  STAFF_JOBS,
  STAFF_JOB_LABELS,
  addStaffPayload,
  choresToMove,
  formerStaffWithName,
  giveToChoices,
  hiddenAreasFor,
  isClaimable,
  suggestGiveTo,
  kitchenStarters,
  staffWithName,
} from "@/lib/staff-onboarding";
import type { HouseholdLocation, HouseholdTask, StaffProfile } from "@/types/database";

import { claimFromFragment, codeFromFragment, personalWelcomeMessage, staffFromFragment, welcomeLink } from "@/lib/setup-apply";
import { qrPath } from "@/lib/qr";
import { formerStaffLabel, staffNameLookup } from "@/hooks/use-staff-profiles";
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
    expect(add.body.en).toContain("Add staff");
    expect(add.body.id).toContain("Tambah staf");
    const back = guideEntry("staff-back")!;
    expect(back.body.en).toContain("No longer here");
    expect(back.body.id).toContain("Sudah tidak bekerja");
    // 12 months, then "Former staff" (decision 5).
    expect(back.body.en).toContain("Former staff");
    expect(back.body.id).toContain("Mantan staf");
    expect(guideEntry("staff-leaves")!.body.en).toContain("Anyone");
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
  it("suggests them now (step 5): the tools are listed, and the step 1 can't-do line is gone", () => {
    expect(KAKAK_SYSTEM_PROMPT).toContain("- add_staff:");
    expect(KAKAK_SYSTEM_PROMPT).toContain("- remove_staff:");
    expect(KAKAK_SYSTEM_PROMPT).toContain("# Adding and removing staff");
    const cantDo = KAKAK_SYSTEM_PROMPT.slice(KAKAK_SYSTEM_PROMPT.indexOf("# What you can't do yet"));
    expect(cantDo).not.toContain("adding a staff member");
    // Decision 2: ask what they do, never default to everything; decision 7: ask who takes the work.
    expect(KAKAK_SYSTEM_PROMPT).toContain("Never default to everything.");
    expect(KAKAK_SYSTEM_PROMPT).toContain("ask once who takes their chores");
  });
});

const H = "00000000-0000-4000-8000-000000000001";
const loc = (id: string, name: string, kind: "room" | "floor" = "room", parent_id: string | null = null): HouseholdLocation => ({
  id,
  household_id: H,
  name,
  created_at: "2026-10-01T00:00:00Z",
  kind,
  parent_id,
});
const chore = (over: Partial<HouseholdTask>): HouseholdTask =>
  ({
    id: "t1",
    household_id: H,
    title: "Cuci piring",
    status: "pending",
    due_date: "2026-11-01",
    recurrence: "daily",
    recurrence_interval: 1,
    recurrence_until: null,
    parent_task_id: null,
    assigned_to: null,
    location_id: null,
    category: "cleaning",
    ...over,
  }) as HouseholdTask;
const staff = (id: string, name: string, over: Partial<StaffProfile> = {}): StaffProfile =>
  ({ id, household_id: H, name, has_pin: true, user_id: null, archived_at: null, created_at: "2026-10-01T00:00:00Z", ...over }) as StaffProfile;
const TODAY = "2026-11-20";

describe("Add staff: what they do", () => {
  it("offers the four areas as chips, in plain words, with no job title", () => {
    expect([...STAFF_JOBS].sort()).toEqual(["home", "kitchen", "pets", "repairs"]);
    expect(STAFF_JOB_LABELS.kitchen).toEqual(["Kitchen", "Dapur"]);
    expect(STAFF_JOB_LABELS.home).toEqual(["Chores", "Tugas rumah"]);
  });

  it("switches off every area that wasn't picked", () => {
    expect(hiddenAreasFor(["kitchen"])).toEqual(["home", "pets", "repairs"]);
    expect(hiddenAreasFor(["home", "pets"])).toEqual(["kitchen", "repairs"]);
    expect(hiddenAreasFor(["home", "pets", "kitchen", "repairs"])).toEqual([]);
  });

  it("finds someone already on the list by name, case and spaces ignored; not owners or people who left", () => {
    const roster = [staff("a", "Ari"), staff("o", "Sri", { user_id: "u" }), staff("x", "Wati", { archived_at: "2026-11-01T00:00:00Z" })];
    expect(staffWithName("  ari ", roster)?.id).toBe("a");
    expect(staffWithName("Sri", roster)).toBeNull();
    expect(staffWithName("Wati", roster)).toBeNull();
    expect(staffWithName("", roster)).toBeNull();
  });
});

describe("Add staff: kitchen starter chores", () => {
  it("ticks the kitchen's usual three, plus the wet kitchen when the home has one; the three extras start unticked (D6)", () => {
    const plain = kitchenStarters({ locations: [], chores: [], today: TODAY });
    expect(plain.map((s) => [s.title, s.ticked])).toEqual([
      ["Cuci piring", true],
      ["Bersihkan dapur dan kompor", true],
      ["Bersihkan kulkas", true],
      ["Siapkan bahan untuk besok", false],
      ["Buang sampah dapur", false],
      ["Bersihkan freezer", false],
    ]);
    expect(plain.every((s) => s.placeId === null)).toBe(true);
    const freezer = plain.find((s) => s.key === CHORES.freezer.key)!;
    expect([freezer.recurrence, freezer.interval]).toEqual(["monthly", 3]);

    const withRooms = kitchenStarters({
      locations: [loc("k", "Dapur"), loc("w", "Dapur Kotor")],
      chores: [],
      today: TODAY,
    });
    expect(withRooms.find((s) => s.key === "wet-kitchen")).toMatchObject({ ticked: true, placeId: "w" });
    expect(withRooms.find((s) => s.key === "dishes")?.placeId).toBe("k");
  });

  it("offers a chore the home already has as a move, unticked, with whose it is now", () => {
    const list = kitchenStarters({
      locations: [],
      chores: [chore({ id: "t-ari", title: "cuci  PIRING", assigned_to: "ari" }), chore({ id: "t-old", title: "Bersihkan kulkas", recurrence_until: "2026-11-01" })],
      today: TODAY,
    });
    expect(list.find((s) => s.key === "dishes")).toMatchObject({ ticked: false, existing: { id: "t-ari", assignedTo: "ari" } });
    // An ended repeat is not "still going": offered as new.
    expect(list.find((s) => s.key === "fridge")).toMatchObject({ ticked: true, existing: null });
  });
});

describe("Add staff: one save", () => {
  it("sends the person and their new chores, given to them by name; moves stay out of it", () => {
    const locations = [loc("f1", "LT1", "floor"), loc("k", "Dapur", "room", "f1")];
    const starters = kitchenStarters({ locations, chores: [chore({ id: "t-ari", assigned_to: "ari" })], today: TODAY });
    const ticked = new Set(["dishes", "kitchen", "fridge"]);
    const payload = addStaffPayload({ name: "  Sri  Wahyuni ", starters, ticked, locations });
    expect(payload.staff).toEqual([{ key: NEW_STAFF_KEY, name: "Sri Wahyuni" }]);
    // Cuci piring is Ari's already: a move, not a second one.
    expect(payload.chores.map((c) => c.title)).toEqual(["Bersihkan dapur dan kompor", "Bersihkan kulkas"]);
    expect(payload.chores.every((c) => JSON.stringify(c.assignee) === JSON.stringify({ staff: NEW_STAFF_KEY }))).toBe(true);
    // The home's own floor and kitchen, by name under the same parent: nothing new is made.
    expect(payload.floors).toEqual([{ key: expect.stringMatching(/^f:/), name: "LT1" }]);
    expect(payload.rooms).toEqual([{ key: expect.stringMatching(/^r:/), name: "Dapur", parent: payload.floors[0].key }]);
    expect(payload.chores[0].place).toBe(payload.rooms[0].key);
    expect(choresToMove(starters, ticked)).toEqual(["t-ari"]);
  });

  it("leaves a place out when its chain can't be followed, so no room is made by mistake", () => {
    const locations = [loc("k", "Dapur", "room", "missing-floor")];
    const starters = kitchenStarters({ locations, chores: [], today: TODAY });
    const payload = addStaffPayload({ name: "Sri", starters, ticked: new Set(["kitchen"]), locations });
    expect(payload.rooms).toEqual([]);
    expect(payload.floors).toEqual([]);
    expect(payload.chores).toEqual([expect.objectContaining({ title: "Bersihkan dapur dan kompor", place: null })]);
  });
});

// Step 3: the personal welcome (lib/setup-apply.ts) and the QR code (lib/qr.ts).
describe("the personal welcome", () => {
  const SRI = "00000000-0000-4000-8000-00000000c0aa";
  const args = { name: " Sri ", code: "K7PM2Q", origin: "https://miamus.app", claim: "ABCDEFGHJK", staffId: SRI };

  it("names her, carries her own link, and says what Miamus records (decision 10)", () => {
    const text = personalWelcomeMessage(args);
    expect(text).toBe(
      `Halo Sri, selamat datang. Ini Miamus, aplikasi rumah kita. Buka link ini lalu buat PIN 4 angka: https://miamus.app/join/code#c=K7P-M2Q&k=ABCDEFGHJK&s=${SRI}\n` +
        "Miamus mencatat tugas, foto, dan cuti Anda. Info: https://miamus.app/privasi"
    );
    expect(personalWelcomeMessage({ ...args, videoUrl: "https://miamus.app/tips/x" })).toMatch(/\nVideo 15 detik: https:\/\/miamus\.app\/tips\/x$/);
  });

  it("is Bahasa Indonesia with no emoji, and never a price", () => {
    const text = personalWelcomeMessage(args);
    expect(text).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u);
    expect(text).not.toMatch(/\b(Rp|IDR|harga)\b/i);
    expect(text).not.toMatch(/\b(pembantu|ponsel|kamu)\b/i);
  });

  it("keeps every code in the fragment, which the old parsers still read", () => {
    const link = welcomeLink("K7PM2Q", "https://miamus.app", "ABCDEFGHJK", SRI);
    const hash = link.slice(link.indexOf("#"));
    expect(link.split("#")[0]).toBe("https://miamus.app/join/code");
    expect(codeFromFragment(hash)).toBe("K7P-M2Q");
    expect(claimFromFragment(hash)).toBe("ABCDEFGHJK");
    expect(staffFromFragment(hash)).toBe(SRI);
  });

  it("reads the roster id only when it is a whole id", () => {
    expect(staffFromFragment("#c=K7P-M2Q&k=ABCDEFGHJK")).toBeNull();
    expect(staffFromFragment(`#s=${SRI.toUpperCase()}&c=K7P-M2Q`)).toBe(SRI);
    expect(staffFromFragment("#s=not-an-id")).toBeNull();
    expect(staffFromFragment(`#s=${SRI}x`)).toBeNull();
  });
});

describe("the QR code", () => {
  it("is drawn here, square, with a quiet zone, the same every time", () => {
    const link = welcomeLink("K7PM2Q", "https://miamus.app", "ABCDEFGHJK", "00000000-0000-4000-8000-00000000c0aa");
    const a = qrPath(link);
    expect(a).toEqual(qrPath(link));
    // Version 1 is 21 modules; each version adds 4. Plus 4 modules of quiet zone on each side.
    expect((a.size - 8 - 21) % 4).toBe(0);
    expect(a.size).toBeGreaterThan(29);
    expect(a.path).toMatch(/^(M\d+ \d+h1v1h-1z)+$/);
    // Nothing is drawn in the quiet zone.
    for (const [, x, y] of a.path.matchAll(/M(\d+) (\d+)/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(4);
      expect(Number(y)).toBeLessThan(a.size - 4);
    }
  });
});

// Step 4: when someone leaves, and bringing them back.
describe("who takes a leaving person's work (decision 7)", () => {
  const sri = staff("sri", "Sri", { hidden_areas: ["home", "pets", "repairs"] });
  it("suggests the one other person who shares their area, Kitchen first", () => {
    const ari = staff("ari", "Ari", { hidden_areas: ["kitchen"] });
    const wati = staff("wati", "Wati", { hidden_areas: ["home", "pets", "repairs"] });
    expect(suggestGiveTo(sri, [sri, ari, wati])).toBe("wati");
  });
  it("is Anyone when nobody shares it, or when two could take it", () => {
    const ari = staff("ari", "Ari", { hidden_areas: ["kitchen"] });
    expect(suggestGiveTo(sri, [sri, ari])).toBeNull();
    const a = staff("a", "A"), b = staff("b", "B");
    expect(suggestGiveTo(sri, [sri, a, b])).toBeNull();
  });
  it("never suggests an owner, someone who left, or the person leaving", () => {
    const owner = staff("o", "Dewi", { user_id: "u" });
    const gone = staff("g", "Gina", { archived_at: "2026-11-01T00:00:00Z" });
    expect(suggestGiveTo(sri, [sri, owner, gone])).toBeNull();
    expect(giveToChoices(sri, [sri, owner, gone, staff("ari", "Ari")]).map((p) => p.id)).toEqual(["ari"]);
  });
  it("for someone who sees everything, the one other person with Kitchen", () => {
    const all = staff("all", "Nah");
    const ari = staff("ari", "Ari", { hidden_areas: ["kitchen"] });
    const wati = staff("wati", "Wati", { hidden_areas: ["home", "pets", "repairs"] });
    expect(suggestGiveTo(all, [all, ari, wati])).toBe("wati");
  });
});

describe("the claim window (migrations/147, 180)", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  it("counts 7 days from when they were added", () => {
    expect(isClaimable({ created_at: "2026-11-15T12:00:00Z" }, now)).toBe(true);
    expect(isClaimable({ created_at: "2026-11-10T12:00:00Z" }, now)).toBe(false);
  });
  it("or from when they were brought back", () => {
    expect(isClaimable({ created_at: "2026-05-01T00:00:00Z", claimable_from: "2026-11-19T00:00:00Z" }, now)).toBe(true);
    expect(isClaimable({ created_at: "2026-05-01T00:00:00Z", claimable_from: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(isClaimable({ created_at: null } as never, now)).toBe(false);
  });
});

describe("Add staff knows who used to work here", () => {
  it("finds someone who left by name, not someone already forgotten", () => {
    const roster = [
      staff("s", "Sri", { archived_at: "2026-10-01T00:00:00Z" }),
      staff("f", "Mantan staf", { archived_at: "2025-01-01T00:00:00Z", forgotten_at: "2026-01-01T00:00:00Z" }),
    ];
    expect(formerStaffWithName(" sri ", roster)?.id).toBe("s");
    expect(formerStaffWithName("Mantan staf", roster)).toBeNull();
    expect(formerStaffWithName("Wati", roster)).toBeNull();
  });
});

// Step 4: a removed name reads "Former staff" / "Mantan staf" in the screen's own language.
describe("a removed name, in the screen's language", () => {
  const roster = [
    staff("a", "Ari"),
    staff("w", "Mantan staf", { archived_at: "2025-01-01T00:00:00Z", forgotten_at: "2026-01-01T00:00:00Z" }),
  ];
  it("reads Former staff for an English owner and Mantan staf for an Indonesian owner or on a staff screen", () => {
    expect(formerStaffLabel("en")).toBe("Former staff");
    expect(formerStaffLabel("id")).toBe("Mantan staf");
    expect(staffNameLookup(roster, "Someone", formerStaffLabel("en"))("w")).toBe("Former staff");
    expect(staffNameLookup(roster, "Seseorang", formerStaffLabel("id"))("w")).toBe("Mantan staf");
  });
  it("leaves everyone else as they are, and an unknown id as the fallback", () => {
    const name = staffNameLookup(roster, "Someone", "Former staff");
    expect(name("a")).toBe("Ari");
    expect(name("nope")).toBe("Someone");
    expect(name(null)).toBe("Someone");
  });
});
