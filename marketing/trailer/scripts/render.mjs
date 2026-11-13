// Renders the four cuts into out/ and the review frames into review/.
//   npm run render                 all four, plus review frames
//   npm run render -- --only=trailer-60-id
//   npm run render -- --music=music/track.mp3   with a licensed track (public/music/)
//   npm run render -- --frames-only            review frames only
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));
// English 60 s first: the primary version (owner, 13 Nov 2026).
const cuts = ["trailer-60-en", "trailer-60-id", "trailer-15-en", "trailer-15-id"].filter((id) => !args.only || id === args.only);

if (!fs.existsSync(path.join(root, "public/shots/taps.json"))) {
  console.error("No screens yet: run `npm run capture` first (see README.md).");
  process.exit(1);
}
const music = typeof args.music === "string" ? args.music : null;
if (music && !fs.existsSync(path.join(root, "public", music))) {
  console.error(`Music file not found: public/${music}`);
  process.exit(1);
}
const props = music ? ["--props", JSON.stringify({ music })] : [];
fs.mkdirSync(path.join(root, "out"), { recursive: true });
fs.mkdirSync(path.join(root, "review"), { recursive: true });
const run = (cmd) => execFileSync("npx", cmd, { cwd: root, stdio: "inherit" });

if (!args["frames-only"]) {
  for (const id of cuts) {
    const file = `out/miamus-${id.replace("trailer-", "")}${music ? "" : "-nomusic"}.mp4`;
    run(["remotion", "render", "src/index.ts", id, file, "--codec=h264", "--crf=16", "--pixel-format=yuv420p", ...props]);
  }
}

// Key frames for review: the moment each shot is clearest (frame numbers at 30 fps).
const SIXTY = {
  "01-hook": 48, "02-today-push-in": 140, "03-kakak-card-ai-tag": 323, "04-looks-right": 352, "05-lights-card": 533,
  "06-two-cards": 717, "07-staff-photos": 865, "08-staff-tick": 938, "09-staff-reminder": 1024, "10-lights-tick": 1116,
  "11-all-on-track": 1190, "12-scroll": 1300, "13-owner-alert": 1440, "14-glimpse-kitchen": 1590, "15-glimpse-pets": 1625,
  "16-glimpse-repairs": 1660, "17-end-card": 1790,
};
const FIFTEEN = { "01-hook": 48, "02-kakak-ai-tag": 123, "03-looks-right": 151, "04-staff": 243, "05-staff-tick": 266, "06-all-on-track": 340, "07-end-card": 445 };
const FRAMES = { "trailer-60-en": SIXTY, "trailer-60-id": SIXTY, "trailer-15-en": FIFTEEN, "trailer-15-id": FIFTEEN };
for (const id of cuts) {
  for (const [name, frame] of Object.entries(FRAMES[id] ?? {})) {
    run(["remotion", "still", "src/index.ts", id, `review/${id.replace("trailer-", "")}-${name}.png`, `--frame=${frame}`, ...props]);
  }
}
