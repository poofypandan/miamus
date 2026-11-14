import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Tell Kakak (Phase 156 step 2). /api/kakak is answered here, in the
// browser, so no key and no Anthropic call: what is under test is the
// phone's side — the button, the question, the card, saving through the
// same chore action as by hand, Undo, the switch, and staff phones.

const chore = {
  kind: "chore",
  title: "Pel teras",
  titleEn: "Mop the terrace",
  category: "cleaning",
  assignedTo: STAFF_ID,
  assignToSelf: false,
  assigneeName: "Ari",
  dueDate: "2026-11-16",
  dueTime: "09:00",
  recurrence: "weekly",
  recurrenceUntil: null,
  requiresSupervision: false,
  locationId: null,
  roomName: null,
  newRoomName: null,
  newRoomFloorId: null,
  newRoomFloorName: null,
  notes: null,
};

const assistant = (name: string) => ({
  role: "assistant",
  content: [{ type: "tool_use", id: `toolu_${name}`, name, input: {} }],
});

async function answerKakak(page: Page) {
  const asked: { householdId: string; reply: string; history: unknown }[] = [];
  const outcomes: string[] = [];
  await page.route("**/api/kakak", async (route) => {
    const body = route.request().postDataJSON();
    asked.push(body);
    if (asked.length === 1) {
      return route.fulfill({
        json: {
          kind: "question",
          question: "Which day?",
          answers: ["Monday", "Saturday"],
          allowTyping: true,
          requestId: "00000000-0000-4000-8000-0000000000a1",
          history: { messages: [{ role: "user", content: body.reply }, assistant("ask_question")] },
        },
      });
    }
    return route.fulfill({
      json: {
        kind: "suggestions",
        text: "Here's what I'll add:",
        items: [chore],
        requestId: "00000000-0000-4000-8000-0000000000a2",
        history: { messages: [] },
      },
    });
  });
  await page.route("**/api/kakak/outcome", async (route) => {
    outcomes.push(route.request().postDataJSON().result);
    return route.fulfill({ json: { ok: true } });
  });
  return { asked, outcomes };
}

test("an admin tells Kakak, answers her question, confirms the card, and can undo", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const kakak = await answerKakak(page);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  // The examples use this household's own names, and fill the box when tapped.
  await expect(page.getByText("Try saying")).toBeVisible();
  await page.getByRole("button", { name: "Ari waters the plants every Monday at 8" }).click();
  await expect(page.getByRole("textbox", { name: "What should I set up?" })).toHaveValue("Ari waters the plants every Monday at 8");
  await expect(page.getByRole("textbox", { name: "What should I set up?" })).toBeFocused();
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Ari mops the terrace at 9");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Which day?")).toBeVisible();
  expect(kakak.asked[0]).toMatchObject({ householdId: HOUSEHOLD_ID, reply: "Ari mops the terrace at 9", history: null });
  await page.getByRole("button", { name: "Monday" }).click();

  // The card, in plain words; the history went back with the answer.
  await expect(page.getByText("Pel teras (Mop the terrace)")).toBeVisible();
  await expect(page.getByText("Monday 16 Nov, 09:00")).toBeVisible();
  await expect(page.locator("dd").getByText("Every Monday", { exact: true })).toBeVisible();
  expect(kakak.asked[1]).toMatchObject({ reply: "Monday" });
  expect((kakak.asked[1].history as { messages: unknown[] }).messages).toHaveLength(2);
  expect(stub.tasks).toHaveLength(0); // nothing saved before Looks right

  await page.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({
    title: "Pel teras",
    category: "cleaning",
    assigned_to: STAFF_ID,
    due_date: "2026-11-16",
    due_time: "09:00",
    recurrence: "weekly",
  });
  await expect(page.getByText("Saved — Mop the terrace, Ari")).toBeVisible();
  await expect.poll(() => kakak.outcomes).toEqual(["confirmed"]);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.tasks.length).toBe(0);
  await expect.poll(() => kakak.outcomes).toEqual(["confirmed", "undone"]);
  expect(stub.seen.realBackend).toEqual([]);
});

