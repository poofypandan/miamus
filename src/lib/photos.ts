/**
 * Turning a stored photo reference into something an <img> can load.
 *
 * Photos are kept in private buckets (Phase 90), so the URL saved on a row is
 * an identifier, not a fetchable link — pointing an <img> at it gets a 400.
 * Everything on screen goes through /api/photo instead, which checks the
 * caller's session and streams the object back.
 *
 * Why a proxy and not createSignedUrl(): the staff feed renders dozens of
 * thumbnails, and signing each one is an API round trip per image before it
 * can even start loading. A proxied <img> is the same single request the
 * browser was going to make anyway, and it caches like any other image.
 */

const BUCKETS = ["household-logs", "inventory_audits"] as const;
export type PhotoBucket = (typeof BUCKETS)[number];

export function isPhotoBucket(value: string): value is PhotoBucket {
  return (BUCKETS as readonly string[]).includes(value);
}

/**
 * Pulls the bucket and object path out of a stored Supabase storage URL.
 * Handles the public shape written before this phase and the signed shape,
 * since both name the object the same way.
 */
export function parseStorageRef(url: string): { bucket: PhotoBucket; path: string } | null {
  const match = /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/.exec(url);
  if (!match) return null;
  const [, bucket, path] = match;
  if (!isPhotoBucket(bucket)) return null;
  return { bucket, path: decodeURIComponent(path) };
}

/**
 * What to put in an <img src>.
 *
 * Leaves anything that isn't one of our storage URLs alone: PhotoPicker
 * previews a local blob: URL before upload, and mock mode hands out object
 * URLs too.
 */
export function photoSrc(
  url: string | null | undefined,
  /**
   * Render width. A thumbnail should always pass one — the originals are
   * ~185KB each and a feed shows dozens. Omit it only where the full image is
   * the point (the lightbox). Must be one of the widths /api/photo allows.
   */
  width?: 160 | 320 | 640 | 1280
): string | undefined {
  if (!url) return undefined;
  const ref = parseStorageRef(url);
  if (!ref) return url;
  const w = width ? `&w=${width}` : "";
  return `/api/photo?b=${ref.bucket}&p=${encodeURIComponent(ref.path)}${w}`;
}
