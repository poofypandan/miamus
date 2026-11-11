import { describe, expect, it } from "vitest";
import {
  developerItems,
  developerListText,
  developerPhotos,
  developerStatus,
  greeting,
  listHeading,
  photoFileName,
  photoLabel,
  whatsAppUrl,
} from "@/lib/developer-list";
import type { HouseholdTask, Repair, RepairWalkIn } from "@/types/database";

const repair = (over: Partial<Repair>): Repair => ({
  id: "r1",
  household_id: "h",
  location_id: null,
  spot: null,
  title: "Keran bocor",
  details: null,
  photo_url: null,
  urgent: false,
  status: "open",
  reported_by_staff: null,
  created_by: null,
  created_at: "2026-11-09T03:00:00Z",
  updated_at: "2026-11-09T03:00:00Z",
  decided_by: null,
  decided_at: null,
  dismiss_reason: null,
  fixed_by_name: null,
  closed_at: null,
  ...over,
});

const walkIn = (over: Partial<RepairWalkIn>): RepairWalkIn => ({
  id: "w1",
  household_id: "h",
  repair_id: "r1",
  worker_name: "Pak Budi",
  logged_by_staff: null,
  created_by: null,
  arrived_at: "2026-11-10T02:00:00Z",
  arrived_phone_at: null,
  before_photo_url: "before.jpg",
  left_at: null,
  left_phone_at: null,
  after_photo_url: null,
  outcome: null,
  note: null,
  ...over,
});

const visit = (over: Partial<HouseholdTask>): HouseholdTask =>
  ({
    id: "v1",
    household_id: "h",
    repair_id: "r1",
    title: "Perbaiki: Keran bocor",
    status: "pending",
    due_date: "2026-11-20",
    due_time: null,
    parent_task_id: null,
    recurrence: "none",
    ...over,
  }) as unknown as HouseholdTask;

const place = (id: string | null, spot: string | null) =>
  id === "room" ? ["LT2 · Kamar Tamu 1", spot].filter(Boolean).join(" · ") : null;

describe("developerPhotos", () => {
  it("sends the problem photo, then how it looks at the latest visit", () => {
    const r = repair({ photo_url: "problem.jpg" });
    const visits = [
      walkIn({ id: "a", arrived_at: "2026-11-09T02:00:00Z", left_at: "2026-11-09T04:00:00Z", after_photo_url: "old-after.jpg" }),
      walkIn({ id: "b", arrived_at: "2026-11-10T02:00:00Z", before_photo_url: "new-before.jpg" }),
    ];
    expect(developerPhotos(r, [], visits)).toEqual([
      { url: "problem.jpg", kind: "problem" },
      { url: "new-before.jpg", kind: "latest" },
    ]);
  });

  it("counts a finished scheduled visit and never sends a photo twice", () => {
    const r = repair({ photo_url: "problem.jpg" });
    const done = visit({ status: "completed", completed_at: "2026-11-10T05:00:00Z", after_photo_url: "problem.jpg" });
    expect(developerPhotos(r, [done], [])).toEqual([{ url: "problem.jpg", kind: "problem" }]);
    const other = visit({ status: "completed", completed_at: "2026-11-10T05:00:00Z", after_photo_url: "after.jpg" });
    expect(developerPhotos(r, [other], []).map((p) => p.url)).toEqual(["problem.jpg", "after.jpg"]);
  });

  it("has no photos for a repair with none", () => {
    expect(developerPhotos(repair({}), [], [])).toEqual([]);
  });
});

describe("developerStatus", () => {
  const items = (r: Repair, visits: HouseholdTask[] = [], walkIns: RepairWalkIn[] = []) =>
    developerItems([r], visits, walkIns, place, "2026-11-11")[0];

  it("reads as the developer needs it, in both languages", () => {
    const fresh = items(repair({}));
    expect(developerStatus(fresh.repair, fresh.stage, [], "id")).toBe("Belum dikerjakan");
    expect(developerStatus(fresh.repair, fresh.stage, [], "en")).toBe("Not started yet");

    const scheduled = items(repair({}), [visit({})]);
    expect(developerStatus(scheduled.repair, scheduled.stage, [], "id")).toBe("Dijadwalkan 20 Nov");
    expect(developerStatus(scheduled.repair, scheduled.stage, [], "en")).toBe("Scheduled for 20 Nov");

    const working = [walkIn({})];
    const now = items(repair({}), [], working);
    expect(developerStatus(now.repair, now.stage, working, "id")).toBe("Sedang dikerjakan");

    const doneWalkIn = [walkIn({ left_at: "2026-11-10T04:00:00Z", after_photo_url: "a.jpg", outcome: "fixed" })];
    const check = items(repair({}), [], doneWalkIn);
    expect(developerStatus(check.repair, check.stage, doneWalkIn, "id")).toBe("Sudah dikerjakan, masih kami cek");
    expect(developerStatus(check.repair, check.stage, doneWalkIn, "en")).toBe("Work done, we're still checking it");
  });

  it("says a repair person is coming back, not that nothing started", () => {
    const back = [walkIn({ left_at: "2026-11-10T04:00:00Z", after_photo_url: "a.jpg", outcome: "come_back" })];
    const item = items(repair({}), [], back);
    expect(developerStatus(item.repair, item.stage, back, "id")).toBe("Belum selesai, perlu datang lagi");
    expect(developerStatus(item.repair, item.stage, back, "en")).toBe("Not finished, needs another visit");
  });
});