test("Kakak's limit and errors read as plain sentences, and nothing is saved", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.route("**/api/kakak", (route) => route.fulfill({ status: 429, json: { kind: "refused", reason: "limit" } }));
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "Mau Kakak atur apa?" }).fill("Beli telur");
  await page.getByRole("button", { name: "Kirim" }).click();
  await expect(page.getByText("Kakak sudah banyak membantu hari ini — coba lagi besok, atau tambahkan sendiri.")).toBeVisible();
  expect(stub.tasks).toHaveLength(0);
});

test("a busy Kakak or a dropped connection offers Try again with the same words", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const asked: { reply: string; history: unknown }[] = [];
  await page.route("**/api/kakak", (route) => {
    asked.push(route.request().postDataJSON());
    if (asked.length === 1) return route.fulfill({ status: 429, json: { kind: "refused", reason: "busy" } });
    if (asked.length === 2) return route.abort("internetdisconnected");
    return route.fulfill({
      json: {
        kind: "suggestions",
        text: "Here's what I'll add:",
        items: [chore],
        requestId: "00000000-0000-4000-8000-0000000000a3",
        history: { messages: [] },
      },
    });
  });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Ari mops the terrace every Monday at 9");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Kakak is busy right now — try again in a minute, or add it yourself.")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Kakak needs the internet. Check your connection and try again.")).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByRole("button", { name: "Looks right" })).toBeVisible();
  await expect(page.getByText("You can undo it straight after saving.")).toBeVisible();
  // Each try sent the same words, and the owner's line shows once.
  expect(asked.map((a) => a.reply)).toEqual(Array(3).fill("Ari mops the terrace every Monday at 9"));
  await expect(page.getByText("Ari mops the terrace every Monday at 9", { exact: true })).toHaveCount(1);
});

test("the monthly spend limit reads as a plain sentence, with no Try again", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.route("**/api/kakak", (route) => route.fulfill({ json: { kind: "failed", reason: "cap" } }));
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  await expect(page.getByText("Coba bilang")).toBeVisible();
  await page.getByRole("textbox", { name: "Mau Kakak atur apa?" }).fill("Beli telur");
  await page.getByRole("button", { name: "Kirim" }).click();
  await expect(page.getByText("Kakak sudah mencapai batas bulan ini. Anda tetap bisa menambahkan semuanya sendiri.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba lagi" })).toHaveCount(0);
  // No typing box either: trying again can't help until next month.
  await expect(page.getByRole("textbox", { name: "Mau Kakak atur apa?" })).toHaveCount(0);
});

test("Kakak is off until an admin turns her on in the Settings tab", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: false } });
  await page.goto("/dashboard");
  await expect(page.getByRole("tab", { name: /Hari ini/ }).or(page.getByText("Hari ini").first())).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Bilang ke Kakak" })).toHaveCount(0);

  await page.goto("/dashboard?module=access");
  await page.getByRole("button", { name: /^Kakak Mati$/ }).click({ timeout: 20_000 });
  await expect(page.getByText(/dikirim ke Anthropic di Amerika Serikat/)).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Izinkan Kakak membantu" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  expect(stub.kakak.enabled).toBe(true);

  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Bilang ke Kakak" })).toBeVisible({ timeout: 20_000 });
});

test("a household not on the family list sees no Kakak at all", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=access");
  await expect(page.getByRole("button", { name: /^Family$/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /^Kakak/ })).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Tell Kakak" })).toHaveCount(0);
});

