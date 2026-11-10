import { expect, test } from "@playwright/test";
import { STAFF_ID, STUB_URL, installStub } from "./stub-backend";

// The public landing page (docs/landing-page-proposal.md): /welcome and
// /selamat-datang, server-rendered, linking into the app without changing
// how "/" routes owners and staff.

test("the English page is readable signed out, and links to both doors", async ({ context, page }) => {
  await installStub(context, { stored: null });
  const response = await page.goto("/welcome");
  expect(response?.status()).toBe(200);
  // Server-rendered: the words are in the HTML itself, for link previews.
  expect(await response?.text()).toContain("Know what&#x27;s done at home, without asking again.");

  await expect(page.getByRole("heading", { level: 1, name: "Know what's done at home, without asking again." })).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: /Staff\?\s*Saya staf/ })).toHaveAttribute("href", "/join/code");
  await expect(page.getByRole("link", { name: "I already have an account" })).toHaveAttribute("href", "/");
  // Never sent anywhere: a signed-out visitor stays on the page.
  await expect(page).toHaveURL(/\/welcome$/);
});

test("the Indonesian page, and the switch between them", async ({ context, page }) => {
  await installStub(context, { stored: null });
  await page.goto("/selamat-datang");
  await expect(
    page.getByRole("heading", { level: 1, name: "Tahu apa yang sudah beres di rumah, tanpa perlu tanya lagi." })
  ).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("lang", "id");

  await page.getByRole("tab", { name: "EN" }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  // Remembered as this phone's public language, so the sign-in screen opens in it.
  expect(await page.evaluate(() => localStorage.getItem("miamus.public-locale"))).toBe("en");
});

test("questions open and close", async ({ context, page }) => {
  await installStub(context, { stored: null });
  await page.goto("/welcome");
  const answer = page.getByText("Bahasa Indonesia, always.", { exact: false });
  await expect(answer).toBeHidden();
  await page.getByText("What language do staff see?").click();
  await expect(answer).toBeVisible();
});

test("Request access starts the same Google sign-in as the front door", async ({ context, page }) => {
  await installStub(context, { stored: null });
  let authorize: URL | null = null;
  await page.route(`${STUB_URL}/auth/v1/authorize**`, (route) => {
    authorize = new URL(route.request().url());
    return route.fulfill({ contentType: "text/html", body: "<p>Google</p>" });
  });

  await page.goto("/selamat-datang");
  await page.getByRole("button", { name: "Minta akses" }).click();
  await expect.poll(() => authorize?.searchParams.get("provider")).toBe("google");
  expect(authorize!.searchParams.get("redirect_to")).toMatch(/\/auth\/callback$/);
  // Back on Miamus (the browser left for Google): the page's language was kept.
  await page.goto("/welcome");
  expect(await page.evaluate(() => localStorage.getItem("miamus.public-locale"))).toBe("id");
});

test("the sign-in screen links to the landing page in its own language", async ({ context, page }) => {
  await installStub(context, { stored: null });
  // The test phone is set to Indonesian (playwright.config.ts).
  await page.goto("/");
  const link = page.getByRole("link", { name: "Apa itu Miamus?" });
  await expect(link).toHaveAttribute("href", "/selamat-datang");
  await link.click();
  await expect(page).toHaveURL(/\/selamat-datang$/);
});

test("a staff phone opening / still goes straight to /staff", async ({ context, page }) => {
  await installStub(context, { stored: null });
  await context.addInitScript((staffId) => localStorage.setItem("banyuwangi11:staffId", staffId), STAFF_ID);
  await page.goto("/");
  await expect(page).toHaveURL(/\/staff$/, { timeout: 15_000 });
});

// A laptop gets a designed page, not the phone column (the root layout's
// mobile frame lets go of its width for data-wide-page): the hero splits into
// words on the left and the app's screens on the right, and nothing scrolls
// sideways.
for (const width of [1024, 1440]) {
  test.describe(`on a laptop, ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

    for (const path of ["/welcome", "/selamat-datang"]) {
      test(`${path} lays the hero out in two columns`, async ({ context, page }) => {
        await installStub(context, { stored: null });
        await page.goto(path);
        const columns = page.locator("[data-landing-hero] > *");
        await expect(columns).toHaveCount(2);
        const words = (await columns.nth(0).boundingBox())!;
        const screens = (await columns.nth(1).boundingBox())!;
        // Side by side, words first, sharing a row, both inside the window.
        expect(words.x).toBeGreaterThan(0);
        expect(words.x + words.width).toBeLessThanOrEqual(screens.x);
        expect(screens.x + screens.width).toBeLessThanOrEqual(width);
        expect(Math.abs(words.y + words.height / 2 - (screens.y + screens.height / 2))).toBeLessThan(200);
        // The page spans the window (no phone column) and nothing scrolls sideways.
        expect((await page.locator("main").boundingBox())!.width).toBe(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      });
    }
  });
}

test("a phone sees one column and nothing scrolls sideways", async ({ context, page }) => {
  await installStub(context, { stored: null });
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/welcome", "/selamat-datang"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
    const columns = page.locator("[data-landing-hero] > *");
    const words = (await columns.nth(0).boundingBox())!;
    const screens = (await columns.nth(1).boundingBox())!;
    // Stacked: the screen sits under the words.
    expect(screens.y).toBeGreaterThanOrEqual(words.y + words.height);
  }
});
