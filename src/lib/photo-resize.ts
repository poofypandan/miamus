import sharp from "sharp";
import { stripImageMetadata } from "@/lib/strip-metadata";

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

/**
 * The full-size photo as it may be served: without hidden data, or null when
 * that can't be guaranteed (the caller then refuses to serve it). Security
 * audit, 20 Nov 2026: photos are cleaned on the phone before upload
 * (lib/image.ts), but an older build uploaded the camera file as it was when
 * compression failed, so a stored photo may still carry where it was taken.
 * Thumbnails never do (sharp writes no metadata unless asked); this covers
 * the full-size view and a thumbnail asked wider than the photo.
 *
 *   JPEG, PNG, WebP  cleaned byte by byte, lossless, no decode
 *                    (lib/strip-metadata.ts), so even a photo too large for
 *                    sharp is served clean; the orientation stays.
 *   anything else, or one of those three the byte cleaner can't parse
 *                    (a malformed segment): re-encoded by sharp, turned as
 *                    shown, which writes no metadata. Never served as
 *                    stored: sharp's metadata check reads the header only,
 *                    so "no metadata found" is no proof (Codex, PR #161).
 * A photo that can be neither cleaned nor re-encoded gives null, never the
 * original.
 */
export async function servableOriginal(input: Buffer): Promise<{ body: Buffer; type: string } | null> {
  const sniffed = sniffedType(input);
  const cleaned = sniffed ? stripImageMetadata(input) : null;
  if (cleaned) return { body: Buffer.from(cleaned), type: sniffed! };
  try {
    const turned = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
    if (sniffed === "image/jpeg") return { body: await turned.jpeg({ quality: 90 }).toBuffer(), type: "image/jpeg" };
    if (sniffed === "image/png") return { body: await turned.png().toBuffer(), type: "image/png" };
    return { body: await turned.webp({ quality: 90 }).toBuffer(), type: "image/webp" };
  } catch (err) {
    console.error("Photo not cleaned; refusing to serve it", err);
    return null;
  }
}

/** The type the bytes say, for the three formats stripImageMetadata cleans. */
function sniffedType(b: Buffer): string | null {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}
