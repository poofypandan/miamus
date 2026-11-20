import { expect, test } from "@playwright/test";

// The photo backup (security audit S5, docs/photo-backups.md) in the privacy
// policy, both languages: who keeps the copy and where, and that a deleted
// photo leaves it (30 days, gone within 32). The numbers come from
// LEGAL.photoBackup, which must match the bucket's lifecycle rule.

test("the English policy names the photo backup, where it is, and when deleted photos leave it", async ({ page }) => {
  await page.goto("/privacy");
  await expect(
    page.getByText("Amazon Web Services (AWS) — keeps an encrypted backup copy of your household's photos, on servers in Singapore", {
      exact: false,
    })
  ).toBeVisible();
  await expect(page.getByText("stays in the backup for 30 days after it leaves Miamus", { exact: false })).toBeVisible();
  await expect(page.getByText("within 32 days of leaving Miamus in all", { exact: false })).toBeVisible();
  await expect(page.getByText("Photos are backed up every night to a private, encrypted copy in Singapore", { exact: false })).toBeVisible();
});

test("the Indonesian policy says the same", async ({ page }) => {
  await page.goto("/privasi");
  await expect(
    page.getByText("Amazon Web Services (AWS) — menyimpan salinan cadangan (backup) foto rumah tangga Anda yang terenkripsi, di server yang berada di Singapura", {
      exact: false,
    })
  ).toBeVisible();
  await expect(page.getByText("tetap ada di cadangan selama 30 hari setelah hilang dari Miamus", { exact: false })).toBeVisible();
  await expect(page.getByText("paling lama 32 hari setelah hilang dari Miamus", { exact: false })).toBeVisible();
  await expect(page.getByText("Foto dicadangkan setiap malam ke salinan privat yang terenkripsi di Singapura", { exact: false })).toBeVisible();
});
