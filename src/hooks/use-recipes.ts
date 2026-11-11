"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getActiveHouseholdId } from "@/lib/tenant";
import { EMPTY_RECIPES, getRecipesSnapshot, loadRecipes, subscribeRecipes } from "@/lib/recipes-store";
import type { RecipeWithLines } from "@/lib/recipes";

function household(): string | null {
  try {
    return getActiveHouseholdId();
  } catch {
    return null;
  }
}

/**
 * The household's recipes (Phase 170 PR B): the phone's last copy at once,
 * then the server's. `enabled` false reads what's held but fetches nothing
 * (Kitchen switched off).
 */
export function useRecipes({ enabled = true }: { enabled?: boolean } = {}): {
  recipes: RecipeWithLines[];
  loaded: boolean;
  failed: boolean;
  /** From the server in this session (cooking waits for it). */
  fresh: boolean;
  /** The last server read failed. */
  errored: boolean;
} {
  const state = useSyncExternalStore(subscribeRecipes, getRecipesSnapshot, () => EMPTY_RECIPES);
  const current = household();
  useEffect(() => {
    if (enabled) void loadRecipes();
  }, [current, enabled]);
  const mine = state.household === current;
  return {
    recipes: mine ? state.recipes : [],
    loaded: mine && state.loaded,
    failed: mine && state.failed,
    fresh: mine && state.fresh,
    errored: mine && state.errored,
  };
}
