// C1.5 "stills on the score" (trailer-reset 16, step A1), English, half resolution only (540 × 960).
//   npm run c15 -- <out-dir>            both cuts: PNG per shot, readability check, slideshow MP4 on the v17 mix, contact sheets
//   npm run c15 -- <out-dir> --only=60  one cut
//   npm run c15 -- <out-dir> --stills   PNGs and the check only
// The readability check runs inside every still (src/stills/readability.tsx): any text under 38 px at 1080 width
// cancels the render and this script exits non-zero. Its findings go to <out-dir>/readability.json.
// Sound: public/audio/mix-<cut>-en.wav as committed at v17. In the 60, "In their own language." (L6, 28.50–29.93 s,
// src/film/vo-data.json) is taken out: that stretch is crossfaded to the v17 music stem alone
// (audio/out/music-60-eleven-owner-4c.wav, copied read-only from the v17 sound build), matched in level.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// sharp comes with the app's own dependencies (as in scripts/sheet.mjs).
const sharp = createRequire(path.join(root, "../../package.json"))("sharp");
const argv = process.argv.slice(2);
const out = path.resolve(argv.find((a) => !a.startsWith("--")) ?? path.join(root, "review/c15"));
const only = (argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1];
const stillsOnly = argv.includes("--stills");
const oneShot = (argv.find((a) => a.startsWith("--shot=")) ?? "").split("=")[1]; // with --stills: one shot only, for testing
const shots = JSON.parse(fs.readFileSync(path.join(root, "src/stills/shots.json"), "utf8"));
const vo = JSON.parse(fs.readFileSync(path.join(root, "src/film/vo-data.json"), "utf8"));
const FPS = 30;
const SCALE = 0.5;
const cuts = ["60", "15"].filter((c) => !only || c === only);

const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const browserExecutable = fs.existsSync(cache)
  ? fs.readdirSync(cache).filter((d) => d.startsWith("chromium_headless_shell-")).sort()
      .map((d) => path.join(cache, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell")).filter((p) => fs.existsSync(p)).pop()
  : undefined;

fs.mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });
const report = { floorPx: 38, frameWidth: 1080, shots: [], failed: [] };

for (const cut of cuts) {
  const dir = path.join(out, `stills-${cut}-en`);
  if (!oneShot) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const composition = await selectComposition({ serveUrl, id: `stills-${cut}-en`, inputProps: { cut }, browserExecutable });
  for (const shot of shots[cut]) {
    if (oneShot && shot.id !== oneShot) continue;
    // The middle of the shot's span (Stills picks the shot by time; the frame inside it does not matter).
    const frame = Math.round(((shot.from + shot.to) / 2) * FPS);
    const file = path.join(dir, `${cut}-${shot.id}.png`);
    let line = null;
    try {
      await renderStill({
        composition, serveUrl, output: file, frame, inputProps: { cut }, browserExecutable, scale: SCALE, imageFormat: "png",
        onBrowserLog: (l) => { if (l.text.startsWith("READABILITY ")) line = JSON.parse(l.text.slice(12)); },
      });
      console.log("still", path.relative(out, file), line ? `smallest ${line.smallest?.px?.toFixed(1)} px (${line.smallest?.text})` : "");
    } catch (e) {
      console.error(`FAILED ${cut}-${shot.id}: ${e.message.split("\n")[0]}`);
      report.failed.push({ shot: `${cut}-${shot.id}`, error: e.message.split("\n")[0] });
    }
    report.shots.push({ shot: `${cut}-${shot.id}`, from: shot.from, to: shot.to, source: shot.v17 != null ? `v17 frame at ${shot.v17} s` : "new", check: line });
  }
}
fs.writeFileSync(path.join(out, "readability.json"), JSON.stringify(report, null, 1));
if (report.failed.length) {
  console.error(`Readability check failed on ${report.failed.length} still(s); see readability.json.`);
  process.exit(1);
}
if (stillsOnly) process.exit(0);

const ff = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

