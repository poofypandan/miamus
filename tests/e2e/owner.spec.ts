import { expect, test } from "@playwright/test";
import { HOUSEHOLD_TABLES, freshSession, installStub } from "./stub-backend";

// Owner screens (R6, docs/app-review-2026-11-07.md). The admin is signed in
// with Google; the middleware checks that on the server, answered by
// server-stub.cjs, and the browser's own requests by stub-backend.ts.

test("the middleware lets the household's admin in, and nobody else", async ({ context, page }) => {
  // Nobody signed in: back to the front door.
  await installStub(context);
  await page.goto("/dashboard?module=access");
  await expect(page).toHaveURL(/\/$/);

  // A staff phone (anonymous session) is sent to the staff screen.
  await context.clearCookies();
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/staff/);

  // The admin gets the dashboard.
  await context.clearCookies();
  await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=access");
  await expect(page).toHaveURL(/\/dashboard\?module=access/);
  await expect(page.getByRole("button", { name: "Family" })).toBeVisible({ timeout: 20_000 });
});

test("Household tab: settings list, and Sign out with its confirmation", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=access");

  for (const row of [
    /^Family$/,
    /^Staff \d+$/,
    /^Invite someone$/,
    /^Staff sign-in$/,
    /^Notifications/,
    /^Language/,
    /^App lock$/,
    /^Activity$/,
  ]) {
    await expect(page.getByRole("button", { name: row })).toBeVisible({ timeout: 20_000 });
  }
  await expect(page.getByRole("button", { name: /Language/ })).toContainText("English");

  // A page opens in place and Back returns to the list (URL-driven).
  await page.getByRole("button", { name: /^Family$/ }).click();
  await expect(page).toHaveURL(/page=family/);
  await expect(page.getByText("owner@example.test").first()).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: /^Invite someone$/ })).toBeVisible();

  // Sign out: the row shows who is signed in; the sheet says what happens.
  const signOutRow = page.getByRole("button", { name: /Sign out/ });
  await expect(signOutRow).toContainText("owner@example.test");
  await signOutRow.click();
  await expect(page.getByRole("heading", { name: "Sign out of Miamus on this phone?" })).toBeVisible();
  await expect(page.getByText(/Your household and everything in it stay safe/)).toBeVisible();

  // Cancel keeps everything as it was.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Sign out of Miamus on this phone?" })).toHaveCount(0);
  expect(await stub.sessionUser()).not.toBeNull();

  // Signing out lands on the front door, with this phone's session gone.
  await signOutRow.click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible({ timeout: 20_000 });
  expect(await stub.sessionUser()).toBeNull();

  expect(stub.seen.realBackend).toEqual([]);
});

test("Kitchen (Bahasa Indonesia): the admin adds food and may delete it", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" } });
  await page.goto("/dashboard?module=inventory");

  await expect(page.getByRole("tab", { name: "Makanan" })).toHaveAttribute("aria-selected", "true", {
    timeout: 20_000,
  });
  await expect(page.getByText("Belum ada makanan")).toBeVisible();

  await page.getByRole("button", { name: "Tambah makanan" }).click();
  await page.getByLabel(/Makanan apa\?/).fill("Rendang");
  await page.getByRole("button", { name: "Kulkas" }).click();
  await page.getByRole("button", { name: "Tidak ada" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();

  await expect.poll(() => stub.foods.length).toBe(1);
  expect(stub.foods[0]).toMatchObject({ name: "Rendang", kept_in: "fridge", expires_on: null, expiry_unknown: false });

  // Unlike a staff phone, the admin can delete a mistake.
  const row = page.getByRole("button", { name: /Rendang/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByText("Hapus — salah tambah")).toBeVisible();

  // Shopping sits beside Food.
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Belanja" }).click();
  await expect(page.getByRole("tab", { name: "Belanja" })).toHaveAttribute("aria-selected", "true");

  expect(stub.seen.anonTables.filter((t) => HOUSEHOLD_TABLES.includes(t))).toEqual([]);
  expect(stub.seen.realBackend).toEqual([]);
});

test("Today: the day's routines for both pets, in the owner's language", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard");

  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true", {
    timeout: 20_000,
  });
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  for (const [time, routine] of [
    ["7:00 AM", "Pipis & Pup"],
    ["8:00 AM", "Obat Uji"],
    ["12:00 PM", "Makan Siang"],
    ["6:00 PM", "Makan Malam"],
  ]) {
    await expect(page.getByText(time, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(routine).first()).toBeVisible();
  }
  // English owner, so no Indonesian tab names.
  await expect(page.getByRole("link", { name: "Kitchen" })).toBeVisible();
  await expect(page.getByText("Hari ini", { exact: true })).toHaveCount(0);

  expect(stub.seen.anonTables.filter((t) => HOUSEHOLD_TABLES.includes(t))).toEqual([]);
  expect(stub.seen.realBackend).toEqual([]);
});
