// Lays review frames side by side on contact sheets, for looking at a cut at a glance:
//   node scripts/sheet.mjs review/v4 review/v4/sheet 4      (folder of frames, output prefix, frames per sheet)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// sharp comes with the app's own dependencies (the capture's photos use it too).
const sharp = createRequire(path.join(root, "../../package.json"))("sharp");
const [dir, prefix, perArg, match] = process.argv.slice(2);
const per = Number(perArg || 4);
const files = fs
  .readdirSync(path.join(root, dir))
  .filter((f) => /\.(jpg|png)$/.test(f) && !f.startsWith("sheet") && (!match || f.includes(match)))
  .sort();
const w = 540;
const h = 960;
for (let i = 0; i < files.length; i += per) {
  const group = files.slice(i, i + per);
  const tiles = await Promise.all(group.map((f) => sharp(path.join(root, dir, f)).resize(w, h).toBuffer()));
  const out = `${prefix}-${String(i / per + 1).padStart(2, "0")}.jpg`;
  await sharp({ create: { width: w * per + 8 * (per - 1), height: h, channels: 3, background: "#222" } })
    .composite(tiles.map((input, k) => ({ input, left: k * (w + 8), top: 0 })))
    .jpeg({ quality: 88 })
    .toFile(path.join(root, out));
  console.log(out, group.join(" "));
}
