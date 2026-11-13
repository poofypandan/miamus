/**
 * Captures every screen the trailer uses, as stills at 390 × 844 CSS px and
 * 3× density (1170 × 2532), into ../public/shots/. Run with `npm run capture`
 * from marketing/trailer (README.md). Also writes ../public/shots/taps.json:
 * where each tap lands, in CSS px, for the tap circles drawn in the edit.
 *
 * Owner screens are captured in both languages (shots/id, shots/en); staff
 * screens once, in Indonesian (shots/staff), as staff screens always are.
 */
import fs from "node:fs";
import path from "node:path";
import { test, type Locator, type Page } from "@playwright/test";
import { HOUSEHOLD_ID, installDemo } from "./demo";
import { photo, servePhotos } from "./photos";
import { TYPED, UI, kakakReply, type Locale } from "./script";
import { STAFF_WHATS_NEW, WHATS_NEW, storageKey } from "../../../src/lib/whats-new";

const SHOTS = path.resolve(__dirname, "../public/shots");
const TAPS_FILE = path.join(SHOTS, "taps.json");
type Tap = { x: number; y: number };
const taps: Record<string, Tap> = fs.existsSync(TAPS_FILE) ? JSON.parse(fs.readFileSync(TAPS_FILE, "utf8")) : {};
function saveTaps() {
  fs.writeFileSync(TAPS_FILE, JSON.stringify(taps, null, 2));
}

async function still(page: Page, dir: string, name: string, settle = 700, type: "png" | "jpeg" = "png") {
  await page.waitForTimeout(settle);
  fs.mkdirSync(path.join(SHOTS, dir), { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, dir, `${name}.${type === "png" ? "png" : "jpg"}`), type, ...(type === "jpeg" ? { quality: 92 } : {}) });
}

async function tapAt(key: string, target: Locator) {
  const box = await target.boundingBox();
  if (box) taps[key] = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  saveTaps();
}

// Every What's new card and staff tip already closed: a clean screen.
test.beforeEach(async ({ context }) => {
  await context.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "seen");
  }, [...WHATS_NEW, ...STAFF_WHATS_NEW].map((e) => storageKey(e.id)));
});

/** Where the typing frames break: about every `step` characters, always ending on the full sentence. */
function typingCuts(text: string, frames: number) {
  const cuts: number[] = [];
  for (let i = 1; i <= frames; i++) cuts.push(Math.round((text.length * i) / frames));
  return [...new Set(cuts)];
}

