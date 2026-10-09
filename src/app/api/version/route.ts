/**
 * Which build is live right now (Phase 137). Polled by useVersionCheck: a
 * phone whose own build ID differs is running a deployment that has since
 * been replaced, and its next lazy-loaded chunk may no longer exist.
 *
 * Dynamic and never cached, so a CDN or the browser cannot hand back the
 * previous deployment's answer.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_BUILD_ID ?? null },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
