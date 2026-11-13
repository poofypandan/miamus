import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { freshSession, installStub } from "./stub-backend";

// Recipes that learn (Phase 177 PR 3; docs/phase-177-cooking-corrections-plan.md
// section 4): three dishes in a row used about a fifth more beef than the
// recipe says, so the owner is offered, once, to update the recipe's amount,
// on Kitchen → Menu and on the recipe itself. Staff never see it.
// SHOTS_DIR set: the PR's screenshots are saved there too.

function day(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function item(id: string, name: string, quantity: number, unit: string, over: Record<string, unknown> = {}) {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    scope: "home",
    name,
    category: "fresh_food",
    quantity,
    unit,
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
    to_buy_amount: null,
    expires_on: null,
    kept_in: null,
    ...over,
  };
}

const beef = item("00000000-0000-4000-8000-000000177301", "Daging sapi", 2, "kg");
const santan = item("00000000-0000-4000-8000-000000177302", "Santan", 1000, "ml", { category: "pantry" });
const RENDANG = "00000000-0000-4000-8000-000000177311";

function line(position: number, fields: Record<string, unknown>) {
  return {
    id: `00000000-0000-4000-8000-00000017732${position}`,
    household_id: HOUSEHOLD_ID,
    recipe_id: RENDANG,
    item_id: null,
    name_id: null,
    amount: null,
    unit: null,
    position,
    ...fields,
  };
}

const rendang = {
  id: RENDANG,
  household_id: HOUSEHOLD_ID,
  name: "Rendang",
  servings: 4,
  steps: "Tumis daging.\nMasak dengan santan 3 jam.",
  written_in: "id",
  name_id: null,
  steps_id: null,
  hints_off: [],
  created_by: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ingredients: [
    line(0, { item_id: beef.id, name: "Daging sapi", amount: 500, unit: "g" }),
    line(1, { item_id: santan.id, name: "Santan", amount: 400, unit: "ml" }),
  ],
};

let seq = 0;
/** A rendang cooked `daysAgo` days ago with about a fifth more beef than the recipe asked. */
function cookedRendang(daysAgo: number, beefSaid: number) {
  seq += 1;
  const at = new Date();
  at.setDate(at.getDate() - daysAgo);
  return {
    id: `00000000-0000-4000-8000-0000001779${String(50 + seq)}`,
    household_id: HOUSEHOLD_ID,
    day: day(-daysAgo),
    meal: "dinner",
    recipe_id: RENDANG,
    title: "Rendang",
    servings: 4,
    notes: null,
    position: 0,
    cooked_at: at.toISOString(),
    cooked_by: null,
    cooked_uses: [
      { item_id: beef.id, amount: beefSaid, unit: "kg", said: beefSaid, planned: 0.5 },
      { item_id: santan.id, amount: 400, unit: "ml", said: 400, planned: 400 },
    ],
    created_by: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: at.toISOString(),
  };
}

const threeMore = () => [cookedRendang(1, 0.6), cookedRendang(8, 0.62), cookedRendang(15, 0.58)];

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

async function openMenu(page: Page) {
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await expect(page.getByRole("heading", { name: /This week|Minggu ini/ })).toBeVisible({ timeout: 20_000 });
  const gotIt = page.getByRole("button", { name: /^(Got it|Mengerti)$/ });
  if (await gotIt.isVisible()) await gotIt.click();
}

const amountOf = (recipes: Record<string, unknown>[]) =>
  ((recipes.find((r) => r.id === RENDANG)?.ingredients as Record<string, unknown>[]) ?? [])[0]?.amount;

