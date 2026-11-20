import imageCompression from "browser-image-compression";
import { stripImageMetadata } from "@/lib/strip-metadata";

const OPTIONS = {
  maxSizeMB: 0.2,
  maxWidthOrHeight: 1080,
  useWebWorker: true,
};

export async function compressPhoto(file: File): Promise<File> {
  // The worker is fetched from a CDN, so with no signal it can only fail
  // (the library then falls back to the main thread). Skip the attempt
  // offline rather than wait on it (Phase 138).
  const options = { ...OPTIONS, useWebWorker: typeof navigator === "undefined" || navigator.onLine };
  const webp = await imageCompression(file, { ...options, fileType: "image/webp" });
  if (webp.type === "image/webp") return asFile(webp, file);
  // A browser that cannot encode WebP (older iOS Safari) silently hands back
  // a PNG instead (Phase 117). PNG ignores the quality steps the size target
  // relies on, so that file can land well over 1MB; JPEG is encodable
  // everywhere and compresses like WebP does.
  return asFile(await imageCompression(file, { ...options, fileType: "image/jpeg" }), file);
}

/**
 * The library's result is typed File but is really a Blob with a name stuck
 * on (canvas.toBlob), so `instanceof File` is false and every form that
 * checks it (FoodPhotoField: food, repair reports, receipts) dropped the
 * photo without a word (found in Phase 164 PR B's tests). Always a File.
 */
function asFile(result: Blob, original: File): File {
  if (result instanceof File) return result;
  const ext = result.type === "image/webp" ? "webp" : result.type === "image/png" ? "png" : "jpg";
  const base = original.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([result], `${base}.${ext}`, { type: result.type, lastModified: original.lastModified });
}

/**
 * The photo to upload: compressed, or, when compression fails, the original
 * with its hidden data (GPS location, camera, comments) taken out
 * (lib/strip-metadata.ts; security audit, 20 Nov 2026). Never the original
 * as it came off the camera: the privacy policy says a photo's location is
 * removed on the phone. A file that can be neither compressed nor cleaned
 * is refused (the buckets accept only JPEG, PNG and WebP anyway).
 */
export async function photoForUpload(file: File): Promise<File> {
  try {
    return await compressPhoto(file);
  } catch (err) {
    console.error("Compression failed; sending the original without its hidden data", err);
    const cleaned = stripImageMetadata(new Uint8Array(await file.arrayBuffer()));
    if (!cleaned) throw new Error("This photo could not be prepared for upload");
    return new File([cleaned as BlobPart], file.name, { type: file.type, lastModified: file.lastModified });
  }
}
