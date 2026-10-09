import imageCompression from "browser-image-compression";

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
  if (webp.type === "image/webp") return webp;
  // A browser that cannot encode WebP (older iOS Safari) silently hands back
  // a PNG instead (Phase 117). PNG ignores the quality steps the size target
  // relies on, so that file can land well over 1MB; JPEG is encodable
  // everywhere and compresses like WebP does.
  return imageCompression(file, { ...options, fileType: "image/jpeg" });
}
