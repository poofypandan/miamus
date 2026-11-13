import path from "node:path";
import { defineConfig } from "@playwright/test";

// The trailer's screen capture (marketing/trailer/README.md). It reuses the
// repo's Playwright and its pretend Supabase (tests/e2e/stub-backend.ts),
// read-only, against a build pointed at the stub host. Nothing real is
// reached: the stub aborts any supabase.co request, and Kakak's replies are
// scripted in capture/script.ts (no Anthropic call).
process.env.TZ = "Asia/Jakarta";

const PORT = Number(process.env.TRAILER_PORT) || 3288;
const ROOT = path.resolve(__dirname, "../../..");

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.capture\.ts$/,
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    timezoneId: "Asia/Jakarta",
    locale: "id-ID",
    colorScheme: "light",
    trace: "off",
    browserName: "chromium",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    cwd: ROOT,
    url: `http://localhost:${PORT}/staff`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test-key",
      NODE_OPTIONS: "--require ./tests/e2e/server-stub.cjs",
      E2E_SERVER_STUB: "1",
      TZ: "Asia/Jakarta",
      KAKAK_PRACTICE: "true",
    },
  },
});
