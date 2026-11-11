import { dataProvider } from "@/lib/data";
import { waitForSession } from "@/lib/auth/device-session";
import { getActiveHouseholdId } from "@/lib/tenant";
import { addDays, compareDishes, weekStart, type MenuDishInput } from "@/lib/menu";
import type { KitchenNotes } from "@/lib/data/types";
import type { CookedUse, InventoryItem, MenuDish } from "@/types/database";

/**
 * The weekly menu behind useMenuWeek (Phase 170 PR C), outside React like
 * recipes-store: the household's own refresh reloads it, and an owner's
 * save shows at once on every screen holding it. It holds the weeks screens
 * asked for (by their Monday) and the household's kitchen note.
 *
 * The last copy is kept on the phone per household, so the cook still sees
 * Menu hari ini on a weak kitchen signal. Storage may be missing or full:
 * every read and write is guarded.
 */

export interface MenuSnapshot {
  household: string | null;
  dishes: MenuDish[];
  /** Mondays whose seven days are loaded. */
  weeks: string[];
  notes: KitchenNotes | null;
  loaded: boolean;
  failed: boolean;
}

export const EMPTY_MENU: MenuSnapshot = { household: null, dishes: [], weeks: [], notes: null, loaded: false, failed: false };

const CACHE_VERSION = 1;
const cacheKey = (household: string) => `miamus_menu_v${CACHE_VERSION}:${household}`;
/** The phone keeps three weeks around today: enough for Menu hari ini and the week view. */
const CACHE_DAYS_BACK = 7;
const CACHE_DAYS_AHEAD = 14;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readCache(household: string): Pick<MenuSnapshot, "dishes" | "notes"> | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(household));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { dishes?: unknown; notes?: unknown };
    if (!Array.isArray(parsed.dishes)) return null;
    return { dishes: parsed.dishes as MenuDish[], notes: (parsed.notes as KitchenNotes | null) ?? null };
  } catch {
    return null;
  }
}

function writeCache(household: string, snap: MenuSnapshot) {
  try {
    const now = today();
    const from = addDays(now, -CACHE_DAYS_BACK);
    const to = addDays(now, CACHE_DAYS_AHEAD);
    const dishes = snap.dishes.filter((d) => d.day >= from && d.day <= to);
    window.localStorage.setItem(cacheKey(household), JSON.stringify({ dishes, notes: snap.notes }));
  } catch {
    // Full or blocked: the menu still works, just without the offline copy.
  }
}

let snapshot: MenuSnapshot = EMPTY_MENU;
/** This phone's successful writes; a load that started before one is read again (as recipes-store). */
let mutations = 0;
const MAX_REREADS = 3;
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();
const loadedAt = new Map<string, number>();
const FRESH_MS = 5000;

function emit(next: MenuSnapshot) {
  snapshot = next;
  if (next.household && next.loaded && !next.failed) writeCache(next.household, next);
  listeners.forEach((listener) => listener());
}

function currentHousehold(): string | null {
  try {
    return getActiveHouseholdId();
  } catch {
    return null;
  }
}

export function getMenuSnapshot(): MenuSnapshot {
  return snapshot;
}

