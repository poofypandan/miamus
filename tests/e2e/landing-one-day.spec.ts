import { expect, test } from "@playwright/test";
import { STUB_URL, installStub } from "./stub-backend";

// The "One day" landing page (docs/private/landing, Direction 3) at its
// preview routes. The browser tests build with LANDING_ONE_DAY=preview
// (.github/workflows/checks.yml), so /welcome stays today's page here, as it
// does in production until the owner switches the new one on.

test("the English page is server-rendered, links to both doors, and signs off as Miamus, by Poofy Labs", async ({
  context,
  page,
}) => {
  await installStub(context, { stored: null });
  const response = await page.goto("/welcome/one-day");
  expect(response?.status()).toBe(200);
  const html = (await response?.text()) ?? "";
  // The words are in the HTML (link previews, search, no script needed).
  expect(html).toContain("A day at home, without the ");
  expect(html).toContain('name="robots" content="noindex, nofollow"');
  // Never a link to the Poofy Labs site.
  expect(html).not.toMatch(/href="https?:\/\/(www\.)?poofylabs\.dev/);

  await expect(page.getByRole("heading", { level: 1, name: "A day at home, without the asking." })).toBeVisible();
  await expect(page.getByText("Early access · By invitation").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: "I already have an account" }).first()).toHaveAttribute("href", "/");
  await expect(page.getByRole("link", { name: /Staff\?\s*Saya staf/ })).toHaveAttribute("href", "/join/code");
  await expect(page.getByText("Miamus, by Poofy Labs")).toBeVisible();
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  await expect(footer.getByRole("link", { name: "support@poofylabs.dev" })).toHaveAttribute(
    "href",
    "mailto:support@poofylabs.dev"
  );
  // The app pictures and Kakak's mark are plainly placeholders for now.
  await expect(page.locator('[data-placeholder="app-picture"]')).toHaveCount(3);
  await expect(page.locator('[data-placeholder="kakak-mark-d"]')).toHaveCount(1);
  // A signed-out visitor stays on the page.
  await expect(page).toHaveURL(/\/welcome\/one-day$/);
});

test("the Indonesian page, and the switch between the two", async ({ context, page }) => {
  await installStub(context, { stored: null });
  await page.goto("/selamat-datang/sehari");
  await expect(
    page.getByRole("heading", { level: 1, name: "Sehari di rumah, tanpa bertanya-tanya." })
  ).toBeVisible();
  await expect(page.getByText("Akses awal · Dengan undangan").first()).toBeVisible();
  await expect(page.getByText("Miamus, oleh Poofy Labs")).toBeVisible();
  await expect(page.locator("footer").getByRole("link", { name: "Kebijakan Privasi" })).toHaveAttribute(
    "href",
    "/privasi"
  );

  await page.getByRole("tab", { name: "EN" }).click();
  await expect(page).toHaveURL(/\/welcome\/one-day$/);
  expect(await page.evaluate(() => localStorage.getItem("miamus.public-locale"))).toBe("en");
});

test("Request access opens the first step, and Google is the same sign-in as the front door", async ({
  context,
  page,
}) => {
  await installStub(context, { stored: null });
  let authorize: URL | null = null;
  await page.route(`${STUB_URL}/auth/v1/authorize**`, (route) => {
    authorize = new URL(route.request().url());
    return route.fulfill({ contentType: "text/html", body: "<p>Google</p>" });
  });

  await page.goto("/selamat-datang/sehari");
  await page.getByRole("button", { name: "Minta akses" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Minta akses" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("pengelola Miamus", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Kebijakan Privasi" })).toHaveAttribute("href", "/privasi");

  // Escape closes it (a native dialog).
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Minta akses" }).last().click();
  await page.getByRole("dialog").getByRole("button", { name: "Lanjutkan dengan Google" }).click();
  await expect.poll(() => authorize?.searchParams.get("provider")).toBe("google");
  expect(authorize!.searchParams.get("redirect_to")).toMatch(/\/auth\/callback$/);
});

test("with reduced motion, everything is simply there", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await installStub(context, { stored: null });
  const page = await context.newPage();
  await page.goto("/welcome/one-day");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // Nothing was held back for an entrance.
  expect(await page.locator("[data-armed]").count()).toBe(0);
  await expect(page.getByRole("heading", { name: "A few households at a time." })).toBeVisible();
  await context.close();
});

test("below the fold arrives as you scroll, and nothing on the first screen is hidden", async ({ context, page }) => {
  await installStub(context, { stored: null });
  await page.goto("/welcome/one-day");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The last heading starts held back, and arrives once reached.
  const last = page.getByRole("heading", { name: "A few households at a time." });
  await expect(last).toHaveAttribute("data-armed", "");
  await last.scrollIntoViewIfNeeded();
  await expect(last).toHaveAttribute("data-in", "");
  await expect(last).toBeVisible();
});

test("asks nothing of any other site: no fonts, scripts or tracking from elsewhere", async ({ context, page }) => {
  await installStub(context, { stored: null });
  const elsewhere: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const ours = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.href.startsWith(STUB_URL);
    if (url.protocol.startsWith("http") && !ours) elsewhere.push(url.origin);
  });
  await page.goto("/welcome/one-day", { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForLoadState("networkidle");
  expect(elsewhere).toEqual([]);
});

test("today's page still stands at /welcome while the switch is not on", async ({ context, page }) => {
  await installStub(context, { stored: null });
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1, name: "Know what's done at home, without asking again." })).toBeVisible();
});
