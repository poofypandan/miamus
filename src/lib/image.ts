import imageCompression from "browser-image-compression";

const OPTIONS = {
  maxSizeMB: 0.2,
  maxWidthOrHeight: 1080,
  useWebWorker: true,
};

export async function compressPhoto(file: File): Promise<File> {
  const webp = await imageCompression(file, { ...OPTIONS, fileType: "image/webp" });
  if (webp.type === "image/webp") return webp;
  // A browser that cannot encode WebP (older iOS Safari) silently hands back
  // a PNG instead (Phase 117). PNG ignores the quality steps the size target
  // relies on, so that file can land well over 1MB; JPEG is encodable
  // everywhere and compresses like WebP does.
  return imageCompression(file, { ...OPTIONS, fileType: "image/jpeg" });
}
