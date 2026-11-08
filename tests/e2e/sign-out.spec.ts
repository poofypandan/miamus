import { expect, test } from "@playwright/test";
import { freshSession, installStub } from "./stub-backend";

// Owner decision, 2026-11-08: sign-out is for owners (Household tab). A staff
// phone is the household's tool, so it offers no way to sign itself out: an
// accidental tap would lock the staff member out. The owner signs a phone
// out instead (archive the person, or remove the linked phone).

test("a staff phone shows who is on duty but offers no sign-out", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");

  await expect(page.getByText("Ari", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /keluar/i })).toHaveCount(0);
});
