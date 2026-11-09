import sharp from "sharp";

/**
 * Thumbnails made by the app, not by Supabase (Phase 160).
 *
 * /api/photo used to ask the storage layer for each thumbnail
 * (`download(path, { transform })`). Supabase counts every photo it resizes
 * against a monthly allowance — 100 on the Pro plan — and with a spend cap on
 * it may start refusing resizes once that is spent. Every thumbnail in the
 * app would then answer 404. On 9 Nov 2026 production stood at 513 of 100,
 * one day into the cycle.
 *
 * So the route downloads the original and resizes it here, with the same
 * rules the storage layer used (Phase 106's "contain"): scale to the width,
 * keep the aspect ratio, never upscale. It works for every photo already
 * stored, needs no new objects in storage, and so changes nothing about
 * where photos are kept or when they are deleted.
 */

export const THUMB_QUALITY = 70;

// Uploads are compressed to 1080px on the phone (src/lib/image.ts) and the
// buckets cap files at 2MB, so a real photo is far below this. The limit is
// for a crafted file whose header claims an enormous canvas.
const MAX_INPUT_PIXELS = 40_000_000;

// A long-lived server process should not hold decoded images between
// requests; each photo is resized once and then cached by the browser.
sharp.cache(false);

/**
 * The photo at `width`, or null when the original should be served as it is:
 * already no wider than asked (never upscale), or not something sharp could
 * read. The caller has already checked the type is a raster image.
 */
export async function resizeForWidth(
  input: Buffer,
  width: number
): Promise<{ body: Buffer; type: "image/webp" } | null> {
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });
    const meta = await image.metadata();
    // The width as shown: a phone photo stored sideways with an EXIF
    // orientation is displayed rotated, so its height is what fills the row.
    const shownWidth = meta.autoOrient?.width ?? meta.width;
    if (!shownWidth || shownWidth <= width) return null;
    const body = await image
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    return { body, type: "image/webp" };
  } catch (err) {
    console.error("Photo not resized; serving the original", err);
    return null;
  }
}
