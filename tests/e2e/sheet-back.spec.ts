import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub, type Stub } from "./stub-backend";

// Sheets and the Back button (useBackToClose). Closing a sheet by Escape, X
// or backdrop removes its history entry with history.back(), which lands a
// moment later. A sheet opened in that moment used to be closed by the late
// pop as if Back had been pressed (found 2026-11-07 on Dapur → Makanan).

function seedFood(stub: Stub, name: string) {
  const now = new Date().toISOString();
  stub.foods.push({
    id: `00000000-0000-4000-8000-${String(stub.foods.length + 1).padStart(12, "0")}`,
    household_id: HOUSEHOLD_ID,
    name,
    photo_url: null,
    kept_in: "fridge",
    expires_on: null,
    expiry_unknown: false,
    source: "home",
    from_whom: null,
    return_container: false,
    container_returned_at: null,
    notes: null,
    added_by: STAFF_ID,
    created_by: STAFF_ID,
    outcome: null,
    finished_at: null,
    finished_by: null,
    created_at: now,
    updated_at: now,
  });
}

/** The staff view, then Dapur: two entries in history before any sheet. */
async function openDapur(page: Page) {
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/view=stok/);
  await expect(page.getByRole("tab", { name: "Makanan" })).toHaveAttribute("aria-selected", "true");
}

const addSheet = (page: Page) => page.getByRole("dialog", { name: "Tambah makanan" });
const detailSheet = (page: Page) => page.getByRole("dialog").filter({ hasText: "Sudah habis?" });

// Longer than any self-caused pop takes, and than the hook's own 1s fallback.
const SETTLED_MS = 1500;

test("a sheet opened the moment another closes stays open", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  seedFood(stub, "Sayur asem");
  await openDapur(page);

  await page.getByRole("button", { name: /Sayur asem/ }).click();
  await expect(detailSheet(page)).toBeVisible();

  // Escape, then "Tambah makanan" in the same task, so the detail sheet's
  // history.back() cannot have landed yet. (A Playwright click would wait for
  // the closing sheet's overlay to clear and might miss the window.)
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const add = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Tambah makanan"));
    if (!add) throw new Error("no Tambah makanan button");
    add.click();
  });

  await expect(addSheet(page)).toBeVisible();
  await page.waitForTimeout(SETTLED_MS);
  await expect(addSheet(page)).toBeVisible();
  await expect(detailSheet(page)).toHaveCount(0);

  // History is as if the two had opened seconds apart: Back closes the add
  // sheet and stays on Dapur...
  await page.goBack();
  await expect(addSheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/view=stok/);
  await expect(page.getByRole("button", { name: /Sayur asem/ })).toBeVisible();

  // ...and the next Back leaves Dapur at once: no dead entry from the
  // detail sheet is left to swallow it.
  await page.goBack();
  await expect(page).not.toHaveURL(/view=stok/);
  expect(stub.seen.realBackend).toEqual([]);
});

test("Back closes only the sheet on top, never the page beneath", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  seedFood(stub, "Lapis legit");
  await page.goto("/staff");

  // Lapor → Makanan masuk hands one sheet straight to the next (Tugas); the
  // food sheet stays, and Back closes it alone.
  await page.getByRole("button", { name: "Lapor" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /Makanan masuk/ }).click();
  await expect(addSheet(page)).toBeVisible();
  await page.waitForTimeout(SETTLED_MS);
  await expect(addSheet(page)).toBeVisible();
  await page.goBack();
  await expect(addSheet(page)).toHaveCount(0);
  await expect(page.getByText("Laporan & Usulan")).toHaveCount(0);
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("button", { name: "Lapor" })).toBeVisible();

  // On Dapur, Back closes the detail sheet and nothing else.
  await page.getByRole("tab", { name: "Dapur" }).click();
  await expect(page).toHaveURL(/view=stok/);
  await page.getByRole("button", { name: /Lapis legit/ }).click();
  await expect(detailSheet(page)).toBeVisible();
  await page.goBack();
  await expect(detailSheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/view=stok/);
  await expect(page.getByRole("button", { name: /Lapis legit/ })).toBeVisible();

  // With every sheet closed, Back is the page's own again.
  await page.goBack();
  await expect(page).not.toHaveURL(/view=stok/);
  await expect(page.getByRole("button", { name: "Lapor" })).toBeVisible();
  expect(stub.seen.realBackend).toEqual([]);
});
