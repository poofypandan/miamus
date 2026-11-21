import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, installStub } from "./stub-backend";
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
    talk: "Talk to Kakak", aloud: "Read replies aloud", cancel: "Cancel", change: "Change", heard: "Ari mops the terrace on",
    mop: "Have Ari mop the terrace every Monday at 9", mopReply: "Sure. Ari mops the terrace every Monday at 9:00.", looksRight: "Looks right",
  },
  id: {
    open: "Bilang ke Kakak", box: "Mau Kakak atur apa?", more: "Ada lagi?", send: "Kirim",
    rice: "Tambah beras merah 2 kg di lemari ya",
    riceReply: "Baik. Kakak siapkan: beras merah 2 kg di lemari.",
    ask: "Miamus itu untuk apa?",
    answer: "Miamus menyatukan urusan rumah di satu tempat: tugas, hewan, dapur, dan orang-orang yang membantu. Anda cukup bilang sekali, lalu staf melihatnya di HP masing-masing. Anda hanya dikabari soal yang belum dikerjakan.",
    thanks: "terima kasih", welcome: "Sama-sama. Kakak selalu ada kalau Anda perlu.",
    talk: "Bicara dengan Kakak", aloud: "Bacakan jawaban Kakak", cancel: "Batalkan", change: "Ubah", heard: "Ari pel teras tiap",
    mop: "Ari pel teras tiap Senin jam 9 ya", mopReply: "Baik. Ari mengepel teras tiap Senin jam 09.00.", looksRight: "Sudah benar",
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

  // The card every request ends on, and the toast after it (04, PR 5).
  test(`screens ${locale}: a chore's card, then the toast`, async ({ context, page }) => {
    await installStub(context, { owner: { locale }, kakak: { allowed: true, enabled: true } });
    await kakakSays(page, [
      {
        kind: "suggestions",
        text: c.mopReply,
        items: [{
          kind: "chore", title: "Pel teras", titleEn: locale === "en" ? "Mop the terrace" : null, category: "cleaning", assignedTo: STAFF_ID,
          assignToSelf: false, assigneeName: "Ari", dueDate: "2026-11-16", dueTime: "09:00", recurrence: "weekly", recurrenceUntil: null,
          requiresSupervision: false, locationId: null, roomName: null, newRoomName: null, newRoomFloorId: null, newRoomFloorName: null, notes: null,
        }],
      },
    ]);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: c.open }).click({ timeout: 20_000 });
    await page.getByRole("textbox", { name: c.box }).fill(c.mop);
    await page.getByRole("button", { name: c.send }).click();
    await expect(page.getByText(c.mopReply)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/5-chore-card-${locale}.png` });
    await page.getByRole("button", { name: c.looksRight }).click();
    // One chore closes the sheet on a toast with Undo.
    await expect(page.getByRole("button", { name: locale === "en" ? "Undo" : "Batalkan" })).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${DIR}/6-saved-${locale}.png` });
  });

  // The states around the card (Fable's gate, PR 5): reading aloud on, the
  // mic listening, thinking, her question with the practice note, Change open.
  test(`screens ${locale}: around the card`, async ({ context, page }) => {
    await context.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
      class FakeRecognition {
        lang = ""; continuous = true; interimResults = false; maxAlternatives = 1;
        onresult: ((event: unknown) => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null;
        onend: (() => void) | null = null;
        start() { w.__recognition = this; }
        stop() { setTimeout(() => this.onend?.(), 20); }
        abort() { setTimeout(() => this.onend?.(), 20); }
      }
      Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true });
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    });
    await installStub(context, { owner: { locale }, kakak: { allowed: true, enabled: true } });
    let n = 0;
    await page.route("**/api/kakak", async (route) => {
      n += 1;
      if (n === 1) {
        await new Promise((r) => setTimeout(r, 2500));
        return route.fulfill({ json: {
          kind: "question", practice: true, requestId: "00000000-0000-4000-8000-0000000000d1", history: { messages: [] },
          question: locale === "en" ? "Which day?" : "Hari apa?", answers: locale === "en" ? ["Monday", "Saturday"] : ["Senin", "Sabtu"], allowTyping: true,
        } });
      }
      return route.fulfill({ json: {
        kind: "suggestions", practice: true, text: c.mopReply, requestId: "00000000-0000-4000-8000-0000000000d2", history: { messages: [] },
        items: [{
          kind: "chore", title: "Pel teras", titleEn: locale === "en" ? "Mop the terrace" : null, category: "cleaning", assignedTo: STAFF_ID,
          assignToSelf: false, assigneeName: "Ari", dueDate: "2026-11-16", dueTime: "09:00", recurrence: "weekly", recurrenceUntil: null,
          requiresSupervision: false, locationId: null, roomName: null, newRoomName: null, newRoomFloorId: null, newRoomFloorName: null, notes: null,
        }],
      } });
    });
    await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
    await page.goto("/dashboard");
    await page.getByRole("button", { name: c.open }).click({ timeout: 20_000 });
    await page.getByRole("button", { name: c.aloud }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/7-read-aloud-on-${locale}.png` });

    await page.getByRole("button", { name: c.talk }).last().click();
    await page.waitForTimeout(300);
    await page.evaluate((words) => {
      const r = (window as unknown as { __recognition: { onresult: (e: unknown) => void } }).__recognition;
      r.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: words }], { isFinal: false })] });
    }, c.heard);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/8-listening-${locale}.png` });
    await page.getByRole("button", { name: c.cancel, exact: true }).click();
    await page.waitForTimeout(400);

    await page.getByRole("textbox", { name: c.box }).fill(c.mop);
    await page.getByRole("button", { name: c.send }).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${DIR}/9-thinking-${locale}.png` });
    await expect(page.getByText(locale === "en" ? "Which day?" : "Hari apa?")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${DIR}/10-question-${locale}.png` });

    await page.getByRole("button", { name: locale === "en" ? "Monday" : "Senin" }).click();
    await expect(page.getByText(c.mopReply)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: c.change, exact: true }).click();
    await page.waitForTimeout(700);
    await page.getByTestId("kakak-scroll").evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/11-change-open-${locale}.png` });
  });
}
