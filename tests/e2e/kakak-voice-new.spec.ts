import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { STAFF_ID, installStub } from "./stub-backend";

// Talk to Kakak, the new voice flow (opt-in per phone with ?newvoice=1; the
// current flow, still the default, is kakak-voice.spec.ts). The browser's
// SpeechRecognition is replaced by
// a fake the test speaks through, and speechSynthesis.speak by a recorder, so
// what is under test is the sheet's side: the mic listening until Done
// (through pauses, restarting the recognizer the way Chrome on Android needs),
// the live words, Done putting them in the typing box to check, Send taking
// them through the real /api/kakak route in practice mode
// (KAKAK_PRACTICE=true, no AI), the card, reading it aloud, and the keyboard
// tip where the browser can't listen.

type Mode = "works" | "missing" | "refused";

async function fakeSpeech(context: BrowserContext, mode: Mode) {
  await context.addInitScript((mode: Mode) => {
    const w = window as unknown as Record<string, unknown>;
    const spoken: string[] = [];
    w.__spoken = spoken;
    w.__starts = 0;
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
        w.__continuous = this.continuous;
        w.__starts = (w.__starts as number) + 1;
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

/** The owner pauses to think: the browser ends its session, as Chrome on Android does. */
async function pause(page: Page) {
  await page.evaluate(() => {
    const r = (window as unknown as { __recognition: { onerror: (e: { error: string }) => void; onend: () => void } })
      .__recognition;
    r.onerror({ error: "no-speech" });
    r.onend();
  });
}

const starts = (page: Page) => page.evaluate(() => (window as unknown as { __starts: number }).__starts);

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

test("new voice: keeps listening through a pause, Done fills the box without sending, Send sends (practice mode)", async ({
  context,
  page,
}) => {
  await fakeSpeech(context, "works");
  const stub = await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  const asked: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/kakak") asked.push(request.postDataJSON().reply);
  });
  await page.goto("/dashboard?newvoice=1");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  // Reading aloud is off until turned on, and remembered on this phone.
  const speaker = page.getByRole("button", { name: "Bacakan jawaban Kakak" });
  await expect(speaker).toHaveAttribute("aria-pressed", "false");
  await speaker.click();
  await expect(speaker).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Bicara dengan Kakak" }).click();
  await expect(page.getByText("Kakak mendengarkan. Ketuk Selesai kalau sudah.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __lang: string }).__lang)).toBe("id-ID");
  expect(await page.evaluate(() => (window as unknown as { __continuous: boolean }).__continuous)).toBe(true);

  // The words appear live under the mic, not yet in the typing box.
  const box = page.getByRole("textbox", { name: "Mau Kakak atur apa?" });
  const live = page.getByTestId("kakak-live-words");
  await say(page, "Ari pel", false);
  await expect(live).toHaveText("Ari pel");
  await say(page, "Ari pel teras", true);
  await expect(live).toHaveText("Ari pel teras");
  await expect(box).toHaveValue("");

  // A pause to think: the browser ends its session, and listening goes on
  // with a new one, the words joined.
  await pause(page);
  await expect.poll(() => starts(page)).toBe(2);
  await expect(page.getByText("Kakak mendengarkan. Ketuk Selesai kalau sudah.")).toBeVisible();
  await say(page, "setiap Senin jam 9", true);
  await expect(live).toHaveText("Ari pel teras setiap Senin jam 9");

  // Done puts the words in the box to check. Nothing is sent yet.
  await page.getByRole("button", { name: "Selesai" }).click();
  await expect(box).toHaveValue("Ari pel teras setiap Senin jam 9");
  await expect(page.getByText("Cek kata-katanya, lalu ketuk Kirim.")).toBeVisible();
  await expect(live).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(asked).toEqual([]);
  expect(await starts(page)).toBe(2); // not started again after Done

  // Send sends them, through the real route, as if typed.
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.getByText("Ari pel teras setiap Senin jam 9", { exact: true })).toBeVisible();
  await expect(page.getByText(/^Mode latihan:/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Pel teras", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sudah benar" })).toBeVisible();

  // Her own sentence was read aloud, ending with the question. The card's
  // rows stay on screen and are no longer read out (#142).
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.join(" | ")))
    .toMatch(/tambahkan\. \| Sudah benar\?$/);

  expect(stub.tasks).toHaveLength(0); // nothing saved before Sudah benar
  await page.getByRole("button", { name: "Sudah benar" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Pel teras", assigned_to: STAFF_ID, due_time: "09:00", recurrence: "weekly" });
  expect(stub.seen.realBackend).toEqual([]);
  expect(asked).toEqual(["Ari pel teras setiap Senin jam 9"]);

  // The speaker choice is remembered on this phone.
  await page.getByRole("button", { name: "Bilang ke Kakak" }).click();
  await expect(page.getByRole("button", { name: "Bacakan jawaban Kakak" })).toHaveAttribute("aria-pressed", "true");
});

test("new voice: Cancel drops the words and sends nothing", async ({ context, page }) => {
  await fakeSpeech(context, "works");
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  let asked = 0;
  await page.route("**/api/kakak", (route) => {
    asked++;
    return route.fulfill({ json: { kind: "message", text: "ok", history: { messages: [] }, requestId: "x" } });
  });
  await page.goto("/dashboard?newvoice=1");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Talk to Kakak" }).click();
  await say(page, "Buy eggs", false);
  await expect(page.getByTestId("kakak-live-words")).toHaveText("Buy eggs");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Tap and talk")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "What should I set up?" })).toHaveValue("");
  await page.waitForTimeout(300);
  expect(await starts(page)).toBe(1); // not started again after Cancel
  expect(asked).toBe(0);
});

test("new voice: typing and tapping Send while the mic is on sends once", async ({ context, page }) => {
  await fakeSpeech(context, "works");
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const asked: string[] = [];
  await page.route("**/api/kakak", (route) => {
    asked.push(route.request().postDataJSON().reply);
    return route.fulfill({ json: { kind: "message", text: "Noted.", history: { messages: [] }, requestId: "x" } });
  });
  await page.goto("/dashboard?newvoice=1");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Talk to Kakak" }).click();
  await say(page, "Buy milk", false);
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Buy eggs");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Noted.")).toBeVisible();
  // The browser finishes the utterance late: nothing more goes to Kakak,
  // and listening doesn't start again.
  await say(page, "Buy milk", true);
  await page.evaluate(() => (window as unknown as { __recognition: { onend: () => void } }).__recognition.onend());
  await page.waitForTimeout(300);
  expect(asked).toEqual(["Buy eggs"]);
  expect(await starts(page)).toBe(1);
  // After her plain reply the box asks "Anything else?" (#144).
  await expect(page.getByRole("textbox", { name: "Anything else?" })).toHaveValue("");
});

