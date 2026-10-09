"use client";

import { useEffect, useState } from "react";

/** The build this tab is running, inlined by next.config.ts. */
const CLIENT_VERSION = process.env.NEXT_PUBLIC_BUILD_ID;

// The camera round-trip (leave, shoot, come back) shouldn't fire a check
// every time; a phone picked up after a few minutes should.
const THROTTLE_MS = 60_000;

/**
 * Whether a newer deployment has gone live since this tab loaded (Phase 137).
 *
 * Asks /api/version on mount and whenever the app returns to the foreground
 * or comes back online — the moments a long-suspended PWA is most likely to
 * be stale. No interval: a phone in a pocket shouldn't be polling. Once a
 * mismatch is seen it stays true; only a reload can make this tab current.
 *
 * Every failure is silent: a missed check just means the next one decides.
 */
export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!CLIENT_VERSION || updateAvailable) return;
    let lastRun = 0;
    let cancelled = false;

    async function check() {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) return;
      const now = Date.now();
      if (now - lastRun < THROTTLE_MS) return;
      lastRun = now;
      try {
        const res = await fetch(`/api/version?t=${now}`, { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string | null };
        if (!cancelled && version && version !== CLIENT_VERSION) setUpdateAvailable(true);
      } catch {
        // Offline, or the deploy is mid-swap. The next foreground tries again.
      }
    }

    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("online", check);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("online", check);
    };
  }, [updateAvailable]);

  return updateAvailable;
}
