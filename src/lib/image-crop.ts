/**
 * Turning a crop selection into a real file, on the device (Phase 103).
 *
 * The whole point of cropping here rather than with CSS is that what gets
 * stored is what the owner chose. `object-cover` only ever hid the problem:
 * a portrait photo of a dog was centre-cropped by the browser, which on a
 * standing dog reliably means a square of its chest. The square is now decided
 * by a person and baked into the upload, so every avatar is right everywhere,
 * including the places that have no cover behaviour at all (a lightbox, a
 * download, whatever renders it next).
 *
 * Done on the client so the original never leaves the phone: a 4MB camera
 * photo becomes a ~300KB square before a single byte is uploaded, which on a
 * household WiFi in Banyuwangi is the difference between instant and not.
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
 * Avatars render at 48–96 CSS pixels, so 512 is already generous at 3x — and
 * compressPhoto runs afterwards anyway. Going larger would only mean uploading
 * detail nothing will ever draw.
 */
const MAX_EDGE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // Only ever a blob: URL from the file the user just picked, so there is no
    // cross-origin fetch here — but a tainted canvas would fail silently at
    // toBlob(), and this makes that impossible rather than unlikely.
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read that image"));
    image.src = src;
  });
}

/**
 * Renders `area` of `src` into a square file.
 *
 * The output is square by construction rather than by trusting the caller:
 * react-easy-crop with aspect={1} reports a square area, but rounding at the
 * edges of a very small crop can hand back 199x200, and a one-pixel-off avatar
 * is a one-pixel-off avatar forever.
 */
export async function cropToSquareFile(
  src: string,
  area: CropArea,
  fileName = "avatar.jpg"
): Promise<File> {
  const image = await loadImage(src);

  const edge = Math.min(Math.round(Math.min(area.width, area.height)), MAX_EDGE);
  if (edge <= 0) throw new Error("Nothing selected to crop");

  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device");

  // A downscale, almost always: smoothing quality is what keeps a 2000px
  // selection from looking like it was resized in 1998.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    area.x,
    area.y,
    Math.min(area.width, area.height),
    Math.min(area.width, area.height),
    0,
    0,
    edge,
    edge
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    // JPEG rather than PNG: a photo as PNG is several times the size for no
    // visible gain. compressPhoto converts to WebP afterwards regardless.
    canvas.toBlob(resolve, "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Could not prepare the cropped image");

  return new File([blob], fileName, { type: "image/jpeg" });
}
