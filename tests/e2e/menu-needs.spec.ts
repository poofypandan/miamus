import { expect, test, type Locator, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { freshSession, installStub } from "./stub-backend";

// For the menu (the owner's wish list, step 1, 21 Nov): on Kitchen →
// Shopping, what the dishes planned for the coming week still need, derived
// from the menu and never stored until someone adds it. A thing with no item
// has a dashed outline and says so in words; Add makes it a real item marked
// Out (on To buy), with Undo; Add all does a whole dish. Staff read it in
// Bahasa Indonesia, with no Add.
// SHOTS_DIR set: the PR's screenshots are saved there too.

function day(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function item(id: string, name: string, over: Record<string, unknown> = {}) {
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
    stock_status: "ok",
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

const ayam = item("00000000-0000-4000-8000-000000183001", "Ayam");
const santan = item("00000000-0000-4000-8000-000000183002", "Santan", { stock_status: "out" });
const bihun = item("00000000-0000-4000-8000-000000183003", "Bihun", { stock_status: "low" });

const RENDANG = "00000000-0000-4000-8000-000000183101";
const SOTO = "00000000-0000-4000-8000-000000183102";

let lineSeq = 0;
function line(recipeId: string, fields: Record<string, unknown>) {
  lineSeq += 1;
  return {
    id: `00000000-0000-4000-8000-0000001832${String(lineSeq).padStart(2, "0")}`,
    household_id: HOUSEHOLD_ID,
    recipe_id: recipeId,
    item_id: null,
    name_id: null,
    amount: null,
    unit: null,
    position: lineSeq,
    ...fields,
  };
}

function recipe(id: string, name: string, ingredients: Record<string, unknown>[]) {
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

const rendang = recipe(RENDANG, "Rendang", [
  line(RENDANG, { item_id: ayam.id, name: "Ayam" }),
  line(RENDANG, { item_id: santan.id, name: "Santan" }),
  line(RENDANG, { name: "Serai" }),
  line(RENDANG, { name: "Daun salam" }),
  line(RENDANG, { name: "Garam" }),
]);
const soto = recipe(SOTO, "Soto ayam", [line(SOTO, { name: "Serai" }), line(SOTO, { item_id: bihun.id, name: "Bihun" })]);

function dish(id: string, offset: number, recipeId: string, title: string, over: Record<string, unknown> = {}) {
  return {
    id,
    household_id: HOUSEHOLD_ID,
    day: day(offset),
    meal: "dinner",
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
    ...over,
  };
}

const menu = [
  dish("00000000-0000-4000-8000-000000183201", 2, RENDANG, "Rendang"),
  dish("00000000-0000-4000-8000-000000183202", 3, SOTO, "Soto ayam"),
  // Cooked, or past: needs nothing.
  dish("00000000-0000-4000-8000-000000183203", 0, SOTO, "Soto ayam", { cooked_at: new Date().toISOString() }),
  dish("00000000-0000-4000-8000-000000183204", -1, RENDANG, "Rendang"),
];

/** The tile whose name is exactly this ("Ayam", not the "Soto ayam" in a Needed for line). */
function row(section: Locator, name: string) {
  return section.locator("li").filter({ has: section.page().getByText(name, { exact: true }) });
}

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test("For the menu: what the coming dishes need, a dashed tile in words, Add with Undo, Add all", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: false },
    items: [ayam, santan, bihun],
    recipes: [rendang, soto],
    menu,
  });
  await page.goto("/dashboard?module=inventory&kitchen=buy");
  const section = page.getByTestId("menu-needs");
  await expect(section).toBeVisible({ timeout: 20_000 });
  await expect(section.getByRole("heading", { name: /For the menu/ })).toBeVisible();

  const serai = row(section, "Serai");
  await expect(serai).toHaveAttribute("data-kind", "not_there");
  await expect(serai).toContainText("Not on your list");
  await expect(serai).toContainText(/Needed for Rendang \(\w+\), Soto ayam \(\w+\)/);
  // Already on To buy: not repeated here, but its To buy row says what it is for.
  await expect(row(section, "Santan")).toHaveCount(0);
  await expect(row(section, "Bihun")).toHaveCount(0);
  await expect(section.getByRole("heading", { name: "For the menu (2)" })).toBeVisible();
  await expect(page.getByRole("region", { name: /To buy/ }).getByText(/^Needed for Rendang \(\w+\)$/)).toBeVisible();
  await expect(page.getByRole("region", { name: /To buy/ }).getByText(/^Needed for Soto ayam \(\w+\)$/)).toBeVisible();
  // Staples never; Ayam is there.
  await expect(row(section, "Garam")).toHaveCount(0);
  await expect(row(section, "Ayam")).toHaveCount(0);
  await shot(page, "menu-needs-owner");

  // One tap: a real item, marked Out, so it is on To buy; Undo takes it back off.
  await serai.getByRole("button", { name: "Add Serai to the shopping list" }).click();
  await expect.poll(() => stub.supplies.find((row) => row.name === "Serai")?.stock_status).toBe("out");
  // Now a real item, Out: on To buy, and gone from For the menu.
  await expect(row(section, "Serai")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bought Serai" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.supplies.some((row) => row.name === "Serai")).toBe(false);
  await expect(row(section, "Serai")).toHaveAttribute("data-kind", "not_there");

  // Add all for Rendang: Serai and Daun salam together.
  await section.getByRole("button", { name: "Add all for Rendang" }).click();
  await expect.poll(() => stub.supplies.filter((row) => ["Serai", "Daun salam"].includes(String(row.name))).length).toBe(2);
  await expect(section.getByRole("button", { name: "Add all for Rendang" })).toHaveCount(0);
});

test("a staff phone reads Untuk menu in Bahasa Indonesia, with no Add", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: false },
    items: [ayam, santan, bihun],
    recipes: [rendang, soto],
    menu,
  });
  await page.goto("/staff?view=stok&kitchen=buy");
  const section = page.getByTestId("menu-needs");
  await expect(section).toBeVisible({ timeout: 20_000 });
  await expect(section.getByRole("heading", { name: /Untuk menu/ })).toBeVisible();
  const serai = row(section, "Serai");
  await expect(serai).toContainText("Belum ada di daftar");
  await expect(serai).toContainText(/Perlu untuk Rendang \(\w+\), Soto ayam \(\w+\)/);
  await expect(row(section, "Santan")).toContainText("Habis");
  await expect(row(section, "Santan")).toContainText("Perlu untuk Rendang");
  await expect(section.getByRole("button")).toHaveCount(0);
  await expect(section).not.toContainText("Needed for");
  await shot(page, "menu-needs-staff");
});
