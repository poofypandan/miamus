import { expect, test } from "@playwright/test";
import { STUB_URL, installStub } from "./stub-backend";

// Household requests after Phase 172 (D1, D2; migrations/143): approvals made
// at sign-up say "Automatic"; one the operator approved by hand has an Email
// them link with a ready message in that person's language.

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
  },
];

test("automatic approvals are labelled; a hand-approved one can be emailed in their language", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  await context.route(`${STUB_URL}/rest/v1/rpc/list_household_access_requests*`, (route) => route.fulfill({ json: rows }));

  await page.goto("/dashboard/approvals");
  const sam = page.getByText("Sam Lee").locator("xpath=ancestor::div[contains(@class,'px-4')][1]");
  await expect(page.getByText("Sam Lee")).toBeVisible({ timeout: 20_000 });
  await expect(sam).toContainText("Automatic");
  await expect(sam.getByRole("link", { name: "Email them" })).toHaveCount(0);

  const email = page.getByRole("link", { name: "Email them" });
  await expect(email).toHaveCount(1);
  const href = (await email.getAttribute("href")) ?? "";
  expect(href.startsWith("mailto:dewi%40example.test?")).toBe(true);
  const params = new URLSearchParams(href.split("?")[1]);
  expect(params.get("subject")).toBe("Miamus: Anda sudah bisa masuk");
  expect(params.get("body")).toContain("Halo Dewi,");
});
