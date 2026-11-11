import { beforeEach, describe, expect, it, vi } from "vitest";

// Pre-launch audit M4: the queued finish completes only a pending chore, and
// tells "my own earlier try landed" from "someone else got there first".

type Row = Record<string, unknown>;
const state: { updated: Row[]; current: Row | null; filters: [string, unknown][] } = {
  updated: [],
  current: null,
  filters: [],
};

function builder() {
  const chain = {
    update: () => chain,
    select: () => chain,
    eq: (column: string, value: unknown) => {
      state.filters.push([column, value]);
      return chain;
    },
    maybeSingle: async () => ({ data: state.current, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: state.updated, error: null, status: 200 }),
  };
  return chain;
}

vi.mock("@/lib/supabase/client", () => ({ supabase: { from: () => builder() } }));
vi.mock("@/lib/tenant", () => ({ getActiveHouseholdId: () => "house-a" }));

const { supabaseProvider } = await import("@/lib/data/supabase-provider");
const { ChoreAlreadySettledError } = await import("@/lib/chore-settled");

const patch = {
  onlyIfPending: true,
  before_photo_url: "https://x/mine-before.jpg",
  after_photo_url: "https://x/mine-after.jpg",
  photo_url: "https://x/mine-after.jpg",
  completed_by: "staff-1",
  completed_at: "2026-11-09T02:00:00.000Z",
};

beforeEach(() => {
  state.updated = [];
  state.current = null;
  state.filters = [];
});

describe("updateHouseholdTaskStatus with onlyIfPending", () => {
  it("adds status = pending to the update", async () => {
    state.updated = [{ id: "row-1", status: "completed" }];
    await supabaseProvider.updateHouseholdTaskStatus("row-1", "completed", patch);
    expect(state.filters).toContainEqual(["status", "pending"]);
  });

  it("counts its own earlier try that landed as done, by its photos", async () => {
    state.current = { id: "row-1", status: "completed", completed_by: "staff-2", after_photo_url: patch.after_photo_url };
    await expect(supabaseProvider.updateHouseholdTaskStatus("row-1", "completed", patch)).resolves.toMatchObject({ id: "row-1" });
  });

  it("counts its own earlier try that landed as done, by author and time", async () => {
    state.current = { id: "row-1", status: "completed", completed_by: "staff-1", completed_at: "2026-11-09T02:00:00+00:00" };
    await expect(supabaseProvider.updateHouseholdTaskStatus("row-1", "completed", patch)).resolves.toMatchObject({ id: "row-1" });
  });

  it("refuses over someone else's finish", async () => {
    state.current = {
      id: "row-1",
      status: "completed",
      completed_by: "staff-2",
      completed_at: "2026-11-09T01:00:00+00:00",
      after_photo_url: "https://x/theirs.jpg",
    };
    await expect(supabaseProvider.updateHouseholdTaskStatus("row-1", "completed", patch)).rejects.toEqual(
      new ChoreAlreadySettledError("completed")
    );
  });

  it("refuses over a cancelled chore", async () => {
    state.current = { id: "row-1", status: "cancelled" };
    await expect(supabaseProvider.updateHouseholdTaskStatus("row-1", "completed", patch)).rejects.toBeInstanceOf(
      ChoreAlreadySettledError
    );
  });

  it("still reports a chore the update couldn't reach at all", async () => {
    state.current = null;
    await expect(supabaseProvider.updateHouseholdTaskStatus("row-1", "completed", patch)).rejects.toThrow(/not updated/);
  });
});
