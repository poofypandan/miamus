import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER_PROFILE_ID, freshSession, installStub } from "./stub-backend";

// Household → Features (Phase 171 PR A, migrations/145): turning Repairs off
// takes its pill away at once and a stale ?chores=repairs link falls back to
// Today; turning it on brings it back, with no reload. Bills off hides bill
// chores and the checklist. Staff phones lose the buttons of what's off and
// gain no text.

const tabs = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Sections" });

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const chore = (id: string, title: string, category: string) => ({
  id: `00000000-0000-4000-8000-0000001710${id}`,
  household_id: HOUSEHOLD_ID,
  title,
  notes: null,
  category,
  assigned_to: OWNER_PROFILE_ID,
  due_date: today(),
  due_time: null,
  status: "pending",
  completed_by: null,
  completed_at: null,
  photo_url: null,
  created_at: "2026-11-01T00:00:00Z",
  recurrence: "none",
  recurrence_until: null,
  recurrence_interval: 1,
  remind_days_before: null,
  parent_task_id: null,
  requires_supervision: false,
  before_photo_url: null,
  after_photo_url: null,
  location_id: null,
  spot: null,
});

test("Repairs off hides its pill at once; on brings it back, no reload", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=access");
  // A marker that a full reload would wipe.
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

  const row = page.getByRole("button", { name: /^Features/ });
  await expect(row).toContainText("4 on", { timeout: 20_000 });
  await row.click();
  await expect(page.getByRole("heading", { name: "Features" })).toBeVisible();
  const repairs = page.getByRole("switch", { name: "Repairs" });
  await expect(repairs).toHaveAttribute("aria-checked", "true");
  await repairs.click();
  await expect(page.getByText("Repairs is off")).toBeVisible();
  await expect(repairs).toHaveAttribute("aria-checked", "false");
  expect(stub.features.repairs).toBe(false);

  await tabs(page).getByRole("link", { name: "Chores" }).click();
  const pills = page.getByRole("tablist", { name: "Chores" });
  await expect(pills.getByRole("tab", { name: "Rooms" })).toBeVisible({ timeout: 20_000 });
  await expect(pills.getByRole("tab", { name: "Repairs" })).toHaveCount(0);

  // Back on, from Household: the pill returns without a reload.
  await tabs(page).getByRole("link", { name: "Household" }).click();
  await page.getByRole("button", { name: /^Features/ }).click();
  await page.getByRole("switch", { name: "Repairs" }).click();
  await expect(page.getByText("Repairs is on")).toBeVisible();
  await tabs(page).getByRole("link", { name: "Chores" }).click();
  await expect(page.getByRole("tablist", { name: "Chores" }).getByRole("tab", { name: "Repairs" })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
});

test("a stale Repairs link opens Chores → Today while Repairs is off", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { repairs: false } });
  await page.goto("/dashboard?module=chores&chores=repairs");
  const pills = page.getByRole("tablist", { name: "Chores" });
  await expect(pills.getByRole("tab", { name: "Today" })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  await expect(pills.getByRole("tab", { name: "Repairs" })).toHaveCount(0);
});

test("Bills off hides bill chores and the checklist; the other chores stay", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    features: { bills: false },
    chores: [chore("01", "Bayar listrik", "bill"), chore("02", "Sapu teras", "cleaning")],
  });
  await page.goto("/dashboard?module=chores");
  await expect(page.getByText("Sapu teras")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Bayar listrik")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bills and upkeep" })).toHaveCount(0);
});

test("Food off: Kitchen opens on Shopping with no pills", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { food: false } });
  await page.goto("/dashboard?module=inventory");
  await expect(page.getByRole("heading", { name: /Shopping|To buy/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("tablist", { name: "Kitchen" })).toHaveCount(0);
});

test("staff phone: Repairs and Food off take their buttons away, and the line gets shorter", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    household: { hasPets: false, pets: false },
    features: { repairs: false, food: false },
  });
  await page.goto("/staff");
  await page.getByRole("button", { name: /^Lapor/ }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Laporkan stok.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Lapor kerusakan/ })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /Makanan masuk/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Dapur opens on Belanja, with no Makanan pill.
  await page.getByRole("tab", { name: "Dapur" }).or(page.getByRole("button", { name: "Dapur" })).first().click();
  await expect(page.getByRole("tablist", { name: "Dapur" })).toHaveCount(0);
});

test("staff phone with everything on keeps both buttons", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");
  await page.getByRole("button", { name: /^Lapor/ }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: /Lapor kerusakan/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Makanan masuk/ })).toBeVisible();
});
