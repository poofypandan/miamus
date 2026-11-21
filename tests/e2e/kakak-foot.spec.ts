import { expect, test } from "@playwright/test";
import { installStub } from "./stub-backend";
import { WHATS_NEW, storageKey } from "../../src/lib/whats-new";

// Once a conversation exists, the foot of Kakak's sheet is one row: the mic,
// then the field; Send only with words, and then the mic goes quiet; no Close
// word at the foot (07, screen 9; Fable, 21 Nov). The first screen is as before.

test.beforeEach(async ({ context }) => {
  await context.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "seen");
  }, WHATS_NEW.map((entry) => storageKey(entry.id)));
  await context.addInitScript(() => {
    class FakeRecognition {
      lang = ""; continuous = true; interimResults = false; maxAlternatives = 1;
      onresult = null; onerror = null; onend = null;
      start() {}
      stop() {}
      abort() {}
    }
    Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true });
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
  });
});

test("after her first answer the foot is one row, and Send comes only with words", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  await page.route("**/api/kakak", (route) =>
    route.fulfill({ json: { kind: "message", text: "You're welcome.", requestId: "00000000-0000-4000-8000-0000000000e1", history: { messages: [] } } })
  );
  await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog", { name: "Kakak" });

  // The first screen: the label under the big disc, the examples, Send there but disabled.
  await expect(sheet.getByText("Tap and talk")).toBeVisible();
  await expect(sheet.getByText("Try saying")).toBeVisible();

  await sheet.getByRole("textbox", { name: "What should I set up?" }).fill("thank you");
  await sheet.getByRole("button", { name: "Send" }).click();
  await expect(sheet.getByText("You're welcome.")).toBeVisible();

  // One row: the mic (its name kept, its label gone), the field, no Send yet.
  const field = sheet.getByRole("textbox", { name: "Anything else?" });
  const mic = sheet.getByRole("button", { name: "Talk to Kakak" });
  await expect(field).toBeVisible();
  await expect(mic).toBeVisible();
  await expect(sheet.getByText("Tap and talk")).toHaveCount(0);
  await expect(sheet.getByText("Try saying")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Send" })).toHaveCount(0);
  // The disc travels in and settles at 56 px.
  await expect.poll(async () => Math.round((await mic.boundingBox())!.width)).toBe(56);
  const micBox = (await mic.boundingBox())!;
  const fieldBox = (await field.boundingBox())!;
  expect(Math.abs(micBox.y + micBox.height - (fieldBox.y + fieldBox.height))).toBeLessThan(2);
  expect(micBox.x).toBeLessThan(fieldBox.x);
  // The cross in her header is the only Close.
  await expect(sheet.getByRole("button", { name: "Close" })).toHaveCount(1);

  // Words: Send arrives as the solid shape; the mic goes quiet.
  await field.fill("one more thing");
  await expect(sheet.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(mic).toHaveClass(/bg-muted/);
});

test("at 360 px a long line never pushes Send off the screen", async ({ context, page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.route("**/api/kakak", (route) =>
    route.fulfill({ json: { kind: "message", text: "Sama-sama.", requestId: "00000000-0000-4000-8000-0000000000e2", history: { messages: [] } } })
  );
  await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog", { name: "Kakak" });
  await sheet.getByRole("textbox", { name: "Mau Kakak atur apa?" }).fill("terima kasih");
  await sheet.getByRole("button", { name: "Kirim" }).click();
  const field = sheet.getByRole("textbox", { name: "Ada lagi?" });
  await field.fill("Tolong ingatkan Ari untuk menyiram semua tanaman di teras belakang setiap pagi sebelum jam delapan");
  const send = (await sheet.getByRole("button", { name: "Kirim" }).boundingBox())!;
  expect(send.x + send.width).toBeLessThanOrEqual(360);
  // 360 less 2 × 20 padding, the 56 px mic, the 48 px Send and two 10 px gaps.
  expect((await field.boundingBox())!.width).toBeGreaterThanOrEqual(196);
});
