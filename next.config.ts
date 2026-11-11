import type { NextConfig } from "next";

/**
 * This build's identity, for the over-the-air update check (Phase 137).
 *
 * Vercel's deployment ID first: it changes on every deploy, including a
 * redeploy of the same commit. The commit SHA covers other hosts that set it;
 * a timestamp covers local builds. It is pinned on process.env the first time
 * this file runs, because a build loads its config in more than one process,
 * and the workers inherit the parent's environment — so the client bundle and
 * the /api/version route cannot end up with two different timestamps.
 */
process.env.MIAMUS_BUILD_ID ??=
  process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? `local-${Date.now()}`;

/**
 * Security headers on every page (pre-launch audit M8).
 *
 * Enforced now: no framing by any other site (X-Frame-Options and CSP
 * frame-ancestors — the latter is ignored in a report-only policy, so it is
 * its own enforced header), no MIME sniffing, a referrer that never carries a
 * path to other sites, and camera and microphone for this site only (photos;
 * Kakak's voice needs the microphone). Nothing else the app uses is a
 * permission.
 *
 * Report-only for now: the full Content-Security-Policy. Browsers log what
 * it would block without blocking anything, so it can be watched before it
 * is enforced. Next's own bootstrap is inline script, hence 'unsafe-inline'
 * until nonces; development also needs eval for fast refresh. The only other
 * origin is Supabase (API, sign-in and storage); every photo on screen comes
 * through /api/photo, on this origin.
 */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [url.origin, `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`];
  } catch {
    return [];
  }
}

export function contentSecurityPolicy(dev = process.env.NODE_ENV !== "production"): string {
  const supabase = supabaseOrigins();
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...supabase.slice(0, 1)],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...supabase],
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy() },
];

const nextConfig: NextConfig = {
  // Inlined at build time into both bundles: the client knows which version
  // it is running, and the server knows which version is live.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.MIAMUS_BUILD_ID,
  },
  async headers() {
    return [
      // Every route, pages and API alike (M8). A path's own headers below
      // add to these.
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // The push service worker (Phase 119). Never cached, so a fix to it
        // reaches phones on their next visit; and same-origin only, since a
        // worker has no business loading anything from elsewhere.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
