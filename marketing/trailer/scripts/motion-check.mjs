// The motion check (trailer-reset 28, decision 3): measures how the picture changes from each frame to the next
// and lists what the eye reads as robotic. Free, local, a few seconds a film. No dependencies beyond ffmpeg.
//
//   node scripts/motion-check.mjs <film.mp4> [--from=5 --to=15] [--cuts=15,35] [--json=out.json] [--strict]
//   npm run render -- --only=film-60-en --motion-check        (after the render)
//   npm run a3 -- <out-dir> --motion-check --cuts=15,41
//
// It lists three things:
//   (a) JUMPS   one-frame changes of the whole picture that are not an intended cut (--cuts, seconds);
//   (b) EDGES   moves that start or stop inside one frame: a part of the picture goes from rest to (nearly) its top
//               speed in one frame, or from top speed to rest ("start", "stop"), or does its whole move in three
//               frames or fewer ("pop");
//   (c) FLASHES anything that is on screen for under 8 frames: it appears from a still picture and is gone again,
//               in place. Something that travels through (a firefly, a mark flying to a phone) is not a flash.
//
// How: every frame is shrunk to 135 x 240 grey (which also averages the film grain away) and cut into a 15 x 30
// grid. For each cell the script follows how much it changes per frame, above that cell's own resting level (grain,
// a slow camera, leaves in the wind). It cannot read: "readable" is taken as "has real contrast", see FLASH_MIN.
// Thresholds are named below and printed with every report, so a count can be checked against its list.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FPS = 30;
const AW = 135, AH = 240; // analysis size
const BW = 9, BH = 8; // cell size: 15 x 30 cells, each 72 x 64 px of the 1080 x 1920 frame
const COLS = AW / BW, ROWS = AH / BH, CELLS = COLS * ROWS;

export const T = {
  /** (a) a cell "changed" in a jump when it moves this many grey levels (of 255) in one frame. */
  JUMP_CELL: 8,
  /** (a) share of the picture that must change at once. */
  JUMP_SHARE: 0.33,
  /** (a) how far the frame must stand above the frames around it (a dissolve changes much, but not in one frame). */
  JUMP_SPIKE: 3,
  /** (b) a cell is moving when it changes this much above its resting level. */
  ACTIVE: 2,
  /** (b) a move counts when its fastest frame reaches this in a cell. */
  PEAK: 5,
  /** (b) the first (last) frame of a move carries at least this share of the move's top speed: no easing in (out). */
  EDGE: 0.8,
  /** (b) "rest": the two frames before (after) are under this share of the top speed. */
  REST: 0.25,
  /** (b) a move done in this many frames or fewer is a pop. */
  POP: 3,
  /** (b) an edge is listed when it adds up to this much change over the whole picture (grey levels, frame mean):
   *      about one 46 px word arriving at full contrast in one frame. Smaller ones are counted separately as "faint". */
  EDGE_MIN: 0.12,
  /** (c) contrast of a flash against the picture before it, in its cell. */
  FLASH_MIN: 6,
  /** (c) frames a thing must stay (at half its strength or more) to be read. */
  FLASH_FRAMES: 8,
  /** (c) a neighbouring cell this busy (as a share of the flash's own speed) just before or after means it travels. */
  TRAVEL: 0.3,
};

function decode(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `fps=${FPS},scale=${AW}:${AH}:flags=area,format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg could not read ${file}: ${r.stderr}`);
  const n = Math.floor(r.stdout.length / (AW * AH));
  return { n, px: r.stdout };
}