test("a staff phone never sees Kakak", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");
  await expect(page.getByRole("button", { name: "Lapor" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Bilang ke Kakak")).toHaveCount(0);
});

test("practice mode: the real Kakak route answers with no AI, and saving still works", async ({ context, page }) => {
  // No page.route for /api/kakak: the test server runs it with
  // KAKAK_PRACTICE=true (playwright.config.ts), answered by server-stub.cjs.
  const stub = await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "Mau Kakak atur apa?" }).fill("Ari pel teras setiap Senin jam 9");
  await page.getByRole("button", { name: "Kirim" }).click();

  await expect(page.getByText(/^Mode latihan:/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Ari pel teras setiap Senin jam 9", { exact: true })).toBeVisible();
  await expect(page.getByText("Pel teras", { exact: true })).toBeVisible();
  await expect(page.locator("dd").getByText("Setiap Senin", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sudah benar" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Pel teras", assigned_to: STAFF_ID, due_time: "09:00", recurrence: "weekly" });
  expect(stub.seen.realBackend).toEqual([]);
});

test("practice mode: a tapped example becomes a card in one go", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Ari waters the plants every Monday at 8" }).click();
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/^Practice mode:/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Siram tanaman (Waters the plants)")).toBeVisible();
  await expect(page.locator("dd").getByText("Every Monday", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Siram tanaman", assigned_to: STAFF_ID, due_time: "08:00", recurrence: "weekly" });
});

test("the card's chips change how often and who, with no call to Kakak", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const kakak = await answerKakak(page);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Ari mops the terrace at 9");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Monday" }).click();
  await expect(page.locator("dd").getByText("Every Monday", { exact: true })).toBeVisible();

  const often = page.getByRole("group", { name: "How often" });
  await expect(often.getByRole("button", { name: "Every Monday" })).toHaveAttribute("aria-pressed", "true");
  await often.getByRole("button", { name: "One time" }).click();
  await expect(page.locator("dd").getByText("Every Monday", { exact: true })).toHaveCount(0);
  await page.getByRole("group", { name: "Who" }).getByRole("button", { name: "Anyone" }).click();
  await expect(page.locator("dd", { hasText: "Anyone" })).toBeVisible();
  expect(kakak.asked).toHaveLength(2); // the chips asked Kakak nothing

  // A typed change afterwards tells Kakak what the chips set; the owner's line shows only their words.
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("textbox", { name: "What should change?" }).fill("at 10 instead");
  await page.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => kakak.asked.length).toBe(3);
  expect(kakak.asked[2].reply).toBe(
    "(Set on the card with one tap; the owner's words after this win: Pel teras: one time, for anyone, no reminder.) at 10 instead",
  );
  await expect(page.getByText("at 10 instead", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Looks right" })).toBeVisible();

  await page.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  // The stub's new card is Kakak's own (weekly, Ari): what she sends back is what is saved.
  expect(stub.tasks[0]).toMatchObject({ title: "Pel teras", recurrence: "weekly" });
  await expect.poll(() => kakak.outcomes).toEqual(["changed", "confirmed"]);
});

test("Remind me on the card: Kakak's choice shows, a chip changes it, and it is saved", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const outcomes: string[] = [];
  await page.route("**/api/kakak", (route) =>
    route.fulfill({
      json: {
        kind: "suggestions",
        text: "Here's what I'll add:",
        items: [{ ...chore, recurrence: "none", remindDaysBefore: 1 }],
        requestId: "00000000-0000-4000-8000-0000000000a5",
        history: { messages: [] },
      },
    }),
  );
  await page.route("**/api/kakak/outcome", (route) => {
    outcomes.push(route.request().postDataJSON().result);
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Ari mops the terrace Monday at 9, remind me the day before");
  await page.getByRole("button", { name: "Send" }).click();

  const remind = page.getByRole("group", { name: "Remind me" });
  await expect(remind.getByRole("button", { name: "1 day before" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("dd").getByText("1 day before", { exact: true })).toBeVisible();
  await remind.getByRole("button", { name: "3 days before" }).click();
  await expect(page.locator("dd").getByText("3 days before", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Pel teras", remind_days_before: 3 });
  // A chip is a refinement: Kakak was close, not right (statistics).
  await expect.poll(() => outcomes).toEqual(["changed"]);
});

test("Remind me Off on the card saves no reminder", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.route("**/api/kakak", (route) =>
    route.fulfill({
      json: {
        kind: "suggestions",
        text: "Ini yang akan Kakak tambahkan:",
        items: [{ ...chore, remindDaysBefore: 0 }],
        requestId: "00000000-0000-4000-8000-0000000000a6",
        history: { messages: [] },
      },
    }),
  );
  await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "Mau Kakak atur apa?" }).fill("Ari pel teras tiap Senin jam 9, ingatkan pada harinya");
  await page.getByRole("button", { name: "Kirim" }).click();
  const remind = page.getByRole("group", { name: "Ingatkan saya" });
  await expect(remind.getByRole("button", { name: "Pada harinya" })).toHaveAttribute("aria-pressed", "true");
  await remind.getByRole("button", { name: "Mati" }).click();
  await expect(page.locator("dd").getByText("Pada harinya", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Sudah benar" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0].remind_days_before ?? null).toBeNull();
});

// Phase 176 (put_away_ingredient).
const BEEF = "00000000-0000-4000-8000-000000176001";
const beef = {
  id: BEEF,
  household_id: HOUSEHOLD_ID,
  scope: "home",
  name: "Daging sapi",
  category: "fresh_food",
  quantity: 1,
  unit: "kg",
  min_threshold: 0,
  photo_url: null,
  created_at: "2026-10-01T00:00:00Z",
  variant: null,
  audit_frequency_days: 30,
  last_audited_at: null,
  notes: null,
  stock_status: "ok",
  stock_status_at: null,
  stock_status_by: null,
  track_amount: false,
  amount_set_at: null,
  amount_set_by: null,
  last_bought_amount: null,
  kept_in: "freezer",
  expires_on: "2026-12-20",
};

/** Kakak's ingredient card for the beef: Fridge, use by Thursday 12 November. */
function beefCard(page: Page) {
  return Promise.all([
    page.route("**/api/kakak", (route) =>
      route.fulfill({
        json: {
          kind: "suggestions",
          text: "Here's what I'll note:",
          items: [
            {
              kind: "ingredient",
              itemId: BEEF,
              name: "Daging sapi",
              keptIn: "fridge",
              fromPlace: "freezer",
              expiry: "set",
              expiresOn: "2026-11-12",
              expiryIsGuess: false,
            },
          ],
          requestId: "00000000-0000-4000-8000-0000000000a7",
          history: { messages: [] },
        },
      }),
    ),
    page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } })),
  ]);
}

test("an ingredient card moves it and sets its date through the two kitchen actions, and Undo puts both back", async ({ context, page }) => {
  // Beef from the freezer to the fridge, use by tomorrow.
  const stub = await installStub(context, {
    owner: { locale: "en" },
    kakak: { allowed: true, enabled: true },
    features: { kitchen: true },
    items: [beef],
  });
  await beefCard(page);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("The beef is out of the freezer, in the fridge, use it by tomorrow");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Fridge (was Freezer)")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Thursday 12 Nov")).toBeVisible();
  expect(stub.supplies[0]).toMatchObject({ kept_in: "freezer", expires_on: "2026-12-20" }); // nothing saved yet

  await page.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.supplies[0]).toMatchObject({ kept_in: "fridge", expires_on: "2026-11-12" });
  // Only the place and the date were sent: the amount and status are as they were.
  expect(stub.supplies[0]).toMatchObject({ quantity: 1, stock_status: "ok", name: "Daging sapi" });
  await expect(page.getByText("Saved — Daging sapi")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.supplies[0]).toMatchObject({ kept_in: "freezer", expires_on: "2026-12-20" });
  expect(stub.seen.realBackend).toEqual([]);
});

