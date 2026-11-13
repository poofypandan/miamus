// Renders the four cuts into out/, with their sound (public/audio/mix-*.wav, from audio/mix.py).
//   npm run render                       all four
//   npm run render -- --only=film-60-en
//   npm run render -- --silent           picture only
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));
// English 60 s first: the primary version.
const cuts = ["film-60-en", "film-60-id", "film-15-en", "film-15-id"].filter((id) => !args.only || id === args.only);

if (!fs.existsSync(path.join(root, "public/shots/taps.json"))) {
  console.error("No screens yet: run `npm run capture` first (see README.md).");
  process.exit(1);
}
fs.mkdirSync(path.join(root, "out"), { recursive: true });
for (const id of cuts) {
  const name = id.replace("film-", "");
  const wav = `audio/mix-${name}.wav`;
  const sound = !args.silent && fs.existsSync(path.join(root, "public", wav));
  if (!args.silent && !sound) console.warn(`No sound for ${id}: run audio/mix.py first. Rendering picture only.`);
  const file = `out/miamus-${name}${sound ? "" : "-silent"}.mp4`;
  execFileSync(
    "npx",
    ["remotion", "render", "src/index.ts", id, file, "--codec=h264", "--crf=17", "--pixel-format=yuv420p", "--audio-codec=aac", "--audio-bitrate=320k", "--props", JSON.stringify({ audio: sound ? wav : null })],
    { cwd: root, stdio: "inherit" }
  );
}
