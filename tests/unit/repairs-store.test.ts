import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 174 (Codex, PR #94): a walk-in save the server took keeps its whole
// effect on screen (the "Baru" repair, the walk-in, the stretch) even when
// the reload after it fails, since the save has left the queue by then.

const provider = {
  listRepairs: vi.fn(),
  listRepairVisits: vi.fn(async () => []),
  listRepairNotes: vi.fn(async () => []),
  listRepairWalkIns: vi.fn(),
  listRepairSupervision: vi.fn(),
};
vi.mock("@/lib/data", () => ({ dataProvider: provider }));
vi.mock("@/lib/auth/device-session", () => ({ waitForSession: async () => undefined }));
vi.mock("@/lib/tenant", () => ({ getActiveHouseholdId: () => "h" }));

const store = await import("@/lib/repairs-store");

const visitRow = {
  id: "v1",
  household_id: "h",
  repair_id: "r-new",
  worker_name: "Pak Budi",
  logged_by_staff: "ari",
  created_by: null,
  arrived_at: "2026-11-11T02:00:05.000Z",
  arrived_phone_at: "2026-11-11T02:00:00.000Z",
  before_photo_url: "h/repairs/r-new/b.webp",
  left_at: null,
  left_phone_at: null,
  after_photo_url: null,
  outcome: null,
  note: null,
};

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  provider.listRepairs.mockResolvedValue([]);
  provider.listRepairWalkIns.mockResolvedValue([]);
  provider.listRepairSupervision.mockResolvedValue([]);
  await store.loadRepairs(true);
});

describe("keepSent", () => {
  it("keeps the new repair, the walk-in and Ari's stretch when the reload after the start fails", async () => {
    store.keepSent(
      {
        kind: "walkin_start",
        repair: { id: "r-new", title: "Stopkontak longgar", status: "reported", reported_by_staff: "ari" },
        visit: {
          id: "v1",
          repair_id: "r-new",
          worker_name: "Pak Budi",
          logged_by_staff: "ari",
          arrived_phone_at: "2026-11-11T02:00:00.000Z",
          before_photo_url: "h/repairs/r-new/b.webp",
        },
      },
      visitRow
    );
    provider.listRepairs.mockRejectedValue(new Error("offline"));
    await store.loadRepairs(true);
    const snap = store.getSnapshot();
    expect(snap.failed).toBe(true);
    expect(snap.repairs.map((r) => r.id)).toEqual(["r-new"]);
    // The server's row, with its own arrival time.
    expect(snap.walkIns).toEqual([visitRow]);
    expect(snap.supervision).toHaveLength(1);
    expect(snap.supervision[0]).toMatchObject({ visit_id: "v1", staff_id: "ari", ended_at: null });
  });

  it("a Selesai the server took closes the stretch on screen even if the reload fails", async () => {
    provider.listRepairWalkIns.mockResolvedValue([visitRow]);
    provider.listRepairSupervision.mockResolvedValue([
      { id: "s1", household_id: "h", visit_id: "v1", staff_id: "ari", user_id: null, started_at: visitRow.arrived_at, ended_at: null },
    ]);
    await store.loadRepairs(true);
    const finished = { ...visitRow, left_at: "2026-11-11T04:00:05.000Z", left_phone_at: "2026-11-11T04:00:00.000Z", after_photo_url: "a.webp" };
    store.keepSent(
      {
        kind: "walkin_finish",
        visitId: "v1",
        finish: { after_photo_url: "a.webp", left_phone_at: "2026-11-11T04:00:00.000Z", outcome: null, note: null },
        releases: "ari",
      },
      finished
    );
    provider.listRepairWalkIns.mockRejectedValue(new Error("offline"));
    await store.loadRepairs(true);
    const snap = store.getSnapshot();
    expect(snap.walkIns).toEqual([finished]);
    expect(snap.supervision[0].ended_at).toBe("2026-11-11T04:00:00.000Z");
  });
});
