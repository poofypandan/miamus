/**
 * v10: the real "Talk to Kakak" listening screen (the default voice flow in src/components/kakak/kakak-voice.tsx),
 * captured from the demo build against the read-only stub, with no app code changed.
 *
 * The phone's speech recogniser is replaced, in the page only, by a fake with the same shape the app's own tests use
 * (RecognitionLike in src/lib/kakak/voice.ts): it hears nothing by itself, and the capture hands it the sentence, so
 * the app shows exactly what it shows while someone speaks: the black Stop button with its halo, "Listening… tap Stop
 * when you're done", and the words live in the typing box.
 *
 *   npx playwright test -c marketing/trailer/capture/capture.config.ts listen     (from the repo root)
 * Writes ../public/shots/<lang>/k0-listen-empty.png and k0-listen-full.png, and the mic's tap point to taps.json.
 */
import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";
import { installDemo } from "./demo";
import { servePhotos } from "./photos";
import { TYPED, UI, type Locale } from "./script";
import { STAFF_WHATS_NEW, WHATS_NEW, storageKey } from "../../../src/lib/whats-new";

const SHOTS = path.resolve(__dirname, "../public/shots");
const TAPS_FILE = path.join(SHOTS, "taps.json");
const MIC: Record<Locale, string> = { en: "Talk to Kakak", id: "Bicara dengan Kakak" };

async function still(page: Page, dir: string, name: string, settle = 700) {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: path.join(SHOTS, dir, `${name}.png`), type: "png" });
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "seen");
  }, [...WHATS_NEW, ...STAFF_WHATS_NEW].map((e) => storageKey(e.id)));
  // The fake recogniser: the app finds it as the browser's own, and the capture speaks through window.__hear.
  await context.addInitScript(() => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        (window as unknown as { __rec: FakeRecognition }).__rec = this;
      }
      start() {}
      stop() {}
      abort() {}
    }
    const w = window as unknown as Record<string, unknown>;
    w.webkitSpeechRecognition = FakeRecognition;
    w.SpeechRecognition = FakeRecognition;
    w.__hear = (text: string) => {
      const rec = (window as unknown as { __rec?: FakeRecognition }).__rec;
      if (!rec || !rec.onresult) return false;
      const alt = Object.assign([{ transcript: text }], { isFinal: false });
      rec.onresult({ resultIndex: 0, results: [alt] });
      return true;
    };
  });
});

for (const locale of ["en", "id"] as Locale[]) {
  const ui = UI[locale];
  test(`owner ${locale}: talking to Kakak, listening`, async ({ context, page }) => {
    await installDemo(context, page, { owner: locale }, { at: "07:45" });
    await servePhotos(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: ui.open }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: ui.open }).click();
    await page.getByRole("textbox", { name: ui.box }).waitFor();
    // A tip card in the sheet ("Got it"): closed, as every tip is in the trailer's captures.
    const gotIt = page.getByRole("button", { name: locale === "en" ? "Got it" : "Mengerti", exact: true });
    if (await gotIt.count()) {
      await gotIt.first().click();
      await page.waitForTimeout(500);
    }
    const mic = page.getByRole("button", { name: MIC[locale], exact: true });
    await mic.waitFor({ timeout: 10_000 });
    const box = await mic.boundingBox();
    const taps = fs.existsSync(TAPS_FILE) ? JSON.parse(fs.readFileSync(TAPS_FILE, "utf8")) : {};
    if (box) taps[`${locale}.mic`] = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    fs.writeFileSync(TAPS_FILE, JSON.stringify(taps, null, 2));
    await mic.click();
    await still(page, locale, "k0-listen-empty", 900);
    const heard = await page.evaluate((t) => (window as unknown as { __hear: (t: string) => boolean }).__hear(t), TYPED[locale][0]);
    if (!heard) throw new Error("the app did not start listening");
    await still(page, locale, "k0-listen-full", 900);
  });
}
