import { expect, test, type BrowserContext } from "@playwright/test";
import { STUB_URL, freshSession, installStub } from "./stub-backend";

// Signing up (Phase 172 PR A1, D1 and D2; migrations/143). The owner
// approves every new household (2026-11-10): by default a new account asks,
// and the waiting screen promises an email. Only if a platform admin
// switches automatic approval on does an account read "open" and go
// straight to the name form, Create household approving it in the same call;
// over the day's cap the request is filed instead. Answered here, after the
// stub: Playwright tries the most recently added route first.

// A Google account with no household: the middleware's stub knows only the
// owner as a member, so this one lands on /onboarding.
const NEWCOMER = "00000000-0000-4000-8000-00000000e0aa";

interface Calls {
  rpc: { name: string; body: Record<string, unknown> }[];
}

async function signUp(
  context: BrowserContext,
  locale: "en" | "id",
  create: { status: number; json: unknown } | (() => { status: number; json: unknown }),
  requestAnswer = "pending",
  access = "open"
): Promise<Calls> {
  await installStub(context, { stored: freshSession(NEWCOMER, false) });
  await context.addInitScript((lang) => localStorage.setItem("miamus.owner-locale", lang), locale);
  const calls: Calls = { rpc: [] };
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    calls.rpc.push({ name, body: route.request().postDataJSON() ?? {} });
    if (name === "my_locale") return route.fulfill({ json: locale });
    if (name === "my_household_access") return route.fulfill({ json: access });
    if (name === "create_household") return route.fulfill(typeof create === "function" ? create() : create);
    if (name === "request_household_access") return route.fulfill({ json: requestAnswer });
    return route.fallback();
  });
  await context.route(`${STUB_URL}/auth/v1/user*`, (route) =>
    route.fulfill({
      json: { id: NEWCOMER, aud: "authenticated", role: "authenticated", email: "sam@example.test", is_anonymous: false },
    })
  );
  return calls;
}

test("by default a new account asks, and is told it will be emailed once approved", async ({ context, page }) => {
  const calls = await signUp(
    context,
    "en",
    { status: 403, json: { code: "42501", message: "household_not_approved", details: null, hint: null } },
    "pending",
    "none"
  );

  await page.goto("/onboarding");
  const ask = page.getByRole("button", { name: "Request access" });
  await expect(ask).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Name your household")).toHaveCount(0);
  await ask.click();

  await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
  await expect(
    page.getByText("We'll email you at sam@example.test from support@poofylabs.dev, usually within a day.")
  ).toBeVisible();
  expect(calls.rpc.filter((c) => c.name === "request_household_access")).toHaveLength(1);
  expect(calls.rpc.some((c) => c.name === "create_household")).toBe(false);
});

test("switched on: a new account names its household straight away, with no wait", async ({ context, page }) => {
  const calls = await signUp(context, "en", { status: 200, json: "00000000-0000-4000-8000-0000000000f1" });

  await page.goto("/onboarding");
  await expect(page.getByLabel("Name your household")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Request access" })).toHaveCount(0);
  await expect(page.getByText("Creating a household shares your Google name and email with Poofy Labs, who runs Miamus.", { exact: false })).toBeVisible();

  await page.getByLabel("Name your household").fill("The Lee Residence");
  await page.getByRole("button", { name: "Pets" }).click();
  await page.getByRole("button", { name: "Create household" }).click();

  await expect.poll(() => calls.rpc.filter((c) => c.name === "create_household").length).toBe(1);
  expect(calls.rpc.find((c) => c.name === "create_household")?.body).toEqual({ p_name: "The Lee Residence", p_has_pets: true });
  expect(calls.rpc.some((c) => c.name === "request_household_access")).toBe(false);
});

test("switched on, over the day's cap: the request is filed and the screen promises an email", async ({ context, page }) => {
  const calls = await signUp(context, "en", {
    status: 403,
    json: { code: "42501", message: "household_not_approved", details: null, hint: null },
  });

  await page.goto("/onboarding");
  await page.getByLabel("Name your household").fill("The Lee Residence", { timeout: 20_000 });
  await page.getByRole("button", { name: "Create household" }).click();

  await expect(page.getByRole("heading", { name: "Request sent" })).toBeVisible();
  await expect(
    page.getByText("We'll email you at sam@example.test from support@poofylabs.dev, usually within a day.")
  ).toBeVisible();
  expect(calls.rpc.filter((c) => c.name === "request_household_access")).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Check again" })).toBeVisible();
});

test("Bahasa Indonesia: the email promise and the sharing sentence", async ({ context, page }) => {
  await signUp(context, "id", {
    status: 403,
    json: { code: "42501", message: "household_not_approved", details: null, hint: null },
  });

  await page.goto("/onboarding");
  await expect(
    page.getByText("Membuat rumah membagikan nama dan email Google Anda kepada Poofy Labs, pengelola Miamus.", { exact: false })
  ).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Beri nama rumah Anda").fill("Rumah Keluarga Lee");
  await page.getByRole("button", { name: "Buat rumah" }).click();
  await expect(page.getByRole("heading", { name: "Permintaan terkirim" })).toBeVisible();
  await expect(
    page.getByText("Kami akan mengirim email ke sam@example.test dari support@poofylabs.dev, biasanya dalam sehari.")
  ).toBeVisible();
});

test("switched on, refused, then approved after all: the form works again and the second try creates it", async ({ context, page }) => {
  let tries = 0;
  const calls = await signUp(
    context,
    "en",
    () =>
      ++tries === 1
        ? { status: 403, json: { code: "42501", message: "household_not_approved", details: null, hint: null } }
        : { status: 200, json: "00000000-0000-4000-8000-0000000000f1" },
    "approved"
  );

  await page.goto("/onboarding");
  await page.getByLabel("Name your household").fill("The Lee Residence", { timeout: 20_000 });
  const create = page.getByRole("button", { name: "Create household" });
  await create.click();
  await expect.poll(() => calls.rpc.filter((c) => c.name === "request_household_access").length).toBe(1);
  await expect(create).toBeEnabled();
  await expect(page.getByLabel("Name your household")).toHaveValue("The Lee Residence");
  await create.click();
  await expect.poll(() => calls.rpc.filter((c) => c.name === "create_household").length).toBe(2);
});
