import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPhotoBucket } from "@/lib/photos";

/**
 * Serves a photo out of a private bucket to whoever is allowed to see it
 * (Phase 90).
 *
 * The download runs as the caller — their session cookie, their JWT — so the
 * storage RLS policies in migrations/092 do the deciding, not this handler.
 * That means one place defines who may see a photo, and it is the same place
 * that defines who may see the row pointing at it.
 *
 * The bucket is checked against a fixed list before use: without that, `b`
 * would let a caller name any bucket in the project.
 */
// Widths the proxy will render, so `w` cannot be used to mint unlimited
// variants (each one is a transform the storage layer has to perform).
const ALLOWED_WIDTHS = [160, 320, 640, 1280];

// What the buckets accept, plus AVIF in case the storage transformer ever
// re-encodes a thumbnail into it.
const SERVABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function GET(request: NextRequest) {
  const bucket = request.nextUrl.searchParams.get("b");
  const path = request.nextUrl.searchParams.get("p");
  const width = Number(request.nextUrl.searchParams.get("w")) || null;

  if (!bucket || !path || !isPhotoBucket(bucket)) {
    return new NextResponse("Bad request", { status: 400 });
  }
  if (width && !ALLOWED_WIDTHS.includes(width)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  // Resized by the storage layer, not by us: a feed thumbnail asking for 320px
  // pulls ~24KB instead of the ~185KB original (Phase 92). Without `w` the
  // untouched object is served, which is what the lightbox wants.
  //
  // `resize: "contain"` is not optional (Phase 106). Supabase defaults to
  // "cover", and "cover" with only a width keeps the ORIGINAL HEIGHT: a 486px
  // square asked for at w=160 came back as a 160x486 strip cut from its
  // middle. Every <img> then used object-cover to fill a square box from that
  // strip, so every thumbnail in the app has been a centre-zoom since Phase 92
  // — ~3x at w=160, ~1.5x at w=320. Measured against live storage, not
  // inferred. It is also what the Phase 95 "slivers" were: object-contain on
  // the same strip, misread at the time as a CSS problem.
  //
  // "contain" with a width scales to fit and keeps the aspect ratio, and never
  // upscales: 486x486 -> 160x160, 733x974 -> 160x213, and a w=1280 request for
  // a 733px image returns the image untouched.
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(
      path,
      width ? { transform: { width, quality: 70, resize: "contain" } } : undefined
    );

  if (error || !data) {
    // RLS denial and a missing object are deliberately the same answer: a
    // caller probing paths learns nothing about what exists.
    return new NextResponse("Not found", { status: 404 });
  }

  // Raster images only (Phase 117). This response comes from the app's own
  // origin, so an object stored as text/html or image/svg+xml would run
  // script against the viewer's session — one household member could plant
  // it for another to open. The buckets refuse those types on upload now
  // (migrations/101); this is the same rule at the other end.
  const contentType = data.type || "image/webp";
  if (!SERVABLE_TYPES.includes(contentType.split(";")[0].trim().toLowerCase())) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      // The type was just checked; this stops a browser second-guessing it.
      "X-Content-Type-Options": "nosniff",
      "Content-Length": String(data.size),
      // Object keys carry a timestamp and a random suffix and are never
      // rewritten, so a hit can be cached hard — a year, immutable, which is
      // what stops the feed re-fetching thumbnails on every navigation.
      //
      // Deliberately `private`, not `public`: these are household photos
      // served against a session cookie, and `public` would let any shared
      // cache (a CDN, a corporate proxy) store one household's image and hand
      // it to the next person who asks for that URL. The browser cache — the
      // one that matters for this feed — behaves identically either way.
      "Cache-Control": "private, max-age=31536000, immutable",
      // No `Vary: Cookie`, deliberately (it was here briefly in Phase 92).
      // Supabase rotates its auth cookie on every token refresh, and varying
      // on it invalidated every cached photo each time — measured at roughly
      // half the feed re-downloading on each visit. `private` already keeps
      // these out of shared caches, and the browser cache it leaves them in
      // is per-profile. The residual is narrow: a device rebound to another
      // household could still hold the previous one's images on disk, but it
      // has no row pointing at them, so nothing in the app can render them.
    },
  });
}
