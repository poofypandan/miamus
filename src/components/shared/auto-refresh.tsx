"use client";

import { useEffect, useRef } from "react";
import { useHousehold } from "@/context/household-context";

// Long enough that the camera round-trip (leave the app, shoot, come back)
// doesn't fire a second fetch on top of the one that just ran, short enough
// that a phone picked up after a few minutes is current before it is read.
const THROTTLE_MS = 30_000;

/**
 * Refetches household data whenever the app comes back to the foreground.
 *
 * Both views are long-lived client pages: staff leave the app open all day and
 * the owner's dashboard sits on a phone for hours, so without this a schedule
 * approved at noon is still missing from the staff view at three. React state
 * is where the data lives — this deliberately does not call router.refresh(),
 * which re-runs server components and would do nothing at all here.
 *
 * Renders nothing; mounted once from Providers so it covers both views.
 */
export function AutoRefresh() {
  const { refresh } = useHousehold();
  const lastRun = useRef(Date.now());

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      // Offline: the request would only fail, and use-offline-sync already
      // refetches once the connection comes back.
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRun.current < THROTTLE_MS) return;
      lastRun.current = now;
      // Silent: no skeletons, no flicker — the screen simply becomes correct.
      refresh({ silent: true }).catch((err) => {
        // A failed background sync leaves the last-known data on screen, which
        // is the right outcome; nothing is said because nobody asked for it.
        console.error("Foreground refresh failed", err);
      });
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  return null;
}
