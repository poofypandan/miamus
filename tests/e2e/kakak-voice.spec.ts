import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { STAFF_ID, installStub } from "./stub-backend";

// Talk to Kakak (voice beta). The browser's SpeechRecognition is replaced by
// a fake the test speaks through, and speechSynthesis.speak by a recorder, so
// what is under test is the sheet's side: the mic, the live words in the
// typing box, the spoken request going through the real /api/kakak route in
// practice mode (KAKAK_PRACTICE=true, no AI), the card, reading it aloud, and
// the keyboard tip where the browser can't listen.

type Mode = "works" | "missing" | "refused";

/** What the fake voice was given: each sentence, how fast, and when. */
interface Utterance {
  text: string;
  rate: number;
  pitch: number;
  at: number;
}

/** `speakMs`: how long the fake voice takes to read one sentence. */
async function fakeSpeech(context: BrowserContext, mode: Mode, speakMs = 50) {
  await context.addInitScript(([mode, speakMs]: [Mode, number]) => {
    const w = window as unknown as Record<string, unknown>;
    const spoken: string[] = [];
    const utterances: Utterance[] = [];
    w.__spoken = spoken;
    w.__utterances = utterances;
    w.__cancels = 0;
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
        if (!utterance.text.trim()) return;
        spoken.push(utterance.text);
        utterances.push({ text: utterance.text, rate: utterance.rate, pitch: utterance.pitch, at: performance.now() });
        setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), speakMs);
      };
      const cancel = window.speechSynthesis.cancel.bind(window.speechSynthesis);
      window.speechSynthesis.cancel = () => {
        w.__cancels = (w.__cancels as number) + 1;
        cancel();
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
  }, [mode, speakMs] as [Mode, number]);
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

  // Kakak's own sentence was read aloud, then the question; not the card's rows.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(" | ")))
    .toMatch(/tambahkan\. \| Sudah benar\?$/);
  expect(await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(" | "))).not.toContain("Pel teras");

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

test("voice: the card's question is read once, and not again when an item is removed while listening", async ({ context, page }) => {
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
  // Her sentence, then the question: two sentences, never the rows.
  await expect.poll(spoken).toEqual(["Here's what I'll add.", "Is that right?"]);

  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Talk to Kakak" }).click();
  await page.getByRole("button", { name: "Remove" }).first().click();
  await page.waitForTimeout(300);
  expect(await spoken()).toHaveLength(2);
});

/** Turn reading aloud on, send a typed request, and get `reply` back as Kakak's message. */
async function askAndHear(page: Page, locale: "id" | "en", reply: string) {
  await page.route("**/api/kakak", (route) =>
    route.fulfill({ json: { kind: "message", text: reply, history: { messages: [] }, requestId: "x" } })
  );
  await page.goto("/dashboard");
  const id = locale === "id";
  await page.getByRole("button", { name: id ? "Bilang ke Kakak" : "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: id ? "Bacakan jawaban Kakak" : "Read replies aloud" }).click();
  await page.getByRole("textbox", { name: id ? "Mau Kakak atur apa?" : "What should I set up?" }).fill("Ingatkan Syam");
  await page.getByRole("button", { name: id ? "Kirim" : "Send", exact: true }).click();
}

const utterances = (page: Page) =>
  page.evaluate(() => (window as unknown as { __utterances: Utterance[] }).__utterances);

test("voice: Kakak reads times and symbols as a person says them, sentence by sentence", async ({ context, page }) => {
  await fakeSpeech(context, "works");
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await askAndHear(page, "id", "Beres. Syam diingatkan jam 21.30; Kakak hanya mengabari Anda jika belum dikerjakan → cek di HP.");
  // The screen keeps the written reply.
  await expect(page.getByText(/Syam diingatkan jam 21\.30/)).toBeVisible();

  await expect.poll(async () => (await utterances(page)).length).toBe(2);
  const said = await utterances(page);
  expect(said.map((u) => u.text)).toEqual([
    "Beres.",
    "Syam diingatkan jam setengah sepuluh malam, Kakak hanya mengabari Anda jika belum dikerjakan, lalu cek di ha-pe.",
  ]);
  for (const u of said) {
    expect(u.text).not.toMatch(/\d{1,2}[.:]\d{2}/);
    expect(u.text).not.toContain("→");
    expect(u.rate).toBeCloseTo(0.93);
    expect(u.pitch).toBe(1); // the voice's own pitch
  }
  // A breath after the short opener: its 50 ms of speech, then the pause.
  expect(said[1].at - said[0].at).toBeGreaterThanOrEqual(400);
});

test("voice: English times and arrows are read as words", async ({ context, page }) => {
  await fakeSpeech(context, "works");
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  await askAndHear(page, "en", "Done. Open Settings → Staff to change it; the reminder is at 21:30.");
  await expect.poll(async () => (await utterances(page)).map((u) => u.text)).toEqual([
    "Done.",
    "Open Settings, then Staff to change it, the reminder is at nine thirty in the evening.",
  ]);
});

test("voice: closing the sheet stops the sentences still waiting to be read", async ({ context, page }) => {
  // A slow voice: the first sentence is still being read when the sheet closes.
  await fakeSpeech(context, "works", 800);
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await askAndHear(page, "id", "Baik. Syam diingatkan jam 21.30. Kakak kabari kalau belum.");
  await expect.poll(async () => (await utterances(page)).length).toBe(1);
  const cancelsBefore = await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Bacakan jawaban Kakak" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __cancels: number }).__cancels)).toBeGreaterThan(cancelsBefore);
  // Long enough for the first sentence to end and the next to have started.
  await page.waitForTimeout(1_800);
  expect((await utterances(page)).map((u) => u.text)).toEqual(["Baik."]);
});

test("voice: a browser with no speech recognition gets the keyboard mic tip", async ({ context, page }) => {
  await fakeSpeech(context, "missing");
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  // One line since Phase 172 (D11 rule 7).
  await expect(page.getByText("Tap the mic on your keyboard and speak.")).toBeVisible();
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
  await expect(page.getByText("Ketuk mic di keyboard, lalu bicara.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bicara dengan Kakak" })).toHaveCount(0);
});
