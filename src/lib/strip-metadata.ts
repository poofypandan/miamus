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
 *         transform), and comments, wherever they are: before the first
 *         scan and between the scans of a progressive JPEG. Anything after
 *         the end marker goes too (phones append depth maps and second
 *         pictures there, each with its own EXIF). EXIF and XMP live in APP1,
 *         ICC colour profiles in APP2, IPTC in APP13.
 *   PNG   eXIf, tEXt, zTXt, iTXt and tIME chunks, and anything after IEND.
 *   WebP  EXIF and XMP chunks, and the XMP flag in the VP8X header; anything
 *         past the RIFF size.
 * The one EXIF field that changes how a photo looks, its orientation, is
 * written back on its own (JPEG and WebP), so a photo taken sideways still
 * shows the right way up.
 *
 * Anything else, or a file that doesn't parse, gives null: the caller then
 * refuses rather than use it unchecked (photoForUpload, /api/photo).
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

// --- Orientation ----------------------------------------------------------------------

/** EXIF orientation (1-8) from a TIFF block, or null. */
function tiffOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
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

const EXIF_HEADER = "Exif\0\0";

/** A TIFF block holding nothing but an orientation (big-endian), 26 bytes. */
function orientationTiff(orientation: number): Uint8Array {
  return Uint8Array.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

// --- JPEG -----------------------------------------------------------------------------

/** An APP1 segment holding nothing but an orientation. */
function jpegOrientationSegment(orientation: number): Uint8Array {
  const payload = concat([Uint8Array.from(EXIF_HEADER, (c) => c.charCodeAt(0)), orientationTiff(orientation)]);
  const length = payload.length + 2;
  return concat([Uint8Array.from([0xff, 0xe1, length >> 8, length & 0xff]), payload]);
}

/**
 * The end of the entropy-coded data that starts at `i`: the index of the
 * next real marker. Inside scan data, 0xFF is followed by 0x00 (a stuffed
 * byte), a restart marker (D0-D7) or fill bytes; anything else is a marker.
 */
function scanEnd(b: Uint8Array, i: number): number {
  while (i < b.length - 1) {
    if (b[i] === 0xff) {
      const next = b[i + 1];
      if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
        i += 2;
        continue;
      }
      if (next === 0xff) {
        i += 1;
        continue;
      }
      return i;
    }
    i += 1;
  }
  return b.length;
}

function stripJpeg(b: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let orientation: number | null = null;
  // Where the orientation goes back: after APP0 when the file starts with
  // one, as JFIF expects, else straight after the start marker.
  let orientationAt = 1;
  let sawScan = false;
  let i = 2;

  const finish = () => {
    if (orientation !== null && orientation !== 1) parts.splice(orientationAt, 0, jpegOrientationSegment(orientation));
    return concat(parts);
  };

  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    // Fill bytes before a marker.
    while (i + 1 < b.length && b[i + 1] === 0xff) i++;
    const marker = b[i + 1];
    if (marker === undefined) return null;
    // Markers with no length (TEM, RSTn): kept as they are.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xd9) {
      // End of image. Whatever follows is not this picture: dropped.
      if (!sawScan) return null;
      parts.push(b.subarray(i, i + 2));
      return finish();
    }
    if (i + 4 > b.length) return null;
    const length = (b[i + 2] << 8) | b[i + 3];
    if (length < 2 || i + 2 + length > b.length) return null;
    const segment = b.subarray(i, i + 2 + length);

    if (marker === 0xda) {
      // Start of scan: its header, then its entropy-coded data up to the next
      // marker. A progressive JPEG has several; segments between them are
      // filtered like any other.
      sawScan = true;
      const end = scanEnd(b, i + 2 + length);
      parts.push(b.subarray(i, end));
      if (end >= b.length) return finish(); // no end marker: the picture is all there is
      i = end;
      continue;
    }

    if (marker === 0xe1 && orientation === null && !sawScan) {
      const payload = segment.subarray(4);
      if (ascii(payload, 0, 6) === EXIF_HEADER) orientation = tiffOrientation(payload.subarray(6));
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keepApp = marker === 0xe0 || marker === 0xee;
    if (!(isApp && !keepApp) && marker !== 0xfe) {
      parts.push(segment);
      if (marker === 0xe0 && parts.length === 2) orientationAt = 2;
    }
    i += 2 + length;
  }
  return sawScan ? finish() : null;
}

// --- PNG ------------------------------------------------------------------------------

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

// --- WebP -----------------------------------------------------------------------------

const VP8X_XMP = 0x04;

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(8);
  for (let n = 0; n < 4; n++) header[n] = type.charCodeAt(n);
  new DataView(header.buffer).setUint32(4, data.length, true);
  return concat(data.length % 2 ? [header, data, new Uint8Array(1)] : [header, data]);
}

function stripWebp(b: Uint8Array): Uint8Array | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const riffEnd = Math.min(b.length, 8 + view.getUint32(4, true));
  const parts: Uint8Array[] = [];
  let vp8x: Uint8Array | null = null;
  let orientation: number | null = null;
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, 4);
    const size = view.getUint32(i + 4, true);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > riffEnd) return null;
    const data = b.subarray(i + 8, i + 8 + size);
    if (type === "VP8X") {
      if (size < 10) return null;
      vp8x = b.slice(i, i + 8 + size);
      parts.push(vp8x);
    } else if (type === "EXIF") {
      // Usually a bare TIFF block; some writers keep JPEG's "Exif\0\0" prefix.
      const tiff = ascii(data, 0, 6) === EXIF_HEADER ? data.subarray(6) : data;
      if (orientation === null) orientation = tiffOrientation(tiff);
    } else if (type !== "XMP ") {
      parts.push(b.subarray(i, Math.min(end, riffEnd)));
    }
    i = end;
  }
  if (vp8x) {
    // The flags say which optional chunks exist: XMP never does now, EXIF
    // only when an orientation is written back (bit 0x08).
    const keepOrientation = orientation !== null && orientation !== 1;
    vp8x[8] &= ~VP8X_XMP;
    vp8x[8] = keepOrientation ? vp8x[8] | 0x08 : vp8x[8] & ~0x08;
    if (keepOrientation) parts.push(webpChunk("EXIF", orientationTiff(orientation!)));
  }
  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}
