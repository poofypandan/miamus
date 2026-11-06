import { expect, test } from "@playwright/test";
import { HOUSEHOLD_TABLES, USER, expiredSession, freshSession, installStub } from "./stub-backend";

// Phase 146: a staff phone on bad Wi-Fi says it is offline, keeps what it
// has, and recovers by itself. Each of these was broken before that phase.

const OFFLINE_CARD = "Belum bisa memuat data rumah";
const OFFLINE_STRIP = "Belum tersambung";
const A_ROUTINE = "Pipis & Pup";

test("opened with no connection: says so, then recovers once the network is back", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  stub.setNetwork(false);
  await page.goto("/staff");

  // Before: the RUMAH cover for 20s+, then skeletons that never went away.
  await expect(page.getByText(OFFLINE_CARD)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(page.getByText("Tidak ada jadwal untuk tanggal ini")).toHaveCount(0);

  stub.setNetwork(true);
  await expect(page.getByText(A_ROUTINE).first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(OFFLINE_CARD)).toHaveCount(0);

  expect(stub.seen.signups).toBe(0);
  expect(await stub.sessionUser()).toBe(USER);
  expect(stub.seen.realBackend).toEqual([]);
});

test("a sign-in that can't be renewed never loads the household with the public key", async ({ context, page }) => {
  const stub = await installStub(context, { stored: expiredSession(), staffPhone: true });
  // The token endpoint is down; the data API is not.
  stub.net.token = false;
  await page.goto("/staff");

  await expect(page.getByText(OFFLINE_CARD)).toBeVisible({ timeout: 25_000 });
  // Past the point where auth-js gives up renewing (30s) and the old code
  // fell back to the public key.
  await page.waitForTimeout(15_000);

  // Before: every one of these went out as anon, RLS returned nothing, and
  // the agenda said "Tidak ada jadwal untuk tanggal ini".
  expect(stub.seen.anonTables.filter((t) => HOUSEHOLD_TABLES.includes(t))).toEqual([]);
  await expect(page.getByText("Tidak ada jadwal untuk tanggal ini")).toHaveCount(0);
  expect(await stub.sessionUser()).toBe(USER);
  expect(stub.seen.realBackend).toEqual([]);
});

test("with this phone's saved copy: shows it under a strip while offline", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");
  await expect(page.getByText(A_ROUTINE).first()).toBeVisible({ timeout: 20_000 });

  stub.setNetwork(false);
  await page.reload();

  await expect(page.getByText(OFFLINE_STRIP)).toBeVisible({ timeout: 20_000 });
  // Before: hidden for 20s behind the roster fetch.
  await expect(page.getByText(A_ROUTINE).first()).toBeVisible({ timeout: 10_000 });
  expect(stub.seen.realBackend).toEqual([]);
});
