import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { freshSession, installStub } from "./stub-backend";

// Kitchen recipes (Phase 170 PR B, migrations/151): an owner writes an
// English recipe with its Indonesian version for staff, scales it, and a
// staff phone reads the Indonesian version, read only. SHOTS_DIR set: the
// PR's screenshots are saved there too.

const chicken = {
  id: "00000000-0000-4000-8000-000000151001",
  household_id: HOUSEHOLD_ID,
  scope: "home",
  name: "Chicken",
  category: "fresh_food",
  quantity: 1,
  unit: "kg",
  min_threshold: 0,
  photo_url: null,
  created_at: "2026-10-01T00:00:00Z",
  variant: null,
  audit_frequency_days: 30,
  last_audited_at: null,
  notes: null,
  stock_status: "ok",
  stock_status_at: null,
  stock_status_by: null,
  track_amount: true,
  amount_set_at: new Date().toISOString(),
  amount_set_by: null,
  last_bought_amount: null,
};

const RECIPE_ID = "00000000-0000-4000-8000-000000151101";

function soto(over: Record<string, unknown> = {}) {
  const line = (position: number, fields: Record<string, unknown>) => ({
    id: `00000000-0000-4000-8000-00000015120${position}`,
    household_id: HOUSEHOLD_ID,
    recipe_id: RECIPE_ID,
    item_id: null,
    name_id: null,
    amount: null,
    unit: null,
    position,
    ...fields,
  });
  return {
    id: RECIPE_ID,
    household_id: HOUSEHOLD_ID,
    name: "Chicken soto",
    servings: 4,
    steps: "Boil the chicken for 30 minutes.\nAdd the spices and the lime leaves.\nServe with rice.",
    written_in: "en",
    name_id: "Soto ayam",
    steps_id: "Rebus ayam 30 menit.\nMasukkan bumbu dan daun jeruk.\nSajikan dengan nasi.",
    created_by: null,
    created_at: "2026-11-11T00:00:00Z",
    updated_at: "2026-11-11T00:00:00Z",
    ingredients: [
      line(0, { item_id: chicken.id, name: "Chicken", amount: 1, unit: "kg" }),
      line(1, { name: "Lime leaves", name_id: "Daun jeruk", amount: 3, unit: "lembar" }),
      line(2, { name: "Sweet soy sauce", name_id: "Kecap manis", amount: 2, unit: "sdm" }),
      line(3, { name: "Salt", name_id: "Garam" }),
    ],
    ...over,
  };
}

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  // Let the splash fade and sheets finish sliding in.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

test("an owner writes an English recipe with its Indonesian version for staff, and scales it", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [chicken] });
  await page.goto("/dashboard?module=inventory");

  // D5: Food · Shopping · Menu, and Menu opens on the recipe box.
  await page.getByRole("tab", { name: "Menu" }).click({ timeout: 20_000 });
  await expect(page.getByText("No recipes yet")).toBeVisible();
  await page.getByRole("button", { name: "New recipe" }).click();

  await page.getByLabel("Name", { exact: true }).first().fill("Chicken soto");
  await expect(page.getByRole("button", { name: "English", pressed: true })).toBeVisible();
  // From the list, linked, with the item's unit to start.
  await page.getByLabel("Add an ingredient").fill("chick");
  await page.getByRole("button", { name: "Chicken", exact: true }).click();
  await page.getByLabel("Amount of Chicken").fill("1");
  await expect(page.getByLabel("Unit for Chicken")).toHaveValue("kg");
  // A free name, with a spoon unit (sdm: recipes only).
  await page.getByLabel("Add an ingredient").fill("Lime leaves");
  await page.getByLabel("Add an ingredient").press("Enter");
  await page.getByLabel("Amount of Lime leaves").fill("3");
  await page.getByLabel("Unit for Lime leaves").selectOption("lembar");
  // No amount: to taste.
  await page.getByLabel("Add an ingredient").fill("Salt");
  await page.getByLabel("Add an ingredient").press("Enter");
  await page.getByLabel(/^Steps/).fill("Boil the chicken.\nAdd the spices.");

  // The Indonesian version for staff (answer 4).
  await page.getByLabel("Name", { exact: true }).nth(1).fill("Soto ayam");
  await page.getByLabel("Lime leaves in Bahasa Indonesia").fill("Daun jeruk");
  await page.getByLabel("Salt in Bahasa Indonesia").fill("Garam");
  await page.locator("#recipe-steps-id").fill("Rebus ayam.\nMasukkan bumbu.");
  await page.getByRole("button", { name: "Save" }).click();

  await expect.poll(() => stub.recipes.length).toBe(1);
  expect(stub.recipes[0]).toMatchObject({ name: "Chicken soto", written_in: "en", name_id: "Soto ayam", servings: 4 });
  expect(stub.recipes[0].ingredients).toMatchObject([
    { item_id: chicken.id, name: "Chicken", amount: 1, unit: "kg" },
    { item_id: null, name: "Lime leaves", name_id: "Daun jeruk", amount: 3, unit: "lembar" },
    { item_id: null, name: "Salt", name_id: "Garam", amount: null, unit: null },
  ]);

  // Fully translated: no note on the list.
  const row = page.getByRole("button", { name: /Chicken soto/ });
  await expect(row).toContainText("4 servings · 3 ingredients");
  await expect(page.getByText("No Indonesian version yet")).toHaveCount(0);

  await row.click();
  await expect(page.getByRole("heading", { name: "Chicken soto" })).toBeVisible();
  await expect(page.getByText("1 kg", { exact: true })).toBeVisible();
  await expect(page.getByText("to taste")).toBeVisible();
  // Scaled to 6 servings: every amount follows (stored amounts don't).
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByRole("button", { name: "More servings" }).click();
  await expect(page.getByText("6 servings")).toBeVisible();
  await expect(page.getByText("1.5 kg", { exact: true })).toBeVisible();
  await expect(page.getByText("5 lembar", { exact: true })).toBeVisible(); // 4.5 → 5
  expect(stub.recipes[0].ingredients).toMatchObject([{ amount: 1 }, { amount: 3 }, { amount: null }]);

  // What the cook reads.
  await page.getByRole("tab", { name: "For staff" }).click();
  await expect(page.getByRole("heading", { name: "Soto ayam" })).toBeVisible();
  await expect(page.getByText("Daun jeruk")).toBeVisible();
  await expect(page.getByText("secukupnya")).toBeVisible();
  await expect(page.getByText("Rebus ayam.")).toBeVisible();
});

