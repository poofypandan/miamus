// A2 (trailer-reset 16): Acts 1, 2 and 4 moving, Act 3 as the C1.6 stills. English, half resolution only (540 × 960).
//   npm run a2 -- <out-dir>                       both cuts: MP4 with sound, a one-frame-per-second sheet each
//   npm run a2 -- <out-dir> --only=60             one cut
//   npm run a2 -- <out-dir> --at=2.4,51.5         just these moments (seconds) of the chosen cut(s), as PNGs
//   npm run a3 -- <out-dir> --motion-check --cuts=15,41   the motion check on each film after it renders (motion-check.mjs)
// Sound: public/audio/a2-<cut>-en.wav (audio/mix.py with the A2 effects; see marketing/trailer/README.md).
// Every Act 3 still keeps its readability and frame check while the film renders (src/stills/readability.tsx).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { runMotionCheck } from "./motion-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(path.join(root, "../../package.json"))("sharp");
const argv = process.argv.slice(2);
const out = path.resolve(argv.find((a) => !a.startsWith("--")) ?? path.join(root, "review/a2"));
const only = (argv.find((a) => a.startsWith("--only=")) ?? "").split("=")[1];
const at = (argv.find((a) => a.startsWith("--at=")) ?? "").split("=")[1];
const cuts = ["60", "15"].filter((c) => !only || c === only);
const strict = argv.includes("--strict");
// A4: --name=a4 writes a4-<cut>-en.mp4 on public/audio/a4-<cut>-en.wav (same compositions).
const name = (argv.find((a) => a.startsWith("--name=")) ?? "--name=a3").split("=")[1];
const FPS = 30;

const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
const browserExecutable = fs.existsSync(cache)
  ? fs.readdirSync(cache).filter((d) => d.startsWith("chromium_headless_shell-")).sort()
      .map((d) => path.join(cache, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell")).filter((p) => fs.existsSync(p)).pop()
  : undefined;

fs.mkdirSync(out, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts"), publicDir: path.join(root, "public") });

for (const cut of cuts) {
  const audio = `audio/${name}-${cut}-en.wav`;
  const inputProps = { cut, audio: fs.existsSync(path.join(root, "public", audio)) ? audio : null, act3: true, check: strict ? "strict" : "log" };
  const fails = new Map();
  const onBrowserLog = (log) => {
    if (!log.text.startsWith("FRAMECHECK ")) return;
    const j = JSON.parse(log.text.slice(11));
    fails.set(j.frame, j);
  };
  if (!inputProps.audio) console.warn(`no ${audio}: rendering ${cut} silent`);
  const composition = await selectComposition({ serveUrl, id: `a3-${cut}-en`, inputProps, browserExecutable });
  const total = composition.durationInFrames / FPS;
  const times = at ? at.split(",").map(Number).filter((t) => t < total) : [...Array(Math.round(total)).keys()].map((s) => s + 0.5);
  const dir = path.join(out, `frames-${cut}`);
  fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const t of times) {
    const file = path.join(dir, `${cut}-${t.toFixed(2).padStart(5, "0")}.png`);
    await renderStill({ composition, serveUrl, output: file, frame: Math.min(composition.durationInFrames - 1, Math.round(t * FPS)), inputProps, browserExecutable, scale: 0.5, imageFormat: "png", onBrowserLog });
    files.push({ t, file });
  }
  // One sheet: every frame in order, labelled with its time.
  const cols = 8, tw = 270, th = 480;
  const tiles = await Promise.all(files.map(async ({ t, file }, i) => {
    const label = Buffer.from(`<svg width="${tw}" height="30"><rect width="100%" height="100%" fill="rgba(0,0,0,0.6)"/><text x="8" y="21" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="600" fill="#fff">${t.toFixed(1)} s</text></svg>`);
    const img = await sharp(file).resize(tw, th).composite([{ input: label, left: 0, top: 0 }]).toBuffer();
    return { input: img, left: (i % cols) * (tw + 4), top: Math.floor(i / cols) * (th + 4) };
  }));
  const rows = Math.ceil(files.length / cols);
  const sheet = path.join(out, at ? `moments-${cut}-en.jpg` : `sheet-${cut}-en.jpg`);
  await sharp({ create: { width: Math.min(files.length, cols) * (tw + 4), height: rows * (th + 4), channels: 3, background: "#111" } }).composite(tiles).jpeg({ quality: 84 }).toFile(sheet);
  console.log("wrote", path.relative(out, sheet));
  if (at) {
    report(cut, fails);
    continue;
  }
  const file = path.join(out, `${name}-${cut}-en.mp4`);
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: file, inputProps, browserExecutable, scale: 0.5, crf: 20, concurrency: 6, onBrowserLog });
  console.log("wrote", path.relative(out, file));
  if (argv.includes("--motion-check")) runMotionCheck(file, argv, path.join(out, `motioncheck-${cut}.json`));
  report(cut, fails);
}
function report(cut, fails) {
  const list = [...fails.values()].sort((a, b) => a.frame - b.frame);
  fs.writeFileSync(path.join(out, `framecheck-${cut}.json`), JSON.stringify(list, null, 1));
  console.log(`frame check ${cut}: ${list.length} failing frame(s)` + (list.length ? `, first at ${list[0].t} s` : ""));
}