test("an ingredient card for an item marked Out saves nothing, since its date would be dropped", async ({ context, page }) => {
  // migrations/154: an Out item keeps no date, so the card must not report it saved.
  const stub = await installStub(context, {
    owner: { locale: "en" },
    kakak: { allowed: true, enabled: true },
    features: { kitchen: true },
    items: [{ ...beef, stock_status: "out", expires_on: null }],
  });
  await beefCard(page);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("The beef is in the fridge, use it by tomorrow");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Looks right" }).click({ timeout: 20_000 });

  await expect(page.getByText("Something went wrong. Nothing was saved.")).toBeVisible();
  // The move was taken back with the rest.
  await expect.poll(() => stub.supplies[0]).toMatchObject({ kept_in: "freezer", expires_on: null });
});

// 2026-11-14 (owner: "Add 2 kg of brown rice into the pantry" got "Sorry, I
// can't add a new ingredient"; "what is Miamus for" got "Sorry, I didn't
// catch that"): a new ingredient's card, an amount on a listed one, and a
// plain answer, with both sides of the conversation kept on screen.

/** One canned Kakak reply for every turn, and what the page sent. */
async function kakakSays(page: Page, replies: Record<string, unknown>[]) {
  const asked: { reply: string; v?: number; history: unknown }[] = [];
  await page.route("**/api/kakak", (route) => {
    asked.push(route.request().postDataJSON());
    const reply = replies[Math.min(asked.length, replies.length) - 1];
    return route.fulfill({
      json: { requestId: `00000000-0000-4000-8000-0000000000b${asked.length}`, history: { messages: [] }, ...reply },
    });
  });
  await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
  return asked;
}