const pct = (arr, p) => {
  const s = Float64Array.from(arr).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
};
const sec = (f) => (f / FPS).toFixed(2);
const where = (cells) => {
  let x0 = COLS, x1 = 0, y0 = ROWS, y1 = 0;
  for (const c of cells) {
    const x = c % COLS, y = Math.floor(c / COLS);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  // In px of the 1080 x 1920 frame.
  return { x: x0 * 72, y: y0 * 64, w: (x1 - x0 + 1) * 72, h: (y1 - y0 + 1) * 64 };
};
/** Groups cells that touch (8 neighbours). */
function groups(cells) {
  const set = new Set(cells), out = [];
  for (const c of cells) {
    if (!set.has(c)) continue;
    const g = [], todo = [c];
    set.delete(c);
    while (todo.length) {
      const k = todo.pop();
      g.push(k);
      const x = k % COLS, y = Math.floor(k / COLS);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, nk = ny * COLS + nx;
        if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && set.has(nk)) { set.delete(nk); todo.push(nk); }
      }
    }
    out.push(g);
  }
  return out;
}

/** `from`, `to` in seconds (frames [from, to) are judged; frames outside are only context). `cuts`: intended cuts, seconds. */
export function motionCheck(file, { from = 0, to = Infinity, cuts = [] } = {}) {
  const { n, px } = decode(file);
  const f0 = Math.max(1, Math.round(from * FPS)), f1 = Math.min(n, Math.round(to * FPS));
  const at = (f, c, i) => px[f * AW * AH + (Math.floor(c / COLS) * BH + Math.floor(i / BW)) * AW + (c % COLS) * BW + (i % BW)];
  // d[c][f]: how much cell c changed from frame f-1 to f (mean grey levels). D[f]: the whole picture.
  const d = Array.from({ length: CELLS }, () => new Float32Array(n));
  const D = new Float32Array(n);
  for (let f = 1; f < n; f++) {
    let all = 0;
    for (let c = 0; c < CELLS; c++) {
      let s = 0;
      for (let i = 0; i < BW * BH; i++) s += Math.abs(at(f, c, i) - at(f - 1, c, i));
      d[c][f] = s / (BW * BH);
      all += d[c][f];
    }
    D[f] = all / CELLS;
  }
  const cutFrames = cuts.map((s) => Math.round(s * FPS));
  const isCut = (f) => cutFrames.some((c) => Math.abs(c - f) <= 1);

  // (a) Jumps.
  const jumps = [], intended = [], jumpAt = new Set();
  for (let f = f0; f < f1; f++) {
    let share = 0;
    for (let c = 0; c < CELLS; c++) if (d[c][f] >= T.JUMP_CELL) share++;
    share /= CELLS;
    const near = [];
    for (let k = 2; k <= 6; k++) { if (f - k >= 1) near.push(D[f - k]); if (f + k < n) near.push(D[f + k]); }
    const spike = D[f] / Math.max(0.4, pct(near, 0.5), Math.min(f > 1 ? D[f - 1] : 0, f + 1 < n ? D[f + 1] : 0));
    if (share >= T.JUMP_SHARE && spike >= T.JUMP_SPIKE) {
      jumpAt.add(f);
      (isCut(f) ? intended : jumps).push({ t: +sec(f), frame: f, share: +share.toFixed(2), change: +D[f].toFixed(1), spike: +spike.toFixed(1) });
    }
  }
  const skip = (f) => jumpAt.has(f) || isCut(f);

  // Each cell's own resting level, and its activity above it.
  const e = d.map((row) => {
    const out = new Float32Array(n);
    for (let f = 1; f < n; f++) {
      const w = [];
      for (let k = Math.max(1, f - 20); k <= Math.min(n - 1, f + 20); k++) w.push(row[k]);
      out[f] = Math.max(0, row[f] - pct(w, 0.2) * 1.5);
    }
    return out;
  });

  // (b) Edges: per cell, each run of activity is a move; then cells that touch in the same frame are one event.
  const marks = new Map(); // "frame kind" -> [{ c, v }]
  const put = (f, kind, c, v) => {
    // The first frames of a file have no "before" to rest in (a clip cut out of a film starts mid-move).
    if (f < f0 || f >= f1 || f < 3 || skip(f)) return;
    const k = `${f} ${kind}`;
    if (!marks.has(k)) marks.set(k, []);
    marks.get(k).push({ c, v });
  };
  for (let c = 0; c < CELLS; c++) {
    const a = e[c];
    let f = 1;
    while (f < n) {
      if (a[f] < T.ACTIVE) { f++; continue; }
      let s = f, g = f;
      while (g + 1 < n && a[g + 1] >= T.ACTIVE) g++;
      let peak = 0;
      for (let k = s; k <= g; k++) peak = Math.max(peak, a[k]);
      f = g + 1;
      if (peak < T.PEAK) continue;
      // The move proper: from the first to the last frame at a fifth of its top speed.
      while (a[s] < 0.2 * peak) s++;
      while (a[g] < 0.2 * peak) g--;
      const before = Math.max(a[s - 1] ?? 0, a[s - 2] ?? 0), after = Math.max(a[g + 1] ?? 0, a[g + 2] ?? 0);
      const restBefore = before <= T.REST * peak, restAfter = after <= T.REST * peak;
      if (g - s + 1 <= T.POP && restBefore && restAfter) { put(s, "pop", c, peak); continue; }
      if (restBefore && a[s] >= T.EDGE * peak) put(s, "start", c, a[s]);
      if (restAfter && a[g] >= T.EDGE * peak) put(g, "stop", c, a[g]);
    }
  }
  const edges = [];
  let faint = 0;
  for (const [k, list] of marks) {
    const [f, kind] = k.split(" ");
    const v = new Map(list.map((m) => [m.c, m.v]));
    for (const g of groups(list.map((m) => m.c))) {
      const strength = g.reduce((s, c) => s + v.get(c), 0) / CELLS;
      if (strength < T.EDGE_MIN) { faint++; continue; }
      edges.push({ t: +sec(+f), frame: +f, kind, ...where(g), share: +(g.length / CELLS).toFixed(3), strength: +strength.toFixed(2) });
    }
  }
  edges.sort((x, y) => x.frame - y.frame || y.strength - x.strength);

  // (c) Flashes: a cell leaves a still picture, and is back to that picture before anyone could read what came.
  const found = [];
  for (let c = 0; c < CELLS; c++) {
    const a = e[c];
    for (let s = Math.max(2, f0); s < f1; s++) {
      if (!(a[s] >= T.ACTIVE && a[s - 1] < T.ACTIVE) || skip(s)) continue;
      const dev = [];
      for (let k = s; k < Math.min(n, s + 40); k++) {
        let sum = 0;
        for (let i = 0; i < BW * BH; i++) sum += Math.abs(at(k, c, i) - at(s - 1, c, i));
        dev.push(sum / (BW * BH));
      }
      let pk = 0;
      for (let k = 1; k < dev.length; k++) if (dev[k] > dev[pk]) pk = k;
      if (dev[pk] < T.FLASH_MIN) continue;
      let back = -1;
      for (let k = pk + 1; k < dev.length; k++) if (dev[k] <= 0.3 * dev[pk]) { back = k; break; }
      if (back < 0) continue;
      let held = 0;
      for (let k = 0; k <= back; k++) if (dev[k] >= 0.5 * dev[pk]) held++;
      if (held >= T.FLASH_FRAMES) continue;
      // A thing that travels came from the cell next door, or goes on into it: that cell is busy just before this
      // one lights up, or just after it clears. A flash has quiet neighbours on both sides of its moment.
      const r = s + back;
      let own = 0;
      for (let k = s; k <= r; k++) own = Math.max(own, a[k]);
      let travels = false;
      const cx = c % COLS, cy = Math.floor(c / COLS);
      for (let dy = -1; dy <= 1 && !travels; dy++) for (let dx = -1; dx <= 1 && !travels; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if ((!dx && !dy) || nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        const nb = e[ny * COLS + nx];
        for (let k = 1; k <= 5; k++) if ((nb[s - k] ?? 0) >= T.TRAVEL * own || (nb[r + k] ?? 0) >= T.TRAVEL * own) travels = true;
      }
      if (!travels) found.push({ c, s, r, held, v: dev[pk] });
    }
  }
  // Cells that touch and overlap in time are one thing. A thing that travels (a firefly crossing cells) lives longer
  // than any one cell shows it, so the whole group's life is what is measured.
  const flashes = [];
  const left = new Set(found);
  for (const seed of found) {
    if (!left.has(seed)) continue;
    const g = [seed], todo = [seed];
    left.delete(seed);
    while (todo.length) {
      const m = todo.pop();
      for (const o of [...left]) {
        const dx = Math.abs((o.c % COLS) - (m.c % COLS)), dy = Math.abs(Math.floor(o.c / COLS) - Math.floor(m.c / COLS));
        if (dx <= 1 && dy <= 1 && o.s <= m.r + 1 && m.s <= o.r + 1) { left.delete(o); g.push(o); todo.push(o); }
      }
    }
    const s = Math.min(...g.map((m) => m.s)), r = Math.max(...g.map((m) => m.r));
    if (r - s > T.FLASH_FRAMES + 2) continue;
    flashes.push({ t: +sec(s), frame: s, frames: Math.max(...g.map((m) => m.held)), ...where(g.map((m) => m.c)), contrast: +Math.max(...g.map((m) => m.v)).toFixed(1) });
  }
  flashes.sort((x, y) => x.frame - y.frame);

  const judged = [];
  for (let f = f0; f < f1; f++) judged.push(D[f]);
  return {
    file: path.basename(file), frames: n, from: +sec(f0), to: +sec(f1), thresholds: T,
    change: { median: +pct(judged, 0.5).toFixed(2), p95: +pct(judged, 0.95).toFixed(2), max: +Math.max(...judged).toFixed(2) },
    counts: { jumps: jumps.length, edges: edges.length, flashes: flashes.length, intendedCuts: intended.length, faintEdges: faint },
    jumps, intended, edges, flashes,
  };
}

export function report(r) {
  const L = [];
  L.push(`motion check · ${r.file} · ${r.from}–${r.to} s · change per frame: median ${r.change.median}, 95 % ${r.change.p95}, max ${r.change.max} (grey levels of 255)`);
  L.push(`  (a) jumps of the whole picture: ${r.counts.jumps}` + (r.counts.intendedCuts ? `   (+ ${r.counts.intendedCuts} intended cut(s))` : ""));
  for (const j of r.jumps) L.push(`      ${j.t.toFixed(2)} s   ${Math.round(j.share * 100)} % of the picture, ${j.spike}x the frames around it`);
  L.push(`  (b) moves that start or stop inside one frame: ${r.counts.edges}   (+ ${r.counts.faintEdges} too faint to list)`);
  for (const m of r.edges) L.push(`      ${m.t.toFixed(2)} s   ${m.kind.padEnd(5)} at x ${m.x}, y ${m.y}, ${m.w} x ${m.h} px   strength ${m.strength}`);
  L.push(`  (c) on screen for under ${T.FLASH_FRAMES} frames: ${r.counts.flashes}`);
  for (const m of r.flashes) L.push(`      ${m.t.toFixed(2)} s   ${m.frames} frame(s) at x ${m.x}, y ${m.y}, ${m.w} x ${m.h} px   contrast ${m.contrast}`);
  return L.join("\n");
}

/** Shared by the render commands: `--motion-check`, with `--cuts=`, `--from=`, `--to=` passed through. */
export function runMotionCheck(file, argv, jsonPath) {
  const arg = (k) => (argv.find((a) => a.startsWith(`--${k}=`)) ?? "").split("=")[1];
  const r = motionCheck(file, { from: arg("from") ? +arg("from") : 0, to: arg("to") ? +arg("to") : Infinity, cuts: (arg("cuts") ?? "").split(",").filter(Boolean).map(Number) });
  console.log(report(r));
  if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(r, null, 1));
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("usage: node scripts/motion-check.mjs <film.mp4> [--from=5 --to=15] [--cuts=15,35] [--json=out.json] [--strict]");
    process.exit(2);
  }
  const r = runMotionCheck(file, argv, (argv.find((a) => a.startsWith("--json=")) ?? "").split("=")[1]);
  if (argv.includes("--strict") && r.counts.jumps + r.counts.edges + r.counts.flashes > 0) process.exit(1);
}
