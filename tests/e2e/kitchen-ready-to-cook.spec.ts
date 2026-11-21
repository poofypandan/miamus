import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { freshSession, installStub } from "./stub-backend";

// Can we cook it? (D18, owner 20 Nov): "Ready to cook" or "Missing 1:
// Santan" on recipes, planned dishes and Menu hari ini, by the items'
// Enough / Running low / Out with Kitchen amounts off, and recipes and the
// menu there for every home. SHOTS_DIR set: the PR's screenshots too.

function day(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function item(id: string, name: string, status: "ok" | "low" | "out", over: Record<string, unknown> = {}) {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    scope: "home",
    name,
    category: "fresh_food",
    quantity: 0,
    unit: "pcs",
    min_threshold: 0,
    photo_url: null,
    created_at: "2026-10-01T00:00:00Z",
    variant: null,
    audit_frequency_days: 30,
    last_audited_at: null,
    notes: null,
    stock_status: status,
    stock_status_at: null,
    stock_status_by: null,
    track_amount: false,
    amount_set_at: null,
    amount_set_by: null,
    last_bought_amount: null,
    to_buy_amount: null,
    ...over,
  };
}

const ayam = item("00000000-0000-4000-8000-000000180001", "Ayam", "ok");
const santan = item("00000000-0000-4000-8000-000000180002", "Santan", "out", { category: "pantry" });
const bawang = item("00000000-0000-4000-8000-000000180003", "Bawang putih", "ok", { category: "pantry" });

const OPOR = "00000000-0000-4000-8000-000000180101";
const NASI = "00000000-0000-4000-8000-000000180102";

let lineSeq = 0;
function line(recipe: string, fields: Record<string, unknown>) {
  lineSeq += 1;
  return {
    id: `00000000-0000-4000-8000-0000001802${String(lineSeq).padStart(2, "0")}`,
    household_id: HOUSEHOLD_ID,
    recipe_id: recipe,
    item_id: null,
    name_id: null,
    amount: null,
    unit: null,
    position: lineSeq,
    ...fields,
  };
}

function recipe(id: string, name: string, ingredients: ReturnType<typeof line>[]) {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    name,
    servings: 4,
    steps: null,
    written_in: "id",
    name_id: null,
    steps_id: null,
    created_by: null,
    created_at: "2026-11-11T00:00:00Z",
    updated_at: "2026-11-11T00:00:00Z",
    ingredients,
  };
}

const opor = recipe(OPOR, "Opor ayam", [
  line(OPOR, { item_id: ayam.id, name: "Ayam", amount: 1, unit: "kg" }),
  line(OPOR, { item_id: santan.id, name: "Santan", amount: 400, unit: "ml" }),
  line(OPOR, { name: "Serai", amount: 2, unit: "batang" }),
]);
const nasiGoreng = recipe(NASI, "Nasi goreng", [line(NASI, { item_id: bawang.id, name: "Bawang putih", amount: 3, unit: "siung" })]);

function dish(dayOffset: number, meal: string, title: string, recipeId: string | null) {
  return {
    id: `00000000-0000-4000-8000-0000001803${String(dayOffset + 10).padStart(2, "0")}`,
    household_id: HOUSEHOLD_ID,
    day: day(dayOffset),
    meal,
    recipe_id: recipeId,
    title,
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
}

const items = [ayam, santan, bawang];
const recipes = [opor, nasiGoreng];
const menu = [dish(0, "dinner", "Opor ayam", OPOR), dish(1, "lunch", "Nasi goreng", NASI)];

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test("an owner sees what each dish is missing on the week, with Kitchen amounts off", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: false }, items, recipes, menu });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  const today = page.locator(`section[data-day="${day(0)}"]`);
  await expect(today.getByText("To buy: Santan")).toBeVisible({ timeout: 20_000 });
  // A later day says "now", so it isn't read as a promise for that day.
  await expect(page.locator(`section[data-day="${day(1)}"]`).getByText("Ready to cook now")).toBeVisible();
  await shot(page, "owner-en-week");

  await today.getByRole("button", { name: /Opor ayam/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("To buy: Santan")).toBeVisible();
  await expect(sheet.getByText("Not on your list: Serai")).toBeVisible();
  await shot(page, "owner-en-dish");
});

test("the Recipes pill puts what can be cooked now first, in the URL", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: false }, items, recipes });
  await page.goto("/dashboard?module=inventory&kitchen=menu&recipes=1");
  const rows = page.getByRole("button", { name: /Opor ayam|Nasi goreng/ });
  await expect(rows.first()).toContainText("Nasi goreng", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Opor ayam/ })).toContainText("To buy: Santan");
  await expect(page.getByRole("button", { name: /Nasi goreng/ })).toContainText("Ready to cook");
  // Alphabetical under All; only what is ready under Ready to cook now (Fable S3).
  await page.getByRole("tab", { name: "Ready to cook now" }).click();
  await expect(page).toHaveURL(/ready=1/);
  await expect(page.getByRole("button", { name: /Nasi goreng/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Opor ayam/ })).toHaveCount(0);
  await expect(page.getByText("1 more needs shopping first")).toBeVisible();
  await shot(page, "owner-en-recipes-ready");
});

