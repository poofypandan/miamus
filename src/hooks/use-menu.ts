"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getActiveHouseholdId } from "@/lib/tenant";
import { addDays, weekStart } from "@/lib/menu";
import { EMPTY_MENU, getMenuSnapshot, loadMenuWeek, subscribeMenu } from "@/lib/menu-store";
import type { KitchenNotes } from "@/lib/data/types";
import type { MenuDish } from "@/types/database";

function household(): string | null {
  try {
    return getActiveHouseholdId();
  } catch {
    return null;
  }
}

/**
 * The menu for the week holding `day` (Phase 170 PR C), and the kitchen
 * note: the phone's last copy at once, then the server's. `enabled` false
 * reads what's held but fetches nothing (Kitchen switched off).
 */
export function useMenuWeek(
  day: string,
  { enabled = true }: { enabled?: boolean } = {}
): {
  dishes: MenuDish[];
  notes: KitchenNotes | null;
  loaded: boolean;
  failed: boolean;
  /** This week came from the server in this session (not only the phone's copy). */
  weekLoaded: boolean;
  /** This week's last read failed and hasn't come in since. */
  weekFailed: boolean;
} {
  const state = useSyncExternalStore(subscribeMenu, getMenuSnapshot, () => EMPTY_MENU);
  const current = household();
  const monday = weekStart(day);
  useEffect(() => {
    if (enabled) void loadMenuWeek(monday);
  }, [current, monday, enabled]);
  const mine = state.household === current;
  const end = addDays(monday, 6);
  const dishes = useMemo(
    () => (mine ? state.dishes.filter((d) => d.day >= monday && d.day <= end) : []),
    [mine, state.dishes, monday, end]
  );
  return {
    dishes,
    notes: mine ? state.notes : null,
    loaded: mine && state.loaded,
    failed: mine && state.failed,
    weekLoaded: mine && state.weeks.includes(monday),
    weekFailed: mine && state.failedWeeks.includes(monday),
  };
}

/** Every dish held (several weeks): for Copy last week and Add missing. */
export function useAllHeldDishes(): MenuDish[] {
  const state = useSyncExternalStore(subscribeMenu, getMenuSnapshot, () => EMPTY_MENU);
  return state.household === household() ? state.dishes : [];
}
