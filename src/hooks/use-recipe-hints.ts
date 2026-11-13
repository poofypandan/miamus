"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useHousehold } from "@/context/household-context";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useRecipes } from "@/hooks/use-recipes";
import { dataProvider } from "@/lib/data";
import type { CookedDish } from "@/lib/data/types";
import { getMenuSnapshot, subscribeMenu } from "@/lib/menu-store";
import { recipeHints, type RecipeHint } from "@/lib/recipe-hints";
import { getActiveHouseholdId } from "@/lib/tenant";

/**
 * Recipes that learn (Phase 177, plan 4a), for owners only: the household's
 * cooked dishes of the last 120 days, read once and again whenever a dish on
 * the phone is cooked, changed or un-cooked, and the suggestions worked out
 * from them. Staff phones never call this. Nothing while the Kitchen switch
 * is off (the suggestions show only where the Menu shows), or before the
 * recipes and the household's lists came from the server in this session.
 */

interface CookedState {
  household: string | null;
  dishes: CookedDish[];
}

let state: CookedState = { household: null, dishes: [] };
const listeners = new Set<() => void>();
let inflight: string | null = null;

function household(): string | null {
  try {
    return getActiveHouseholdId();
  } catch {
    return null;
  }
}

async function loadCooked(key: string): Promise<void> {
  const current = household();
  if (!current || inflight === `${current}|${key}`) return;
  inflight = `${current}|${key}`;
  try {
    const dishes = await dataProvider.listCookedDishes();
    if (household() !== current) return;
    state = { household: current, dishes };
    listeners.forEach((l) => l());
  } catch (err) {
    // A suggestion is a nicety: a failed read just shows none.
    console.error(err);
  } finally {
    if (inflight === `${current}|${key}`) inflight = null;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** What changes when a dish is cooked, changed or un-cooked on this phone. */
function cookedKey(): string {
  return getMenuSnapshot()
    .dishes.filter((d) => d.cooked_at)
    .map((d) => `${d.id}:${d.updated_at}`)
    .sort()
    .join(",");
}

export function useRecipeHints({ enabled = true }: { enabled?: boolean } = {}): RecipeHint[] {
  const { flags } = useHouseholdFeatures();
  const { recipes, fresh } = useRecipes({ enabled });
  const { inventoryItems, listsFresh } = useHousehold();
  const on = enabled && flags.kitchen === true;
  const cooked = useSyncExternalStore(subscribe, () => state, () => state);
  const key = useSyncExternalStore(subscribeMenu, cookedKey, () => "");
  const current = household();
  useEffect(() => {
    if (on) void loadCooked(key);
  }, [on, key, current]);
  return useMemo(() => {
    if (!on || !fresh || !listsFresh || cooked.household !== current) return [];
    return recipeHints(recipes, cooked.dishes, inventoryItems);
  }, [on, fresh, listsFresh, cooked, current, recipes, inventoryItems]);
}
