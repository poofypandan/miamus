import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Config } from "@remotion/cli/config";

// Stills are PNG at 3x density; keep them sharp in the video.
Config.setVideoImageFormat("png");

// Reuse the headless Chromium the repo's Playwright already installed, so
// rendering downloads nothing. Remotion falls back to its own if not found.
const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
if (fs.existsSync(cache)) {
  const shell = fs
    .readdirSync(cache)
    .filter((d) => d.startsWith("chromium_headless_shell-"))
    .sort()
    .map((d) => path.join(cache, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"))
    .filter((p) => fs.existsSync(p))
    .pop();
  if (shell) Config.setBrowserExecutable(shell);
}
