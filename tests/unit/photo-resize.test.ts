import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { resizeForWidth } from "@/lib/photo-resize";

// Phase 160: thumbnails are resized by the app with the rules the storage
// layer used — scale to the width, keep the aspect ratio, never upscale.

function photo(width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg") {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .toFormat(format)
    .toBuffer();
}

describe("resizeForWidth", () => {
  it("scales a wide photo to the width and keeps its shape, as WebP", async () => {
    const out = await resizeForWidth(await photo(1080, 810), 320);
    expect(out?.type).toBe("image/webp");
    const meta = await sharp(out!.body).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([320, 240]);
  });

  it("keeps a tall photo whole (contain, not a centre cut)", async () => {
    const out = await resizeForWidth(await photo(733, 974, "png"), 160);
    const meta = await sharp(out!.body).metadata();
    expect([meta.width, meta.height]).toEqual([160, 213]);
  });

  it("never upscales: a photo no wider than asked is served as it is", async () => {
    expect(await resizeForWidth(await photo(733, 974), 1280)).toBeNull();
    expect(await resizeForWidth(await photo(320, 200, "webp"), 320)).toBeNull();
  });

  it("measures a sideways phone photo by the width it is shown at", async () => {
    // Stored 400x200 with EXIF orientation 6: shown upright as 200x400.
    const sideways = await sharp(await photo(400, 200)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const out = await resizeForWidth(sideways, 160);
    const meta = await sharp(out!.body).metadata();
    expect([meta.width, meta.height]).toEqual([160, 320]);
    // And one already narrower than asked once upright is left alone.
    expect(await resizeForWidth(sideways, 320)).toBeNull();
  });

  it("serves the original when the file can't be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await resizeForWidth(Buffer.from("not an image at all"), 320)).toBeNull();
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
