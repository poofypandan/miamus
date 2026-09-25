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
export async function GET(request: NextRequest) {
  const bucket = request.nextUrl.searchParams.get("b");
  const path = request.nextUrl.searchParams.get("p");

  if (!bucket || !path || !isPhotoBucket(bucket)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);

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
      // rewritten, so a hit can be cached hard. `private` keeps it in the
      // one browser that fetched it and out of any shared cache — this is
      // household data behind a session.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
