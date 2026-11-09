import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests against a stubbed Supabase (tests/e2e/stub-backend.ts).
 *
 * The app must be built against the stub, never a real project:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://supabase.test \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test-key npm run build
 *   npm run test:e2e
 *
 * CI does exactly that (.github/workflows/ci.yml). A build pointed at a real
 * project would send its requests past the stub, so every test also fails if
 * any request reaches a supabase.co host — they are blocked, not sent.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  // Some tests wait out auth-js's own retry and cooldown windows (30s, 60s).
  timeout: 90_000,
  // Each test has its own browser context and backend stub, so they can run
  // side by side; the slowest one sets the pace.
  fullyParallel: true,
  workers: process.env.CI ? 4 : 3,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    timezoneId: "Asia/Jakarta",
    locale: "id-ID",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/staff`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://supabase.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test-key",
      // The server's own calls to the fake host (the middleware's "who is
      // this, are they in a household?") are answered in-process, so owner
      // screens can be tested too (R6). Test-only; see the file.
      NODE_OPTIONS: "--require ./tests/e2e/server-stub.cjs",
      E2E_SERVER_STUB: "1",
    },
  },
});
