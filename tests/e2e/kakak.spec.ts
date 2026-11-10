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

test("Kakak is off until an admin turns her on in the Household tab", async ({ context, page }) => {
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
  expect(kakak.asked[2].reply).toBe("(Already set on the card: Pel teras: one time, for anyone.) at 10 instead");
  await expect(page.getByText("at 10 instead", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Looks right" })).toBeVisible();

  await page.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  // The stub's new card is Kakak's own (weekly, Ari): what she sends back is what is saved.
  expect(stub.tasks[0]).toMatchObject({ title: "Pel teras", recurrence: "weekly" });
  await expect.poll(() => kakak.outcomes).toEqual(["changed", "confirmed"]);
});
