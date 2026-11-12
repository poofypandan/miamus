import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, installStub } from "./stub-backend";

// The calm first screen (Phase 172 PR A1, D11): a new household's Today is
// the checklist alone, directly under the date; no What's new until it is 14
// days old and past setup; Add to Home Screen and the notifications prompt
// wait for a first task, and since Phase 175 S2 for the checklist to go (it
// has its own notifications row); "Any pets at home?" never asks a household made
// since the sign-up question; and an established owner sees at most one
// What's new card a week.

const PUSH_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

async function pushOff(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "default" });
  });
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SARI = {
  id: STAFF_ID,
  household_id: HOUSEHOLD_ID,
  name: "Sari",
  has_pin: false,
  user_id: null,
  archived_at: null,
  created_at: new Date().toISOString(),
};

const checklist = (page: Page) => page.getByRole("region", { name: "Set up your home" });
/** Every What's new card on Today (their regions are named after the entry). */
const whatsNew = (page: Page) => page.getByRole("region", { name: /^New: / });

test("a brand-new household: the checklist alone, nothing above it, no tips", async ({ context, page }) => {
  await pushOff(context);
  await installStub(context, {
    owner: { locale: "en" },
    firstRun: true,
    installTip: true,
    pushKey: PUSH_KEY,
    household: { hasPets: false, pets: false, createdAt: new Date().toISOString() },
    staff: [],
    linkedPhones: [],
    chores: [],
  });
  await page.goto("/dashboard");

  const card = checklist(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  // Step names only, under the three lines of how Miamus works (Phase 175
  // S2): the title, the count, the three lines (16 words), five step names,
  // the household's name, the open step's two buttons and Not now. About 40
  // words of reading in the plan, 54 with the buttons; it was about 60
  // before Phase 172, with no three lines.
  const words = ((await card.innerText()).match(/\S+/g) ?? []).length;
  expect(words).toBeLessThanOrEqual(56);
  await expect(whatsNew(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Turn on notifications" })).toHaveCount(0);
  await expect(page.getByText("Add Miamus to your Home Screen for notifications.")).toHaveCount(0);
  // Directly under the date ribbon: the next thing after the ribbon's block.
  const before = await card.evaluate((el) => el.previousElementSibling?.querySelector("button")?.textContent ?? "");
  expect(before).not.toBe("");
  expect(await page.evaluate((id) => localStorage.getItem(`miamus.setup-stage.${id}`), HOUSEHOLD_ID)).toBe("new");
});

test("with a first task given, the prompts wait while the checklist asks itself; once it's hidden they may ask", async ({
  context,
  page,
}) => {
  await pushOff(context);
  await installStub(context, {
    owner: { locale: "en" },
    firstRun: true,
    installTip: true,
    pushKey: PUSH_KEY,
    household: { hasPets: false, pets: false, createdAt: new Date().toISOString() },
    staff: [SARI],
    linkedPhones: [],
    chores: [
      {
        id: "00000000-0000-4000-8000-0000000000b1",
        household_id: HOUSEHOLD_ID,
        title: "Sapu teras",
        notes: null,
        category: "cleaning",
        assigned_to: STAFF_ID,
        due_date: today(),
        due_time: null,
        status: "pending",
        completed_by: null,
        completed_at: null,
        photo_url: null,
        created_at: new Date().toISOString(),
        recurrence: "none",
        recurrence_until: null,
        parent_task_id: null,
        requires_supervision: false,
        before_photo_url: null,
        after_photo_url: null,
        location_id: null,
        spot: null,
      },
    ],
  });
  await page.goto("/dashboard");

  const card = checklist(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  // The card has its own "Turn on notifications" row: nothing above Today
  // asks the same thing twice.
  await expect(card).toContainText("Turn on notifications");
  await expect(page.getByText("Add Miamus to your Home Screen for notifications.")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Turn on notifications" })).toHaveCount(0);
  expect(await page.evaluate((id) => localStorage.getItem(`miamus.setup-stage.${id}`), HOUSEHOLD_ID)).toBe("new");

  // Not now: the card goes, and the prompts take over.
  await card.getByRole("button", { name: "Not now" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("Add Miamus to your Home Screen for notifications.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Turn on notifications" })).toBeVisible();
  expect(await page.evaluate((id) => localStorage.getItem(`miamus.setup-stage.${id}`), HOUSEHOLD_ID)).toBe("task");
  await expect(whatsNew(page)).toHaveCount(0);
});

test("an established household sees one What's new card a week, not the backlog", async ({ context, page }) => {
  // Ari is on the roster, so both the couldn't-do and the bills cards apply.
  await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard");

  await expect(whatsNew(page)).toHaveCount(1, { timeout: 20_000 });
  await whatsNew(page).getByRole("button", { name: "Got it" }).last().click();
  await expect(whatsNew(page)).toHaveCount(0);
  // The next one waits a week, on this phone.
  await page.reload();
  await expect(page.getByRole("tab", { name: "Day", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  await expect(whatsNew(page)).toHaveCount(0);
});

test("a household made since the sign-up question is never asked about pets", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    household: { hasPets: null, pets: false, createdAt: new Date().toISOString() },
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("tab", { name: "Day", exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1000);
  await expect(page.getByText("Any pets at home?")).toHaveCount(0);
});

test("an older household that never answered is still asked once", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    household: { hasPets: null, pets: false, createdAt: "2026-10-01T00:00:00Z" },
  });
  await page.goto("/dashboard");
  await expect(page.getByText("Any pets at home?")).toBeVisible({ timeout: 20_000 });
});
