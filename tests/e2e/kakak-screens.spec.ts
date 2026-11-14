import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { installStub } from "./stub-backend";
import { WHATS_NEW, storageKey } from "../../src/lib/whats-new";

// Phone-size screenshots of Kakak's sheet, in both languages: the first
// screen, a new ingredient's card, an answer, and a conversation with both
// sides (2026-11-14). Not part of the suite; run by hand:
//
//   SHOTS_DIR=<folder> CI=1 npx playwright test tests/e2e/kakak-screens.spec.ts
//
// Test-only: the stubbed backend and the canned replies never ship.
const DIR = process.env.SHOTS_DIR;
test.skip(!DIR, "set SHOTS_DIR to take the screenshots");
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

test.beforeEach(async ({ context }) => {
  await context.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "seen");
  }, WHATS_NEW.map((entry) => storageKey(entry.id)));
});

const beef = {
  id: "00000000-0000-4000-8000-000000176001", household_id: HOUSEHOLD_ID, scope: "home", name: "Daging sapi", category: "fresh_food",
  quantity: 1, unit: "kg", min_threshold: 0, photo_url: null, created_at: "2026-10-01T00:00:00Z", variant: null, audit_frequency_days: 30,
  last_audited_at: null, notes: null, stock_status: "ok", stock_status_at: null, stock_status_by: null, track_amount: false,
  amount_set_at: null, amount_set_by: null, last_bought_amount: null, kept_in: "freezer", expires_on: "2026-12-20",
};

async function kakakSays(page: Page, replies: Record<string, unknown>[]) {
  let n = 0;
  await page.route("**/api/kakak", (route) => {
    n += 1;
    const reply = replies[Math.min(n, replies.length) - 1];
    return route.fulfill({ json: { requestId: `00000000-0000-4000-8000-0000000000c${n}`, history: { messages: [] }, ...reply } });
  });
  await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
}

const COPY = {
  en: {
    open: "Tell Kakak", box: "What should I set up?", more: "Anything else?", send: "Send",
    rice: "Add 2 kg of brown rice into the pantry thank you",
    riceReply: "Of course. I'll put 2 kg of brown rice in the cupboard.",
    ask: "how would you describe what miamis is for",
    answer: "Miamus keeps the running of your home in one place: chores, pets, the kitchen and the people who help. You say what should happen once, and your staff see it on their own phone. You only hear about what didn't happen.",
    thanks: "thank you", welcome: "You're welcome. I'm here whenever you need me.",
  },
  id: {
    open: "Bilang ke Kakak", box: "Mau Kakak atur apa?", more: "Ada lagi?", send: "Kirim",
    rice: "Tambah beras merah 2 kg di lemari ya",
    riceReply: "Baik. Kakak siapkan: beras merah 2 kg di lemari.",
    ask: "Miamus itu untuk apa?",
    answer: "Miamus menyatukan urusan rumah di satu tempat: tugas, hewan, dapur, dan orang-orang yang membantu. Anda cukup bilang sekali, lalu staf melihatnya di HP masing-masing. Anda hanya dikabari soal yang belum dikerjakan.",
    thanks: "terima kasih", welcome: "Sama-sama. Kakak selalu ada kalau Anda perlu.",
  },
} as const;

for (const locale of ["en", "id"] as const) {
  const c = COPY[locale];
  test(`screens ${locale}: the first screen, a new ingredient, an answer`, async ({ context, page }) => {
    await installStub(context, { owner: { locale }, kakak: { allowed: true, enabled: true }, features: { kitchen: true }, items: [beef] });
    await kakakSays(page, [
      {
        kind: "suggestions",
        text: c.riceReply,
        items: [{ kind: "new_ingredient", name: "Beras merah", nameEn: locale === "en" ? "Brown rice" : null, category: "pantry", keptIn: "pantry", expiresOn: null, expiryIsGuess: false, amount: { value: 2, unit: "kg" } }],
      },
    ]);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: c.open }).click({ timeout: 20_000 });
    await expect(page.getByRole("textbox", { name: c.box })).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/1-first-screen-${locale}.png` });

    await page.getByRole("textbox", { name: c.box }).fill(c.rice);
    await page.getByRole("button", { name: c.send }).click();
    await expect(page.getByText(c.riceReply)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/2-new-ingredient-${locale}.png` });
  });

  test(`screens ${locale}: a question, answered, and both sides kept`, async ({ context, page }) => {
    await installStub(context, { owner: { locale }, kakak: { allowed: true, enabled: true } });
    await kakakSays(page, [{ kind: "message", text: c.answer }, { kind: "message", text: c.welcome }]);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: c.open }).click({ timeout: 20_000 });
    await page.getByRole("textbox", { name: c.box }).fill(c.ask);
    await page.getByRole("button", { name: c.send }).click();
    await expect(page.getByText(c.answer)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/3-answer-${locale}.png` });
    await page.getByRole("textbox", { name: c.more }).fill(c.thanks);
    await page.getByRole("button", { name: c.send }).click();
    await expect(page.getByText(c.welcome)).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/4-both-sides-${locale}.png` });
  });
}
