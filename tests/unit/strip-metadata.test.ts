import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { stripImageMetadata } from "@/lib/strip-metadata";
import { servableOriginal } from "@/lib/photo-resize";

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

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const byte of b) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: string): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), Buffer.from(data, "latin1")]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length - 4);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
function riffChunk(type: string, data: string): Buffer {
  const payload = Buffer.from(data, "latin1");
  const header = Buffer.alloc(8);
  header.write(type, 0, "latin1");
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
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

  it("cleans between the scans of a progressive JPEG, and drops what follows the end", async () => {
    const progressive = await pixels(64, 48).jpeg({ progressive: true }).toBuffer();
    const scans: number[] = [];
    for (let n = 0; n < progressive.length - 1; n++) if (progressive[n] === 0xff && progressive[n + 1] === 0xda) scans.push(n);
    expect(scans.length).toBeGreaterThan(1);
    const note = Buffer.from("GPS -6.2088 106.8456 rumah");
    const com = Buffer.concat([Buffer.from([0xff, 0xfe, 0, note.length + 2]), note]);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, note.length + 2]), note]);
    // A comment and an APP1 between the first and second scans, and a second
    // picture's EXIF appended after the end marker.
    const input = Buffer.concat([
      progressive.subarray(0, scans[1]),
      com,
      app1,
      progressive.subarray(scans[1]),
      Buffer.from("Exif\0\0 GPS -6.2088 106.8456"),
    ]);
    await expect(sharp(input).raw().toBuffer()).resolves.toBeInstanceOf(Buffer);
    const out = stripImageMetadata(input)!;
    expect(out).not.toBeNull();
    expect(text(out)).not.toContain("GPS");
    expect(Buffer.compare(Buffer.from(out), progressive)).toBe(0);
  });

  it("keeps a sideways WebP's orientation, and nothing else of its EXIF", async () => {
    const input = await pixels().withExif({ ...CAMERA, ...GPS }).withMetadata({ orientation: 6 }).webp().toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const out = stripImageMetadata(input)!;
    expect(text(out)).not.toContain("PhoneCo");
    expect(Buffer.from(out).readUInt32LE(4)).toBe(out.length - 8);
    const meta = await sharp(out).metadata();
    expect(meta.orientation).toBe(6);
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

  it("drops Content Credentials (C2PA) and any unlisted chunk from a PNG", async () => {
    const png = await pixels().png().toBuffer();
    const iend = png.length - 12;
    const input = Buffer.concat([png.subarray(0, iend), pngChunk("caBX", "c2pa GPS -6.2088 106.8456"), pngChunk("zzZz", "GPS later"), png.subarray(iend)]);
    const out = stripImageMetadata(input)!;
    expect(text(out)).not.toContain("GPS");
    expect(Buffer.compare(Buffer.from(out), png)).toBe(0);
  });

  it("keeps a PNG's colour space (cICP, iCCP), so a Display-P3 or HDR photo keeps its colours", async () => {
    const p3 = await pixels().withIccProfile("p3").png().toBuffer();
    expect((await sharp(p3).metadata()).icc).toBeDefined();
    const iend = p3.length - 12;
    const cicp = pngChunk("cICP", "\x0c\x0d\x00\x01"); // Display P3, sRGB transfer, full range
    const badCicp = pngChunk("cICP", "\x0c\x0d\x00\x01GPS"); // not its fixed size: dropped
    const input = Buffer.concat([p3.subarray(0, 33), cicp, badCicp, p3.subarray(33, iend), p3.subarray(iend)]);
    const out = Buffer.from(stripImageMetadata(input)!);
    expect(out.includes(cicp)).toBe(true);
    expect(text(out)).not.toContain("GPS");
    expect((await sharp(out).metadata()).icc).toBeDefined();
  });

  it("keeps a JPEG's colour profile and drops MPF from APP2", async () => {
    const p3 = await pixels().withIccProfile("p3").withExif({ ...CAMERA, ...GPS }).jpeg().toBuffer();
    const note = Buffer.from("MPF\0 GPS -6.2088 106.8456");
    const mpf = Buffer.concat([Buffer.from([0xff, 0xe2, 0, note.length + 2]), note]);
    const input = Buffer.concat([p3.subarray(0, 2), mpf, p3.subarray(2)]);
    const out = stripImageMetadata(input)!;
    expect(text(out)).not.toContain("GPS");
    expect(text(out)).not.toContain("PhoneCo");
    const meta = await sharp(out).metadata();
    expect(meta.icc).toBeDefined();
    expect(meta.exif).toBeUndefined();
  });

  it("keeps a WebP's colour profile, flagged in its header", async () => {
    const p3 = await pixels().withIccProfile("p3").withExif({ ...CAMERA, ...GPS }).webp().toBuffer();
    const out = stripImageMetadata(p3)!;
    expect(text(out)).not.toContain("PhoneCo");
    expect(out[20] & 0x20).toBe(0x20);
    const meta = await sharp(out).metadata();
    expect(meta.icc).toBeDefined();
    expect(meta.exif).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([40, 20]);
  });

  it("refuses a PNG with a critical chunk it doesn't know", async () => {
    const png = await pixels().png().toBuffer();
    const iend = png.length - 12;
    expect(stripImageMetadata(Buffer.concat([png.subarray(0, iend), pngChunk("ZZZZ", "?"), png.subarray(iend)]))).toBeNull();
  });

  it("drops Content Credentials (C2PA) and any unlisted chunk from a WebP", async () => {
    const webp = await pixels().withMetadata({ orientation: 1 }).webp().toBuffer();
    const body = Buffer.concat([webp.subarray(12), riffChunk("C2PA", "c2pa GPS -6.2088 106.8456"), riffChunk("XMP ", "<x:xmpmeta>GPS</x:xmpmeta>")]);
    const header = Buffer.from(webp.subarray(0, 12));
    header.writeUInt32LE(body.length + 4, 4);
    const out = stripImageMetadata(Buffer.concat([header, body]))!;
    expect(text(out)).not.toContain("GPS");
    expect(Buffer.from(out).readUInt32LE(4)).toBe(out.length - 8);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([40, 20]);
  });

  it("cuts the JFIF thumbnail and drops a JFXX thumbnail, with whatever they hide", async () => {
    const jpeg = await pixels().jpeg().toBuffer();
    // A JFXX extension holding a JPEG thumbnail with a GPS comment inside it,
    // and a JFIF header with a 1 x 1 RGB thumbnail.
    const note = Buffer.from("GPS -6.2088 106.8456");
    const thumb = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xfe, 0, note.length + 2]), note, Buffer.from([0xff, 0xd9])]);
    const jfxx = Buffer.concat([Buffer.from("JFXX\0"), Buffer.from([0x10]), thumb]);
    const jfif = Buffer.concat([Buffer.from("JFIF\0"), Buffer.from([1, 1, 0, 0, 1, 0, 1, 1, 1]), Buffer.from("GPS")]);
    const seg = (payload: Buffer) => Buffer.concat([Buffer.from([0xff, 0xe0, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
    const input = Buffer.concat([jpeg.subarray(0, 2), seg(jfif), seg(jfxx), jpeg.subarray(2)]);
    const out = stripImageMetadata(input)!;
    expect(out).not.toBeNull();
    expect(text(out)).not.toContain("GPS");
    expect(text(out)).not.toContain("JFXX");
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([40, 20]);
  });

  it("refuses a JPEG with a marker it doesn't know", async () => {
    const jpeg = await pixels().jpeg().toBuffer();
    expect(stripImageMetadata(Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xc8, 0x00, 0x04, 0x00, 0x00]), jpeg.subarray(2)]))).toBeNull();
  });

  it("gives null for anything it can't clean", () => {
    expect(stripImageMetadata(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(stripImageMetadata(Uint8Array.from([0xff, 0xd8, 0x00, 0x00, 0x00]))).toBeNull();
  });
});

