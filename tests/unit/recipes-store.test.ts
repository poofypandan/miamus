import { beforeEach, describe, expect, it, vi } from "vitest";

// The recipe box's cache (Phase 170 PR B): a load that started before a save
// or delete never overwrites it (Codex P2, PR #98).

const provider = { listRecipes: vi.fn(), saveRecipe: vi.fn(), deleteRecipe: vi.fn() };
vi.mock("@/lib/data", () => ({ dataProvider: provider }));
vi.mock("@/lib/auth/device-session", () => ({ waitForSession: async () => undefined }));
vi.mock("@/lib/tenant", () => ({ getActiveHouseholdId: () => "house-a" }));

const store = await import("@/lib/recipes-store");
import type { RecipeWithLines } from "@/lib/recipes";

function recipe(id: string, name: string): RecipeWithLines {
  return {
    id,
    household_id: "house-a",
    name,
    servings: 4,
    steps: null,
    written_in: "id",
    name_id: null,
    steps_id: null,
    created_by: null,
    created_at: "2026-11-11T00:00:00Z",
    updated_at: "2026-11-11T00:00:00Z",
    ingredients: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const names = () => store.getRecipesSnapshot().recipes.map((r) => r.name).sort();

beforeEach(async () => {
  for (const fn of Object.values(provider)) fn.mockReset();
  // A settled first load, so each test starts from a known box.
  provider.listRecipes.mockResolvedValueOnce([recipe("r1", "Soto"), recipe("r2", "Rendang")]);
  await store.loadRecipes(true);
  expect(names()).toEqual(["Rendang", "Soto"]);
});

describe("an older load never overwrites a newer save or delete", () => {
  it("a save made while a load is out: the load's older answer is dropped and the list read again", async () => {
    const slow = deferred<RecipeWithLines[]>();
    provider.listRecipes.mockReturnValueOnce(slow.promise);
    const load = store.loadRecipes(true);

    provider.saveRecipe.mockResolvedValueOnce(recipe("r1", "Soto ayam"));
    await store.saveRecipe({ recipe: { ...recipe("r1", "Soto ayam") }, ingredients: [] });
    expect(names()).toEqual(["Rendang", "Soto ayam"]);

    // The re-read has the save; the old answer (read before it) arrives last.
    provider.listRecipes.mockResolvedValueOnce([recipe("r1", "Soto ayam"), recipe("r2", "Rendang")]);
    slow.resolve([recipe("r1", "Soto"), recipe("r2", "Rendang")]);
    await load;
    expect(names()).toEqual(["Rendang", "Soto ayam"]);
    expect(provider.listRecipes).toHaveBeenCalledTimes(3); // first load, the slow one, the re-read
  });

  it("a delete made while a load is out: the deleted recipe doesn't come back", async () => {
    const slow = deferred<RecipeWithLines[]>();
    provider.listRecipes.mockReturnValueOnce(slow.promise);
    const load = store.loadRecipes(true);

    provider.deleteRecipe.mockResolvedValueOnce(undefined);
    await store.deleteRecipe("r2");
    expect(names()).toEqual(["Soto"]);

    provider.listRecipes.mockResolvedValueOnce([recipe("r1", "Soto")]);
    slow.resolve([recipe("r1", "Soto"), recipe("r2", "Rendang")]);
    await load;
    expect(names()).toEqual(["Soto"]);
  });

  it("saves that keep racing every re-read: what's showing (with them) stays", async () => {
    let n = 0;
    provider.listRecipes.mockImplementation(async () => {
      n += 1;
      // Each read is overtaken by another save before it answers.
      provider.saveRecipe.mockResolvedValueOnce(recipe(`new-${n}`, `Baru ${n}`));
      await store.saveRecipe({ recipe: recipe(`new-${n}`, `Baru ${n}`), ingredients: [] });
      return [recipe("r1", "Soto"), recipe("r2", "Rendang")];
    });
    await store.loadRecipes(true);
    expect(names()).toContain("Baru 1");
    expect(names()).toContain("Baru 4");
  });

  it("a load with no save in between is taken as is", async () => {
    provider.listRecipes.mockResolvedValueOnce([recipe("r3", "Nasi goreng")]);
    await store.loadRecipes(true);
    expect(names()).toEqual(["Nasi goreng"]);
  });
});