test("a new ingredient's card adds it with its amount, as Add ingredient does, and Undo takes it out", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    kakak: { allowed: true, enabled: true },
    features: { kitchen: true },
    items: [beef],
  });
  const asked = await kakakSays(page, [
    {
      kind: "suggestions",
      text: "Of course. I'll put 2 kg of brown rice in the cupboard.",
      items: [
        { kind: "new_ingredient", name: "Beras merah", nameEn: "Brown rice", category: "pantry", keptIn: "pantry", expiresOn: null, expiryIsGuess: false, amount: { value: 2, unit: "kg" } },
      ],
    },
  ]);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Add 2 kg of brown rice into the pantry thank you");
  await page.getByRole("button", { name: "Send" }).click();

  // Her own sentence, then the card: what staff will read, glossed for the owner.
  await expect(page.getByText("Of course. I'll put 2 kg of brown rice in the cupboard.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("New ingredient")).toBeVisible();
  await expect(page.getByText("Beras merah (Brown rice)")).toBeVisible();
  await expect(page.locator("dd").getByText("2 kg", { exact: true })).toBeVisible();
  await expect(page.locator("dd").getByText("Cupboard", { exact: true })).toBeVisible();
  // The page says what it can show, so the route may send this kind of card.
  expect(asked[0]).toMatchObject({ reply: "Add 2 kg of brown rice into the pantry thank you", v: 2 });
  expect(stub.supplies).toHaveLength(1); // nothing saved before Looks right

  await page.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.supplies.length).toBe(2);
  await expect
    .poll(() => stub.supplies[1])
    .toMatchObject({ name: "Beras merah", scope: "home", category: "pantry", kept_in: "pantry", expires_on: null, track_amount: true, unit: "kg", quantity: 2 });
  await expect(page.getByText("Saved — Brown rice")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.supplies.length).toBe(1);
  expect(stub.supplies[0]).toMatchObject({ name: "Daging sapi" });
  expect(stub.seen.realBackend).toEqual([]);
});

test("an amount on a listed ingredient is added as a purchase, and Undo takes it off again", async ({ context, page }) => {
  // The beef, counted: 1 kg in the freezer. Two more come in.
  const stub = await installStub(context, {
    owner: { locale: "en" },
    kakak: { allowed: true, enabled: true },
    features: { kitchen: true },
    items: [{ ...beef, track_amount: true }],
  });
  await kakakSays(page, [
    {
      kind: "suggestions",
      text: "",
      items: [
        { kind: "ingredient", itemId: BEEF, name: "Daging sapi", keptIn: null, fromPlace: "freezer", expiry: "keep", expiresOn: null, expiryIsGuess: false, amount: { value: 2, unit: "kg", mode: "add", before: 1 }, amountSkipped: null },
      ],
    },
  ]);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("We bought 2 kg of beef");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("+2 kg · 3 kg in all")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.supplies[0]).toMatchObject({ quantity: 3, stock_status: "ok", kept_in: "freezer", expires_on: "2026-12-20" });

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.supplies[0]).toMatchObject({ quantity: 1 });
});

