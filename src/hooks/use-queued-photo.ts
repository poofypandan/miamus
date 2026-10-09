"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  hydratePhotoQueue,
  photoQueueReady,
  photoQueueVersion,
  photoSyncState,
  readQueuedPhoto,
  subscribePhotoQueue,
  type PhotoSyncState,
} from "@/lib/photo-queue";

/**
 * Where one photo stands in the offline queue (Phase 138), and something to
 * show for it while it is not in storage yet.
 *
 *   state     "pending" | "uploading" | "failed", or null once uploaded
 *   localSrc  an object URL of the copy on this device, if it was queued here
 *   ready     false until the queue has been read back from the device — a
 *             draft restored after a reload names a photo that may not exist
 *             in storage yet, and asking /api/photo for it would only 404
 *
 * The local copy stays on screen after the upload lands rather than swapping
 * to the proxied URL: same picture, and no flash while the network fetches it.
 */
export function useQueuedPhoto(url: string | null | undefined): {
  state: PhotoSyncState | null;
  localSrc: string | null;
  ready: boolean;
} {
  useSyncExternalStore(subscribePhotoQueue, photoQueueVersion, () => 0);
  const ready = useSyncExternalStore(subscribePhotoQueue, photoQueueReady, () => false);
  const state = photoSyncState(url);
  const [local, setLocal] = useState<{ url: string; src: string } | null>(null);

  useEffect(() => {
    void hydratePhotoQueue();
  }, []);

  // Read once per photo, independent of its state: the copy is written before
  // the URL is ever handed out, so it is there to find whenever this runs.
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let created: string | null = null;
    readQueuedPhoto(url).then((blob) => {
      if (cancelled || !blob) return;
      created = URL.createObjectURL(blob);
      setLocal({ url, src: created });
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  return { state, localSrc: local && local.url === url ? local.src : null, ready };
}
