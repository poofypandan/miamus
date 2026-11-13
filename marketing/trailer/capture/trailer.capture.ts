/**
 * Captures every screen the trailer uses, as stills at 390 × 844 CSS px and
 * 3× density (1170 × 2532), into ../public/shots/. Run with `npm run capture`
 * from marketing/trailer (README.md). Also writes ../public/shots/taps.json:
 * where each tap lands (and where Kakak's name sits, for the AI tag), in CSS px.
 *
 * Owner screens are captured in both languages (shots/id, shots/en); staff
 * screens once, in Indonesian (shots/staff), as staff screens always are.
 *
 * The day, Monday 16 Nov 2026: the owner tells Kakak at 07.45, Sari mops the
 * terrace from 09.00, Today is all on track at 16.30, the lights reminder
 * rings on Sari's phone at 21.30.
 */
import fs from "node:fs";
import path from "node:path";
import { test, type Locator, type Page } from "@playwright/test";
import { DAY, foods, installDemo } from "./demo";
import { photo, servePhotos } from "./photos";
import { TYPED, UI, kakakReply, type Locale } from "./script";
import { STAFF_WHATS_NEW, WHATS_NEW, storageKey } from "../../../src/lib/whats-new";

const SHOTS = path.resolve(__dirname, "../public/shots");
const TAPS_FILE = path.join(SHOTS, "taps.json");
type Tap = { x: number; y: number };
const taps: Record<string, Tap> = fs.existsSync(TAPS_FILE) ? JSON.parse(fs.readFileSync(TAPS_FILE, "utf8")) : {};
function saveTaps() {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.writeFileSync(TAPS_FILE, JSON.stringify(taps, null, 2));
}

async function still(page: Page, dir: string, name: string, settle = 700, type: "png" | "jpeg" = "png") {
  await page.waitForTimeout(settle);
  fs.mkdirSync(path.join(SHOTS, dir), { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, dir, `${name}.${type === "png" ? "png" : "jpg"}`), type, ...(type === "jpeg" ? { quality: 92 } : {}) });
}

async function tapAt(key: string, target: Locator, where: "centre" | "right" = "centre") {
  const box = await target.boundingBox();
  if (box) {
    taps[key] = where === "right" ? { x: Math.round(box.x + box.width), y: Math.round(box.y + box.height / 2) } : { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  }
  saveTaps();
}

const at = (page: Page, hhmm: string) => page.clock.setFixedTime(new Date(`${DAY}T${hhmm}:00+07:00`));

// Every What's new card and staff tip already closed: a clean screen.
test.beforeEach(async ({ context }) => {
  await context.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "seen");
  }, [...WHATS_NEW, ...STAFF_WHATS_NEW].map((e) => storageKey(e.id)));
});

/** Where the typing frames break: evenly, always ending on the full sentence. */
function typingCuts(text: string, frames: number) {
  const cuts: number[] = [];
  for (let i = 1; i <= frames; i++) cuts.push(Math.round((text.length * i) / frames));
  return [...new Set(cuts)];
}

/** Kakak's sheet scrolls inside itself: the element that does. */
async function sheetScroller(page: Page) {
  return page.getByRole("dialog").evaluateHandle((dialog) => {
    const all = [dialog, ...Array.from(dialog.querySelectorAll("*"))] as HTMLElement[];
    return all.find((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) ?? null;
  });
}

for (const locale of ["en", "id"] as Locale[]) {
  const ui = UI[locale];

  test(`owner ${locale}: Today and the three sentences to Kakak`, async ({ context, page }) => {
    await installDemo(context, page, { owner: locale }, { lights: false, at: "07:45" });
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
      // Kakak's name in the sheet's header: the AI tag sits beside it.
      // Measured on the text itself: the element may span the whole header.
      const name = await page
        .getByRole("dialog")
        .getByText("Kakak", { exact: true })
        .first()
        .evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const r = range.getBoundingClientRect();
          return { x: Math.round(r.right), y: Math.round(r.top + r.height / 2) };
        });
      taps[`${locale}.k${k}.name`] = name;
      saveTaps();
      if (k === 0) {
        // The chore card is long: scroll the sheet down to its button, in small steps.
        const scroller = await sheetScroller(page);
        const max = await scroller.evaluate((el) => (el ? (el as HTMLElement).scrollHeight - (el as HTMLElement).clientHeight : 0));
        const steps = 14;
        for (let i = 1; i <= steps; i++) {
          await scroller.evaluate((el, y) => el && ((el as HTMLElement).scrollTop = y), Math.round((max * i) / steps));
          await still(page, locale, `k0-scroll-${String(i - 1).padStart(2, "0")}`, 60, "jpeg");
        }
      }
      await tapAt(`${locale}.k${k}.confirm`, confirm);
      await confirm.click();
      await still(page, locale, `k${k}-saved`, 1300);
    }
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
    stub.foods.push(...foods(locale));
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
        await still(page, locale, `glimpse-${key}`, 1800);
      }
    }
  });
}