test("an English recipe without its Indonesian version: the owner is told, on the list and the recipe", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [chicken],
    recipes: [
      soto(),
      soto({ id: "00000000-0000-4000-8000-000000151102", name: "Beef rendang", name_id: null, steps_id: null, servings: 6, ingredients: [] }),
    ],
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  const rendang = page.getByRole("button", { name: /Beef rendang/ });
  await expect(rendang).toContainText("No Indonesian version yet", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Chicken soto/ })).not.toContainText("No Indonesian version yet");
  await shot(page, "owner-recipes-en");

  await page.getByRole("button", { name: /Chicken soto/ }).click();
  await expect(page.getByRole("heading", { name: "Chicken soto" })).toBeVisible();
  await shot(page, "owner-recipe-en");
  await page.keyboard.press("Escape");

  await rendang.click();
  // A gentle, non-blocking note (Codex P1, PR #98); the fields stay optional.
  await expect(page.getByText("Add the Indonesian version so your staff can cook from it.")).toBeVisible();
  await page.getByRole("button", { name: "Add Indonesian version" }).click();
  await expect(page.getByText("For staff, in Bahasa Indonesia")).toBeVisible();
  await shot(page, "owner-recipe-form-en");
});

test("the owner's recipe screens in Bahasa Indonesia", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" }, features: { kitchen: true }, items: [chicken], recipes: [soto()] });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await expect(page.getByRole("button", { name: "Resep baru" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Chicken soto/ })).toContainText("4 porsi · 4 bahan");
  await shot(page, "owner-recipes-id");
});

test("a staff phone reads the recipe in Bahasa Indonesia, read only, and scales it", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [chicken],
    recipes: [soto()],
  });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();
  await page.getByRole("tab", { name: "Menu" }).click({ timeout: 20_000 });

  const row = page.getByRole("button", { name: /Soto ayam/ });
  await expect(row).toContainText("4 porsi · 4 bahan", { timeout: 20_000 });
  // Read only: no New recipe, no English.
  await expect(page.getByRole("button", { name: /Resep baru|New recipe/ })).toHaveCount(0);
  await expect(page.getByText("Chicken soto")).toHaveCount(0);
  await shot(page, "staff-recipes");

  await row.click();
  await expect(page.getByRole("heading", { name: "Soto ayam" })).toBeVisible();
  await expect(page.getByText("Untuk", { exact: true })).toBeVisible();
  await expect(page.getByText("2 sdm", { exact: true })).toBeVisible();
  await expect(page.getByText("Kecap manis")).toBeVisible();
  await expect(page.getByText("Masukkan bumbu dan daun jeruk.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Ubah resep|Edit recipe/ })).toHaveCount(0);
  await expect(page.getByText(/Boil|Lime leaves|to taste/)).toHaveCount(0);
  await shot(page, "staff-recipe");

  await page.getByRole("button", { name: "Tambah porsi" }).click();
  await page.getByRole("button", { name: "Tambah porsi" }).click();
  await expect(page.getByText("6 porsi")).toBeVisible();
  await expect(page.getByText("1,5 kg", { exact: true })).toBeVisible();
  await expect(page.getByText("3 sdm", { exact: true })).toBeVisible();
});

test("an English recipe without Indonesian steps: staff see the ingredients and one Indonesian line, no English steps", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [chicken],
    recipes: [soto({ steps_id: null })],
  });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();
  await page.getByRole("tab", { name: "Menu" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /Soto ayam/ }).click({ timeout: 20_000 });

  await expect(page.getByRole("heading", { name: "Soto ayam" })).toBeVisible();
  await expect(page.getByText("Kecap manis")).toBeVisible();
  await expect(page.getByText("Cara membuat belum ada dalam Bahasa Indonesia.")).toBeVisible();
  await expect(page.getByText(/Boil the chicken|Add the spices|Serve with rice/)).toHaveCount(0);
});

test("the owner's staff preview of a recipe without Indonesian steps shows what staff see", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [chicken], recipes: [soto({ steps_id: null })] });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: /Chicken soto/ }).click({ timeout: 20_000 });
  await expect(page.getByText("Add the Indonesian version so your staff can cook from it.")).toBeVisible();
  await expect(page.getByText("Boil the chicken for 30 minutes.")).toBeVisible();
  await page.getByRole("tab", { name: "For staff" }).click();
  await expect(page.getByText("Cara membuat belum ada dalam Bahasa Indonesia.")).toBeVisible();
  await expect(page.getByText("Boil the chicken for 30 minutes.")).toHaveCount(0);
});

test("Kitchen switched off: no Menu pill, and a Menu link opens Food", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: false }, recipes: [soto()] });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await expect(page.getByRole("tab", { name: "Food" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("tab", { name: "Menu" })).toHaveCount(0);
  await expect(page.getByText("Chicken soto")).toHaveCount(0);
});
