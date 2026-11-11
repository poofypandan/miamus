"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useHousehold } from "@/context/household-context";
import { choreDraftKey, clearChoreDraft } from "@/lib/chore-draft";
import { drainOutbox, onNewWaiting, outboxItems, retryDelayMs, type DrainReport } from "@/lib/offline-queue";
import { confirmTaskExceptions } from "@/lib/task-exceptions-store";
import { choreSettledMessageEn, choreSettledMessageId } from "@/lib/chore-settled";
import { getActiveHouseholdId } from "@/lib/tenant";

/**
 * One drain at a time, across every mount on the page. Overlapping drains
 * are harmless for the data since Phase 161 (every retry carries the same
 * row ids), but would send everything twice and toast twice.
 */
let draining: Promise<void> | null = null;

/** "No longer linked" is said once per page, not on every try. */
let unlinkedTold = false;

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
    let paused = false;

    async function afterSend(report: DrainReport) {
      const household = getActiveHouseholdId();
      // Sent, or settled elsewhere meanwhile (audit M4): the draft is done.
      for (const item of [...report.sent, ...report.settled.map((s) => s.item)]) {
        // The chore's photos are on the server with it: the draft is done.
        if (item.job.kind === "chore") {
          clearChoreDraft(choreDraftKey(household, item.job.templateId, item.job.date));
        }
      }
      // Before the sent saves leave the queue, so they never drop off the
      // screen between the queue and the server's copy.
      await refreshRef.current({ silent: true });
      // Couldn't-do records live in their own cache (Phase 165): wait for it
      // to hold them too. A failed reload throws, and they stay queued.
      if (report.sent.some((item) => item.job.kind === "couldnt")) await confirmTaskExceptions();
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
        toast.success(id ? "Catatan yang tertunda sudah terkirim" : "Waiting saves sent");
      }
      // A chore finished by someone else, or cancelled, while this waited.
      for (const { item, state } of result.settled) {
        const title = item.job.kind === "chore" ? item.job.title : undefined;
        toast.info(id ? choreSettledMessageId(state, title) : choreSettledMessageEn(state, title), { duration: 8000 });
      }
      if (result.unlinked && !unlinkedTold) {
        unlinkedTold = true;
        toast.error(
          id
            ? "HP ini tidak terhubung lagi ke rumah. Catatan yang tertunda tetap di HP ini."
            : "This phone is no longer linked to the household. Waiting saves are kept on it."
        );
      }
      if (result.refused.length > result.settled.length) {
        toast.error(
          id
            ? "Ada catatan yang ditolak server dan tidak tersimpan. Coba catat lagi."
            : "The server refused a waiting save, so it was not kept. Please enter it again."
        );
      }
    }

    function schedule(ms: number) {
      window.clearTimeout(timer);
      if (stopped || paused || outboxItems().length === 0) return;
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
          // No longer linked (audit L4): no timer, which would only be
          // refused again. The app coming back to the front, the signal
          // returning or a new save still try; a re-link reloads the page.
          paused = !!result?.unlinked;
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
      // A new save tries again even after "no longer linked" (audit L4).
      paused = false;
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