export function subscribeMenu(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replaces one week's dishes with the server's, keeping every other week. */
function withWeek(snap: MenuSnapshot, monday: string, dishes: MenuDish[]): MenuDish[] {
  const end = addDays(monday, 6);
  const others = snap.dishes.filter((d) => d.day < monday || d.day > end);
  return [...others, ...dishes].sort(compareDishes);
}

function ensureHousehold(household: string) {
  if (snapshot.household === household) return;
  const cached = typeof window === "undefined" ? null : readCache(household);
  snapshot = cached
    ? { household, dishes: cached.dishes, weeks: [], notes: cached.notes, loaded: true, failed: false }
    : { ...EMPTY_MENU, household };
  listeners.forEach((listener) => listener());
}

/** Loads one week (by any day in it) and the kitchen note; screens asking together share one read. */
export async function loadMenuWeek(day: string, force = false): Promise<void> {
  const household = currentHousehold();
  if (!household) return;
  ensureHousehold(household);
  const monday = weekStart(day);
  const key = `${household}:${monday}`;
  const running = inflight.get(key);
  if (running) {
    if (!force) return running;
    await running.catch(() => undefined);
  } else if (!force && Date.now() - (loadedAt.get(key) ?? 0) < FRESH_MS && snapshot.weeks.includes(monday)) {
    return;
  }
  if (inflight.get(key)) return inflight.get(key);
  const job = (async () => {
    try {
      await waitForSession();
      const read = () => Promise.all([dataProvider.listMenuDishes(monday, addDays(monday, 6)), dataProvider.getKitchenNotes()]);
      let started = mutations;
      let [dishes, notes] = await read();
      for (let reread = 0; started !== mutations && reread < MAX_REREADS; reread++) {
        started = mutations;
        [dishes, notes] = await read();
      }
      if (started !== mutations) return;
      if (currentHousehold() === household && snapshot.household === household) {
        loadedAt.set(key, Date.now());
        emit({
          ...snapshot,
          dishes: withWeek(snapshot, monday, dishes),
          weeks: snapshot.weeks.includes(monday) ? snapshot.weeks : [...snapshot.weeks, monday],
          notes,
          loaded: true,
          failed: false,
        });
      }
    } catch (err) {
      console.error("Menu not loaded", err);
      if (currentHousehold() === household && snapshot.household === household) {
        emit({ ...snapshot, loaded: true, failed: snapshot.dishes.length === 0 });
      }
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, job);
  return job;
}

/** Reload the weeks on screen (HouseholdProvider's refresh), if any screen shows the menu. */
export function refreshMenu(): void {
  if (listeners.size === 0) return;
  for (const monday of snapshot.weeks) void loadMenuWeek(monday, true);
}

function applyDishes(changed: MenuDish[], removed: string[] = []) {
  mutations += 1;
  const household = currentHousehold();
  if (!household || snapshot.household !== household) return;
  const ids = new Set([...changed.map((d) => d.id), ...removed]);
  emit({ ...snapshot, dishes: [...snapshot.dishes.filter((d) => !ids.has(d.id)), ...changed].sort(compareDishes) });
}

/** Owners: plan dishes. */
export async function addDishes(inputs: MenuDishInput[]): Promise<MenuDish[]> {
  const added = await dataProvider.addMenuDishes(inputs);
  applyDishes(added);
  return added;
}

/** Owners: change a dish (never its cooked columns). */
export async function updateDish(id: string, patch: Partial<MenuDishInput>): Promise<MenuDish> {
  const dish = await dataProvider.updateMenuDish(id, patch);
  applyDishes([dish]);
  return dish;
}

/** Owners: remove dishes (the toast's Undo of Copy last week, or one dish). */
export async function deleteDishes(ids: string[]): Promise<void> {
  await dataProvider.deleteMenuDishes(ids);
  applyDishes([], ids);
}

/**
 * Sudah dimasak: takes `uses` off stock and marks the dish cooked. Returns
 * the changed items for the household's list. A dish already cooked (a
 * resend after a weak signal, or another phone) is refused by the server;
 * the menu is then read again, and the error passed on.
 */
export async function cookDish(
  id: string,
  uses: CookedUse[],
  staffId: string | null
): Promise<{ dish: MenuDish; items: InventoryItem[] }> {
  try {
    const result = await dataProvider.cookMenuDish(id, uses, staffId);
    applyDishes([result.dish]);
    return result;
  } catch (err) {
    const dish = snapshot.dishes.find((d) => d.id === id);
    if (dish) void loadMenuWeek(dish.day, true);
    throw err;
  }
}

/** Batalkan / Mark not cooked: puts back exactly what cooking took. */
export async function uncookDish(id: string): Promise<{ dish: MenuDish; items: InventoryItem[] }> {
  const result = await dataProvider.uncookMenuDish(id);
  applyDishes([result.dish]);
  return result;
}

/** Owners: the kitchen note (blank clears it); `confirm` is the one-time health-data OK. */
export async function saveKitchenNotes(text: string | null, confirm: boolean): Promise<KitchenNotes> {
  const notes = await dataProvider.setKitchenNotes(text, confirm);
  mutations += 1;
  const household = currentHousehold();
  if (household && snapshot.household === household) emit({ ...snapshot, notes });
  return notes;
}