test("three cooks at a fifth more beef: the card on Menu and on the recipe; Update recipe changes the amount and the card goes", async ({ context, page }) => {
  const recipes = [structuredClone(rendang)];
  await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [beef, santan],
    recipes,
    menu: threeMore(),
  });
  await openMenu(page);
  const card = page.getByRole("region", { name: "Suggestion for Rendang" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("The last 3 times, this used a different amount than the recipe says.");
  await expect(card).toContainText("Daging sapi");
  await expect(card).toContainText("recipe 500 g · used about 600 g");
  // Santan was used as the recipe says: not on the card.
  await expect(card).not.toContainText("Santan");
  await shot(page, "owner-en-1-menu-card");

  // The same card on the recipe's own sheet.
  await page.goto("/dashboard?module=inventory&kitchen=menu&recipes=1");
  await page.getByRole("button", { name: /Rendang/ }).first().click({ timeout: 20_000 });
  const onRecipe = page.getByRole("dialog").getByRole("region", { name: "Suggestion for Rendang" });
  await expect(onRecipe).toBeVisible();
  await shot(page, "owner-en-2-recipe-card");
  await onRecipe.getByRole("button", { name: "Update recipe" }).click();
  await expect(page.getByText("Rendang updated")).toBeVisible();
  await expect.poll(() => amountOf(recipes)).toBe(600);
  // Saving the recipe starts the count again: no card.
  await expect(page.getByRole("region", { name: "Suggestion for Rendang" })).toHaveCount(0);
  await expect(page.getByRole("dialog").getByText("600 g", { exact: true })).toBeVisible();
  // Undo saves the old amount back. (A toast's button can't be tapped through
  // an open sheet in this app, so the sheet is closed first; the toast stays.)
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => amountOf(recipes)).toBe(500);
});

test("Keep recipe: the card goes and never comes back for that ingredient", async ({ context, page }) => {
  const recipes = [structuredClone(rendang)];
  await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [beef, santan],
    recipes,
    menu: threeMore(),
  });
  await openMenu(page);
  const card = page.getByRole("region", { name: "Suggestion for Rendang" });
  await card.getByRole("button", { name: "Keep recipe" }).click();
  await expect(page.getByText("Recipe kept. Miamus won't suggest this again.")).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(recipes[0].hints_off).toEqual([beef.id]);
  expect((recipes[0].ingredients as Record<string, unknown>[])[0].amount).toBe(500);
  await openMenu(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Suggestion for Rendang" })).toHaveCount(0);
});

test("two cooks are not enough, and a mixed third breaks it: no card", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [beef, santan],
    recipes: [structuredClone(rendang)],
    menu: [cookedRendang(1, 0.6), cookedRendang(8, 0.4), cookedRendang(15, 0.6)],
  });
  await openMenu(page);
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByRole("region", { name: "Suggestion for Rendang" })).toHaveCount(0);
});

test("the owner's card in Bahasa Indonesia", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "id" },
    features: { kitchen: true },
    items: [beef, santan],
    recipes: [structuredClone(rendang)],
    menu: threeMore(),
  });
  await openMenu(page);
  const card = page.getByRole("region", { name: "Saran untuk Rendang" });
  await expect(card).toContainText("3 kali terakhir, jumlah yang dipakai berbeda dari resepnya.");
  await expect(card).toContainText("resep 500 g · dipakai sekitar 600 g");
  await expect(card.getByRole("button", { name: "Perbarui resep" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Biarkan resep" })).toBeVisible();
  await shot(page, "owner-id-1-menu-card");
});

test("staff never see the card: not on Menu hari ini, not on the recipe", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [beef, santan],
    recipes: [structuredClone(rendang)],
    menu: [...threeMore(), { ...cookedRendang(0, 0.6), cooked_at: null, cooked_uses: null }],
  });
  await page.goto("/staff");
  const today = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await today.getByRole("button", { name: /Rendang/ }).click({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Rendang" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sudah dimasak" })).toBeVisible();
  await expect(page.getByText(/Saran untuk|Suggestion for|3 kali terakhir|Perbarui resep/)).toHaveCount(0);
  await shot(page, "staff-id-1-dish-no-card");
});
