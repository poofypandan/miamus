"use client";

import type { ComponentProps } from "react";
import { useQueuedPhoto } from "@/hooks/use-queued-photo";
import { photoSrc } from "@/lib/photos";

/**
 * A stored photo that may still be on this phone (Phase 161): the copy kept
 * here while it waits to upload, else the stored one. Saves made on a weak
 * signal show their photo straight away instead of a broken image.
 */
export function SyncedImg({
  url,
  size,
  alt = "",
  ...props
}: { url: string; size: 160 | 320 | 640 | 1280 } & Omit<ComponentProps<"img">, "src">) {
  const { localSrc } = useQueuedPhoto(url);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={localSrc ?? photoSrc(url, size)} alt={alt} {...props} />;
}
