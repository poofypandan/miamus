import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { freshSession, installStub } from "./stub-backend";

// Phase 177 PR 5: the What's new card on Kitchen → Menu (owner, EN and ID)
// and the staff tip on Today (Indonesian, once Today has a menu), only while
// the Kitchen switch is on. SHOTS_DIR set: the PR's screenshots are saved there too.

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

const OWNER_EN = "New: change what cooking used";
const STAFF_ID = "Baru: ubah bahan yang dipakai";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const dish = {
  id: "00000000-0000-4000-8000-000000177501",
  household_id: HOUSEHOLD_ID,
  day: today(),
  meal: "lunch",
  recipe_id: null,
  title: "Nasi goreng",
  servings: null,
  notes: null,
  position: 0,
  cooked_at: null,
  cooked_by: null,
  cooked_uses: null,
  created_by: null,
  created_at: "2026-11-10T00:00:00Z",
  updated_at: "2026-11-10T00:00:00Z",
};

test("owners see the card on Kitchen → Menu once, in English", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: true } });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  const card = page.getByRole("region", { name: OWNER_EN });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("tap Change what was used");
  await expect(card).toContainText("only the difference comes off or goes back");
  await expect(card).toContainText("Update recipe saves the new amount");
  await shot(page, "owner-en-whats-new");
  // One card a week: the older menu card waits.
  await expect(page.getByRole("region", { name: "New: the week's menu" })).toHaveCount(0);
  await card.getByRole("button", { name: "Got it" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: OWNER_EN })).toHaveCount(0);
});

test("in Bahasa Indonesia for an owner who chose it", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" }, features: { kitchen: true } });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  const card = page.getByRole("region", { name: STAFF_ID });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("ketuk Ubah bahan yang dipakai");
  await expect(card).toContainText("Perbarui resep menyimpan jumlah yang baru");
  await shot(page, "owner-id-whats-new");
});

test("staff get the tip on Today once there is a menu, in Indonesian", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: true }, menu: [dish] });
  await page.goto("/staff");
  const tip = page.getByRole("region", { name: STAFF_ID });
  await expect(tip).toBeVisible({ timeout: 20_000 });
  await expect(tip).toContainText("lalu ketuk Ubah bahan yang dipakai");
  await expect(tip).toContainText("lalu tekan Simpan perubahan");
  await shot(page, "staff-id-tip");
});

test("staff with the Kitchen switch off never get it", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: false }, menu: [dish] });
  await page.goto("/staff");
  await expect(page.getByRole("region", { name: "Baru: Kirim masukan" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: STAFF_ID })).toHaveCount(0);
});
