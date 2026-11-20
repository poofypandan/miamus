/**
 * A photo's hidden data taken out of its bytes, pixels untouched
 * (security audit, 20 Nov 2026).
 *
 * A phone camera writes where and when a photo was taken (EXIF GPS), the
 * phone's make and model, and sometimes an owner name into the file. For a
 * photo of someone's home, the GPS position is the home's address. Normally
 * this never reaches Miamus: compressPhoto (lib/image.ts) redraws every photo
 * on a canvas, which keeps only pixels. But when compression fails (an old
 * phone running out of memory on a large photo, a format the browser can't
 * draw), two places used to upload the original file as it was, location
 * and all, while the privacy policy says the phone removes it.
 *
 * This removes, without decoding the image:
 *   JPEG  every APPn segment except APP0 (JFIF) and APP14 (Adobe colour
 *         transform), and comments. EXIF and XMP live in APP1, ICC colour
 *         profiles in APP2, IPTC in APP13. The one EXIF field that changes
 *         how the photo looks, its orientation, is written back on its own,
 *         so a photo taken sideways still shows the right way up.
 *   PNG   eXIf, tEXt, zTXt, iTXt and tIME chunks.
 *   WebP  EXIF and XMP chunks, and their flags in the VP8X header.
 * Anything else, or a file that doesn't parse, gives null: the caller then
 * decides (photoForUpload refuses rather than upload it unchecked).
 *
 * Pure (bytes in, bytes out) so it can be unit tested without a browser.
 */
export function stripImageMetadata(input: Uint8Array): Uint8Array | null {
  if (isJpeg(input)) return stripJpeg(input);
  if (isPng(input)) return stripPng(input);
  if (isWebp(input)) return stripWebp(input);
  return null;
}

function isJpeg(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0xff && b[1] === 0xd8;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function isPng(b: Uint8Array): boolean {
  return b.length > 8 && PNG_SIGNATURE.every((v, i) => b[i] === v);
}

function isWebp(b: Uint8Array): boolean {
  return b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP";
}

function ascii(b: Uint8Array, at: number, n: number): string {
  return String.fromCharCode(...b.subarray(at, at + n));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** EXIF orientation (1-8) from an APP1 segment's payload, or null. */
function exifOrientation(payload: Uint8Array): number | null {
  if (payload.length < 14 || ascii(payload, 0, 6) !== "Exif\0\0") return null;
  const tiff = payload.subarray(6);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const order = ascii(tiff, 0, 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  if (view.getUint16(2, le) !== 42) return null;
  const ifd = view.getUint32(4, le);
  if (ifd + 2 > tiff.length) return null;
  const count = view.getUint16(ifd, le);
  for (let n = 0; n < count; n++) {
    const at = ifd + 2 + n * 12;
    if (at + 12 > tiff.length) return null;
    if (view.getUint16(at, le) === 0x0112) {
      const value = view.getUint16(at + 8, le);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/** An APP1 segment holding nothing but an orientation (big-endian TIFF). */
function orientationSegment(orientation: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22, // APP1, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

function stripJpeg(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let orientation: number | null = null;
  // Where the orientation goes back: after APP0 when the file starts with
  // one, as JFIF expects, else straight after the start marker.
  let orientationAt = 1;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    // Fill bytes before a marker.
    while (i < b.length && b[i] === 0xff && b[i + 1] === 0xff) i++;
    const marker = b[i + 1];
    if (marker === undefined) return null;
    // Markers with no length (TEM, RSTn): kept as they are.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      parts.push(b.subarray(i, i + 2));
      return concat(parts);
    }
    if (i + 4 > b.length) return null;
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2 || i + 2 + length > b.length) return null;
    const segment = b.subarray(i, i + 2 + length);
    if (marker === 0xda) {
      // Start of scan: the image data and everything after it, verbatim.
      parts.push(b.subarray(i));
      if (orientation !== null && orientation !== 1) parts.splice(orientationAt, 0, orientationSegment(orientation));
      return concat(parts);
    }
    if (marker === 0xe1 && orientation === null) orientation = exifOrientation(segment.subarray(4));
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keepApp = marker === 0xe0 || marker === 0xee;
    if (!(isApp && !keepApp) && marker !== 0xfe) {
      parts.push(segment);
      if (marker === 0xe0 && parts.length === 2) orientationAt = 2;
    }
    i += 2 + length;
  }
  return null;
}

const PNG_DROPPED = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(b: Uint8Array): Uint8Array | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const length = view.getUint32(i);
    const end = i + 12 + length;
    if (end > b.length) return null;
    const type = ascii(b, i + 4, 4);
    if (!PNG_DROPPED.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(parts);
  }
  return null;
}

const WEBP_DROPPED = new Set(["EXIF", "XMP "]);
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function stripWebp(b: Uint8Array): Uint8Array | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const riffEnd = Math.min(b.length, 8 + view.getUint32(4, true));
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, 4);
    const size = view.getUint32(i + 4, true);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > riffEnd) return null;
    if (type === "VP8X" && size >= 1) {
      const chunk = b.slice(i, Math.min(end, riffEnd));
      chunk[8] &= ~(VP8X_EXIF | VP8X_XMP);
      parts.push(chunk);
    } else if (!WEBP_DROPPED.has(type)) {
      parts.push(b.subarray(i, Math.min(end, riffEnd)));
    }
    i = end;
  }
  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}
