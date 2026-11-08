// Food photos against the real API: what Kakak suggests from a picture of a
// label, a box or a dish. Run by hand; costs money; never in CI.
//
//   ANTHROPIC_API_KEY=… npx tsx tests/kakak/run-photos.ts --model opus --effort low
//
// Photos: tests/kakak/media/photos/<name>.{jpg,jpeg,png,heic}, each with
// <name>.json next to it saying what Kakak should do (format in
// docs/kakak-eval.md, "Food photos"). The media folder is git-ignored.
// Every photo is converted to JPEG and shrunk on this Mac first (sips), the
// way the app will shrink it on the phone: a full-size phone photo costs
// about three times as many tokens and reads no better.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { KakakHousehold } from "@/lib/kakak/household";
import { gradeCase } from "./grade";
import { summarise, tableRow, TABLE_HEADER, type CaseOutcome } from "./report";
import { checkVariant, makeClient, MODELS, playConversation, variantLabel, type Effort, type Variant } from "./run-core";
import { checkTestSet } from "./test-set-check";
import type { ExpectedTurn, KakakCase, MustNeverFlag } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const PHOTO_DIR = join(here, "media", "photos");
const EXTS = new Set([".jpg", ".jpeg", ".png", ".heic"]);

interface PhotoSidecar {
  /** What the owner types with the photo; defaults to "Tambahkan makanan ini." / "Add this food." */
  caption?: string;
  ownerLocale?: "id" | "en";
  mustNever?: MustNeverFlag[];
  paths: ExpectedTurn[][];
  note?: string;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function loadPhotos(): { file: string; kakakCase: KakakCase; caption: string }[] {
  if (!existsSync(PHOTO_DIR)) throw new Error(`No photos folder: ${PHOTO_DIR}. See docs/kakak-eval.md.`);
  const photos: { file: string; kakakCase: KakakCase; caption: string }[] = [];
  const missing: string[] = [];
  for (const name of readdirSync(PHOTO_DIR).sort()) {
    if (!EXTS.has(extname(name).toLowerCase())) continue;
    const sidecarFile = join(PHOTO_DIR, `${basename(name, extname(name))}.json`);
    if (!existsSync(sidecarFile)) {
      missing.push(name);
      continue;
    }
    const sidecar = JSON.parse(readFileSync(sidecarFile, "utf8")) as PhotoSidecar;
    const ownerLocale = sidecar.ownerLocale ?? "id";
    const caption = sidecar.caption ?? (ownerLocale === "id" ? "Tambahkan makanan ini." : "Add this food.");
    photos.push({
      file: join(PHOTO_DIR, name),
      caption,
      kakakCase: {
        id: `photo-${basename(name, extname(name))}`,
        sentence: caption,
        ownerLocale,
        lang: ownerLocale,
        category: "food",
        holdout: false,
        mustNever: sidecar.mustNever,
        paths: sidecar.paths,
        note: sidecar.note,
      },
    });
  }
  if (missing.length) throw new Error(`These photos have no .json saying what Kakak should do: ${missing.join(", ")}`);
  if (photos.length === 0) throw new Error(`No photos in ${PHOTO_DIR}.`);
  return photos;
}

/** JPEG, longest side at most `edge` pixels, via macOS sips. */
function shrink(file: string, workDir: string, edge: number): string {
  const out = join(workDir, `${basename(file, extname(file))}.jpg`);
  execFileSync("sips", ["-s", "format", "jpeg", "-Z", String(edge), file, "--out", out], { stdio: "ignore" });
  return out;
}

async function main() {
  const household = JSON.parse(readFileSync(join(here, "household.json"), "utf8")) as KakakHousehold;
  const photos = loadPhotos();
  const problems = checkTestSet(
    household,
    { version: 1, cases: photos.map((p) => p.kakakCase) },
    /^photo-[\w-]+$/,
  );
  if (problems.length) throw new Error(`Photo expectations have problems:\n- ${problems.join("\n- ")}`);

  const model = MODELS[arg("model") ?? "opus"];
  if (!model) throw new Error("--model must be opus, sonnet or haiku");
  const effort = (arg("effort") ?? "low") as Effort;
  const variant: Variant = { model, effort, thinking: process.argv.includes("--no-thinking") ? "between_tools" : "adaptive" };
  checkVariant(variant);
  const edge = Number(arg("max-edge") ?? "1280");
  const client = makeClient();
  const workDir = mkdtempSync(join(tmpdir(), "kakak-photos-"));
  const outcomes: CaseOutcome[] = [];
  try {
    for (const photo of photos) {
      const jpeg = shrink(photo.file, workDir, edge);
      const content: Anthropic.ContentBlockParam[] = [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: readFileSync(jpeg).toString("base64") } },
        { type: "text", text: photo.caption },
      ];
      const conversation = await playConversation(client, variant, household, photo.kakakCase, content);
      const grade = gradeCase(household, photo.kakakCase, conversation.turns);
      const { id, category, lang, ownerLocale, holdout, sentence } = photo.kakakCase;
      outcomes.push({ kakakCase: { id, category, lang, ownerLocale, holdout, sentence }, conversation, grade });
      console.log(`  ${id} ${grade.pass ? "pass" : `FAIL: ${[...grade.mustNever, ...grade.failures].join(" · ")}`}`);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
  const label = `${variantLabel(variant)}-photos`;
  const summary = summarise(outcomes);
  mkdirSync(join(here, "results"), { recursive: true });
  const file = join(here, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}-${label}.json`);
  writeFileSync(file, JSON.stringify({ variant, label, maxEdge: edge, summary, outcomes }, null, 2));
  console.log(`\n${TABLE_HEADER}\n${tableRow(label, summary)}\n\ndetails: ${file}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