test("staff: Pel teras, with photos", async ({ context, page }) => {
  await installDemo(context, page, { staff: true }, { lights: true, terraceToDo: true, at: "08:58" });
  await servePhotos(page);
  await page.goto("/staff");
  const card = page.getByRole("button", { name: /Pel teras/ }).first();
  await card.waitFor({ timeout: 30_000 });
  await still(page, "staff", "list", 2000);
  await tapAt("staff.card", card);
  await card.click();
  await page.getByRole("button", { name: "Ambil Foto Sebelum" }).waitFor();
  await still(page, "staff", "sheet", 900);
  // The before photo as she starts, the after photo when she's done.
  for (const [label, name, key, time] of [
    ["Ambil Foto Sebelum", "terrace-before", "before", "09:02"],
    ["Ambil Foto Sesudah", "terrace", "after", "09:24"],
  ] as const) {
    await at(page, time);
    const button = page.getByRole("button", { name: label, exact: true });
    await tapAt(`staff.${key}`, button);
    const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
    await button.click();
    await (await chooser).setFiles({ name: `${name}.jpg`, mimeType: "image/jpeg", buffer: await photo(name) });
    // Wait for the photo to finish saving, so the still shows it, not the spinner.
    await page.getByText(/Menyimpan foto/).first().waitFor({ state: "detached", timeout: 20_000 }).catch(() => undefined);
    await still(page, "staff", `photo-${key}`, 1500);
  }
  const finish = page.getByRole("button", { name: "Selesaikan" });
  await tapAt("staff.finish", finish);
  await finish.click();
  await still(page, "staff", "done", 900);
});

test("staff: the 17.00 walk reminder, the photo and the tick", async ({ context, page }) => {
  await installDemo(context, page, { staff: true }, { lights: true, at: "17:00", open: ["walk", "lights"] });
  await servePhotos(page);
  await page.goto("/staff");
  const card = page.getByRole("button", { name: /Jalan-jalan/ }).first();
  await card.waitFor({ timeout: 30_000 });
  await still(page, "staff", "walk-list", 2000);
  // The round camera button at the card's right.
  const box = await card.boundingBox();
  if (box) taps["staff.walk"] = { x: Math.round(box.x + box.width - 26), y: Math.round(box.y + box.height / 2) };
  saveTaps();
  await card.click();
  const take = page.getByText(/Ambil Foto untuk/);
  await take.waitFor();
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
  await take.click();
  await (await chooser).setFiles({ name: "path.jpg", mimeType: "image/jpeg", buffer: await photo("path") });
  const boxes = page.getByRole("checkbox");
  await boxes.first().waitFor();
  const count = await boxes.count();
  for (let i = 0; i < count; i++) await boxes.nth(i).click();
  await still(page, "staff", "walk-picked", 600);
  const save = page.getByRole("button", { name: "Simpan" });
  await tapAt("staff.walkSave", save);
  await save.click();
  await page.getByText(/Menyimpan foto/).first().waitFor({ state: "detached", timeout: 20_000 }).catch(() => undefined);
  await still(page, "staff", "walk-done", 1500);
});