for (const cut of cuts) {
  const dir = path.join(out, `stills-${cut}-en`);
  const list = shots[cut];
  const total = Number(cut);
  // Sound.
  const mix = path.join(root, `public/audio/mix-${cut}-en.wav`);
  let sound = mix;
  if (cut === "60") {
    const l6 = vo["60-en"].cues.find((c) => c.id === "L6");
    const a = l6.from - 0.08, b = l6.to + 0.1, f = 0.12;
    const stem = path.join(root, "audio/out/music-60-eleven-owner-4c.wav");
    if (!fs.existsSync(stem)) throw new Error(`Missing ${stem} (copy it read-only from the v17 sound build).`);
    // Level of the music in the mix where no one speaks (22.6–25.4 s, between L4b and L5) against the stem's.
    const gainDb = levelDb(mix) - levelDb(stem);
    const env = `if(between(t,${a},${b}),0,if(between(t,${a - f},${a}),(${a}-t)/${f},if(between(t,${b},${b + f}),(t-${b})/${f},1)))`;
    sound = path.join(dir, `..`, `audio-60-en-without-L6.wav`);
    ff(["-i", mix, "-i", stem, "-filter_complex",
      `[0:a]volume='${env}':eval=frame[m];[1:a]volume=${gainDb.toFixed(2)}dB,volume='1-(${env})':eval=frame[s];[m][s]amix=inputs=2:normalize=0:duration=first[o]`,
      "-map", "[o]", "-c:a", "pcm_s16le", sound]);
    console.log(`L6 taken out ${a.toFixed(2)}–${b.toFixed(2)} s; music stem at ${gainDb.toFixed(1)} dB`);
  }
  // Picture: each still for its span, crossfades where shots.json gives fadeIn, cuts elsewhere.
  const inputs = [];
  const parts = [];
  list.forEach((s, i) => {
    const next = list[i + 1];
    const tail = next?.fadeIn ?? 0;
    const dur = s.to - s.from + tail;
    inputs.push("-loop", "1", "-t", dur.toFixed(3), "-framerate", String(FPS), "-i", path.join(dir, `${cut}-${s.id}.png`));
    parts.push(`[${i}:v]scale=540:960,setsar=1,format=yuv420p,fps=${FPS},settb=1/${FPS}[v${i}]`);
  });
  let last = "v0";
  let t = list[0].to - list[0].from;
  for (let i = 1; i < list.length; i++) {
    const fade = list[i].fadeIn ?? 0;
    const lbl = `x${i}`;
    if (fade > 0) parts.push(`[${last}][v${i}]xfade=transition=fade:duration=${fade}:offset=${t.toFixed(3)},settb=1/${FPS}[${lbl}]`);
    else parts.push(`[${last}][v${i}]concat=n=2:v=1:a=0,settb=1/${FPS}[${lbl}]`);
    last = lbl;
    t += list[i].to - list[i].from;
  }
  const file = path.join(out, `stills-${cut}-en.mp4`);
  ff([...inputs, "-i", sound, "-filter_complex", parts.join(";"), "-map", `[${last}]`, "-map", `${list.length}:a`, "-t", String(total),
    "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", file]);
  console.log("wrote", path.relative(out, file));
  // Contact sheet: every still in order, 6 across, each labelled with its shot and time.
  const cols = 6, tw = 270, th = 480, bar = 34;
  const rows = Math.ceil(list.length / cols);
  const tiles = await Promise.all(list.map(async (s, i) => {
    const img = await sharp(path.join(dir, `${cut}-${s.id}.png`)).resize(tw, th).toBuffer();
    const label = Buffer.from(`<svg width="${tw}" height="${bar}"><rect width="100%" height="100%" fill="rgba(0,0,0,0.62)"/><text x="10" y="23" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="600" fill="#fff">${s.id}   ${s.from.toFixed(1)}–${s.to.toFixed(1)} s</text></svg>`);
    const tile = await sharp(img).composite([{ input: label, left: 0, top: 0 }]).toBuffer();
    return { input: tile, left: (i % cols) * (tw + 6), top: Math.floor(i / cols) * (th + 6) };
  }));
  await sharp({ create: { width: cols * tw + (cols - 1) * 6, height: rows * th + (rows - 1) * 6, channels: 3, background: "#1a1a1a" } })
    .composite(tiles).jpeg({ quality: 86 }).toFile(path.join(out, `contact-${cut}-en.jpg`));
  console.log("wrote", `contact-${cut}-en.jpg`);
}

/** Mean loudness (dB) of a file between 22.6 and 25.4 s, from ffmpeg's volumedetect. */
function levelDb(file) {
  const r = execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostats -ss 22.6 -to 25.4 -i "${file}" -af volumedetect -f null - 2>&1`], { encoding: "utf8" });
  const m = r.match(/mean_volume: (-?[\d.]+) dB/);
  if (!m) throw new Error(`no level for ${file}`);
  return Number(m[1]);
}
