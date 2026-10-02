/**
 * Turning a crop selection into a real file, on the device (Phase 103,
 * rewritten Phase 106).
 *
 * The whole point of cropping here rather than with CSS is that what gets
 * stored is what the owner chose. `object-cover` only ever hid the problem:
 * a portrait photo of a dog was centre-cropped by the browser, which on a
 * standing dog reliably means a square of its chest. The square is now decided
 * by a person and baked into the upload.
 *
 * WHAT PHASE 106 FOUND. Avatars looked drastically over-zoomed, and the
 * extraction maths here was the obvious suspect. It was measured rather than
 * assumed: a coordinate-encoded test image (red = x, green = y) was cropped at
 * zoom 1 to 3, portrait and landscape, up to 3024x4032, and the output decoded
 * back into the source rectangle it actually covers. It matched the on-screen
 * crop box to within ~1% every time, and the avatars in live storage are
 * genuine squares of exactly what was framed. The zoom was added afterwards,
 * by the photo proxy resizing every thumbnail into a centre-cut strip — see
 * app/api/photo/route.ts.
 *
 * What this rewrite does fix is the edges the old version trusted the caller
 * about: a crop box reaching past the image, and a box that is not quite
 * square. Both are now resolved against the image's real natural size, so the
 * output can never contain a letterbox bar or silently shrink the selection.
 */

/** The crop rectangle react-easy-crop reports, in natural image pixels. */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * How large the stored square may be.
 *
 * Avatars render at 48–96 CSS pixels, so 512 is already generous at 3x.
 * Larger would only mean uploading detail nothing will ever draw.
 */
export const MAX_EDGE = 512;

/**
 * JPEG quality for the square. This is the square's ONLY lossy encode — it is
 * uploaded as-is rather than run through compressPhoto, which used to re-encode
 * it as WebP and shrink it by its 0.95 step (every live avatar is 486x486, not
 * 512, for exactly that reason). One encode at 0.9 keeps a detailed 512px dog
 * under ~150KB, which is small enough not to need a second.
 */
const QUALITY = 0.9;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // A blob: URL from the file just picked, or a same-origin /api/photo URL
    // for a re-crop — never cross-origin. Set anyway, because a tainted canvas
    // fails silently at toBlob(), and this makes that impossible rather than
    // unlikely.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image"));
    image.src = src;
  });
}

/**
 * The square source rectangle to read, resolved against the real image.
 *
 * Pure, and exported for testing, because it is the part that has to be right:
 *
 *   - Square by construction. react-easy-crop with aspect={1} reports a square,
 *     but rounding can hand back 401x400; the old code took min(w, h) from the
 *     top-left corner, shifting the selection half a pixel per pixel of error.
 *     This keeps the side and the CENTRE the user chose.
 *   - Inside the image, always. A box that reaches past an edge — a letterboxed
 *     image at low zoom, a drag at the limit — used to read empty canvas into
 *     the output. It is now slid back inside, and shrunk only if the image
 *     itself is smaller than the box.
 *
 * For any in-bounds square selection, which is what the UI produces in normal
 * use, this returns the selection unchanged.
 */
export function resolveSquareSource(
  area: CropArea,
  naturalWidth: number,
  naturalHeight: number
): { sx: number; sy: number; side: number } {
  const side = Math.min(area.width, area.height, naturalWidth, naturalHeight);
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));
  return {
    side,
    sx: clamp(cx - side / 2, naturalWidth - side),
    sy: clamp(cy - side / 2, naturalHeight - side),
  };
}

/**
 * Renders `area` of `src` into a square file.
 *
 * Deliberately no devicePixelRatio anywhere. The crop area arrives in the
 * image's natural pixels, and the output is sized in natural pixels too; a
 * screen's pixel density has nothing to say about either. Multiplying by it is
 * the classic way this kind of function over-zooms — it is absent on purpose,
 * not by oversight.
 */
export async function cropToSquareFile(
  src: string,
  area: CropArea,
  fileName = "avatar.jpg"
): Promise<File> {
  const image = await loadImage(src);
  const { naturalWidth, naturalHeight } = image;
  if (!naturalWidth || !naturalHeight) throw new Error("Could not read that image");

  const { sx, sy, side } = resolveSquareSource(area, naturalWidth, naturalHeight);
  if (side <= 0) throw new Error("Nothing selected to crop");

  // Never upscale: a 300px selection becomes a 300px avatar, not a blurry 512.
  const edge = Math.max(1, Math.min(Math.round(side), MAX_EDGE));

  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Source and destination are both squares, so this can only scale, never
  // stretch or crop further.
  ctx.drawImage(image, sx, sy, side, side, 0, 0, edge, edge);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (!blob) throw new Error("Could not prepare the cropped image");

  const base = fileName.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
