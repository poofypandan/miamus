import { expect, test } from "@playwright/test";
import { freshSession, installStub } from "./stub-backend";

// Phase 157: a link that leads nowhere says so — Bahasa Indonesia only on
// staff routes (AGENTS.md; Codex review, PR #14), with a way back that does
// not reload the app.

test("a missing staff page is in Bahasa Indonesia only", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  const response = await page.goto("/staff/tidak-ada");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
  await expect(page.getByText("Page not found")).toHaveCount(0);
  await expect(page.getByText("Back to the start")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kembali ke awal" })).toHaveAttribute("href", "/staff");
  expect(stub.seen.realBackend).toEqual([]);
});