test("new voice: a recognizer that refuses to run (iPhone Home Screen app) falls back to the tip", async ({ context, page }) => {
  await fakeSpeech(context, "refused");
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard?newvoice=1");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Bicara dengan Kakak" }).click();
  await expect(page.getByText("Ketuk mic di keyboard, lalu bicara.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bicara dengan Kakak" })).toHaveCount(0);
});

test("new voice: off by default (the current flow), on with ?newvoice=1 for this phone, off again with ?newvoice=0", async ({
  context,
  page,
}) => {
  await fakeSpeech(context, "works");
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const listen = async () => {
    await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
    await page.getByRole("button", { name: "Talk to Kakak" }).click();
  };

  // Default: the current flow, with Stop.
  await page.goto("/dashboard");
  await listen();
  await expect(page.getByText("Listening… tap Stop when you're done")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __continuous: boolean }).__continuous)).toBe(false);

  // ?newvoice=1: the new flow, with Done, and it stays on without the parameter.
  await page.goto("/dashboard?newvoice=1");
  await listen();
  await expect(page.getByText("Listening. Tap Done when you're finished.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __continuous: boolean }).__continuous)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("miamus.kakak.newVoice"))).toBe("on");
  await page.goto("/dashboard");
  await listen();
  await expect(page.getByText("Listening. Tap Done when you're finished.")).toBeVisible();

  // ?newvoice=0: back to the current flow.
  await page.goto("/dashboard?newvoice=0");
  await listen();
  await expect(page.getByText("Listening… tap Stop when you're done")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("miamus.kakak.newVoice"))).toBeNull();
});
