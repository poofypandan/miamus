import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Records the video tips (Phase 172, D12) from the app on the test stub:
 * mock data only, no real household. Run by hand, never in CI:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://supabase.test \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test-key npm run build
 *   npx playwright test -c playwright.tips.config.ts
 *   npx tsx scripts/finish-tips.ts        # needs ffmpeg (brew install ffmpeg)
 *
 * Each test in tests/tips/ records one tip at phone size with its captions
 * on screen; finish-tips turns the recordings into public/tips/<id>.<lang>
 * .mp4, a poster .jpg and the .vtt captions. Then set the tip's `ready` to
 * true in src/lib/video-tips.ts.
 */
export default defineConfig({
  ...base,
  testDir: "tests/tips",
  outputDir: "test-results/tips",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    ...base.use,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    video: { mode: "on", size: { width: 390, height: 844 } },
  },
});
