"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useHousehold } from "@/context/household-context";
import { choreDraftKey, clearChoreDraft } from "@/lib/chore-draft";
import { drainOutbox, onNewWaiting, outboxItems, retryDelayMs, type DrainReport } from "@/lib/offline-queue";
import { getActiveHouseholdId } from "@/lib/tenant";

/**
 * One drain at a time, across every mount on the page. Overlapping drains
 * are harmless for the data since Phase 161 (every retry carries the same
 * row ids), but would send everything twice and toast twice.
 */
let draining: Promise<void> | null = null;

/** Soon after a save starts waiting: the signal may only have blinked. */
const FIRST_RETRY_MS = 3_000;

/**
 * Sends the saves waiting on this phone (lib/offline-queue.ts) — the logs,
 * finished chores and food that got no answer when they were made.
 *
 * Since Phase 161 not only when the browser fires "online". A phone on one
 * bar of Wi-Fi never went offline in the browser's eyes, and iOS often skips
 * the event on a Wi-Fi handover. So it also runs on mount, when the app
 * comes back to the front, soon after a save starts waiting, and on a timer
 * while anything waits: 5s, 10s, 20s, 40s, then every minute until it goes.
 *
 * Mounted on both the Owner Dashboard layout and the Staff "Jadwal" page —
 * two separate route trees, and staff logging in the field is exactly what
 * the queue is for.
 *
 * `lang` only picks the toast's words (Phase 149), through a ref, so a
 * language change never restarts the loop.
 */
export function useOfflineSync(lang: "en" | "id") {
  const { refresh } = useHousehold();
  const langRef = useRef(lang);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    langRef.current = lang;
    refreshRef.current = refresh;
  });

  useEffect(() => {
    let failures = 0;
    let timer: number | undefined;
    let stopped = false;

    async function afterSend(report: DrainReport) {
      const household = getActiveHouseholdId();
      for (const item of report.sent) {
        // The chore's photos are on the server with it: the draft is done.
        if (item.job.kind === "chore") {
          clearChoreDraft(choreDraftKey(household, item.job.templateId, item.job.date));
        }
      }
      // Before the sent saves leave the queue, so they never drop off the
      // screen between the queue and the server's copy.
      await refreshRef.current({ silent: true });
    }

    async function drain(): Promise<DrainReport | null> {
      // Truly offline: nothing to try. A weak signal still tries.
      if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
      return drainOutbox(afterSend);
    }

    // A Web Lock covers other tabs of the app (and the installed PWA beside a
    // browser tab), which share the queue but not this module. `ifAvailable`:
    // if another tab holds it, that tab is already sending.
    async function drainOnce(): Promise<DrainReport | null> {
      if (typeof navigator !== "undefined" && navigator.locks) {
        return navigator.locks.request("miamus-offline-drain", { ifAvailable: true }, async (lock) =>
          lock ? drain() : null
        );
      }
      return drain();
    }

    function report(result: DrainReport | null) {
      if (!result) return;
      const id = langRef.current === "id";
      if (result.sent.length > 0 && result.confirmed) {
        toast.success(id ? "Catatan yang tertunda sudah terkirim ✅" : "Waiting saves sent ✅");
      }
      if (result.refused.length > 0) {
        toast.error(
          id
            ? "Ada catatan yang ditolak server dan tidak tersimpan. Coba catat lagi."
            : "The server refused a waiting save, so it was not kept. Please enter it again."
        );
      }
    }

    function schedule(ms: number) {
      window.clearTimeout(timer);
      if (stopped || outboxItems().length === 0) return;
      timer = window.setTimeout(run, ms);
    }

    function run() {
      if (stopped) return;
      if (document.visibilityState !== "visible") return;
      // Already sending — possibly started by the instance on the page just
      // left, whose own reschedule is now a no-op: pick up from where it ends
      // (Codex, PR #41).
      if (draining) {
        void draining.finally(() => schedule(retryDelayMs(failures - 1)));
        return;
      }
      draining = drainOnce()
        .then((result) => {
          report(result);
          if (result && result.waiting === 0 && result.confirmed) failures = 0;
          else failures++;
        })
        .catch((err) => {
          failures++;
          console.error("Offline sync failed", err);
        })
        .finally(() => {
          draining = null;
          schedule(retryDelayMs(failures - 1));
        });
    }

    function soon() {
      failures = 0;
      schedule(FIRST_RETRY_MS);
    }

    function online() {
      failures = 0;
      run();
    }

    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", run);
    const unsubscribe = onNewWaiting(soon);
    // Also once on mount: reopened with saves still waiting.
    run();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", run);
      unsubscribe();
    };
  }, []);
}
