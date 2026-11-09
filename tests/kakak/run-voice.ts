// Speech-to-text comparison for Kakak's mic (decision K9). Run by hand:
//
//   npx tsx tests/kakak/run-voice.ts [--providers scribe,soniox,deepgram]
//
// Clips: tests/kakak/media/voice/<name>.{m4a,mp4,mp3,wav,webm}, each with
// <name>.txt next to it holding what was actually said, typed by the owner.
// The media folder is git-ignored: household voices never go into the repo.
// A provider runs only when its key is set (ELEVENLABS_API_KEY,
// SONIOX_API_KEY, DEEPGRAM_API_KEY). See docs/kakak-eval.md.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { PROVIDERS, type ProviderId } from "./stt-providers";
import { nameHits, wordErrorRate, type NameHit, type WerResult } from "./wer";

const ROOT = join(process.cwd(), "tests", "kakak");
const VOICE_DIR = join(ROOT, "media", "voice");
const RESULTS_DIR = join(ROOT, "results");
const AUDIO_EXTS = new Set([".m4a", ".mp4", ".mp3", ".wav", ".webm"]);

interface ClipResult {
  clip: string;
  provider: ProviderId;
  seconds: number | null;
  reference: string;
  text?: string;
  ms?: number;
  wer?: WerResult;
  names?: NameHit[];
  error?: string;
}

function parseProviders(argv: string[]): ProviderId[] {
  const index = argv.indexOf("--providers");
  const raw = index >= 0 ? argv[index + 1] : "scribe,soniox,deepgram";
  if (!raw) throw new Error("--providers needs a value, e.g. scribe,soniox");
  return raw.split(",").map((value) => {
    const id = value.trim() as ProviderId;
    if (!(id in PROVIDERS)) throw new Error(`Unknown provider: ${value}`);
    return id;
  });
}

function householdNames(): string[] {
  const household = JSON.parse(readFileSync(join(ROOT, "household.json"), "utf8")) as {
    people: { name: string }[];
    pets: { name: string }[];
  };
  return [...household.people.map((p) => p.name), ...household.pets.map((p) => p.name)];
}

/** Duration in seconds via macOS afinfo; null when unavailable. */
function durationSeconds(file: string): number | null {
  try {
    const output = execFileSync("afinfo", [file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const match = /estimated duration:\s*([\d.]+)\s*sec/i.exec(output);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function listClips(): { audio: string; reference: string }[] {
  if (!existsSync(VOICE_DIR)) {
    throw new Error(`No clips folder: ${VOICE_DIR}. See docs/kakak-eval.md.`);
  }
  const clips: { audio: string; reference: string }[] = [];
  const missing: string[] = [];
  for (const name of readdirSync(VOICE_DIR).sort()) {
    if (!AUDIO_EXTS.has(extname(name).toLowerCase())) continue;
    const audio = join(VOICE_DIR, name);
    const txt = join(VOICE_DIR, `${basename(name, extname(name))}.txt`);
    if (!existsSync(txt)) {
      missing.push(name);
      continue;
    }
    const reference = readFileSync(txt, "utf8").trim();
    if (!reference) {
      missing.push(name);
      continue;
    }
    clips.push({ audio, reference });
  }
  if (missing.length) {
    throw new Error(`These clips have no reference .txt (or it is empty); add one first: ${missing.join(", ")}`);
  }
  if (clips.length === 0) throw new Error(`No clips in ${VOICE_DIR}.`);
  return clips;
}

async function main(): Promise<void> {
  const wanted = parseProviders(process.argv.slice(2));
  const clips = listClips();
  const names = householdNames();
  const results: ClipResult[] = [];

  for (const id of wanted) {
    const provider = PROVIDERS[id];
    if (!process.env[provider.envKey]) {
      console.log(`Skipping ${provider.label}: ${provider.envKey} is not set.`);
      continue;
    }
    console.log(`\n${provider.label}: ${clips.length} clips`);
    for (const clip of clips) {
      const result: ClipResult = {
        clip: basename(clip.audio),
        provider: id,
        seconds: durationSeconds(clip.audio),
        reference: clip.reference,
      };
      try {
        const { text, ms } = await provider.transcribe(clip.audio, { keyterms: names });
        result.text = text;
        result.ms = ms;
        result.wer = wordErrorRate(clip.reference, text);
        result.names = nameHits(clip.reference, text, names);
        console.log(`  ${result.clip}: WER ${(result.wer.wer * 100).toFixed(1)}%, ${ms} ms`);
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        console.log(`  ${result.clip}: ERROR ${result.error}`);
      }
      results.push(result);
    }
  }

  if (results.length === 0) {
    console.log("\nNo provider ran. Set at least one key (see docs/kakak-eval.md).");
    return;
  }

  console.log("\n| Provider | Clips | Failed | Mean WER | Names right | p50 | p95 | Minutes | Est. cost |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const id of wanted) {
    const rows = results.filter((r) => r.provider === id);
    if (rows.length === 0) continue;
    const ok = rows.filter((r) => r.wer);
    const meanWer = ok.length ? ok.reduce((sum, r) => sum + (r.wer?.wer ?? 0), 0) / ok.length : null;
    const allNames = ok.flatMap((r) => r.names ?? []);
    const namesRight = allNames.length ? allNames.filter((n) => n.hit).length / allNames.length : null;
    const latencies = ok.map((r) => r.ms ?? 0);
    const knownSeconds = rows.map((r) => r.seconds).filter((s): s is number => s !== null);
    const unknownDurations = rows.length - knownSeconds.length;
    const minutes = knownSeconds.reduce((sum, s) => sum + s, 0) / 60;
    const cost = minutes * PROVIDERS[id].usdPerMinute;
    const pct = (value: number | null) => (value === null ? "n/a" : `${(value * 100).toFixed(1)}%`);
    const msText = (value: number | null) => (value === null ? "n/a" : `${(value / 1000).toFixed(1)} s`);
    console.log(
      `| ${PROVIDERS[id].label} | ${rows.length} | ${rows.length - ok.length} | ${pct(meanWer)} | ${pct(namesRight)} (${allNames.length}) | ${msText(percentile(latencies, 50))} | ${msText(percentile(latencies, 95))} | ${minutes.toFixed(2)}${unknownDurations ? ` (+${unknownDurations} unknown)` : ""} | $${cost.toFixed(4)} |`,
    );
  }

  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = join(RESULTS_DIR, `voice-${stamp}.json`);
  writeFileSync(out, `${JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`\nPer-clip results: ${out}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
