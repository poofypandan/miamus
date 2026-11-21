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
 *   JPEG  keeps only the segments that make the picture and its colour
 *         profile (keptJpegSegment), before the first scan and between the
 *         scans of a progressive JPEG, with the JFIF header's thumbnail cut
 *         off; every APPn else (EXIF, XMP, IPTC, MPF, C2PA), comments, and
 *         anything after the end marker (phones append depth maps and second
 *         pictures there) goes.
 *   PNG   keeps only the picture's own chunks and its colour signalling
 *         (PNG_KEPT): eXIf, text, caBX and every other ancillary chunk go,
 *         and anything after IEND.
 *   WebP  keeps only VP8X, ICCP, VP8, VP8L and ALPH: EXIF, XMP, C2PA and the
 *         rest go, with their VP8X flags; anything past the RIFF size.
 * Colour profiles and colour-space chunks stay: they say how to read the
 * pixels (a Display-P3 or HDR photo would otherwise show wrong colours),
 * and are not where a phone writes location or who took it (Codex, PR #161).
 * Kept by name, never by a list of what to drop, so a metadata container
 * nobody listed yet is dropped too.
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

/**
 * What of a segment (before or between scans) is kept: the segment, a
 * rewritten copy, null to drop it, or undefined for a marker this doesn't
 * know (the whole file is then refused, never passed on unchecked). Kept by
 * name, not by dropping known metadata, so a container nobody listed yet
 * goes too (Codex, PR #161):
 *   SOFn, DHT, DAC, DQT, DRI, DNL, DHP, EXP   what the picture is made of;
 *   APP0 "JFIF"    its density, with the optional thumbnail cut off (a JFXX
 *                  extension's thumbnail is a whole JPEG of its own, with
 *                  room for its own comments and EXIF: dropped);
 *   APP2 "ICC_PROFILE"  the colour profile (APP2 also carries MPF, the
 *                  index of pictures appended after the end: dropped);
 *   APP14 "Adobe"  the 12-byte colour-transform note, nothing longer.
 * Every other APPn, comments and the reserved JPGn markers are dropped.
 */
function keptJpegSegment(marker: number, segment: Uint8Array): Uint8Array | null | undefined {
  const payload = segment.subarray(4);
  if (marker === 0xe0) {
    if (payload.length < 12 || ascii(payload, 0, 5) !== "JFIF\0") return null;
    // JFIF\0, version, units, X and Y density: then 0 x 0 thumbnail.
    return concat([Uint8Array.from([0xff, 0xe0, 0x00, 0x10]), payload.subarray(0, 12), Uint8Array.from([0, 0])]);
  }
  if (marker === 0xee) return payload.length === 12 && ascii(payload, 0, 5) === "Adobe" ? segment : null;
  if (marker === 0xe2) return ascii(payload, 0, 12) === "ICC_PROFILE\0" ? segment : null;
  if (marker >= 0xe1 && marker <= 0xef) return null; // APP1-APP15: EXIF, XMP, IPTC, MPF, C2PA...
  if (marker === 0xfe) return null; // comments
  if (marker >= 0xf0 && marker <= 0xfd) return null; // JPGn, reserved extensions
  if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc8) return segment; // SOFn, DHT, DAC
  if (marker >= 0xdb && marker <= 0xdf) return segment; // DQT, DNL, DRI, DHP, EXP
  return undefined;
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
    const kept = keptJpegSegment(marker, segment);
    if (kept === undefined) return null;
    if (kept) {
      parts.push(kept);
      if (marker === 0xe0 && parts.length === 2) orientationAt = 2;
    }
    i += 2 + length;
  }
  return sawScan ? finish() : null;
}

// --- PNG ------------------------------------------------------------------------------

/**
 * Chunks kept by name: the picture, its palette and transparency, and how
 * its colours and pixels are meant to be read (gAMA, cHRM, sRGB, iCCP, and
 * PNG 3's cICP, mDCV and cLLI for wide-gamut and HDR photos, each at its
 * fixed size). Everything else ancillary goes (eXIf, tEXt, zTXt, iTXt,
 * tIME, caBX Content Credentials, and any chunk not invented yet; Codex,
 * PR #161). An unknown critical chunk (capital first letter) means a file
 * this can't vouch for: refused. Animation chunks are ancillary, so an
 * animated PNG becomes its still frame.
 */
const PNG_KEPT = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "sBIT", "bKGD", "pHYs"]);
const PNG_KEPT_FIXED: Record<string, number> = { cICP: 4, mDCV: 24, cLLI: 8 };

function stripPng(b: Uint8Array): Uint8Array | null {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const length = view.getUint32(i);
    const end = i + 12 + length;
    if (end > b.length) return null;
    const type = ascii(b, i + 4, 4);
    if (PNG_KEPT.has(type) || PNG_KEPT_FIXED[type] === length) parts.push(b.subarray(i, end));
    else if (type.charCodeAt(0) < 0x61) return null; // unknown critical chunk
    i = end;
    if (type === "IEND") return concat(parts);
  }
  return null;
}

// --- WebP -----------------------------------------------------------------------------

// VP8X flags: ICC profile, alpha, EXIF, XMP, animation.
const VP8X_ICC = 0x20;
const VP8X_EXIF = 0x08;
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
  let hasIcc = false;
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
    } else if (type === "VP8 " || type === "VP8L" || type === "ALPH") {
      parts.push(b.subarray(i, Math.min(end, riffEnd)));
    } else if (type === "ICCP") {
      // The colour profile, where the container puts it (right after VP8X).
      hasIcc = true;
      parts.push(b.subarray(i, Math.min(end, riffEnd)));
    } else if (type === "ANIM" || type === "ANMF") {
      // An animation's frames nest chunks of their own: not vouched for here
      // (photos never are animated); refused, so the server re-encodes it.
      return null;
    }
    // Anything else (XMP, C2PA Content Credentials, chunks not
    // invented yet) is dropped: kept by name only (Codex, PR #161).
    i = end;
  }
  if (vp8x) {
    // The flags say which optional chunks exist: XMP never does now, ICC
    // when the profile was there, EXIF only when an orientation is written
    // back.
    const keepOrientation = orientation !== null && orientation !== 1;
    vp8x[8] &= ~VP8X_XMP;
    vp8x[8] = hasIcc ? vp8x[8] | VP8X_ICC : vp8x[8] & ~VP8X_ICC;
    vp8x[8] = keepOrientation ? vp8x[8] | VP8X_EXIF : vp8x[8] & ~VP8X_EXIF;
    if (keepOrientation) parts.push(webpChunk("EXIF", orientationTiff(orientation!)));
  }
  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}
