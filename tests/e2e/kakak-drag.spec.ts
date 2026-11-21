import { expect, test, type Page } from "@playwright/test";
import { installStub } from "./stub-backend";
import { WHATS_NEW, storageKey } from "../../src/lib/whats-new";

// Kakak's grabber means it (Fable and the manager, 21 Nov): pull her sheet
// down by the grabber or her header and it closes; a short pull springs
// back; the close button and the conversation's own scroll are untouched.

test.beforeEach(async ({ context }) => {
  await context.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "seen");
  }, WHATS_NEW.map((entry) => storageKey(entry.id)));
});

async function open(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog", { name: "Kakak" });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(600); // she has come to rest
  return sheet;
}

async function pull(page: Page, dy: number, steps = 12) {
  const box = (await page.getByTestId("kakak-handle").boundingBox())!;
  const x = box.x + 60;
  const y = box.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps });
  await page.mouse.up();
}

test("pulling her sheet down by the grabber closes it", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const sheet = await open(page);
  await pull(page, 220);
  await expect(sheet).toHaveCount(0);
});

test("a short pull springs back, and Close still closes", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const sheet = await open(page);
  const before = (await sheet.boundingBox())!.y;
  await pull(page, 40, 20);
  await page.waitForTimeout(500);
  await expect(sheet).toBeVisible();
  expect(Math.abs((await sheet.boundingBox())!.y - before)).toBeLessThan(1);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
});

test("a quick short pull that stops and holds before letting go springs back (Codex, #188)", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const sheet = await open(page);
  const box = (await page.getByTestId("kakak-handle").boundingBox())!;
  const x = box.x + 60;
  const y = box.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 80, { steps: 2 });
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(500);
  await expect(sheet).toBeVisible();
});
