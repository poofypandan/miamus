// Renders a list of stills from one bundle, for looking at frames while building:
//   node scripts/stills.mjs '<json>'      [{ "id": "world-test", "frame": 0, "props": { "tod": 17.6 }, "out": "review/w-golden.png" }, ...]
//   node scripts/stills.mjs @file.json
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2];
const jobs = JSON.parse(arg.startsWith("@") ? fs.readFileSync(arg.slice(1), "utf8") : arg);
const scale = Number(process.env.STILL_SCALE || 1);

// The headless Chromium the repo's Playwright installed (as remotion.config.ts does).
const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const browserExecutable = fs.existsSync(cache)
  ? fs
      .readdirSync(cache)
      .filter((d) => d.startsWith("chromium_headless_shell-"))
      .sort()
      .map((d) => path.join(cache, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"))
      .filter((p) => fs.existsSync(p))
      .pop()
  : undefined;

const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
for (const job of jobs) {
  const inputProps = job.props ?? {};
  const composition = await selectComposition({ serveUrl, id: job.id, inputProps, browserExecutable });
  const output = path.join(root, job.out);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const jpeg = job.out.endsWith(".jpg");
  await renderStill({ composition, serveUrl, output, frame: job.frame ?? 0, inputProps, browserExecutable, scale, imageFormat: jpeg ? "jpeg" : "png", ...(jpeg ? { jpegQuality: 90 } : {}) });
  console.log("wrote", job.out);
}
