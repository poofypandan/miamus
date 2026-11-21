import { expect, test } from "@playwright/test";

// The photo backup (security audit S5, docs/photo-backups.md) in the privacy
// policy, both languages: who keeps the copy and where, and that a deleted
// photo leaves it (marked the next night, kept 30 days, usually gone about a
// month later; no fixed total, which AWS can't promise). The numbers come from
// LEGAL.photoBackup, which must match the bucket's lifecycle rule.

test("the English policy names the photo backup, where it is, and when deleted photos leave it", async ({ page }) => {
  await page.goto("/privacy");
  await expect(
    page.getByText("Amazon Web Services (AWS) — keeps an encrypted backup copy of your household's photos, on servers in Singapore", {
      exact: false,
    })
  ).toBeVisible();
  await expect(page.getByText("the backup marks it deleted the next night and keeps it 30 more days", { exact: false })).toBeVisible();
  await expect(page.getByText("usually leaves the backup about a month after it leaves Miamus", { exact: false })).toBeVisible();
  await expect(page.getByText("that month starts once we have checked", { exact: false })).toBeVisible();
  await expect(page.getByText("Photos are backed up every night to a private, encrypted copy in Singapore", { exact: false })).toBeVisible();
});

test("the Indonesian policy says the same", async ({ page }) => {
  await page.goto("/privasi");
  await expect(
    page.getByText("Amazon Web Services (AWS) — menyimpan salinan cadangan (backup) foto rumah tangga Anda yang terenkripsi, di server yang berada di Singapura", {
      exact: false,
    })
  ).toBeVisible();
  await expect(page.getByText("cadangan menandainya terhapus pada malam berikutnya dan menyimpannya 30 hari lagi", { exact: false })).toBeVisible();
  await expect(page.getByText("biasanya hilang dari cadangan sekitar sebulan setelah hilang dari Miamus", { exact: false })).toBeVisible();
  await expect(page.getByText("hitungan sebulan itu dimulai setelah kami memeriksanya", { exact: false })).toBeVisible();
  await expect(page.getByText("Foto dicadangkan setiap malam ke salinan privat yang terenkripsi di Singapura", { exact: false })).toBeVisible();
});
