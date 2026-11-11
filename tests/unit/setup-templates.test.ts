// Starter templates (Phase 172 PR A2): the pure builder. Counts per shape
// (Appendix A), titles staff can read, only repeats the chore engine has,
// nothing twice, what a household already has marked Added, unticking a
// room takes its chores, job chips assign chores, and the call's payload.

import { describe, expect, it } from "vitest";
import {
  HOME_TYPES,
  SHAPES,
  alreadyInHousehold,
  assigneeFor,
  buildSetupDraft,
  cadenceLabel,
  countsFor,
  firstDue,
  leftOut,
  setupHref,
  shapeFor,
  toApplyPayload,
  type DraftStaff,
  type HomeType,
} from "@/lib/setup-templates";
import type { HouseholdTask } from "@/types/database";

const TODAY = "2026-11-11"; // a Wednesday
const opts = (homeType: HomeType | null, extra: Partial<{ billsOn: boolean; locale: "en" | "id" }> = {}) => ({
  homeType,
  today: TODAY,
  locale: "en" as const,
  billsOn: true,
  ...extra,
});
const NONE = new Set<string>();

describe("the starting shapes", () => {
  it("multi_floor matches Appendix A: 25 rooms, 52 chores, 9 bills", () => {
    const draft = buildSetupDraft(SHAPES.multi_floor, opts("multi_floor"));
    expect(draft.rooms).toHaveLength(25);
    expect(draft.chores).toHaveLength(52);
    expect(draft.bills).toHaveLength(9);
    expect(draft.floors.map((f) => f.name)).toEqual(["LT1", "LT2", "LT3", "Rooftop"]);
    expect(countsFor(draft, NONE, NONE).total).toBe(86);
  });

  it("every kind of home builds, with every room and chore unique", () => {
    for (const home of [...HOME_TYPES, null]) {
      const draft = buildSetupDraft(shapeFor(home), opts(home));
      const keys = [...draft.rooms.map((r) => r.key), ...draft.chores.map((c) => c.key), ...draft.floors.map((f) => f.key)];
      expect(new Set(keys).size).toBe(keys.length);
      // Names unique under the same parent (the database's own rule).
      const names = draft.rooms.map((r) => `${r.inside ?? r.floor}|${r.name.toLowerCase()}`);
      expect(new Set(names).size).toBe(names.length);
      expect(draft.chores.length).toBeGreaterThan(10);
    }
  });

  it("an apartment has a balcony, no outside, no bak, token electricity and IPL", () => {
    const draft = buildSetupDraft(SHAPES.apartment, opts("apartment"));
    const names = draft.rooms.map((r) => r.name);
    expect(names).toContain("Balkon");
    expect(names).not.toContain("Ruang Tamu");
    expect(names).not.toContain("Teras");
    expect(draft.rooms.some((r) => r.outside)).toBe(false);
    expect(draft.chores.some((c) => c.title === "Kuras bak mandi")).toBe(false);
    expect(draft.chores.find((c) => c.title === "Siram tanaman")?.place).toBe("r:balcony");
    expect(draft.bills.map((b) => b.key)).toEqual(["electricity-token", "water", "internet", "bpjs", "ipl", "ac", "pest"]);
    expect(draft.floors).toEqual([]);
  });

  it("puts bedrooms upstairs, a bathroom inside Kamar Utama, and the kitchen downstairs", () => {
    const draft = buildSetupDraft(SHAPES.garden, opts("garden"));
    const byKey = new Map(draft.rooms.map((r) => [r.key, r]));
    expect(byKey.get("r:kitchen")?.floor).toBe("f:1");
    expect(byKey.get("r:bed1")).toMatchObject({ name: "Kamar Utama", floor: "f:2" });
    expect(byKey.get("r:bath1")).toMatchObject({ name: "Kamar Mandi", inside: "r:bed1" });
    expect(byKey.get("r:staff-bath")).toMatchObject({ inside: "r:staff" });
    expect(byKey.get("r:pool")).toMatchObject({ name: "Kolam Renang", floor: null, outside: true });
  });

  it("changing a stepper rebuilds the list (pure)", () => {
    const base = buildSetupDraft(SHAPES.garden, opts("garden"));
    const more = buildSetupDraft({ ...SHAPES.garden, bedrooms: 6 }, opts("garden"));
    expect(more.rooms.length - base.rooms.length).toBe(2);
    expect(more.chores.length - base.chores.length).toBe(4);
    expect(buildSetupDraft(SHAPES.garden, opts("garden"))).toEqual(base);
    const noPool = buildSetupDraft({ ...SHAPES.garden, pool: false }, opts("garden"));
    expect(noPool.chores.some((c) => c.title === "Cek kaporit kolam")).toBe(false);
  });

  it("keeps steppers inside their limits", () => {
    const draft = buildSetupDraft({ ...SHAPES.other, floors: 99, bedrooms: -3, bathrooms: 40 }, opts("other"));
    expect(draft.floors).toHaveLength(5);
    expect(draft.rooms.filter((r) => /^r:bed/.test(r.key))).toHaveLength(1);
    expect(draft.rooms.filter((r) => /^r:bath\d/.test(r.key))).toHaveLength(8);
  });

  it("leaves bills out while Bills and upkeep is switched off (Phase 171)", () => {
    expect(buildSetupDraft(SHAPES.garden, opts("garden", { billsOn: false })).bills).toEqual([]);
  });

  it("opens /setup with the answer, or without one for Skip", () => {
    expect(setupHref("garden")).toBe("/setup?home=garden");
    expect(setupHref(null)).toBe("/setup");
  });
});

