import { expect, test } from "@playwright/test";
import { installStub } from "./stub-backend";

// No list may be requested before this device has a session (review fix,
// 2026-11-10). The production logs held about 113 refused loads of the food
// and staff lists: the household provider (in the root layout, so on every
// page) and the staff sign-in screen loaded them with only the public key,
// many of them for Vercel's post-deploy check, which opens the app with no cookies.
//
// The stub records every data request that carries only the public key
// (seen.anonTables). With no session, every request would be one of those, so
// an empty list means nothing was sent at all.

const NOT_LINKED = "HP ini belum terhubung ke rumah.";

test("a visitor with no session: the app opens and sends no data requests", async ({ context, page }) => {
  const stub = await installStub(context, { stored: null });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  // Past the provider's first load and AutoRefresh's first tick.
  await page.waitForTimeout(3_000);

  expect(stub.seen.anonTables).toEqual([]);
  expect(stub.seen.signups).toBe(0);
  expect(stub.seen.realBackend).toEqual([]);
});

test("a phone that was never linked: says so, and never asks for the staff list", async ({ context, page }) => {
  const stub = await installStub(context, { stored: null });
  await page.goto("/staff");
  await page.waitForLoadState("networkidle");
  // Past the screen's 10-second retry, which used to ask again each time.
  await page.waitForTimeout(12_000);

  expect(stub.seen.anonTables).toEqual([]);
  await expect(page.getByText(NOT_LINKED)).toBeVisible();
  await expect(page.getByRole("link", { name: "Masuk dengan kode rumah" })).toHaveAttribute("href", "/join/code");
  // Not shown as a failed load, which would send staff off to fix their Wi-Fi.
  await expect(page.getByText("Gagal memuat daftar nama")).toHaveCount(0);
  expect(stub.seen.signups).toBe(0);
  expect(stub.seen.realBackend).toEqual([]);
});

test("a phone that remembers a name but has lost its session: no list goes out", async ({ context, page }) => {
  // The household and "Ari" are in localStorage; the sign-in cookie is gone.
  const stub = await installStub(context, { stored: null, staffPhone: true });
  await page.goto("/staff");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3_000);

  expect(stub.seen.anonTables).toEqual([]);
  await expect(page.getByText(NOT_LINKED)).toBeVisible();
  expect(stub.seen.signups).toBe(0);
  expect(stub.seen.realBackend).toEqual([]);
});
