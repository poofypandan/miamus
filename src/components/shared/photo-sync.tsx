"use client";

import { useEffect } from "react";
import { hasPendingPhotos, syncPhotos } from "@/lib/photo-queue";

// Short enough that a photo goes up soon after signal returns even when the
// browser never fires "online" (iOS often doesn't on a Wi-Fi handover), long
// enough not to matter to the battery. Only ticks while something is waiting.
const RETRY_MS = 30_000;

/**
 * Uploads proof photos taken offline (Phase 138; see lib/photo-queue.ts):
 * on launch, when the connection returns, when the app comes back to the
 * foreground, and every half-minute while anything is still waiting.
 *
 * Silent throughout — the photo's own thumbnail is what shows its progress.
 * Renders nothing; mounted once from Providers so it covers both views.
 */
export function PhotoSync() {
  useEffect(() => {
    function run() {
      if (document.visibilityState !== "visible") return;
      void syncPhotos();
    }
    run();
    const timer = window.setInterval(() => {
      if (hasPendingPhotos()) run();
    }, RETRY_MS);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);

  return null;
}
