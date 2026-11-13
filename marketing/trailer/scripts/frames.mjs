// Review frames for all four cuts, at half size, laid out on contact sheets in review/:
//   npm run frames            every cut
//   npm run frames -- 60-en   one cut
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv[2];
// One frame from every beat of the story, in order.
const SIXTY = [0, 14, 60, 110, 128, 150, 240, 310, 372, 430, 470, 500, 545, 590, 625, 652, 680, 705, 735, 746, 790, 812, 860, 900, 952, 975, 1012, 1040, 1066, 1110, 1152, 1200, 1250, 1290, 1340, 1385, 1404, 1432, 1470, 1545, 1600, 1680, 1720, 1790];
const FIFTEEN = [0, 20, 50, 76, 96, 120, 150, 190, 205, 222, 250, 284, 304, 330, 372, 405, 440];
const jobs = [];
for (const cut of ["60-en", "60-id", "15-en", "15-id"]) {
  if (only && only !== cut) continue;
  for (const frame of cut.startsWith("60") ? SIXTY : FIFTEEN) jobs.push({ id: `film-${cut}`, frame, out: `review/${cut}/f${String(frame).padStart(4, "0")}.jpg` });
  fs.rmSync(path.join(root, "review", cut), { recursive: true, force: true });
}
const list = path.join(root, ".tools", "frames.json");
fs.mkdirSync(path.dirname(list), { recursive: true });
fs.writeFileSync(list, JSON.stringify(jobs));
execFileSync("node", ["scripts/stills.mjs", `@${list}`], { cwd: root, stdio: "inherit", env: { ...process.env, STILL_SCALE: "0.5" } });
for (const cut of ["60-en", "60-id", "15-en", "15-id"]) {
  if (only && only !== cut) continue;
  execFileSync("node", ["scripts/sheet.mjs", `review/${cut}`, `review/${cut}/sheet`, "4"], { cwd: root, stdio: "inherit" });
}
