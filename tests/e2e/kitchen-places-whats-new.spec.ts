import { expect, test } from "@playwright/test";
import { freshSession, installStub } from "./stub-backend";

// Phase 176 PR 5: the What's new card on Kitchen → Food (owner, EN and ID)
// and the staff tip on Today (Indonesian), only while Ingredients shows.

const OWNER_EN = "New: where ingredients are kept";
const OWNER_ID = "Baru: tempat simpan bahan masakan";

test("owners see the card on Kitchen → Food once, in their language", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: true } });
  await page.goto("/dashboard?module=inventory");
  const card = page.getByRole("region", { name: OWNER_EN });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Use soon, on top, shows what expires within a week.");
  await expect(card).toContainText("with Open it");
  // One card a week: the older Kitchen amounts card waits.
  await expect(page.getByRole("region", { name: "New: exact amounts in Kitchen" })).toHaveCount(0);
  await card.getByRole("button", { name: "Got it" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ingredients", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: OWNER_EN })).toHaveCount(0);
});

test("in Bahasa Indonesia for an owner who chose it", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" }, features: { kitchen: true } });
  await page.goto("/dashboard?module=inventory");
  const card = page.getByRole("region", { name: OWNER_ID });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Segera dipakai, di paling atas");
  await expect(card).toContainText("dengan tombol Buka");
});

test("Kitchen amounts off: no card", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: false } });
  await page.goto("/dashboard?module=inventory");
  await expect(page.getByRole("button", { name: "Add food" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: OWNER_EN })).toHaveCount(0);
});

test("staff get the tip on Today, in Indonesian, while Bahan masakan shows", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: true } });
  await page.goto("/staff");
  const tip = page.getByRole("region", { name: OWNER_ID });
  await expect(tip).toBeVisible({ timeout: 20_000 });
  await expect(tip).toContainText("Ketuk bahannya, lalu ketuk tempat barunya.");
  // Only Dapur → Makanan has the Buka button; Lapor → Makanan masuk has none.
  await expect(tip).toContainText(
    "Di Dapur → Makanan, kalau makanan yang ditambahkan sudah ada di Bahan masakan, ketuk Buka untuk mencatatnya di sana."
  );
});

test("staff without Kitchen amounts never get it", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: false } });
  await page.goto("/staff");
  await expect(page.getByRole("region", { name: "Baru: Kirim masukan" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: OWNER_ID })).toHaveCount(0);
});