describe("titles and repeats", () => {
  const all = HOME_TYPES.flatMap((home) => buildSetupDraft(shapeFor(home), opts(home)).chores);
  const rooms = HOME_TYPES.flatMap((home) => buildSetupDraft(shapeFor(home), opts(home)).rooms);

  it("titles fit (80 for chores, 60 for rooms) and are written, not symbols", () => {
    for (const c of all) {
      expect(c.title.length).toBeLessThanOrEqual(80);
      expect(c.title).toMatch(/^[A-Za-z][A-Za-z ]+$/);
      expect(c.en.length).toBeGreaterThan(0);
    }
    for (const r of rooms) expect(r.name.length).toBeLessThanOrEqual(60);
  });

  it("uses only repeats the chore engine supports", () => {
    for (const c of all) {
      expect(["daily", "weekly", "monthly"]).toContain(c.recurrence);
      expect(c.interval).toBeGreaterThanOrEqual(1);
      expect(c.interval).toBeLessThanOrEqual(12);
      expect(c.dueDate >= TODAY).toBe(true);
    }
  });

  it("first days fall on the right day", () => {
    expect(firstDue({ kind: "daily" }, TODAY)).toBe(TODAY);
    expect(firstDue({ kind: "weekly", weekday: 3 }, TODAY)).toBe(TODAY); // Wednesday
    expect(firstDue({ kind: "weekly", weekday: 6 }, TODAY)).toBe("2026-11-14");
    expect(firstDue({ kind: "monthly", day: 1 }, TODAY)).toBe("2026-12-01");
    expect(firstDue({ kind: "monthly", day: 15 }, TODAY)).toBe("2026-11-15");
    expect(firstDue({ kind: "monthly", day: 31 }, "2027-02-10")).toBe("2027-02-28");
  });

  it("reads cadences in both languages", () => {
    const draft = buildSetupDraft(SHAPES.garden, opts("garden"));
    const sheets = draft.chores.find((c) => c.title.startsWith("Ganti seprai"))!;
    expect(cadenceLabel(sheets, "en")).toBe("Every week · Sat");
    expect(cadenceLabel(sheets, "id")).toBe("Setiap minggu · Sab");
    const mow = draft.chores.find((c) => c.title === "Potong rumput")!;
    expect(cadenceLabel(mow, "en")).toBe("Every 2 weeks · Sat");
    const fridge = draft.chores.find((c) => c.title === "Bersihkan kulkas")!;
    expect(cadenceLabel(fridge, "en")).toBe("Every month · 1st");
    expect(cadenceLabel(fridge, "id")).toBe("Setiap bulan · tgl 1");
  });
});

describe("what the household already has (D7)", () => {
  const draft = buildSetupDraft(SHAPES.garden, opts("garden"));
  const locations = [
    { id: "lt1", name: "LT1", kind: "floor" as const, parent_id: null },
    { id: "dapur", name: " dapur ", kind: "room" as const, parent_id: "lt1" },
    { id: "taman", name: "Taman", kind: "room" as const, parent_id: null },
  ];
  const task = (over: Partial<HouseholdTask>) =>
    ({
      id: Math.random().toString(),
      title: "",
      category: "cleaning",
      status: "pending",
      due_date: "2026-11-01",
      recurrence: "daily",
      recurrence_interval: 1,
      recurrence_until: null,
      parent_task_id: null,
      location_id: null,
      ...over,
    }) as HouseholdTask;

  it("marks rooms by name under the same parent, and chores by title, place and repeat", () => {
    const added = alreadyInHousehold(draft, {
      locations,
      today: TODAY,
      chores: [
        task({ title: "cuci  piring", location_id: "dapur" }),
        // Same title, other repeat: not the same chore.
        task({ title: "Siram tanaman", location_id: "taman", recurrence: "weekly" }),
        task({ title: "Listrik PLN", category: "bill", recurrence: "monthly" }),
      ],
    });
    expect(added.has("f:1")).toBe(false); // floors aren't rows on the list
    expect(added.has("r:kitchen")).toBe(true);
    expect(added.has("r:garden")).toBe(true);
    expect(added.has("dishes@r:kitchen")).toBe(true);
    expect(added.has("plants@r:garden")).toBe(false);
    expect(added.has("bill:electricity")).toBe(true);
    // Not counted, so never sent twice.
    expect(countsFor(draft, NONE, added).total).toBe(countsFor(draft, NONE, NONE).total - 4);
  });

  it("a chore that ended doesn't count as added", () => {
    const added = alreadyInHousehold(draft, {
      locations,
      today: TODAY,
      chores: [task({ title: "Cuci piring", location_id: "dapur", recurrence_until: "2026-10-01" })],
    });
    expect(added.has("dishes@r:kitchen")).toBe(false);
  });
});

