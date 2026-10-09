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

const nextConfig: NextConfig = {
  // Inlined at build time into both bundles: the client knows which version
  // it is running, and the server knows which version is live.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.MIAMUS_BUILD_ID,
  },
  async headers() {
    return [
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