test("what is left replaces the amount, and Undo puts back the amount and a Running low someone had tapped", async ({ context, page }) => {
  // The beef, counted: 4 kg, and someone marked it Running low by hand. "Only 1 kg left."
  const stub = await installStub(context, {
    owner: { locale: "en" },
    kakak: { allowed: true, enabled: true },
    features: { kitchen: true },
    items: [{ ...beef, track_amount: true, quantity: 4, stock_status: "low" }],
  });
  await kakakSays(page, [
    {
      kind: "suggestions",
      text: "",
      items: [
        { kind: "ingredient", itemId: BEEF, name: "Daging sapi", keptIn: null, fromPlace: "freezer", expiry: "keep", expiresOn: null, expiryIsGuess: false, amount: { value: 1, unit: "kg", mode: "set", before: 4 }, amountSkipped: null },
      ],
    },
  ]);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("There is only 1 kg of beef left");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("1 kg (was 4 kg)")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Looks right" }).click();
  // A new amount settles the status again: 1 kg, with no low level set, is Enough.
  await expect.poll(() => stub.supplies[0]).toMatchObject({ quantity: 1, stock_status: "ok" });

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.supplies[0]).toMatchObject({ quantity: 4, stock_status: "low" });
});

test("an amount that can't be written is explained on the card, and the card has nothing to save", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true }, features: { kitchen: true }, items: [beef] });
  await kakakSays(page, [
    {
      kind: "suggestions",
      text: "",
      items: [
        { kind: "ingredient", itemId: BEEF, name: "Daging sapi", keptIn: null, fromPlace: "freezer", expiry: "keep", expiresOn: null, expiryIsGuess: false, amount: null, amountSkipped: { value: 2, unit: "L", itemUnit: "kg" } },
      ],
    },
  ]);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "Mau Kakak atur apa?" }).fill("Tambah daging 2 liter");
  await page.getByRole("button", { name: "Kirim" }).click();

  await expect(page.getByText("2 L tidak ditambahkan: di sini Daging sapi dicatat dalam kg.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Sudah benar" })).toBeDisabled();
});

test("Kakak answers a question in words, and the conversation keeps both sides", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  const answer =
    "Miamus keeps the running of your home in one place: chores, pets, the kitchen and the people who help. You say what should happen once; staff see it on their own phone and tick it off, often with a photo. You only hear about what didn't happen.";
  const asked = await kakakSays(page, [
    { kind: "message", text: answer },
    { kind: "message", text: "You're welcome." },
  ]);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("how would you describe what miamis is for");
  await page.getByRole("button", { name: "Send" }).click();

  // The whole answer, longer than a card's sentence, and no card.
  await expect(page.getByText(answer)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Looks right" })).toHaveCount(0);
  // She can be asked again straight away: the box now asks "Anything else?".
  await page.getByRole("textbox", { name: "Anything else?" }).fill("thank you");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("You're welcome.")).toBeVisible();
  // Both sides stay, in order: the question, her answer, the thanks.
  const said = page.getByTestId("kakak-said");
  await expect(said.locator("p")).toHaveText(["how would you describe what miamis is for", answer, "thank you"]);
  await expect(said.getByTestId("kakak-earlier")).toHaveCount(1);
  expect(asked.map((turn) => turn.reply)).toEqual(["how would you describe what miamis is for", "thank you"]);
});

test("Kakak's question stays above the answer the owner taps", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  await answerKakak(page);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Ari mops the terrace at 9");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByRole("button", { name: "Monday" }).click({ timeout: 20_000 });

  await expect(page.getByText("Pel teras (Mop the terrace)")).toBeVisible();
  await expect(page.getByTestId("kakak-said").locator("p")).toHaveText(["Ari mops the terrace at 9", "Which day?", "Monday"]);
});
