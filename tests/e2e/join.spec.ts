import { expect, test } from "@playwright/test";
import { NEW_USER, USER, expiredSession, freshSession, installStub } from "./stub-backend";

// Phase 147: the invite link page. "Link Tidak Berlaku" used to be the answer
// to every failure, and a bad connection signed the phone in as somebody new.

const JOIN = "/join/staff?token=test-token";

test("an expired sign-in on bad Wi-Fi is never replaced by a new user", async ({ context, page }) => {
  test.setTimeout(150_000);
  const stub = await installStub(context, { stored: expiredSession() });
  stub.net.token = false;
  await page.goto(JOIN);

  // auth-js retries the renewal for 30s, then gives up. Before Phase 147 the
  // page then signed up a new anonymous user and spent the invite on it.
  await expect(page.getByRole("heading", { name: "Belum Tersambung" })).toBeVisible({ timeout: 50_000 });
  expect(stub.seen.signups).toBe(0);
  expect(stub.seen.redeemedAs).toEqual([]);

  // Back online: the original identity redeems. auth-js holds a failed
  // renewal for 60s before trying again, hence the long wait.
  stub.net.token = true;
  await expect(page).toHaveURL(/\/staff$/, { timeout: 90_000 });
  expect(stub.seen.signups).toBe(0);
  expect(stub.seen.redeemedAs).toEqual([USER]);
  expect(await stub.sessionUser()).toBe(USER);
});

test("the owner's own phone does not spend the invite", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(USER, false) });
  await page.goto(JOIN);
  await expect(page.getByRole("heading", { name: "Ini Link untuk HP Staf" })).toBeVisible({ timeout: 15_000 });
  expect(stub.seen.redeemedAs).toEqual([]);
  expect(await stub.sessionUser()).toBe(USER);
});

test("a link this phone already used lets it in", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), redeem: "used", bound: true });
  await page.goto(JOIN);
  await expect(page).toHaveURL(/\/staff$/, { timeout: 15_000 });
  expect(stub.seen.redeemedAs).toEqual([USER]);
});

test("a link that is really used up still says so", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), redeem: "used", bound: false });
  await page.goto(JOIN);
  await expect(page.getByRole("heading", { name: "Link Tidak Berlaku" })).toBeVisible({ timeout: 15_000 });
});

test("fully offline: waits, then joins by itself", async ({ context, page }) => {
  const stub = await installStub(context, { stored: null });
  stub.setNetwork(false);
  await page.goto(JOIN);
  await expect(page.getByRole("heading", { name: "Belum Tersambung" })).toBeVisible({ timeout: 20_000 });

  stub.setNetwork(true);
  await expect(page).toHaveURL(/\/staff$/, { timeout: 30_000 });
  // No session was there to keep, so a new one is right here.
  expect(stub.seen.redeemedAs).toEqual([NEW_USER]);
  expect(stub.seen.realBackend).toEqual([]);
});
