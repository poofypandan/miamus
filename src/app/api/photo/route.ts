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
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(path, width ? { transform: { width, quality: 70 } } : undefined);

  if (error || !data) {
    // RLS denial and a missing object are deliberately the same answer: a
    // caller probing paths learns nothing about what exists.
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(data, {
    headers: {
      "Content-Type": data.type || "image/webp",
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
      // The response depends on who is asking, so a cache must not reuse it
      // across sessions.
      Vary: "Cookie",
    },
  });
}
