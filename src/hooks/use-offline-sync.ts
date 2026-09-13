"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useHousehold } from "@/context/household-context";
import { dataProvider } from "@/lib/data";
import { clearFromQueue, getOfflineQueue } from "@/lib/offline-queue";

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
 */
export function useOfflineSync() {
  const { refresh } = useHousehold();

  useEffect(() => {
    async function handleOnline() {
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
        toast.success("Offline logs synced successfully!");
        await refresh();
      }
    }

    window.addEventListener("online", handleOnline);
    // Also run once on mount in case they reloaded while already online.
    handleOnline();
    return () => window.removeEventListener("online", handleOnline);
  }, [refresh]);
}
