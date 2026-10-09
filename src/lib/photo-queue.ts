"use client";

import { createStore, del, get, keys, set, type UseStore } from "idb-keyval";
import { dataProvider } from "@/lib/data";
import { classifySubmitError } from "@/lib/submit-errors";

/**
 * Proof photos that are taken now and uploaded whenever there is signal
 * (Phase 138).
 *
 * WHY. Chores happen in the garden, the garage, the far end of the house —
 * exactly where the Wi-Fi gives out. A photo that had to upload before it
 * counted meant a "Gagal mengunggah foto" toast and a walk back to the router,
 * or worse, a before shot that never happened.
 *
 * HOW. A photo's stored URL is built on the device (reservePhotoPath: the
 * household, the folder, the capture time, a random suffix), so it can be
 * handed to the chore's draft the instant the shutter closes. Only the bytes
 * wait. They go into IndexedDB first, and come out once the upload lands.
 *
 *   capture -> compress -> IndexedDB -> URL into the draft   (no network)
 *                                    -> upload, then delete  (when there is)
 *
 * WHY INDEXEDDB. The draft (lib/chore-draft.ts) is localStorage, which is
 * right for two short strings and wrong for photos: ~200KB each against a
 * ~5MB quota shared with the household snapshot. IndexedDB is the one
 * persistent store every PWA engine gives a real quota to, and idb-keyval is
 * already how the offline log queue reaches it (lib/offline-queue.ts). The
 * bytes are kept as an ArrayBuffer, not a Blob: iOS Safari has a history of
 * storing Blobs in IndexedDB that read back empty.
 *
 * Uploads are retried until they land, with one exception: a photo the
 * storage server rejects outright (unreadable, wrong type, too big) is marked
 * failed and kept for the UI to ask for a retake — retrying it forever would
 * only fail forever.
 */

interface QueuedPhoto {
  path: string;
  data: ArrayBuffer;
  type: string;
  createdAt: number;
  failed?: boolean;
}

/** Where a photo is, as far as this device knows. No entry: uploaded. */
export type PhotoSyncState = "pending" | "uploading" | "failed";

/**
 * Long past any chore's draft (7 days) — an entry this old belongs to work
 * nobody is coming back to, and only takes up space.
 */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

let store: UseStore | null = null;
function db(): UseStore {
  store ??= createStore("miamus-photo-queue", "photos");
  return store;
}

// --- State the UI subscribes to ---------------------------------------------

const states = new Map<string, PhotoSyncState>();
const listeners = new Set<() => void>();
let hydrated = false;
let hydrating: Promise<void> | null = null;
// A new value on every change, so useSyncExternalStore re-renders.
let version = 0;

function emit() {
  version++;
  listeners.forEach((listener) => listener());
}

function setState(url: string, state: PhotoSyncState | null) {
  if (state) states.set(url, state);
  else states.delete(url);
  emit();
}

export function subscribePhotoQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function photoQueueVersion(): number {
  return version;
}

/** Whether the queue has been read back from the device yet. */
export function photoQueueReady(): boolean {
  return hydrated;
}

export function photoSyncState(url: string | null | undefined): PhotoSyncState | null {
  return url ? (states.get(url) ?? null) : null;
}

export function hasPendingPhotos(): boolean {
  for (const state of states.values()) if (state !== "failed") return true;
  return false;
}

/** Reads what a previous session left behind, once per page load. */
export function hydratePhotoQueue(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    hydrated = true;
    return Promise.resolve();
  }
  hydrating ??= (async () => {
    try {
      for (const key of await keys<string>(db())) {
        const entry = await get<QueuedPhoto>(key, db());
        if (!entry) continue;
        if (Date.now() - entry.createdAt > MAX_AGE_MS) {
          await del(key, db());
          continue;
        }
        states.set(key, entry.failed ? "failed" : "pending");
      }
    } catch (err) {
      console.error("Could not read the photo queue", err);
    } finally {
      hydrated = true;
      emit();
    }
  })();
  return hydrating;
}

// --- Capture ------------------------------------------------------------------

/**
 * Keeps a photo on the device and returns its final stored URL straight away;
 * the upload follows in the background. When the device has no usable
 * IndexedDB (a locked-down private window), falls back to uploading now — the
 * pre-Phase 138 behaviour — so a photo is never silently dropped.
 */
export async function enqueuePhoto(file: File, pathPrefix: string): Promise<string> {
  const { path, url } = dataProvider.reservePhotoPath(file, pathPrefix);
  try {
    if (typeof indexedDB === "undefined") throw new Error("No IndexedDB");
    const entry: QueuedPhoto = {
      path,
      data: await file.arrayBuffer(),
      type: file.type,
      createdAt: Date.now(),
    };
    await set(url, entry, db());
  } catch (err) {
    console.error("Could not keep the photo on the device; uploading directly", err);
    await dataProvider.uploadPhotoAt(path, file);
    return url;
  }
  setState(url, "pending");
  void syncPhotos();
  return url;
}