describe("unticking and assigning", () => {
  const draft = buildSetupDraft(SHAPES.garden, opts("garden"));

  it("unticking a room takes the rooms inside it and their chores", () => {
    const out = leftOut(draft, new Set(["r:bed1"]));
    expect(out.has("r:bath1")).toBe(true);
    expect(out.has("tidy-bed@r:bed1")).toBe(true);
    expect(out.has("towels@r:bath1")).toBe(true);
    expect(out.has("tidy-bed@r:bed2")).toBe(false);
    const before = countsFor(draft, NONE, NONE);
    const after = countsFor(draft, new Set(["r:bed1"]), NONE);
    expect(before.rooms - after.rooms).toBe(2);
    expect(before.chores - after.chores).toBe(5);
  });

  it("gives a chore to the one person with its job, otherwise Anyone", () => {
    const staff: DraftStaff[] = [
      { key: "s1", name: "Sari", job: "cleaning" },
      { key: "s2", name: "Budi", job: "garden" },
      { key: "s3", name: "Joko", job: "garden" },
      { key: "s4", name: "  ", job: "kitchen" },
    ];
    expect(assigneeFor("cleaning", staff)).toBe("s1");
    expect(assigneeFor("garden", staff)).toBeNull(); // shared
    expect(assigneeFor("kitchen", staff)).toBeNull(); // no name, no person
    expect(assigneeFor("pool", staff)).toBeNull();
  });

  it("builds one payload: ticked, not added, assigned, bills to the owner, only places in use", () => {
    const staff: DraftStaff[] = [{ key: "s1", name: " Mbak  Sari ", job: "kitchen" }];
    const payload = toApplyPayload(draft, new Set(["r:pool", "trash@house"]), new Set(["dishes@r:kitchen"]), staff);
    expect(payload.staff).toEqual([{ key: "s1", name: "Mbak Sari" }]);
    expect(payload.rooms.some((r) => r.key === "r:pool")).toBe(false);
    expect(payload.chores.some((c) => c.title === "Cek kaporit kolam")).toBe(false);
    expect(payload.chores.some((c) => c.title === "Buang sampah")).toBe(false);
    expect(payload.chores.some((c) => c.title === "Cuci piring")).toBe(false);
    expect(payload.chores.find((c) => c.title === "Bersihkan kulkas")?.assignee).toEqual({ staff: "s1" });
    expect(payload.chores.find((c) => c.title === "Sapu dan pel lantai")?.assignee).toBeNull();
    const pln = payload.chores.find((c) => c.category === "bill" && c.title === "Electricity (PLN)");
    expect(pln).toMatchObject({ assignee: { me: true }, remind: 3, from_bills: true });
    // A room inside another comes after its parent; floors only when used.
    const order = payload.rooms.map((r) => r.key);
    expect(order.indexOf("r:bed1")).toBeLessThan(order.indexOf("r:bath1"));
    expect(payload.floors.map((f) => f.key)).toEqual(["f:1", "f:2"]);
  });
});

describe("the Starter list's starting shape", () => {
  it("reads floors and rooms an existing household already has", async () => {
    const { shapeFromHousehold } = await import("@/lib/setup-templates");
    const { homeType, shape } = shapeFromHousehold([
      { name: "LT1", kind: "floor" },
      { name: "LT2", kind: "floor" },
      { name: "LT3", kind: "floor" },
      { name: "Rooftop", kind: "floor" },
      { name: "Kamar Utama", kind: "room" },
      { name: "Kamar Anak", kind: "room" },
      { name: "Kamar Mandi", kind: "room" },
      { name: "Taman", kind: "room" },
      { name: "Kolam Renang", kind: "room" },
    ]);
    expect(homeType).toBe("multi_floor");
    expect(shape).toMatchObject({ floors: 3, bedrooms: 2, bathrooms: 1, garden: true, pool: true, rooftop: true, carport: false });
  });

  it("falls back to small defaults for a household with no rooms", async () => {
    const { shapeFromHousehold } = await import("@/lib/setup-templates");
    expect(shapeFromHousehold([])).toEqual({ homeType: "other", shape: SHAPES.other });
  });
});