test("amber Missing while something isn't on the shopping list yet (Kitchen amounts on, a short amount still Enough)", async ({ context, page }) => {
  const ayamCounted = { ...ayam, track_amount: true, unit: "kg", quantity: 0.3, stock_status: "ok" };
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [ayamCounted, santan, bawang], recipes, menu });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await expect(page.locator(`section[data-day="${day(0)}"]`).getByText("Missing 2: Ayam, Santan")).toBeVisible({ timeout: 20_000 });
  await page.locator(`section[data-day="${day(0)}"]`).getByRole("button", { name: /Opor ayam/ }).click();
  // The rows themselves are marked (Fable S4).
  await expect(page.getByRole("dialog").getByLabel("Missing")).toHaveCount(2);
  await shot(page, "owner-en-missing-amber");
});

test("in Bahasa Indonesia for an owner who chose it", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" }, features: { kitchen: false }, items, recipes, menu });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await expect(page.locator(`section[data-day="${day(0)}"]`).getByText("Perlu dibeli: Santan")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(`section[data-day="${day(1)}"]`).getByText("Bahan lengkap saat ini")).toBeVisible();
  await shot(page, "owner-id-week");
});

test("a staff phone sees what is missing on Menu hari ini, in Indonesian, with no prices", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: false }, items, recipes, menu });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await expect(card.getByText("Perlu dibeli: Santan")).toBeVisible({ timeout: 20_000 });
  await expect(card).not.toContainText(/Rp|Missing|Ready/);
  await shot(page, "staff-id-menu-today");
  await card.getByRole("button", { name: /Opor ayam/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Perlu dibeli: Santan")).toBeVisible();
  await expect(sheet.getByText("Belum ada di daftar: Serai")).toBeVisible();
  await shot(page, "staff-id-dish");
});

test("the tutorials: the owner's card on Menu and the staff tip, once", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: false }, items, recipes, menu, readyToCookTip: true });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  const card = page.getByRole("region", { name: "New: can we cook it?" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Recipes and the menu are now in every home's Kitchen");
  await shot(page, "owner-en-whats-new");
});

test("the staff tip, in Indonesian", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: false }, items, recipes, menu, readyToCookTip: true });
  await page.goto("/staff");
  const tip = page.getByRole("region", { name: "Baru: bahannya lengkap?" });
  await expect(tip).toBeVisible({ timeout: 20_000 });
  await expect(tip).toContainText("Kurang 1: santan");
  await shot(page, "staff-id-tip");
});

test("the staff tip on keeping the kitchen up to date: two short lines, in Indonesian, no prices", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: false }, items, recipes, menu, kitchenSyncTip: true });
  await page.goto("/staff");
  const tip = page.getByRole("region", { name: "Supaya stok selalu benar" });
  await expect(tip).toBeVisible({ timeout: 20_000 });
  await expect(tip).toContainText("Di Dapur → Belanja, ketuk barangnya.");
  await expect(tip).toContainText("Tekan Sudah dimasak di Menu hari ini.");
  await expect(tip).not.toContainText(/Rp|Missing|Kitchen/);
  await shot(page, "staff-id-kitchen-sync-tip");
});

test("after Sudah dimasak, one tap marks what ran out, and Batalkan puts it back (S2a)", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: false, food: true }, items, recipes, menu });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await card.getByRole("button", { name: /Opor ayam/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Sudah dimasak" }).click();
  const sheet = page.getByRole("dialog", { name: "Ada bahan yang habis?" });
  await expect(sheet).toBeVisible();
  // Ayam is Enough: asked. Santan is already Out and Serai isn't on a list: not asked.
  const ayam = sheet.getByRole("button", { name: /Ayam/ });
  await expect(ayam).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Santan|Serai/ })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Tidak ada" })).toBeVisible();
  await expect(sheet).not.toContainText(/Rp|Missing|Out\b/);

  const marked = page.waitForRequest((r) => r.url().includes("/inventory_items") && r.method() === "PATCH");
  await ayam.click();
  expect((await marked).postDataJSON()).toMatchObject({ stock_status: "out" });
  await expect(ayam).toHaveAttribute("aria-pressed", "true");
  await expect(ayam).toContainText("Habis");
  await shot(page, "staff-id-ran-out");

  await sheet.getByRole("button", { name: "Selesai" }).click();
  // Then the usual Ada sisa?, while Food at home is on.
  await page.getByRole("button", { name: "Tidak ada sisa" }).click();
  const putBack = page.waitForRequest((r) => r.url().includes("/inventory_items") && r.method() === "PATCH");
  await page.getByRole("button", { name: "Batalkan" }).click();
  expect((await putBack).postDataJSON()).toMatchObject({ stock_status: "ok" });
});

test("in English for an owner, and Nothing ran out just closes it (S2a)", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: false, food: false }, items, recipes, menu });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.locator(`section[data-day="${day(0)}"]`).getByRole("button", { name: /Opor ayam/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Cooked", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Anything run out?" });
  await expect(sheet.getByRole("button", { name: /Ayam/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Nothing ran out" })).toBeVisible();
  await shot(page, "owner-en-ran-out");
  await sheet.getByRole("button", { name: "Nothing ran out" }).click();
  await expect(sheet).toHaveCount(0);
});

