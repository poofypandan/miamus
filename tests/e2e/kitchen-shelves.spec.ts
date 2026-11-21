import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { installStub, type Stub } from "./stub-backend";

// The owners' Kitchen → Food as shelves (21 Nov; Fable's 08, section 2, and
// kitchen-inventory.html): Use soon first, then a shelf for each place, food
// and ingredients together, a tile a thing. Amber is rationed and always has
// a word; Out is an empty tile; Everything · Use soon · To buy sort at once.

// The browser runs in Asia/Jakarta (playwright.config.ts).
function jakartaDay(offset = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

let next = 0;
const id = () => `00000000-0000-4000-8000-${String(210_000 + ++next).padStart(12, "0")}`;

function seedFood(stub: Stub, name: string, over: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  stub.foods.push({
    id: id(),
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
    added_by: null,
    created_by: null,
    outcome: null,
    finished_at: null,
    finished_by: null,
    created_at: now,
    updated_at: now,
    ...over,
  });
}

const item = (name: string, over: Record<string, unknown> = {}) => ({
  id: id(),
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
  kept_in: null,
  expires_on: null,
  ...over,
});

const ITEMS = [
  item("Telur"),
  item("Tempe", { stock_status: "low" }),
  item("Santan", { stock_status: "out" }),
  item("Ayam", { kept_in: "freezer" }),
  item("Beras", { category: "pantry" }),
  item("Sabun cuci", { category: "household_supplies" }),
];

async function seed(stub: Stub) {
  seedFood(stub, "Sayur asem", { expires_on: jakartaDay(1) });
  seedFood(stub, "Opor", { expires_on: jakartaDay(2) });
  seedFood(stub, "Kue lapis", { expires_on: jakartaDay(3), kept_in: "counter" });
  seedFood(stub, "Rendang", { expires_on: jakartaDay(24), kept_in: "freezer" });
}

const SEEN = ["kitchen-shelves-2026-11", "kitchen-places-2026-11", "kitchen-amounts-2026-11"];

test("the shelves: Use soon first, food and ingredients together, amber only for today and tomorrow", async ({
  context,
  page,
}) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: ITEMS });
  await seed(stub);
  await context.addInitScript((cards) => {
    for (const card of cards) localStorage.setItem(`miamus.whats-new.${card}`, "seen");
  }, SEEN);
  await page.goto("/dashboard?module=inventory");

  const kitchen = page.getByRole("region", { name: "The kitchen", exact: true });
  await expect(kitchen.locator("[data-shelf]").first()).toBeVisible({ timeout: 20_000 });
  expect(await kitchen.locator("[data-shelf]").evaluateAll((els) => els.map((el) => el.getAttribute("data-shelf")))).toEqual([
    "soon",
    "fridge",
    "freezer",
    "pantry",
  ]);
  await expect(kitchen.getByRole("group", { name: "Show" }).getByRole("button")).toHaveText([
    "Everything",
    "Use soon",
    "To buy",
  ]);

  const soon = kitchen.getByRole("region", { name: "Use soon" });
  await expect(soon.getByRole("button")).toHaveText(["Sayur asemTomorrow", "Opor2 days", "Kue lapis3 days"]);
  // Only tomorrow's tile is amber; two and three days keep a plain tile.
  await expect(soon.getByRole("button", { name: "Sayur asem, Tomorrow" }).locator("span").first()).toHaveClass(/bg-attention-tint/);
  await expect(soon.getByRole("button", { name: "Opor, 2 days" }).locator("span").first()).not.toHaveClass(/bg-attention-tint/);

  const fridge = kitchen.getByRole("region", { name: "Fridge" });
  await expect(fridge.getByRole("button", { name: "Tempe, Low" })).toBeVisible();
  await expect(fridge.getByRole("button", { name: "Santan, Out" }).locator("span").first()).toHaveClass(/border/);
  // A thing that is simply there says nothing.
  await expect(fridge.getByRole("button", { name: "Telur", exact: true })).toBeVisible();
  const freezer = kitchen.getByRole("region", { name: "Freezer" });
  await expect(freezer.getByRole("button", { name: "Rendang, 24 days" })).toBeVisible();
  await expect(freezer.getByRole("button", { name: "Ayam", exact: true })).toBeVisible();
  // Supplies stay under Shopping.
  await expect(kitchen.getByRole("button", { name: /Sabun cuci/ })).toHaveCount(0);

  // The pills sort at once, and the URL keeps the choice.
  await kitchen.getByRole("button", { name: "To buy" }).click();
  await expect(page).toHaveURL(/shelf=buy/);
  await expect(kitchen.locator("[data-shelf]")).toHaveCount(1);
  await expect(kitchen.getByRole("region", { name: "Fridge" }).getByRole("button")).toHaveText(["SantanOut", "TempeLow"]);
  await kitchen.getByRole("button", { name: "Use soon" }).click();
  await expect(page).toHaveURL(/shelf=soon/);
  await expect(kitchen.locator("[data-shelf]")).toHaveCount(1);
  await kitchen.getByRole("button", { name: "Everything" }).click();
  await expect(page).not.toHaveURL(/shelf=/);

  // A tap opens the thing with its actions.
  await soon.getByRole("button", { name: "Sayur asem, Tomorrow" }).click();
  await expect(page.getByRole("button", { name: "Eaten" })).toBeVisible();
  await page.keyboard.press("Escape");
  await fridge.getByRole("button", { name: "Tempe, Low" }).click();
  const sheet = page.getByRole("dialog", { name: "Tempe" });
  await expect(sheet.getByRole("button", { name: "Out", exact: true })).toBeVisible();
});

