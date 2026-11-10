import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { STAFF_ID, installStub } from "./stub-backend";

// Talk to Kakak (voice beta). The browser's SpeechRecognition is replaced by
// a fake the test speaks through, and speechSynthesis.speak by a recorder, so
// what is under test is the sheet's side: the mic, the live words in the
// typing box, the spoken request going through the real /api/kakak route in
// practice mode (KAKAK_PRACTICE=true, no AI), the card, reading it aloud, and
// the keyboard tip where the browser can't listen.

type Mode = "works" | "missing" | "refused";

async function fakeSpeech(context: BrowserContext, mode: Mode) {
  await context.addInitScript((mode: Mode) => {
    const w = window as unknown as Record<string, unknown>;
    const spoken: string[] = [];
    w.__spoken = spoken;
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
        if (utterance.text.trim()) spoken.push(utterance.text);
        setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), 50);
      };
    }
    if (mode === "missing") {
      Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
      return;
    }
    class FakeRecognition {
      lang = "";
      continuous = true;
      interimResults = false;
      maxAlternatives = 1;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        w.__recognition = this;
        w.__lang = this.lang;
        // An iPhone Home Screen app: the recognizer exists but won't run.
        if (mode === "refused") {
          setTimeout(() => {
            this.onerror?.({ error: "service-not-allowed" });
            this.onend?.();
          }, 20);
        }
      }
      stop() {
        setTimeout(() => this.onend?.(), 20);
      }
      abort() {
        setTimeout(() => this.onend?.(), 20);
      }
    }
    Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true });
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
  }, mode);
}

/** The owner speaks: the browser reports the words so far. */
async function say(page: Page, words: string, final: boolean) {
  await page.evaluate(
    ([words, final]) => {
      const r = (window as unknown as { __recognition: { onresult: (e: unknown) => void } }).__recognition;
      const result = Object.assign([{ transcript: words }], { isFinal: final });
      r.onresult({ resultIndex: 0, results: [result] });
    },
    [words, final] as const
  );
}

test("voice: speak a request, see the words live, and Kakak's card comes back (practice mode)", async ({ context, page }) => {
  await fakeSpeech(context, "works");
  const stub = await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  // Reading aloud is off until turned on, and remembered on this phone.
  const speaker = page.getByRole("button", { name: "Bacakan jawaban Kakak" });
  await expect(speaker).toHaveAttribute("aria-pressed", "false");
  await speaker.click();
  await expect(speaker).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Bicara dengan Kakak" }).click();
  await expect(page.getByText("Kakak mendengarkan… ketuk Berhenti kalau sudah")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __lang: string }).__lang)).toBe("id-ID");

  // The words appear in the typing box as they are heard.
  const box = page.getByRole("textbox", { name: "Mau Kakak atur apa?" });
  await say(page, "Ari pel teras", false);
  await expect(box).toHaveValue("Ari pel teras");
  await say(page, "Ari pel teras setiap Senin jam 9", true);
  await expect(box).toHaveValue("Ari pel teras setiap Senin jam 9");

  // Stop sends what was heard, through the real route, as if typed.
  await page.getByRole("button", { name: "Berhenti" }).click();
  await expect(page.getByText("Ari pel teras setiap Senin jam 9", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Mode latihan:/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Pel teras", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sudah benar" })).toBeVisible();

  // The card was read aloud, ending with the question.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(" | ")))
    .toMatch(/Pel teras.*Sudah benar\?$/);

  expect(stub.tasks).toHaveLength(0); // nothing saved before Sudah benar
  await page.getByRole("button", { name: "Sudah benar" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Pel teras", assigned_to: STAFF_ID, due_time: "09:00", recurrence: "weekly" });
  expect(stub.seen.realBackend).toEqual([]);

  // The speaker choice is remembered on this phone.
  await page.getByRole("button", { name: "Bilang ke Kakak" }).click();
  await expect(page.getByRole("button", { name: "Bacakan jawaban Kakak" })).toHaveAttribute("aria-pressed", "true");
});

test("voice: Cancel keeps the words in the box and sends nothing", async ({ context, page }) => {
  await fakeSpeech(context, "works");
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  let asked = 0;
  await page.route("**/api/kakak", (route) => {
    asked++;
    return route.fulfill({ json: { kind: "message", text: "ok", history: { messages: [] }, requestId: "x" } });
  });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Talk to Kakak" }).click();
  await say(page, "Buy eggs", false);
  await page.getByRole("button", { name: "Cancel, don't send" }).click();
  await expect(page.getByText("Tap and talk")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "What should I set up?" })).toHaveValue("Buy eggs");
  expect(asked).toBe(0);
});

test("voice: tapping Send while the mic is on sends once", async ({ context, page }) => {
  await fakeSpeech(context, "works");
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const asked: string[] = [];
  await page.route("**/api/kakak", (route) => {
    asked.push(route.request().postDataJSON().reply);
    return route.fulfill({ json: { kind: "message", text: "Noted.", history: { messages: [] }, requestId: "x" } });
  });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Talk to Kakak" }).click();
  await say(page, "Buy eggs", false);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Noted.")).toBeVisible();
  // The browser finishes the utterance late: nothing more goes to Kakak.
  await say(page, "Buy eggs", true);
  await page.evaluate(() => (window as unknown as { __recognition: { onend: () => void } }).__recognition.onend());
  await page.waitForTimeout(300);
  expect(asked).toEqual(["Buy eggs"]);
});

test("voice: the card is read once, and not again when an item is removed while listening", async ({ context, page }) => {
  await fakeSpeech(context, "works");
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  await page.route("**/api/kakak", (route) =>
    route.fulfill({
      json: {
        kind: "suggestions",
        text: "Here's what I'll add:",
        items: [
          { kind: "shopping", entries: [{ type: "item", itemId: "i1", name: "Eggs", status: "out" }] },
          { kind: "shopping", entries: [{ type: "item", itemId: "i2", name: "Sugar", status: "low" }] },
        ],
        requestId: "00000000-0000-4000-8000-0000000000b1",
        history: { messages: [] },
      },
    })
  );
  await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Read replies aloud" }).click();
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Buy eggs and sugar");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save 2" })).toBeVisible();
  const spoken = () => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  await expect.poll(spoken).toHaveLength(1);
  expect((await spoken())[0]).toMatch(/Eggs.*Sugar.*Is that right\?$/);

  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Talk to Kakak" }).click();
  await page.getByRole("button", { name: "Remove" }).first().click();
  await page.waitForTimeout(300);
  expect(await spoken()).toHaveLength(1);
});

test("voice: a browser with no speech recognition gets the keyboard mic tip", async ({ context, page }) => {
  await fakeSpeech(context, "missing");
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await expect(page.getByText(/This browser can't listen here\. To talk instead of typing, tap the mic key on your keyboard\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Talk to Kakak" })).toHaveCount(0);
  // Typing still works, and reading aloud is still offered.
  await expect(page.getByRole("textbox", { name: "What should I set up?" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Read replies aloud" })).toBeVisible();
});

test("voice: a recognizer that refuses to run (iPhone Home Screen app) falls back to the tip", async ({ context, page }) => {
  await fakeSpeech(context, "refused");
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Bicara dengan Kakak" }).click();
  await expect(page.getByText(/Browser ini belum bisa mendengar di sini\. Untuk bicara tanpa mengetik, ketuk tombol mikrofon di keyboard\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Bicara dengan Kakak" })).toHaveCount(0);
});