for (const locale of ["id", "en"] as Locale[]) {
  const ui = UI[locale];

  test(`owner ${locale}: Today and the three sentences to Kakak`, async ({ context, page }) => {
    const stub = await installDemo(context, page, { owner: locale }, { lights: false });
    await servePhotos(page);
    let k: 0 | 1 | 2 = 0;
    let hold = Promise.resolve();
    await page.route("**/api/kakak", async (route) => {
      await hold;
      await route.fulfill({ json: kakakReply(locale, k) });
    });
    await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
    await page.goto("/dashboard");
    await page.getByRole("button", { name: ui.open }).waitFor({ timeout: 30_000 });
    await still(page, locale, "today", 2500);
    await tapAt(`${locale}.open`, page.getByRole("button", { name: ui.open }));

    const confirms = [ui.confirm1, ui.confirm2, ui.confirm3];
    const frames = [14, 22, 18];
    for (k = 0; k < 3; k = (k + 1) as 0 | 1 | 2) {
      if (k > 0) {
        // A fresh start for the next sentence, as the storyboard's takes are.
        await page.goto("/dashboard");
        await page.getByRole("button", { name: ui.open }).waitFor({ timeout: 30_000 });
        await page.waitForTimeout(1500);
      }
      await page.getByRole("button", { name: ui.open }).click();
      const box = page.getByRole("textbox", { name: ui.box });
      await box.waitFor();
      await still(page, locale, `k${k}-open`, 900);
      const text = TYPED[locale][k];
      const cuts = typingCuts(text, frames[k]);
      for (let i = 0; i < cuts.length; i++) {
        await box.fill(text.slice(0, cuts[i]));
        await still(page, locale, `k${k}-type-${String(i).padStart(2, "0")}`, 120, "jpeg");
      }
      await tapAt(`${locale}.k${k}.send`, page.getByRole("button", { name: ui.send }));
      let release!: () => void;
      hold = new Promise<void>((r) => (release = r));
      await page.getByRole("button", { name: ui.send }).click();
      await still(page, locale, `k${k}-thinking`, 700);
      release();
      const confirm = page.getByRole("button", { name: confirms[k], exact: true });
      await confirm.waitFor();
      await still(page, locale, `k${k}-card`, 1100);
      await tapAt(`${locale}.k${k}.confirm`, confirm);
      await confirm.click();
      await still(page, locale, `k${k}-saved`, 1300);
    }
    void stub;
  });

  test(`owner ${locale}: all on track, and the scroll past each person`, async ({ context, page }) => {
    await installDemo(context, page, { owner: locale }, { lights: true });
    await servePhotos(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: ui.open }).waitFor({ timeout: 30_000 });
    await still(page, locale, "status", 2500);
    // A slow scroll: small steps, played back one after another in the edit.
    for (let i = 0; i <= 60; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 4);
      await still(page, `${locale}/scroll`, String(i).padStart(2, "0"), 60, "jpeg");
    }
  });

  test(`owner ${locale}: Kitchen, Pets, Repairs`, async ({ context, page }) => {
    const stub = await installDemo(context, page, { owner: locale }, { lights: true });
    await servePhotos(page);
    // Aunt Rina's opor, as sentence 3 saved it.
    stub.foods.push({
      id: "00000000-0000-4000-8000-000000000f01", household_id: HOUSEHOLD_ID, name: "Opor", kept_in: "fridge",
      expires_on: "2026-11-17", expiry_unknown: false, source: "gift", from_whom: locale === "en" ? "Aunt Rina" : "Tante Rina",
      return_container: false, container_returned_at: null, notes: null, photo_url: null, added_by: null, created_by: null,
      outcome: null, finished_at: null, finished_by: null, created_at: "2026-11-16T08:00:00Z", updated_at: "2026-11-16T08:00:00Z",
    });
    const tabs = locale === "id" ? { kitchen: "Dapur", pets: "Hewan", home: "Rumah", repairs: "Perbaikan" } : { kitchen: "Kitchen", pets: "Pets", home: "Home", repairs: "Repairs" };
    await page.goto("/dashboard");
    await page.getByRole("button", { name: ui.open }).waitFor({ timeout: 30_000 });
    for (const [key, name] of [["kitchen", tabs.kitchen], ["pets", tabs.pets], ["home", tabs.home]] as const) {
      await page.getByRole("link", { name, exact: true }).or(page.getByRole("button", { name, exact: true })).first().click();
      if (key === "home") {
        await page.waitForTimeout(800);
        await page.getByRole("button", { name: tabs.repairs, exact: true }).or(page.getByRole("tab", { name: tabs.repairs })).first().click();
        await still(page, locale, "glimpse-repairs", 1600);
      } else {
        await still(page, locale, `glimpse-${key}`, 1600);
      }
    }
  });
}

test("staff: Pel teras, with photos", async ({ context, page }) => {
  await installDemo(context, page, { staff: true }, { lights: true, terraceToDo: true, at: "08:50" });
  await servePhotos(page);
  await page.goto("/staff");
  const card = page.getByRole("button", { name: /Pel teras/ }).first();
  await card.waitFor({ timeout: 30_000 });
  await still(page, "staff", "list", 2000);
  await tapAt("staff.card", card);
  await card.click();
  await page.getByRole("button", { name: "Ambil Foto Sebelum" }).waitFor();
  await still(page, "staff", "sheet", 900);
  for (const [label, name, key] of [
    ["Ambil Foto Sebelum", "terrace-before", "before"],
    ["Ambil Foto Sesudah", "terrace", "after"],
  ] as const) {
    const button = page.getByRole("button", { name: label, exact: true });
    await tapAt(`staff.${key}`, button);
    const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
    await button.click();
    await (await chooser).setFiles({ name: `${name}.jpg`, mimeType: "image/jpeg", buffer: await photo(name) });
    await still(page, "staff", `photo-${key}`, 3000);
  }
  const finish = page.getByRole("button", { name: "Selesaikan" });
  await tapAt("staff.finish", finish);
  await finish.click();
  await still(page, "staff", "done", 900);
});

test("staff: the evening, lights off still to do", async ({ context, page }) => {
  await installDemo(context, page, { staff: true }, { lights: true, at: "21:25" });
  await servePhotos(page);
  await page.goto("/staff");
  await page.getByRole("button", { name: /Matikan lampu/ }).first().waitFor({ timeout: 30_000 });
  await still(page, "staff", "evening", 2000);
});
