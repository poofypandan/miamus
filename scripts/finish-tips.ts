/**
 * Turns the tip recordings (playwright.tips.config.ts) into the files the
 * app serves (Phase 172, D12): public/tips/<id>.<lang>.mp4 (H.264, 720 ×
 * 1560, no sound), a poster .jpg from the first second, and the .vtt
 * captions from src/lib/video-tips.ts. Needs ffmpeg on the PATH.
 *
 *   npx tsx scripts/finish-tips.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { videoTip, videoTipVtt, type VideoTipLocale } from "../src/lib/video-tips";

const RESULTS = "test-results/tips";
const OUT = "public/tips";

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
}

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("ffmpeg isn't installed. Install it (brew install ffmpeg) and run this again.");
  process.exit(1);
}
if (!existsSync(RESULTS)) {
  console.error(`No recordings in ${RESULTS}. Run: npx playwright test -c playwright.tips.config.ts`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// Each test's folder holds video.webm; its name starts with the test title.
for (const dir of readdirSync(RESULTS)) {
  const match = dir.match(/^record-((?:owner|staff)-[a-z-]+?)-(en|id)(?:-|$)/);
  const webm = join(RESULTS, dir, "video.webm");
  if (!match || !existsSync(webm) || !statSync(webm).isFile()) continue;
  const [, id, lang] = match;
  const tip = videoTip(id);
  if (!tip) continue;
  const base = join(OUT, `${id}.${lang}`);
  ffmpeg(["-i", webm, "-vf", "scale=720:1560:flags=lanczos", "-an", "-c:v", "libx264", "-preset", "slow",
    "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${base}.mp4`]);
  ffmpeg(["-ss", "1", "-i", `${base}.mp4`, "-frames:v", "1", "-q:v", "4", `${base}.jpg`]);
  writeFileSync(`${base}.vtt`, videoTipVtt(tip, lang as VideoTipLocale));
  console.log(`${id}.${lang}: done`);
}
console.log("Now set `ready: true` for each finished tip in src/lib/video-tips.ts.");
