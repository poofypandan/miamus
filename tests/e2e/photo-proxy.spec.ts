import { expect, test } from "@playwright/test";
import { freshSession, installStub } from "./stub-backend";

// Phase 160: /api/photo resizes thumbnails itself instead of asking Supabase
// (whose resizes count against a monthly allowance). server-stub.cjs serves
// the household's photo as a 1080x810 JPEG and refuses Supabase's resizer
// outright, so a thumbnail can only come back if the app made it.

const PHOTO = "00000000-0000-4000-8000-000000000001/logs/1794200000000-abc123.jpg";
const url = (width?: number) =>
  `/api/photo?b=household-logs&p=${encodeURIComponent(PHOTO)}${width ? `&w=${width}` : ""}&v=2`;

/** Width and height from a WebP (VP8/VP8L/VP8X) or JPEG header. */
function size(bytes: Buffer): [number, number] {
  if (bytes.toString("ascii", 0, 4) === "RIFF") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
    if (chunk === "VP8L") {
      const bits = bytes.readUInt32LE(21);
      return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
    }
    return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  }
  for (let i = 2; i < bytes.length; ) {
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  throw new Error("no size found");
}

test("a thumbnail is resized by the app, never by Supabase, and keeps the photo's shape", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=access");

  const thumb = await page.request.get(url(320));
  expect(thumb.status()).toBe(200);
  expect(thumb.headers()["content-type"]).toBe("image/webp");
  expect(thumb.headers()["cache-control"]).toBe("private, max-age=31536000, immutable");
  const body = await thumb.body();
  expect(size(body)).toEqual([320, 240]);

  // Wider than the photo: the original, untouched (never upscaled).
  const big = await page.request.get(url(1280));
  expect(big.headers()["content-type"]).toBe("image/jpeg");
  const original = await big.body();
  expect(size(original)).toEqual([1080, 810]);
  expect(body.length).toBeLessThan(original.length);

  // No width: the original, for the lightbox.
  const full = await page.request.get(url());
  expect(full.headers()["content-type"]).toBe("image/jpeg");

  // Widths outside the fixed list are refused, so nobody can mint variants.
  expect((await page.request.get(url(333))).status()).toBe(400);
});

test("a phone outside the household gets nothing, resized or not", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");
  expect((await page.request.get(url(320))).status()).toBe(404);
  expect((await page.request.get(url())).status()).toBe(404);
});