test("in Bahasa Indonesia", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" }, features: { kitchen: true }, items: ITEMS });
  await seed(stub);
  await context.addInitScript((cards) => {
    for (const card of cards) localStorage.setItem(`miamus.whats-new.${card}`, "seen");
  }, SEEN);
  await page.goto("/dashboard?module=inventory");
  const kitchen = page.getByRole("region", { name: "Isi dapur", exact: true });
  await expect(kitchen.getByRole("group", { name: "Tampilkan" }).getByRole("button")).toHaveText(
    ["Semua", "Segera dipakai", "Perlu dibeli"],
    { timeout: 20_000 }
  );
  await expect(kitchen.getByRole("region", { name: "Segera dipakai" }).getByRole("button", { name: "Sayur asem, Besok" })).toBeVisible();
  await expect(kitchen.getByRole("region", { name: "Kulkas" }).getByRole("button", { name: "Tempe, Hampir habis" })).toBeVisible();
  await expect(kitchen.getByRole("region", { name: "Kulkas" }).getByRole("button", { name: "Santan, Habis" })).toBeVisible();
  await expect(kitchen.getByRole("region", { name: "Freezer" }).getByRole("button", { name: "Rendang, 24 hari lagi" })).toBeVisible();
});

test("narrow phone in Bahasa Indonesia: no state word is cut off, and both add buttons fit (Fable's look, #189)", async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const stub = await installStub(context, { owner: { locale: "id" }, features: { kitchen: true }, items: ITEMS });
  await seed(stub);
  await context.addInitScript((cards) => {
    for (const card of cards) localStorage.setItem(`miamus.whats-new.${card}`, "seen");
  }, SEEN);
  await page.goto("/dashboard?module=inventory");
  const word = page.getByRole("button", { name: "Tempe, Hampir habis" }).locator("span").last();
  await expect(word).toHaveText("Hampir habis", { timeout: 20_000 });
  // Never truncated: the word's box is as wide as its text needs.
  expect(await word.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  for (const name of ["Tambah makanan", "Tambah bahan masakan"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 360).toBe(true);
  }
});

test("Kitchen amounts off: food alone on the shelves, no To buy, no Add ingredient", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: false }, items: ITEMS });
  await seed(stub);
  await page.goto("/dashboard?module=inventory&shelf=buy");
  const kitchen = page.getByRole("region", { name: "The kitchen", exact: true });
  await expect(kitchen.getByRole("group", { name: "Show" }).getByRole("button")).toHaveText(["Everything", "Use soon"], {
    timeout: 20_000,
  });
  // A stale To buy link shows Everything.
  await expect(kitchen.getByRole("button", { name: "Everything" })).toHaveAttribute("aria-pressed", "true");
  await expect(kitchen.getByRole("button", { name: /^Telur/ })).toHaveCount(0);
  await expect(kitchen.getByRole("button", { name: "Rendang, 24 days" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add ingredient" })).toHaveCount(0);
});
