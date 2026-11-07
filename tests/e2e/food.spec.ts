import { expect, test } from "@playwright/test";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Phase 156: food at home, by hand, on a staff phone (Bahasa Indonesia).
// Add a food, see it in the right group, mark it eaten, undo.

test("a staff phone adds food, marks it eaten, and can undo", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff?view=stok");

  // Dapur opens on Makanan, with the shared pill.
  await expect(page.getByRole("tab", { name: "Dapur" })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  await expect(page.getByRole("tab", { name: "Makanan" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Belum ada makanan")).toBeVisible();

  await page.getByRole("button", { name: "Tambah makanan" }).click();
  await page.getByLabel("Makanan apa?").fill("Lapis legit");
  await page.getByRole("button", { name: "Meja" }).click();
  await page.getByRole("button", { name: "Besok" }).click();
  await page.getByRole("button", { name: "Dari siapa, catatan" }).click();
  await page.getByLabel(/Dari siapa/).fill("Tante Rina");
  await page.getByRole("checkbox", { name: "Wadahnya perlu dikembalikan" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();

  // Saved with who added it, in "Minggu ini" (tomorrow).
  await expect(page.getByRole("heading", { name: "Minggu ini" })).toBeVisible();
  const row = page.getByRole("button", { name: /Lapis legit/ });
  await expect(row).toContainText("Meja · dari Tante Rina");
  await expect(row).toContainText("Besok");
  expect(stub.foods[0]).toMatchObject({
    name: "Lapis legit",
    kept_in: "counter",
    from_whom: "Tante Rina",
    return_container: true,
    added_by: STAFF_ID,
  });

  // Staff finish food but never delete it.
  await row.click();
  await expect(page.getByText("Sudah habis?")).toBeVisible();
  await expect(page.getByText("Hapus — salah tambah")).toHaveCount(0);
  await page.getByRole("button", { name: "Dimakan" }).click();

  // Off the list; the container reminder takes its place.
  await expect(page.getByText("Kembalikan wadah ke Tante Rina")).toBeVisible();
  await expect(page.getByRole("button", { name: /Lapis legit/ })).toHaveCount(0);
  expect(stub.foods[0]).toMatchObject({ outcome: "eaten", finished_by: STAFF_ID });

  // Undo puts it back.
  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect(page.getByRole("button", { name: /Lapis legit/ })).toBeVisible();
  await expect.poll(() => stub.foods[0].outcome).toBeNull();

  // Belanja is the shopping list, one tap away, and stays in the URL.
  await page.getByRole("tab", { name: "Belanja" }).click();
  await expect(page).toHaveURL(/kitchen=buy/);
  await expect(page.getByText("Ketuk barang yang hampir habis atau sudah habis.")).toBeVisible();
  expect(stub.seen.realBackend).toEqual([]);
});
