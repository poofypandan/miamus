// Writes public/music/cue-sheet.md from src/timeline.ts, so the composer's
// sheet always matches the cut. Run: npm run cues (plain Node, types stripped).
import fs from "node:fs";
import path from "node:path";
import { BEAT, BPM, FPS, HOOK, K15, K60, MUSIC_ARC, S1, S6, S8, SHOTS_15, SHOTS_60, STAFF15, STAFF60 } from "../src/timeline.ts";

const sec = (f: number) => (f / FPS).toFixed(2);
const beatOf = (f: number) => (f / BEAT).toFixed(1);
const row = (f: number, what: string) => `| ${sec(f)} | ${beatOf(f)} | ${what} |`;

const lines: string[] = [];
lines.push("# Music cue sheet", "", `Generated from \`src/timeline.ts\` by \`npm run cues\`. ${BPM} BPM, ${FPS} fps; one beat = ${BEAT.toFixed(2)} frames. The 60-second cut is exactly 86 beats.`, "");
lines.push("## The arc (60 s)", "", "| From (s) | To (s) | What the music does |", "|---|---|---|");
for (const a of MUSIC_ARC) lines.push(`| ${sec(a.from)} | ${sec(a.to)} | ${a.what} |`);
lines.push("", "## Cuts (60 s)", "", "| Time (s) | Beat | Shot |", "|---|---|---|");
for (const [name, [from]] of Object.entries(SHOTS_60)) lines.push(row(from, name));
lines.push(row(SHOTS_60.end[1], "last frame: the ending lands here"));

const fx60: [number, string][] = [];
[0, 1, 2].forEach((i) => fx60.push([HOOK.first + i * HOOK.stagger, `tap (hook bubble ${i + 1})`]));
fx60.push([SHOTS_60.s1[0] + S1.tap, "tap (Kakak's button)"]);
const shots = [SHOTS_60.s2, SHOTS_60.s3, SHOTS_60.s4];
K60.forEach((k, i) => {
  fx60.push([shots[i][0] + k.send, `tap (send, sentence ${i + 1})`]);
  if (k.scrollLength) fx60.push([shots[i][0] + k.scrollFrom, `(sheet scrolls to the button, sentence ${i + 1})`]);
  fx60.push([shots[i][0] + k.confirm, `tap (confirm, sentence ${i + 1})`]);
});
const s5 = SHOTS_60.s5[0];
fx60.push([s5 + STAFF60.card, "tap (Pel teras)"], [s5 + STAFF60.before, "tap (before photo)"], [s5 + STAFF60.beforeIn - 2, "shutter"]);
fx60.push([s5 + STAFF60.after, "tap (after photo)"], [s5 + STAFF60.afterIn - 2, "shutter"], [s5 + STAFF60.finish, "tap (Selesaikan)"]);
const s6 = SHOTS_60.s6[0];
fx60.push([s6 + S6.push, "chime (staff reminder, 21.30)"], [s6 + S6.open, "tap (the reminder)"], [s6 + S6.camera, "tap (camera)"], [s6 + S6.picked - 2, "shutter"], [s6 + S6.save, "tap (Simpan): the tick"]);
fx60.push([SHOTS_60.s8[0] + S8.push, "chime (owner: the walk isn't done) — the only sound of the owner's phone"]);
fx60.push([SHOTS_60.end[0] + 10, "soft chime (end card)"]);
lines.push("", "## Sound effects (60 s)", "", "| Time (s) | Beat | Sound |", "|---|---|---|");
for (const [f, what] of fx60.sort((a, b) => a[0] - b[0])) lines.push(row(Math.round(f), what));

lines.push("", "## Cuts and sounds (15 s)", "", "| Time (s) | Beat | What |", "|---|---|---|");
const fx15: [number, string][] = Object.entries(SHOTS_15).map(([n, [f]]) => [f, `cut: ${n}`]);
[0, 1, 2].forEach((i) => fx15.push([HOOK.first + i * HOOK.stagger, "tap (hook)"]));
fx15.push([SHOTS_15.s2[0] + K15.send, "tap (send)"], [SHOTS_15.s2[0] + K15.confirm, "tap (confirm)"]);
const q5 = SHOTS_15.s5[0];
fx15.push([q5 + STAFF15.card, "tap"], [q5 + STAFF15.beforeIn - 2, "shutter"], [q5 + STAFF15.afterIn - 2, "shutter"], [q5 + STAFF15.finish, "tap"]);
fx15.push([SHOTS_15.end[0] + 8, "soft chime (end card)"]);
for (const [f, what] of fx15.sort((a, b) => a[0] - b[0])) lines.push(row(Math.round(f), what));

const out = path.resolve(import.meta.dirname, "../public/music/cue-sheet.md");
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`Wrote ${out}`);
