"use client";

import { useSyncExternalStore } from "react";
import { useHousehold } from "@/context/household-context";
import { laterStage, parseSetupStage, type SetupStage } from "@/lib/calm-start";

/**
 * How far this household has come on this phone, as Today's first-run
 * checklist last saw it (Phase 172 PR A1, lib/calm-start): "new", "task" (a
 * first task given) or "past" (something finished). What's new waits for
 * "past"; Add to Home Screen and the notifications prompt for "task".
 *
 * Kept on the phone (localStorage) and shared between tabs by an event, so a
 * card on Chores knows what Today found without reading it all again. Null
 * until Today has been opened on this phone, which waits like "new". Never
 * goes backwards.
 */
const PREFIX = "miamus.setup-stage.";
const EVENT = "miamus:setup-stage";

export function setupStageKey(householdId: string): string {
  return PREFIX + householdId;
}

function read(householdId: string): SetupStage | null {
  try {
    return parseSetupStage(window.localStorage.getItem(setupStageKey(householdId)));
  } catch {
    return null;
  }
}

/** Today records what it sees; earlier stages never overwrite later ones. */
export function recordSetupStage(householdId: string, seen: SetupStage) {
  const known = read(householdId);
  const next = laterStage(known, seen);
  if (next === known) return;
  try {
    window.localStorage.setItem(setupStageKey(householdId), next);
  } catch {
    // Blocked storage: the cards stay quiet, which is the safe side.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useSetupStage(): SetupStage | null {
  const { activeHouseholdId, tenantReady } = useHousehold();
  return useSyncExternalStore(
    subscribe,
    () => (tenantReady ? read(activeHouseholdId) : null),
    () => null
  );
}
