import { expect, test } from "@playwright/test";
import { STUB_URL, installStub } from "./stub-backend";

// Household requests after Phase 172 (D1, D2; migrations/143): approvals made
// at sign-up say "Automatic"; one the operator approved by hand gets
// WhatsApp (straight to their chat when they left a number), Email and Copy
// link, with a ready message in both languages, theirs first.

const rows = [
  {
    user_id: "00000000-0000-4000-8000-0000000000c1",
    full_name: "Sam Lee",
    email: "sam@example.test",
    status: "approved",
    requested_at: "2026-11-10T01:00:00Z",
    decided_at: "2026-11-10T01:00:00Z",
    auto: true,
    locale: "en",
  },
  {
    user_id: "00000000-0000-4000-8000-0000000000c2",
    full_name: "Dewi Lestari",
    email: "dewi@example.test",
    status: "approved",
    requested_at: "2026-11-09T01:00:00Z",
    decided_at: "2026-11-10T02:00:00Z",
    auto: false,
    locale: "id",
    whatsapp: "6281234567890",
  },
  {
    user_id: "00000000-0000-4000-8000-0000000000c3",
    full_name: "Rina",
    email: "rina@example.test",
    status: "approved",
    requested_at: "2026-11-09T01:00:00Z",
    decided_at: "2026-11-10T03:00:00Z",
    auto: false,
    locale: "en",
    whatsapp: null,
  },
];

test("automatic approvals are labelled; a hand-approved one is told by WhatsApp, email or a copied link", async ({
  context,
  page,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await installStub(context, { owner: { locale: "en" } });
  await context.route(`${STUB_URL}/rest/v1/rpc/list_household_access_requests*`, (route) => route.fulfill({ json: rows }));
  const told: unknown[] = [];
  await context.route(`${STUB_URL}/rest/v1/rpc/household_access_told*`, (route) => {
    told.push(route.request().postDataJSON());
    return route.fulfill({ status: 204, body: "" });
  });
  // WhatsApp opens in a new tab: answered with nothing.
  await context.route(/wa\.me/, (route) => route.fulfill({ status: 200, body: "" }));

  await page.goto("/dashboard/approvals");
  await expect(page.getByText("Sam Lee")).toBeVisible({ timeout: 20_000 });
  const row = (name: string) => page.getByTestId("request-row").filter({ hasText: name });
  const sam = row("Sam Lee");
  await expect(sam).toContainText("Automatic");
  await expect(sam.getByRole("link", { name: "WhatsApp" })).toHaveCount(0);

  // Dewi left a number: WhatsApp goes straight to her chat, Indonesian first.
  const dewi = row("Dewi Lestari");
  const wa = dewi.getByRole("link", { name: "WhatsApp" });
  const href = (await wa.getAttribute("href")) ?? "";
  expect(href.startsWith("https://wa.me/6281234567890?text=")).toBe(true);
  const text = decodeURIComponent(href.split("?text=")[1]);
  expect(text.startsWith("Halo Dewi, permintaan Anda untuk Miamus sudah disetujui. Buka https://miamus.app")).toBe(true);
  expect(text).toContain("Hi Dewi, you're in");
  const mail = (await dewi.getByRole("link", { name: "Email" }).getAttribute("href")) ?? "";
  expect(mail.startsWith("mailto:dewi%40example.test?")).toBe(true);
  expect(new URLSearchParams(mail.split("?")[1]).get("subject")).toBe("Miamus: Anda sudah bisa masuk");
  // Opening it marks the number used, so the database deletes it.
  const popup = page.waitForEvent("popup");
  await wa.click();
  await (await popup).close();
  await expect.poll(() => told).toEqual([{ p_user_id: "00000000-0000-4000-8000-0000000000c2" }]);

  // Rina left none: the chat picker, English first; Copy link copies the link.
  const rina = row("rina@example.test");
  const rinaHref = (await rina.getByRole("link", { name: "WhatsApp" }).getAttribute("href")) ?? "";
  expect(rinaHref.startsWith("https://wa.me/?text=Hi%20Rina%2C%20you're%20in")).toBe(true);
  await rina.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Link copied")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://miamus.app");
});

// The two Request access answers (owner, 2026-11-20; migrations/175), under
// the requester's name, in the operator's language; nothing where none was
// given.
const withAnswers = [
  {
    user_id: "00000000-0000-4000-8000-0000000000d1",
    full_name: "Maya Putri",
    email: "maya@example.test",
    status: "pending",
    requested_at: "2026-11-20T01:00:00Z",
    decided_at: null,
    auto: false,
    locale: "id",
    wants_help_with: "Staff at home, Repairs",
    heard_from: "My sister Dewi",
  },
  {
    user_id: "00000000-0000-4000-8000-0000000000d2",
    full_name: "Old Request",
    email: "old@example.test",
    status: "pending",
    requested_at: "2026-11-19T01:00:00Z",
    decided_at: null,
    auto: false,
    locale: "en",
    wants_help_with: null,
    heard_from: null,
  },
];

for (const locale of ["en", "id"] as const) {
  test(`the answers show under the requester's name (${locale})`, async ({ context, page }) => {
    await installStub(context, { owner: { locale } });
    await context.route(`${STUB_URL}/rest/v1/rpc/list_household_access_requests*`, (route) =>
      route.fulfill({ json: withAnswers })
    );

    await page.goto("/dashboard/approvals");
    await expect(page.getByText("Maya Putri")).toBeVisible({ timeout: 20_000 });
    // Every heading in the owner's language (the operator may read it in Indonesian).
    await expect(page.getByRole("heading", { name: locale === "id" ? "Permintaan rumah baru" : "Household requests" })).toBeVisible();
    await expect(page.getByRole("heading", { name: locale === "id" ? "Menunggu" : "Waiting", exact: true })).toBeVisible();
    const card = page.locator("[data-slot=card]").filter({ hasText: "Maya Putri" });
    await expect(card).toContainText(locale === "id" ? "Ingin dibantu" : "Wants help with");
    await expect(card).toContainText("Staff at home, Repairs");
    await expect(card).toContainText(locale === "id" ? "Tahu Miamus dari" : "Heard about Miamus from");
    await expect(card).toContainText("My sister Dewi");

    const old = page.locator("[data-slot=card]").filter({ hasText: "Old Request" });
    await expect(old).toBeVisible();
    await expect(old.locator("dl")).toHaveCount(0);
  });
}
