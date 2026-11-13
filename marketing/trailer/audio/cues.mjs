// Writes audio/out/cues.json: where every sound goes, in seconds, for both cuts, straight from the
// film's own timings (src/film/timeline.ts), so sound and picture can't disagree.
//   node audio/cues.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { soundCues } from "../src/film/timeline.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
fs.mkdirSync(path.join(root, "audio/out"), { recursive: true });
const cues = { 60: soundCues("60"), 15: soundCues("15") };
fs.writeFileSync(path.join(root, "audio/out/cues.json"), JSON.stringify(cues, null, 1));
console.log("wrote audio/out/cues.json");
