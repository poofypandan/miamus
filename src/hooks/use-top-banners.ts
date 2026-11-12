"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Which of the things that ask the owner for something at the top of the
 * screen is on screen right now (Phase 175 check, P2): the notifications
 * prompt, and Today's Set up card, whose own row asks for notifications.
 *
 * After "Not now" on the card, the Add to Home Screen tip and the
 * notifications prompt both appeared at once, and after Undo both stayed
 * above the card. Now one asks at a time: the notifications prompt first,
 * the tip once it is answered or put off, and neither while the card shows.
 *
 * Held in memory only: each component says whether it shows as it renders,
 * so a reload starts again from what they decide.
 */
export type TopBanner = "pushPrompt" | "setupCard";

const showing: Record<TopBanner, boolean> = { pushPrompt: false, setupCard: false };
const listeners = new Set<() => void>();

function set(banner: TopBanner, on: boolean) {
  if (showing[banner] === on) return;
  showing[banner] = on;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Says whether `banner` is on screen; it stops counting once unmounted. */
export function useReportBanner(banner: TopBanner, on: boolean) {
  useEffect(() => {
    set(banner, on);
    return () => set(banner, false);
  }, [banner, on]);
}

/** Whether `banner` is on screen now. */
export function useBannerShowing(banner: TopBanner): boolean {
  return useSyncExternalStore(
    subscribe,
    () => showing[banner],
    () => false
  );
}
