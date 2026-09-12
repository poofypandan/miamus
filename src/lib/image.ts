import imageCompression from "browser-image-compression";

export async function compressPhoto(file: File): Promise<File> {
  return imageCompression(file, {
    maxSizeMB: 0.2,
    maxWidthOrHeight: 1080,
    useWebWorker: true,
    fileType: "image/webp",
  });
}
