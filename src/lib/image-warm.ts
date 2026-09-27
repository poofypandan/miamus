"use client";

import { photoSrc } from "@/lib/photos";

/**
 * Pulls the recent feed's thumbnails into the browser's cache at startup, so
 * scrolling shows photos instead of empty boxes (Phase 95).
 *
 * WHY THE HTTP CACHE AND NOT CacheStorage/IndexedDB
 * An <img> consults the HTTP cache on its own. It does not consult
 * CacheStorage unless a service worker intercepts the request, and this app
 * has no service worker; storing blobs in IndexedDB would mean rendering
 * every photo from a `blob:` URL, holding them in memory, revoking them by
 * hand, and taking over eviction from the browser. Fetching the same URL the
 * <img> will ask for achieves the same thing — the second request is served
 * from disk — and leaves eviction where it belongs. The proxy marks these
 * immutable for a year (Phase 90/92), so a warmed image stays warm.
 *
 * Bounded on purpose: the newest MAX_IMAGES only, one small batch at a time.
 */

// ~60 thumbnails at roughly 21KB each is about 1.3MB — a few days of photos
// on a household's feed, not the archive.
const MAX_IMAGES = 60;
// Enough to fill the pipe without starving the requests the user is waiting
// for; these are speculative and must never be the reason a tap feels slow.
const BATCH = 4;

// Per session, so a background refresh every 30 seconds doesn't re-request
// what has already been warmed.
const warmed = new Set<string>();

function shouldSkip(): boolean {
  if (typeof navigator === "undefined") return true;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  // Staff are on phone data; Save-Data is a direct request not to do this.
  return !!connection?.saveData || /2g/.test(connection?.effectiveType ?? "");
}

/**
 * Warms thumbnails for the given photo URLs, newest first. Silent: a failure
 * here costs nothing, because the <img> will simply fetch it later.
 */
export async function warmImages(urls: (string | null | undefined)[]): Promise<void> {
  if (shouldSkip()) return;

  const targets: string[] = [];
  for (const url of urls) {
    const src = photoSrc(url, 320);
    if (!src || warmed.has(src)) continue;
    warmed.add(src);
    targets.push(src);
    if (targets.length >= MAX_IMAGES) break;
  }
  if (targets.length === 0) return;

  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.all(
      targets.slice(i, i + BATCH).map((src) =>
        fetch(src, { cache: "force-cache", credentials: "same-origin" }).catch(() => {
          // Offline, or the object is gone. Nothing to do: the <img> that
          // needs it will fail the same way and show its own empty box.
        })
      )
    );
  }
}

// Long enough for the images actually on screen to have been requested and
// stored. Warming before that races the <img> tags for the same URLs and both
// go to the network — measured at roughly double the requests for no gain.
const SETTLE_MS = 2000;

/**
 * Runs the warm once the page has finished loading and gone quiet.
 *
 * Deliberately last in the queue: anything the feed is already showing will
 * have landed in the cache by then, so those fetches are served from disk and
 * the only real traffic is for photos not on screen — older days, further down
 * the feed — which is the entire point of warming.
 */
export function warmImagesWhenIdle(urls: (string | null | undefined)[]): void {
  if (typeof window === "undefined") return;

  const start = () => {
    const run = () => void warmImages(urls);
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (idle) idle(run);
    else window.setTimeout(run, 0);
  };

  if (document.readyState === "complete") {
    window.setTimeout(start, SETTLE_MS);
  } else {
    window.addEventListener("load", () => window.setTimeout(start, SETTLE_MS), { once: true });
  }
}