describe("servableOriginal (what /api/photo serves full size)", () => {
  it("serves a camera JPEG without its GPS, orientation kept", async () => {
    const out = (await servableOriginal(await cameraJpeg(6)))!;
    expect(out.type).toBe("image/jpeg");
    expect(text(out.body)).not.toContain("PhoneCo");
    const meta = await sharp(out.body).metadata();
    expect(meta.orientation).toBe(6);
    expect([meta.width, meta.height]).toEqual([40, 20]);
  });

  it("cleans a photo too large for sharp to decode, rather than serving it as stored", async () => {
    // 48 megapixels of one colour: a few hundred KB, under the bucket's 2 MB,
    // over the proxy's 40-megapixel decode limit (Codex, PR #161).
    const big = await pixels(8000, 6000).withExif({ ...CAMERA, ...GPS }).jpeg().toBuffer();
    expect(big.length).toBeLessThan(2 * 1024 * 1024);
    const out = (await servableOriginal(big))!;
    expect(out).not.toBeNull();
    expect(text(out.body)).not.toContain("PhoneCo");
  });

  it("re-encodes a JPEG the byte cleaner rejects, never serving it as stored", async () => {
    // A clean JPEG whose end marker is replaced by a truncated APP1 holding
    // GPS: the byte cleaner refuses it, sharp's header-only check sees no
    // metadata (Codex, PR #161).
    const clean = await pixels().jpeg().toBuffer();
    const tampered = Buffer.concat([clean.subarray(0, clean.length - 2), Buffer.from([0xff, 0xe1, 0xff, 0xff]), Buffer.from("Exif\0\0 GPS -6.2088 106.8456")]);
    expect(stripImageMetadata(tampered)).toBeNull();
    expect((await sharp(tampered).metadata()).exif).toBeUndefined();
    const out = (await servableOriginal(tampered))!;
    expect(out).not.toBeNull();
    expect(out.type).toBe("image/jpeg");
    expect(text(out.body)).not.toContain("GPS");
    expect(Buffer.compare(out.body, tampered)).not.toBe(0);
  });

  it("refuses what it can neither clean nor check", async () => {
    expect(await servableOriginal(Buffer.from("not a picture at all"))).toBeNull();
  });

  it("serves a clean photo as it is", async () => {
    const clean = await pixels().webp().toBuffer();
    const out = (await servableOriginal(clean))!;
    expect(Buffer.compare(out.body, clean)).toBe(0);
    expect(out.type).toBe("image/webp");
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
