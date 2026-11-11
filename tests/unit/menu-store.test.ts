import { beforeEach, describe, expect, it, vi } from "vitest";

// The weekly menu's cache (Phase 170 PR C): a week whose first read failed
// is read again on the household's refresh and when the phone comes back
// online, and a week counts as loaded only once the server answered
// (Codex, PR #101).

const provider = { listMenuDishes: vi.fn(), getKitchenNotes: vi.fn(), addMenuDishes: vi.fn() };
vi.mock("@/lib/data", () => ({ dataProvider: provider }));
vi.mock("@/lib/auth/device-session", () => ({ waitForSession: async () => undefined }));
vi.mock("@/lib/tenant", () => ({ getActiveHouseholdId: () => "house-a" }));

// The node test environment has no browser: a stand-in window and document,
// so the store's "online" and "back to the foreground" listeners are real.
const g = globalThis as unknown as { window: EventTarget; document: EventTarget & { visibilityState: string } };
g.window = new EventTarget();
g.document = Object.assign(new EventTarget(), { visibilityState: "visible" });

const store = await import("@/lib/menu-store");
import type { MenuDish } from "@/types/database";

function dish(id: string, day: string, title: string): MenuDish {
  return {
    id,
    household_id: "house-a",
    day,
    meal: "lunch",
    recipe_id: null,
    title,
    servings: null,
    notes: null,
    position: 0,
    cooked_at: null,
    cooked_by: null,
    cooked_uses: null,
    created_by: null,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
  };
}

const unsubscribe: (() => void)[] = [];

beforeEach(() => {
  for (const fn of Object.values(provider)) fn.mockReset();
  provider.getKitchenNotes.mockResolvedValue({ text: null, confirmedAt: null });
  // A screen is showing the menu (refreshes only run then).
  unsubscribe.push(store.subscribeMenu(() => undefined));
});

describe("a week whose first read failed is read again", () => {
  it("not loaded after a failure; the household's refresh reads it again", async () => {
    provider.listMenuDishes.mockRejectedValueOnce(new Error("offline"));
    await store.loadMenuWeek("2026-11-11", true);
    expect(store.getMenuSnapshot().weeks).not.toContain("2026-11-09");
    expect(store.missingWeeks()).toContain("2026-11-09");
    // Failed, so Add missing says Try again rather than Loading… forever.
    expect(store.getMenuSnapshot().failedWeeks).toContain("2026-11-09");
    // The kitchen note never came in: the editor says Try again, never shows it empty.
    expect(store.getMenuSnapshot().notesLoaded).toBe(false);
    expect(store.getMenuSnapshot().notesFailed).toBe(true);

    provider.listMenuDishes.mockResolvedValueOnce([dish("d1", "2026-11-11", "Soto")]);
    store.refreshMenu();
    await vi.waitFor(() => expect(store.getMenuSnapshot().weeks).toContain("2026-11-09"));
    expect(store.getMenuSnapshot().dishes.map((d) => d.title)).toContain("Soto");
    expect(store.missingWeeks()).not.toContain("2026-11-09");
    expect(store.getMenuSnapshot().failedWeeks).not.toContain("2026-11-09");
    expect(store.getMenuSnapshot().notesLoaded).toBe(true);
    expect(store.getMenuSnapshot().notesFailed).toBe(false);
  });

  it("coming back online retries only the weeks that failed", async () => {
    provider.listMenuDishes.mockReset();
    provider.listMenuDishes.mockRejectedValueOnce(new Error("offline"));
    await store.loadMenuWeek("2026-11-18", true);
    expect(store.missingWeeks()).toContain("2026-11-16");

    provider.listMenuDishes.mockResolvedValue([dish("d2", "2026-11-18", "Rendang")]);
    g.window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(store.getMenuSnapshot().weeks).toContain("2026-11-16"));
    // Only the failed week was asked again: 2026-11-09 had loaded already.
    expect(provider.listMenuDishes).toHaveBeenCalledTimes(2);
    expect(provider.listMenuDishes).toHaveBeenLastCalledWith("2026-11-16", "2026-11-22");
    expect(provider.listMenuDishes.mock.calls.every(([from]) => from === "2026-11-16")).toBe(true);

    // And back to the foreground does the same.
    provider.listMenuDishes.mockReset();
    provider.listMenuDishes.mockRejectedValueOnce(new Error("offline"));
    await store.loadMenuWeek("2026-11-25", true);
    provider.listMenuDishes.mockResolvedValue([]);
    g.document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(store.getMenuSnapshot().weeks).toContain("2026-11-23"));
  });
});
