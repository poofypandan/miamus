import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { stripImageMetadata } from "@/lib/strip-metadata";
import { withoutHiddenData } from "@/lib/photo-resize";

// A photo of someone's home must never reach storage, or leave /api/photo,
// with the camera's GPS position in it (security audit, 20 Nov 2026).

const GPS = { IFD3: { GPSLatitudeRef: "S", GPSLatitude: "6/1 12/1 30/1", GPSLongitudeRef: "E", GPSLongitude: "106/1 49/1 0/1" } };
const CAMERA = { IFD0: { Make: "PhoneCo", Model: "Camera 9", Copyright: "Pemilik Rumah" } };

function pixels(width = 40, height = 20) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } });
}

async function cameraJpeg(orientation?: number): Promise<Buffer> {
  let image = pixels().withExif({ ...CAMERA, ...GPS });
  if (orientation) image = image.withMetadata({ orientation });
  return image.jpeg().toBuffer();
}

function text(b: Uint8Array): string {
  return Buffer.from(b).toString("latin1");
}

describe("stripImageMetadata", () => {
  it("takes GPS, camera and owner out of a JPEG and keeps every pixel", async () => {
    const input = await cameraJpeg();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    expect(text(input)).toContain("PhoneCo");

    const out = stripImageMetadata(input)!;
    expect(out).not.toBeNull();
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(text(out)).not.toContain("PhoneCo");
    expect(text(out)).not.toContain("Pemilik Rumah");
    expect([meta.width, meta.height]).toEqual([40, 20]);
    // The image data itself is byte for byte the same.
    const scan = (b: Uint8Array) => text(b).slice(text(b).indexOf("\xff\xda"));
    expect(scan(out)).toBe(scan(input));
  });

  it("keeps a sideways photo's orientation, and nothing else of its EXIF", async () => {
    const input = await cameraJpeg(6);
    const out = stripImageMetadata(input)!;
    const meta = await sharp(out).metadata();
    expect(meta.orientation).toBe(6);
    expect(meta.exif!.length).toBeLessThan(40);
    expect(text(meta.exif!)).not.toContain("PhoneCo");
    // Drawn the way it is shown: 20 wide, 40 tall.
    const shown = await sharp(out).rotate().toBuffer({ resolveWithObject: true });
    expect([shown.info.width, shown.info.height]).toEqual([20, 40]);
  });

  it("takes EXIF and text chunks out of a PNG", async () => {
    const input = await pixels().withExif({ ...CAMERA, ...GPS }).withMetadata().png().toBuffer();
    expect(text(input)).toContain("PhoneCo");
    const out = stripImageMetadata(input)!;
    expect(text(out)).not.toContain("PhoneCo");
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([40, 20]);
  });

  it("takes EXIF and XMP out of a WebP and fixes its header", async () => {
    const input = await pixels().withExif({ ...CAMERA, ...GPS }).webp().toBuffer();
    expect(text(input)).toContain("PhoneCo");
    const out = stripImageMetadata(input)!;
    expect(text(out)).not.toContain("PhoneCo");
    expect(Buffer.from(out).readUInt32LE(4)).toBe(out.length - 8);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([40, 20]);
    // Still a picture sharp can decode.
    await expect(sharp(out).raw().toBuffer()).resolves.toBeInstanceOf(Buffer);
  });

  it("gives null for anything it can't clean", () => {
    expect(stripImageMetadata(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(stripImageMetadata(Uint8Array.from([0xff, 0xd8, 0x00, 0x00, 0x00]))).toBeNull();
  });
});

describe("withoutHiddenData (what /api/photo serves full size)", () => {
  it("serves a camera JPEG without its GPS, turned the way it is shown", async () => {
    const out = (await withoutHiddenData(await cameraJpeg(6)))!;
    expect(out.type).toBe("image/jpeg");
    const meta = await sharp(out.body).metadata();
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it("leaves a clean photo alone (no re-encode)", async () => {
    expect(await withoutHiddenData(await pixels().webp().toBuffer())).toBeNull();
  });
});

describe("photoForUpload", () => {
  it("uploads the original without its GPS when compression fails", async () => {
    vi.resetModules();
    vi.doMock("browser-image-compression", () => ({ default: () => Promise.reject(new Error("out of memory")) }));
    const { photoForUpload } = await import("@/lib/image");
    const input = await cameraJpeg();
    const out = await photoForUpload(new File([new Uint8Array(input)], "IMG_0001.jpg", { type: "image/jpeg" }));
    const bytes = new Uint8Array(await out.arrayBuffer());
    expect(out.type).toBe("image/jpeg");
    expect(text(bytes)).not.toContain("PhoneCo");
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    vi.doUnmock("browser-image-compression");
  });

  it("refuses a file it can neither compress nor clean", async () => {
    vi.resetModules();
    vi.doMock("browser-image-compression", () => ({ default: () => Promise.reject(new Error("can't draw")) }));
    const { photoForUpload } = await import("@/lib/image");
    await expect(photoForUpload(new File(["heic bytes"], "IMG.heic", { type: "image/heic" }))).rejects.toThrow();
    vi.doUnmock("browser-image-compression");
  });
});
