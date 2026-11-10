import { expect, test } from "@playwright/test";
import { installStub } from "./stub-backend";

// "Who lives here?" (Phase 162): a household without pets has four tabs and a
// Today that never mentions pets; switching Pets on in Household brings the
// tab back without a reload; a household that never answered is asked once.

// The tab bar is labelled in the owner's language.
const tabs = (page: import("@playwright/test").Page, name = "Sections") => page.getByRole("navigation", { name });

test("no pets: four tabs, a chore-only welcome, and Pets back from Household", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, household: { hasPets: false, pets: false } });
  await page.goto("/dashboard");

  await expect(page.getByText("Let's start by adding a chore.", { exact: false })).toBeVisible({ timeout: 20_000 });
  await expect(tabs(page).getByRole("link", { name: "Kitchen" })).toBeVisible();
  await expect(tabs(page).getByRole("link", { name: "Pets" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Add Pet/ })).toHaveCount(0);
  // Never asked again: the household already answered.
  await expect(page.getByText("Any pets at home?")).toHaveCount(0);

  // ?module=pets opens Today rather than a tab that isn't there.
  await page.goto("/dashboard?module=pets");
  await expect(page.getByText("Let's start by adding a chore.", { exact: false })).toBeVisible({ timeout: 20_000 });

  // Household → Who lives here → Pets on: the tab is back, no reload.
  await tabs(page).getByRole("link", { name: "Household" }).click();
  const row = page.getByRole("button", { name: /^Who lives here/ });
  await expect(row).toContainText("Just people");
  await row.click();
  await expect(page).toHaveURL(/page=who-lives-here/);
  await page.getByRole("switch", { name: /Pets/ }).click();
  await expect(page.getByText("Pets tab is back")).toBeVisible();
  await expect(tabs(page).getByRole("link", { name: "Pets" })).toBeVisible();
  expect(stub.household.hasPets).toBe(true);
});

test("pets still in the app: the switch stays on and says why", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, household: { hasPets: true } });
  await page.goto("/dashboard?module=access&page=who-lives-here");

  await expect(page.getByText(/You have 2 pets in Miamus/)).toBeVisible({ timeout: 20_000 });
  const toggle = page.getByRole("switch", { name: /Pets/ });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // Held on, and marked so (D4): archive the pets first.
  await expect(toggle).toHaveAttribute("aria-disabled", "true");
  await toggle.click({ force: true });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(tabs(page).getByRole("link", { name: "Pets" })).toBeVisible();
});

test("never answered and no pets: asked once on Today, and No pets hides the tab", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" }, household: { hasPets: null, pets: false } });
  await page.goto("/dashboard");

  await expect(page.getByText("Ada hewan di rumah?")).toBeVisible({ timeout: 20_000 });
  await expect(tabs(page, "Bagian").getByRole("link", { name: "Hewan" })).toBeVisible();
  await page.getByRole("button", { name: "Tidak ada" }).click();
  await expect(tabs(page, "Bagian").getByRole("link", { name: "Hewan" })).toHaveCount(0);
  await expect(page.getByText("Ada hewan di rumah?")).toHaveCount(0);
  expect(stub.household.hasPets).toBe(false);
});
