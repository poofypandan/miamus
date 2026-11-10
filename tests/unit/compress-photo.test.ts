import { describe, expect, it, vi } from "vitest";

// The compression library's result is typed File but is a Blob with a name
// stuck on (canvas.toBlob, in the worker and on the page alike). Every form
// that checks `instanceof File` (FoodPhotoField: food, repair reports, repair
// notes, repair receipts) dropped the photo without a word. compressPhoto
// must always hand back a real File.

const compress = vi.fn();
vi.mock("browser-image-compression", () => ({ default: (...args: unknown[]) => compress(...args) }));

function libraryResult(type: string): Blob {
  // Exactly what the library returns: a Blob with name and lastModified set.
  const blob = new Blob(["x"], { type }) as Blob & { name?: string; lastModified?: number };
  blob.name = "IMG_0001.jpg";
  blob.lastModified = 1;
  return blob;
}

describe("compressPhoto", () => {
  it("returns a real File from the library's Blob, typed and named for it", async () => {
    const { compressPhoto } = await import("@/lib/image");
    compress.mockResolvedValueOnce(libraryResult("image/webp"));
    const out = await compressPhoto(new File(["raw"], "IMG_0001.jpg", { type: "image/jpeg", lastModified: 5 }));
    expect(out).toBeInstanceOf(File);
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("IMG_0001.webp");
  });

  it("falls back to JPEG as a File when the browser can't encode WebP", async () => {
    const { compressPhoto } = await import("@/lib/image");
    compress.mockResolvedValueOnce(libraryResult("image/png")).mockResolvedValueOnce(libraryResult("image/jpeg"));
    const out = await compressPhoto(new File(["raw"], "photo.heic", { type: "image/heic" }));
    expect(out).toBeInstanceOf(File);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("photo.jpg");
  });

  it("passes a File the library already returned straight through", async () => {
    const { compressPhoto } = await import("@/lib/image");
    const file = new File(["x"], "small.webp", { type: "image/webp" });
    compress.mockResolvedValueOnce(file);
    expect(await compressPhoto(new File(["raw"], "small.webp", { type: "image/webp" }))).toBe(file);
  });
});
