import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The household's own time zone. The app's date logic is local-day logic
// ("today", "this week", a dose at 08:00), so the tests pin the zone the app
// actually runs in rather than whatever the machine happens to use. Set here,
// before any worker starts, so every test file sees it.
process.env.TZ = "Asia/Jakarta";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