describe("greeting", () => {
  it("follows the hour", () => {
    expect([7, 12, 16, 20].map((h) => greeting(h, "id"))).toEqual([
      "Selamat pagi",
      "Selamat siang",
      "Selamat sore",
      "Selamat malam",
    ]);
    expect([7, 13, 20].map((h) => greeting(h, "en"))).toEqual(["Good morning", "Good afternoon", "Good evening"]);
  });
});

describe("developerListText", () => {
  const now = new Date(2026, 10, 11, 9, 30);
  const list = developerItems(
    [
      repair({ id: "r1", title: "Keran bocor", urgent: true, location_id: "room", spot: "Wastafel", photo_url: "p.jpg" }),
      repair({ id: "r2", title: "Dinding retak", details: "Retak  rambut\n dekat jendela", created_at: "2026-11-02T03:00:00Z" }),
    ],
    [],
    [],
    place,
    "2026-11-11"
  );

  it("is short and polite in Bahasa Indonesia, with the house, the date and a numbered list", () => {
    expect(developerListText({ houseName: "Rumah Kenanga", now, items: list, walkIns: [], lang: "id", withPhotos: true })).toBe(
      [
        "Selamat pagi, Pak/Bu. Mohon bantuannya untuk perbaikan berikut.",
        "",
        "Daftar perbaikan, Rumah Kenanga, 11 Nov 2026: 2 item",
        "",
        "1. Keran bocor (darurat)",
        "   LT2 · Kamar Tamu 1 · Wastafel",
        "   Dilaporkan 9 Nov · Belum dikerjakan",
        "",
        "2. Dinding retak",
        "   Retak rambut dekat jendela",
        "   Dilaporkan 2 Nov · Belum dikerjakan",
        "",
        "Fotonya terlampir, nomornya sesuai daftar ini.",
        "Terima kasih banyak atas bantuannya, Pak/Bu.",
      ].join("\n")
    );
  });

  it("has an English version, and leaves out the photo line when none go with it", () => {
    const text = developerListText({ houseName: "Rumah Kenanga", now, items: list, walkIns: [], lang: "en", withPhotos: false });
    expect(text).toBe(
      [
        "Good morning. Could you please help us with the repairs below?",
        "",
        "Repair list, Rumah Kenanga, 11 Nov 2026: 2 items",
        "",
        "1. Keran bocor (urgent)",
        "   LT2 · Kamar Tamu 1 · Wastafel",
        "   Reported 9 Nov · Not started yet",
        "",
        "2. Dinding retak",
        "   Retak rambut dekat jendela",
        "   Reported 2 Nov · Not started yet",
        "",
        "Thank you very much for your help.",
      ].join("\n")
    );
    expect(text).not.toMatch(/attached/);
  });

  it("uses no emoji or symbol icons", () => {
    const text = developerListText({ houseName: "Rumah", now, items: list, walkIns: [], lang: "id", withPhotos: true });
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("counts one item in English without a plural", () => {
    expect(listHeading("Rumah", now, 1, "en")).toBe("Repair list, Rumah, 11 Nov 2026: 1 item");
  });
});

describe("photo names and labels", () => {
  it("names files by the item's number and the photo's letter", () => {
    expect(photoFileName(0, 0, "image/jpeg", "id")).toBe("perbaikan-1a.jpg");
    expect(photoFileName(2, 1, "image/webp", "en")).toBe("repair-3b.webp");
  });

  it("captions the print page's photos to match", () => {
    expect(photoLabel({ url: "x", kind: "problem" }, 0, 0, "id")).toBe("1a · Kerusakan");
    expect(photoLabel({ url: "x", kind: "latest" }, 0, 1, "en")).toBe("1b · Latest visit");
  });

  it("builds a wa.me link with the text", () => {
    expect(whatsAppUrl("Halo, Pak/Bu")).toBe("https://wa.me/?text=Halo%2C%20Pak%2FBu");
  });
});
