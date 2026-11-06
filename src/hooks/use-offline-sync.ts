"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useHousehold } from "@/context/household-context";
import { dataProvider } from "@/lib/data";
import { clearFromQueue, getOfflineQueue } from "@/lib/offline-queue";

/**
 * One drain at a time, across every mount on the page. Two overlapping drains
 * would both read the same queue entry before either cleared it, and
 * createLogsBatch has no idempotency key — so the entry would be saved twice,
 * a duplicate completion that inflates workload totals (Codex review, PR #6).
 */
let draining: Promise<void> | null = null;

/**
 * Drains the IndexedDB offline-log queue (see lib/offline-queue.ts) into
 * Supabase whenever the browser comes back online, and once on mount in
 * case the page was reloaded while already connected.
 *
 * Mounted on both the Owner Dashboard layout and the Staff "Jadwal" page —
 * those are two entirely separate route trees (the Staff page has no shared
 * layout with /dashboard), and staff logging potty breaks/meals in the
 * field is exactly the primary offline scenario this queue exists for, so
 * the listener needs to be reachable from there too, not just /dashboard.
 *
 * `lang` only picks the toast's words (Phase 149). It is read through a ref,
 * so changing language — or the owner's saved choice arriving mid-drain —
 * never restarts the effect.
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
    async function drain() {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const queue = await getOfflineQueue();
      if (queue.length === 0) return;

      let syncedAny = false;
      for (const item of queue) {
        try {
          await dataProvider.createLogsBatch(item.payload);
          await clearFromQueue(item.id);
          syncedAny = true;
        } catch (err) {
          console.error("Failed to sync offline log", item.id, err);
        }
      }

      if (syncedAny) {
        toast.success(
          langRef.current === "id"
            ? "Catatan offline berhasil dikirim!"
            : "Offline logs synced successfully!"
        );
        await refreshRef.current();
      }
    }

    function handleOnline() {
      // Already draining: that run reads the queue afresh and covers this one.
      if (draining) return;
      draining = drain()
        .catch((err) => console.error("Offline sync failed", err))
        .finally(() => {
          draining = null;
        });
    }

    window.addEventListener("online", handleOnline);
    // Also run once on mount in case they reloaded while already online.
    handleOnline();
    return () => window.removeEventListener("online", handleOnline);
  }, []);
}
