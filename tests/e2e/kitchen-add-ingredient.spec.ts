import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { freshSession, installStub } from "./stub-backend";

// Phase 176 PR 3 (docs/phase-176-kitchen-places-plan.md, 5c and 5d): Add
// ingredient asks where it is kept, when it expires and how much, with one-
// tap defaults and nothing new required; and both add sheets say when the
// name is already in Ingredients, with Open it, without stopping Save.

// The browser runs in Asia/Jakarta (playwright.config.ts).
function jakartaDay(offset = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

const chicken = {
  id: "00000000-0000-4000-8000-000000177001",
  household_id: HOUSEHOLD_ID,
  scope: "home",
  name: "Dada Ayam",
  category: "fresh_food",
  quantity: 6,
  unit: "pcs",
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
  kept_in: "freezer",
  expires_on: null,
};

async function openAddIngredient(page: Page) {
  await page.goto("/dashboard?module=inventory");
  const ingredients = page.getByRole("region", { name: "Ingredients" });
  await ingredients.getByRole("button", { name: "Add ingredient" }).click({ timeout: 20_000 });
  const form = page.getByRole("dialog", { name: "Add item" });
  await expect(form).toBeVisible();
  return { ingredients, form };
}

test("add an ingredient with a place, a date and an amount in one sheet", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [chicken] });
  const { ingredients, form } = await openAddIngredient(page);

  // The place starts on the category's default and follows it until tapped.
  await expect(form.getByRole("button", { name: "Fridge" })).toHaveAttribute("aria-pressed", "true");
  await form.getByRole("button", { name: "Pantry" }).click();
  await expect(form.getByRole("button", { name: "Cupboard" })).toHaveAttribute("aria-pressed", "true");
  await form.getByRole("button", { name: "Fresh Food" }).click();
  await form.getByRole("button", { name: "Freezer" }).click();
  await form.getByRole("button", { name: "Pantry" }).click();
  await expect(form.getByRole("button", { name: "Freezer" })).toHaveAttribute("aria-pressed", "true");
  await form.getByRole("button", { name: "Fresh Food" }).click();

  // The date starts on No date.
  await expect(form.getByRole("button", { name: "No date" })).toHaveAttribute("aria-pressed", "true");
  await form.getByRole("button", { name: "Tomorrow" }).click();
  await form.getByLabel("Name").fill("Daging giling");
  await form.getByLabel("Amount (optional)").fill("2");
  await form.getByRole("button", { name: "Add item" }).click();

  await expect.poll(() => stub.supplies.length).toBe(2);
  await expect.poll(() => stub.supplies[1].track_amount).toBe(true);
  expect(stub.supplies[1]).toMatchObject({
    name: "Daging giling",
    category: "fresh_food",
    kept_in: "freezer",
    expires_on: jakartaDay(1),
    quantity: 2,
    unit: "pcs",
  });
  const row = ingredients.getByRole("group", { name: "Use soon" }).getByRole("button", { name: /Daging giling/ });
  await expect(row).toContainText("Freezer · Expires tomorrow");
  await expect(row).toContainText("2 pcs left");
});

test("nothing tapped: saved as before, no place stored, no date, not tracked", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [chicken] });
  const { ingredients, form } = await openAddIngredient(page);
  await form.getByLabel("Name").fill("Tomat");
  await form.getByRole("button", { name: "Add item" }).click();

  await expect.poll(() => stub.supplies.length).toBe(2);
  expect(stub.supplies[1]).toMatchObject({ name: "Tomat", kept_in: null, expires_on: null });
  expect(stub.supplies[1].track_amount ?? false).toBe(false);
  await expect(ingredients.getByRole("group", { name: "Fridge" }).getByRole("button", { name: /Tomat/ })).toBeVisible();
});

test("Household Supplies and Shopping show the form as before", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [chicken] });
  const { form } = await openAddIngredient(page);
  await form.getByRole("button", { name: "Household Supplies" }).click();
  await expect(form.getByText("Where is it kept?")).toHaveCount(0);
  await expect(form.getByLabel("Amount (optional)")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Shopping" }).click();
  await page.getByRole("button", { name: "Add item" }).click();
  const shopping = page.getByRole("dialog", { name: "Add item" });
  await expect(shopping.getByLabel("Name")).toBeVisible();
  await expect(shopping.getByText("Where is it kept?")).toHaveCount(0);
  await expect(shopping.getByLabel("Amount (optional)")).toHaveCount(0);
  await shopping.getByLabel("Name").fill("Dada Ayam");
  await expect(shopping.getByText("is already in Ingredients")).toHaveCount(0);
});

