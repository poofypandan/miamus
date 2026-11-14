import { expect, test, type BrowserContext, type Page, type Request } from "@playwright/test";
import { silentWav } from "../../src/lib/kakak/app-voice";
import { installStub } from "./stub-backend";

/** A playable sound for the stubbed route: a tenth of a second of silence. */
const AUDIO = Buffer.from(silentWav().split(",")[1], "base64");

// Kakak's own voice (read replies aloud). The ElevenLabs route
// (/api/kakak/speak) is stubbed, the phone's voice (speechSynthesis.speak)
// is a recorder and audio playback (HTMLMediaElement.play) is watched, so what is under
// test is the sheet's side: her voice when the route answers with audio, the
// phone's voice on a refusal, the budget or a slow answer, and no change at
// all when the server has no key.

async function recorders(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const spoken: string[] = [];
    const played: string[] = [];
    w.__spoken = spoken;
    w.__played = played;
    if (window.speechSynthesis) {
      window.speechSynthesis.speak = (utterance: SpeechSynthesisUtterance) => {
        if (!utterance.text.trim()) return;
        spoken.push(utterance.text);
        setTimeout(() => utterance.onend?.(new Event("end") as SpeechSynthesisEvent), 30);
      };
    }
    // Playback is real (a tenth of a second of silence); this only records what was played.
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      played.push(this.src.split(":")[0]);
      return play.call(this);
    };
  });
}

const REPLY = "Beres. Syam diingatkan jam 21.30.";
const SAID = "Beres. Syam diingatkan jam setengah sepuluh malam.";

async function ask(page: Page) {
  await page.getByRole("textbox", { name: "Mau Kakak atur apa?" }).fill("Ingatkan Syam");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
}

async function open(page: Page, context: BrowserContext) {
  await recorders(context);
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.route("**/api/kakak", (route) =>
    route.fulfill({ json: { kind: "message", text: REPLY, history: { messages: [] }, requestId: "x" } })
  );
}

async function start(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Bacakan jawaban Kakak" }).click();
}

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
const played = (page: Page) => page.evaluate(() => (window as unknown as { __played: string[] }).__played);

/** The speak requests the sheet made, with their bodies. */
function speakPosts(page: Page) {
  const posts: Request[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/kakak/speak") posts.push(request);
  });
  return posts;
}

test("app voice: a reply is read in Kakak's own voice when the server has it", async ({ context, page }) => {
  await open(page, context);
  await page.route("**/api/kakak/speak", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { kind: "on" } })
      : route.fulfill({ status: 200, contentType: "audio/mpeg", body: AUDIO })
  );
  const posts = speakPosts(page);
  await start(page);
  await ask(page);

  await expect.poll(() => played(page)).toContain("blob");
  // Played to the end: the sheet is back to listening, not speaking.
  await expect(page.getByText("Kakak sedang bicara")).toHaveCount(0);
  expect(posts).toHaveLength(1);
  // The words shaped for the ear, never the written time.
  expect(posts[0].postDataJSON()).toMatchObject({ text: SAID, locale: "id" });
  expect(await spoken(page)).toEqual([]);
});

test("app voice: audio the phone can't play gives way to the phone's voice", async ({ context, page }) => {
  await open(page, context);
  await page.route("**/api/kakak/speak", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { kind: "on" } })
      : route.fulfill({ status: 200, contentType: "audio/mpeg", body: Buffer.alloc(64) })
  );
  await start(page);
  await ask(page);
  await expect.poll(() => spoken(page)).toEqual(["Beres.", "Syam diingatkan jam setengah sepuluh malam."]);
});

test("app voice: over the day's budget, the phone's voice reads it, and isn't asked again", async ({ context, page }) => {
  await open(page, context);
  await page.route("**/api/kakak/speak", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { kind: "on" } })
      : route.fulfill({ status: 429, json: { kind: "budget" } })
  );
  const posts = speakPosts(page);
  await start(page);
  await ask(page);
  await expect.poll(() => spoken(page)).toEqual(["Beres.", "Syam diingatkan jam setengah sepuluh malam."]);
  expect(posts).toHaveLength(1);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Bilang ke Kakak" }).click();
  await ask(page);
  await expect.poll(async () => (await spoken(page)).length).toBe(4);
  expect(posts).toHaveLength(1);
  expect((await played(page)).filter((p) => p === "blob")).toEqual([]);
});

test("app voice: a slow answer gives way to the phone's voice after about 2.5 seconds", async ({ context, page }) => {
  await open(page, context);
  await page.route("**/api/kakak/speak", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { kind: "on" } });
    await new Promise((resolve) => setTimeout(resolve, 6_000));
    await route.fulfill({ status: 200, contentType: "audio/mpeg", body: AUDIO }).catch(() => {});
  });
  await start(page);
  const sent = Date.now();
  await ask(page);
  await expect.poll(() => spoken(page), { timeout: 5_000 }).toEqual(["Beres.", "Syam diingatkan jam setengah sepuluh malam."]);
  expect(Date.now() - sent).toBeLessThan(5_000);
  await page.waitForTimeout(500);
  expect((await played(page)).filter((p) => p === "blob")).toEqual([]);
});

test("app voice: with no key on the server, nothing is sent to be spoken and the phone reads as before", async ({ context, page }) => {
  await open(page, context);
  // The real route answers: this test server has no ELEVENLABS_API_KEY.
  const posts = speakPosts(page);
  await start(page);
  await ask(page);
  await expect.poll(() => spoken(page)).toEqual(["Beres.", "Syam diingatkan jam setengah sepuluh malam."]);
  expect(posts).toHaveLength(0);
  expect((await played(page)).filter((p) => p === "blob")).toEqual([]);
});
