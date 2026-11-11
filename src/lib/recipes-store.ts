import { dataProvider } from "@/lib/data";
import { waitForSession } from "@/lib/auth/device-session";
import { getActiveHouseholdId } from "@/lib/tenant";
import type { RecipePayload, RecipeWithLines } from "@/lib/recipes";

/**
 * The recipe box behind useRecipes (Phase 170 PR B), outside React so the
 * household's own refresh (the app coming back, pull to refresh) reloads it
 * too, and so the owner's save shows at once on every screen holding it.
 *
 * The last copy is kept on the phone per household, so a cook with a weak
 * signal in the kitchen still opens the recipe (stale-while-revalidate, as
 * the household snapshot does). Storage may be missing or full: every read
 * and write is guarded, and the box works without it.
 */

export interface RecipesSnapshot {
  household: string | null;
  recipes: RecipeWithLines[];
  loaded: boolean;
  failed: boolean;
}

export const EMPTY_RECIPES: RecipesSnapshot = { household: null, recipes: [], loaded: false, failed: false };

const CACHE_VERSION = 1;
const cacheKey = (household: string) => `miamus_recipes_v${CACHE_VERSION}:${household}`;

function readCache(household: string): RecipeWithLines[] | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(household));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as RecipeWithLines[]) : null;
  } catch {
    return null;
  }
}

function writeCache(household: string, recipes: RecipeWithLines[]) {
  try {
    window.localStorage.setItem(cacheKey(household), JSON.stringify(recipes));
  } catch {
    // Full or blocked: the box still works, just without the offline copy.
  }
}

let snapshot: RecipesSnapshot = EMPTY_RECIPES;
/**
 * Counts this phone's successful saves and deletes (Codex P2, PR #98). A
 * load that started before one may have read the list before it; its answer
 * is dropped and the list read again, so an edit never looks undone and a
 * deleted recipe never comes back.
 */
let mutations = 0;
/** Re-reads after a save or delete raced a load, before giving up on that load. */
const MAX_REREADS = 3;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let loadedAt = 0;
const FRESH_MS = 5000;

function emit(next: RecipesSnapshot) {
  snapshot = next;
  if (next.household && next.loaded && !next.failed) writeCache(next.household, next.recipes);
  listeners.forEach((listener) => listener());
}

function currentHousehold(): string | null {
  try {
    return getActiveHouseholdId();
  } catch {
    return null;
  }
}

export function getRecipesSnapshot(): RecipesSnapshot {
  return snapshot;
}

export function subscribeRecipes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Loads the household's recipes; screens mounting together share one read. */
export async function loadRecipes(force = false): Promise<void> {
  const household = currentHousehold();
  if (!household) return;
  if (snapshot.household !== household) {
    // Paint the phone's last copy first (or nothing: another household's never shows).
    const cached = typeof window === "undefined" ? null : readCache(household);
    snapshot = cached
      ? { household, recipes: cached, loaded: true, failed: false }
      : { ...EMPTY_RECIPES, household };
    listeners.forEach((listener) => listener());
  }
  if (inflight) {
    if (!force) return inflight;
    await inflight.catch(() => undefined);
  } else if (!force && Date.now() - loadedAt < FRESH_MS && snapshot.loaded && !snapshot.failed) {
    return;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await waitForSession();
      let started = mutations;
      let recipes = await dataProvider.listRecipes();
      for (let reread = 0; started !== mutations && reread < MAX_REREADS; reread++) {
        started = mutations;
        recipes = await dataProvider.listRecipes();
      }
      // Still racing saves: keep what's showing (it has them), never an older read.
      if (started !== mutations) return;
      if (currentHousehold() === household) {
        loadedAt = Date.now();
        emit({ household, recipes, loaded: true, failed: false });
      }
    } catch (err) {
      console.error("Recipes not loaded", err);
      if (currentHousehold() === household) {
        // Keep whatever is showing (the phone's copy); say it failed only if there's nothing.
        emit({ ...snapshot, household, loaded: true, failed: snapshot.recipes.length === 0 });
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Reload, if any screen shows recipes (HouseholdProvider's refresh). */
export function refreshRecipes(): void {
  if (listeners.size > 0) void loadRecipes(true);
}

/** Owners: save a recipe and show it everywhere at once. */
export async function saveRecipe(payload: RecipePayload): Promise<RecipeWithLines> {
  const saved = await dataProvider.saveRecipe(payload);
  mutations += 1;
  const household = currentHousehold();
  if (household && snapshot.household === household) {
    const others = snapshot.recipes.filter((r) => r.id !== saved.id);
    emit({ ...snapshot, recipes: [...others, saved], loaded: true, failed: false });
  }
  return saved;
}

/** Owners: delete a recipe (its lines go with it). */
export async function deleteRecipe(id: string): Promise<void> {
  await dataProvider.deleteRecipe(id);
  mutations += 1;
  const household = currentHousehold();
  if (household && snapshot.household === household) {
    emit({ ...snapshot, recipes: snapshot.recipes.filter((r) => r.id !== id) });
  }
}
