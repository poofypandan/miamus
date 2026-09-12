import imageCompression from "browser-image-compression";

export async function compressPhoto(file: File): Promise<File> {
  return imageCompression(file, {
    maxWidthOrHeight: 1200,
    maxSizeMB: 0.2,
    fileType: "image/webp",
    useWebWorker: true,
  });
}