/**
 * The photo as stored on the device, for previewing it before (and while) it
 * uploads. Null once it has uploaded, or if it was never queued here.
 */
export async function readQueuedPhoto(url: string): Promise<Blob | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const entry = await get<QueuedPhoto>(url, db());
    return entry ? new Blob([entry.data], { type: entry.type }) : null;
  } catch {
    return null;
  }
}

/** A queued photo removed for a retake: it is never uploaded. */
export async function discardPhoto(url: string): Promise<void> {
  if (!states.has(url)) return;
  setState(url, null);
  try {
    await del(url, db());
  } catch (err) {
    console.error("Could not discard the queued photo", err);
  }
}

// --- Sync ---------------------------------------------------------------------

let running: Promise<void> | null = null;

/**
 * Uploads everything waiting, one at a time. Single-flight: a call while a
 * drain is running joins it, and a photo queued mid-drain is picked up by it.
 */
export function syncPhotos(): Promise<void> {
  running ??= drain().finally(() => {
    running = null;
  });
  return running;
}

async function drain(): Promise<void> {
  await hydratePhotoQueue();
  const tried = new Set<string>();
  for (;;) {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const next = [...states].find(([url, state]) => state === "pending" && !tried.has(url));
    if (!next) return;
    const [url] = next;
    tried.add(url);
    await uploadOne(url);
  }
}

async function uploadOne(url: string): Promise<void> {
  let entry: QueuedPhoto | undefined;
  try {
    entry = await get<QueuedPhoto>(url, db());
  } catch (err) {
    console.error("Could not read a queued photo", err);
    return;
  }
  // Discarded since it was listed.
  if (!entry) {
    setState(url, null);
    return;
  }
  if (!entry.data || entry.data.byteLength === 0) {
    await markFailed(url, entry);
    return;
  }

  setState(url, "uploading");
  try {
    const name = entry.path.split("/").pop() || "photo";
    await dataProvider.uploadPhotoAt(entry.path, new File([entry.data], name, { type: entry.type }));
    await del(url, db());
    // Retaken while it was uploading: the retake already cleared the state.
    if (states.has(url)) setState(url, null);
  } catch (err) {
    if (isPermanent(err)) {
      console.error("Photo rejected by storage", url, err);
      await markFailed(url, entry);
    } else {
      // No signal, a dropped connection, a session not restored yet: all of
      // them fixed by trying again later.
      if (classifySubmitError(err) !== "network") console.error("Photo upload failed; will retry", err);
      if (states.has(url)) setState(url, "pending");
    }
  }
}

async function markFailed(url: string, entry: QueuedPhoto) {
  try {
    await set(url, { ...entry, failed: true }, db());
  } catch {
    // The in-memory state is what the screen shows; this only outlives a reload.
  }
  setState(url, "failed");
}

/**
 * Only what no retry can fix. Deliberately narrow: storage reports a policy
 * refusal as a 400 too, and that one is usually a session still being
 * restored — marking it failed would ask for a retake of a perfectly good
 * photo.
 */
function isPermanent(err: unknown): boolean {
  const e = (err ?? {}) as { status?: unknown; statusCode?: unknown; message?: unknown };
  const status = Number(e.status ?? e.statusCode);
  if (status === 413 || status === 415) return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /invalid mime|mime type .* not supported|payload too large|exceeded the maximum allowed size/i.test(message);
}

/** Thrown by ensureUploaded; `reason` says whether waiting will help. */
export class PhotoNotUploadedError extends Error {
  constructor(readonly reason: "pending" | "failed") {
    super(reason === "failed" ? "A photo was rejected by storage" : "A photo is still waiting to upload");
    this.name = "PhotoNotUploadedError";
  }
}

/**
 * Makes sure these photos are in storage before anything points the database
 * at them — a completed chore whose proof is still on the phone would show
 * the owner two broken images.
 */
export async function ensureUploaded(urls: string[]): Promise<void> {
  await hydratePhotoQueue();
  const waiting = () => urls.map((url) => states.get(url)).filter(Boolean);
  if (waiting().length === 0) return;
  // Twice: the first may be a drain that started before these were queued, or
  // one that already tried them on a connection that has since come back.
  await syncPhotos();
  if (waiting().length > 0) await syncPhotos();
  const left = waiting();
  if (left.includes("failed")) throw new PhotoNotUploadedError("failed");
  if (left.length > 0) throw new PhotoNotUploadedError("pending");
}
