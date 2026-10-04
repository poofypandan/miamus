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
  return `/api/photo?b=${ref.bucket}&p=${encodeURIComponent(ref.path)}${w}&v=${TRANSFORM_VERSION}`;
}

/**
 * Bumped whenever what /api/photo returns for the same object changes.
 *
 * The proxy answers with `immutable` and a one-year max-age, which is right —
 * an object key never changes — but it means a phone that fetched a thumbnail
 * once keeps that copy for a year, whatever the server would say now. When the
 * transform itself is fixed, the old bytes are wrong under the old URL, so the
 * URL has to change too. The handler ignores `v`; only caches read it.
 *
 *   2 — Phase 106: resize "contain" instead of the default "cover", which had
 *       been returning every thumbnail as a centre-cut strip.
 */
const TRANSFORM_VERSION = 2;

/**
 * Rows that share one stored photo, merged (Phase 118).
 *
 * One upload often stands behind several logs: three medicines given at noon,
 * four dogs on one potty round. Each log carries the same URL, so rendering a
 * tile per log drew the same picture three or four times over — and put it in
 * the gallery as that many identical slides. Grouped here, a photo is one tile
 * and one slide, and every row behind it stays reachable (its titles, its
 * dogs, and every log an undo has to revert).
 *
 * First-seen order is kept, so callers that sorted their rows keep that sort.
 * Rows with no photo are dropped — they have nothing to show.
 */
export function groupByPhoto<T>(
  rows: T[],
  urlOf: (row: T) => string | null | undefined
): { url: string; rows: T[] }[] {
  const byUrl = new Map<string, { url: string; rows: T[] }>();
  for (const row of rows) {
    const url = urlOf(row);
    if (!url) continue;
    const existing = byUrl.get(url);
    if (existing) existing.rows.push(row);
    else byUrl.set(url, { url, rows: [row] });
  }
  return [...byUrl.values()];
}

/** The distinct values, in first-seen order — for joining titles and names. */
export function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * When a photo was taken, read from its storage key (Phase 126).
 *
 * Every upload is keyed `<household>/<folder>/<Date.now()>-<random>.<ext>`
 * (supabase-provider's uploadPhoto), and PhotoPicker uploads the moment a
 * photo is chosen — so that number is the capture time, to within the
 * second or two compression takes, on the clock of the phone that took it.
 * Nothing in the database records it separately, and nothing needs to: it is
 * already part of every photo ever stored, back to the first one.
 *
 * Null for anything not shaped like that (a mock-mode blob URL, a key from
 * some future scheme), and for numbers outside any plausible date.
 */
export function photoTakenAt(url: string | null | undefined): Date | null {
  if (!url) return null;
  const path = parseStorageRef(url)?.path ?? url;
  const match = /(?:^|\/)(\d{13})-[a-z0-9]+\.[a-z0-9]+$/i.exec(path);
  if (!match) return null;
  const ms = Number(match[1]);
  // 2020-01-01 .. 2100-01-01: a 13-digit number outside that is not a time.
  if (ms < 1577836800000 || ms > 4102444800000) return null;
  return new Date(ms);
}
