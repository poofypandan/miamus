import { expect, test } from "@playwright/test";
import { freshSession, installStub } from "./stub-backend";

// Owner request, 2026-11-08: everyone must be able to find how to sign out.
// On a staff phone the name badge opens "Keluar dari Miamus di HP ini?",
// in Indonesian, says how to come back, and only signs out when asked.

test("a staff phone can sign out from its name badge, after a confirmation", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");

  const badge = page.getByRole("button", { name: /Ari — keluar dari HP ini/ });
  await badge.click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Keluar dari Miamus di HP ini?")).toBeVisible();
  await expect(sheet.getByText(/kode rumah dan PIN Anda/)).toBeVisible();

  // Batal leaves everything as it was.
  await sheet.getByRole("button", { name: "Batal" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/staff/);

  // Keluar signs out, forgets who this phone was, and opens the start screen.
  await badge.click();
  await page.getByRole("dialog").getByRole("button", { name: "Keluar" }).click();
  await expect(page).not.toHaveURL(/\/staff/, { timeout: 15_000 });
  const remembered = await page.evaluate(() => window.localStorage.getItem("banyuwangi11:staffId"));
  expect(remembered).toBeNull();
});