test("editing an ingredient shows its place and date, and sends only what changed", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [chicken] });
  await page.goto("/dashboard?module=inventory");
  const ingredients = page.getByRole("region", { name: "Ingredients" });
  await ingredients.getByRole("button", { name: /Dada Ayam/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Edit item" }).click();
  const form = page.getByRole("dialog", { name: "Edit item" });
  await expect(form.getByRole("button", { name: "Freezer" })).toHaveAttribute("aria-pressed", "true");
  // Amount stays in Track amount when editing.
  await expect(form.getByLabel("Amount (optional)")).toHaveCount(0);

  const patches: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && request.url().includes("/inventory_items")) patches.push(request.postDataJSON());
  });
  await form.getByRole("button", { name: "3 days" }).click();
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => stub.supplies[0].expires_on).toBe(jakartaDay(3));
  expect(stub.supplies[0].kept_in).toBe("freezer");
  expect(patches.at(-1)).toHaveProperty("expires_on", jakartaDay(3));
  expect(patches.at(-1)).not.toHaveProperty("kept_in");
});

test("Add ingredient: an exact name already there says so, Open it opens it, and Save still works", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [chicken] });
  const { form } = await openAddIngredient(page);

  // A near match says nothing.
  await form.getByLabel("Name").fill("Ayam");
  await expect(form.getByText("is already in Ingredients")).toHaveCount(0);
  await form.getByLabel("Name").fill("  dada   AYAM ");
  await expect(form.getByText("Dada Ayam is already in Ingredients.")).toBeVisible();
  await form.getByRole("button", { name: "Open it" }).click();

  await expect(page.getByRole("dialog", { name: "Add item" })).toHaveCount(0);
  const sheet = page.getByRole("dialog", { name: "Dada Ayam" });
  await expect(sheet.getByText("Fresh Food · Freezer")).toBeVisible();
  await page.keyboard.press("Escape");

  // Not a hard stop: two packs under one name are sometimes wanted.
  const again = await openAddIngredient(page);
  await again.form.getByLabel("Name").fill("Dada Ayam");
  await again.form.getByRole("button", { name: "Add item" }).click();
  await expect.poll(() => stub.supplies.length).toBe(2);
});

test("Add ready-to-eat food: the name is in Ingredients, Open it there", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [chicken] });
  await page.goto("/dashboard?module=inventory");
  await page.getByRole("button", { name: "Add ready-to-eat food" }).click({ timeout: 20_000 });
  const form = page.getByRole("dialog", { name: "Add food" });
  await form.getByLabel(/What is it\?/).fill("dada ayam");
  await expect(
    form.getByText("Dada Ayam is in Ingredients. Open it there to say where it is or when it expires.")
  ).toBeVisible();
  await form.getByRole("button", { name: "Open it" }).click();
  await expect(page.getByRole("dialog", { name: "Add food" })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Dada Ayam" }).getByRole("button", { name: "Freezer" })).toBeVisible();
  expect(stub.foods).toHaveLength(0);
});

test("staff: the line in Indonesian, Buka in Dapur, no button in Lapor's Makanan masuk", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: true }, items: [chicken] });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();
  await page.getByRole("button", { name: "Tambah makanan siap dimakan" }).click({ timeout: 20_000 });
  await page.getByLabel(/Makanan apa\?/).fill("Dada Ayam");
  const line = "Dada Ayam ada di Bahan masakan. Buka di sana untuk mencatat tempat atau tanggal kedaluwarsanya.";
  await expect(page.getByText(line)).toBeVisible();
  await page.getByRole("button", { name: "Buka", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Dada Ayam" }).getByText("Disimpan di mana?")).toBeVisible();
  await page.keyboard.press("Escape");

  // Lapor → Makanan masuk: no list on the page, so the line without a button;
  // saving still works.
  await page.getByRole("tab", { name: "Tugas Hari Ini" }).click();
  await page.getByRole("button", { name: "Lapor" }).click();
  await page.getByRole("button", { name: /Makanan masuk/ }).click();
  await page.getByLabel(/Makanan apa\?/).fill("dada ayam");
  await expect(page.getByText(line)).toBeVisible();
  await expect(page.getByRole("button", { name: "Buka", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(() => stub.foods.length).toBe(1);
});

test("Kitchen amounts off: the food sheet says nothing about Ingredients", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: false }, items: [chicken] });
  await page.goto("/dashboard?module=inventory");
  await page.getByRole("button", { name: "Add food" }).click({ timeout: 20_000 });
  await page.getByLabel(/What is it\?/).fill("Dada Ayam");
  await expect(page.getByText("is in Ingredients")).toHaveCount(0);
});
