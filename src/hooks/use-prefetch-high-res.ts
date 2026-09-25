"use client";

import { useEffect, useRef } from "react";
import { photoSrc } from "@/lib/photos";

// How far ahead of the viewport to start warming. Roughly one card-height on
// a phone, so the row below the fold is ready by the time a thumb reaches it —
// without warming the whole feed.
const ROOT_MARGIN = "300px 0px";

/**
 * Warms the full-size version of a thumbnail once it scrolls into view
 * (Phase 94).
 *
 * Tapping a photo used to start a fresh request for the 1280px copy, so the
 * lightbox opened on an empty frame for as long as that took. Fetching it in
 * the background while the thumbnail is on screen means the tap usually hits
 * an image the browser already has on disk.
 *
 * `new Image()` rather than CacheStorage or a <link rel=preload>: the browser's
 * own HTTP cache is what the <img> will consult anyway, our proxy marks these
 * immutable for a year (Phase 90/92), and this needs no service worker and no
 * cleanup.
 *
 * Returns the ref to attach to the thumbnail element.
 */
export function usePrefetchHighRes(url: string | null | undefined) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = ref.current;
    const src = photoSrc(url, 1280);
    if (!el || !src || typeof IntersectionObserver === "undefined") return;

    // Respect a metered or explicitly frugal connection: staff are on phone
    // data, and speculative full-size images are exactly what Save-Data is
    // asking us not to do.
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (connection?.saveData || /2g/.test(connection?.effectiveType ?? "")) return;

    const observer = new IntersectionObserver(
      ([entry], obs) => {
        if (!entry.isIntersecting) return;
        // One warm per thumbnail: stop observing before the fetch, so
        // scrolling back and forth doesn't queue it again.
        obs.disconnect();
        const image = new Image();
        image.decoding = "async";
        image.src = src;
      },
      { rootMargin: ROOT_MARGIN }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);

  return ref;
}
