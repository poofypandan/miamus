import { get, update } from "idb-keyval";
import type { CreateBatchLogInput } from "@/lib/data";

const QUEUE_KEY = "b11-sync-queue";

// Every queued write is shaped as a batch-log payload (a single log is just
// a one-entry batch) — keeps the reconnect sync in dashboard/layout.tsx to
// one code path regardless of whether it came from `logTask` or
// `logTasksBatch`.
export interface OfflineQueueItem {
  id: string;
  table: string;
  payload: CreateBatchLogInput;
  timestamp: number;
}

export async function addToOfflineQueue(table: string, payload: CreateBatchLogInput): Promise<void> {
  await update<OfflineQueueItem[]>(QUEUE_KEY, (val = []) => [
    ...val,
    { id: crypto.randomUUID(), table, payload, timestamp: Date.now() },
  ]);
}

export async function getOfflineQueue(): Promise<OfflineQueueItem[]> {
  return (await get<OfflineQueueItem[]>(QUEUE_KEY)) ?? [];
}

export async function clearFromQueue(id: string): Promise<void> {
  await update<OfflineQueueItem[]>(QUEUE_KEY, (val = []) => val.filter((item) => item.id !== id));
}
