import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { freshSession, installStub } from "./stub-backend";

// The weekly menu and cooking (Phase 170 PR C, migrations/153): an owner
// plans the week, adds what's missing to Shopping, and a staff phone cooks
// a dish from Menu hari ini, taking the ingredients off stock, with Undo.
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
    ...over,
  };
}

const chicken = item("00000000-0000-4000-8000-000000153001", "Ayam", 1, "kg", { min_threshold: 0.3 });
const rice = item("00000000-0000-4000-8000-000000153002", "Beras", 4, "kg", { category: "pantry" });
const shallots = item("00000000-0000-4000-8000-000000153003", "Bawang merah", 0, "pcs", { track_amount: false, category: "pantry" });

const SOTO = "00000000-0000-4000-8000-000000153101";

function line(position: number, fields: Record<string, unknown>) {
  return {
    id: `00000000-0000-4000-8000-00000015320${position}`,
    household_id: HOUSEHOLD_ID,
    recipe_id: SOTO,
    item_id: null,
    name_id: null,
    amount: null,
    unit: null,
    position,
    ...fields,
  };
}

const soto = {
  id: SOTO,
  household_id: HOUSEHOLD_ID,
  name: "Chicken soto",
  servings: 4,
  steps: "Boil the chicken for 30 minutes.\nAdd the spices.\nServe with rice.",
  written_in: "en",
  name_id: "Soto ayam",
  steps_id: "Rebus ayam 30 menit.\nMasukkan bumbu.\nSajikan dengan nasi.",
  created_by: null,
  created_at: "2026-11-11T00:00:00Z",
  updated_at: "2026-11-11T00:00:00Z",
  ingredients: [
    line(0, { item_id: chicken.id, name: "Chicken", amount: 1, unit: "kg" }),
    line(1, { item_id: rice.id, name: "Rice", amount: 500, unit: "g" }),
    line(2, { item_id: shallots.id, name: "Shallots", amount: 6, unit: "pcs" }),
    line(3, { name: "Lime leaves", name_id: "Daun jeruk", amount: 3, unit: "lembar" }),
    line(4, { name: "Salt", name_id: "Garam" }),
  ],
};

let seq = 0;
function dish(dayOffset: number, meal: string, title: string, over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-0000001539${String(seq).padStart(2, "0")}`,
    household_id: HOUSEHOLD_ID,
    day: day(dayOffset),
    meal,
    recipe_id: null,
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

/** A calm, believable week around today, for the screens and the shots. */
function week() {
  return [
    dish(-1, "dinner", "Rendang", { cooked_at: new Date().toISOString() }),
    dish(0, "breakfast", "Bubur ayam"),
    dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 6 }),
    dish(0, "dinner", "Nasi goreng", { notes: "Less spicy" }),
    dish(1, "lunch", "Gado-gado"),
    dish(1, "dinner", "Ikan bakar"),
    dish(2, "dinner", "Chicken soto", { recipe_id: SOTO, servings: 4 }),
  ];
}

async function shot(page: Page, name: string, tall = false) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  // A tall phone for the whole week, so the tab bar stays at the bottom.
  const size = page.viewportSize();
  if (tall && size) await page.setViewportSize({ width: size.width, height: 1480 });
  // Let the splash fade and sheets finish sliding in.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/${name}.png` });
  if (tall && size) await page.setViewportSize(size);
}

test("the owner's week reads at a glance: days, meals, dishes, today, cooked, kitchen notes", async ({ context, page }) => {
  // Phase 177's card (newer) would hold this week's slot on Menu: seen, so the menu card shows.
  await context.addInitScript(() => localStorage.setItem("miamus.whats-new.cooking-changes-2026-11", "seen"));
  await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [chicken, rice, shallots],
    recipes: [soto],
    menu: week(),
    kitchenNotes: "No pork. Not too spicy for the kids.",
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("No pork. Not too spicy for the kids.")).toBeVisible();
  const today = page.locator(`section[data-day="${day(0)}"]`);
  await expect(today).toContainText("Today");
  await expect(today).toContainText("Breakfast");
  await expect(today).toContainText("Chicken soto");
  await expect(today).toContainText("6 servings");
  await expect(today).toContainText("Less spicy");
  await expect(page.getByRole("button", { name: /Recipes · 1/ })).toBeVisible();
  // The tutorial card, once (calm-start rules); then the week as owners see it.
  await expect(page.getByText("New: the week's menu")).toBeVisible();
  await shot(page, "owner-menu-whats-new-en");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByText("New: the week's menu")).toHaveCount(0);
  await shot(page, "owner-week-en", true);

  // A dish opens with its recipe at the dish's servings, and Cooked.
  await today.getByRole("button", { name: /Chicken soto/ }).click();
  await expect(page.getByRole("heading", { name: "Chicken soto" })).toBeVisible();
  await expect(page.getByText("1.5 kg", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cooked" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});

test("the owner's week in Bahasa Indonesia", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "id" },
    features: { kitchen: true },
    items: [chicken, rice, shallots],
    recipes: [soto],
    menu: week(),
    kitchenNotes: "Tanpa babi. Jangan terlalu pedas untuk anak-anak.",
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await expect(page.getByRole("heading", { name: "Minggu ini" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Catatan dapur", { exact: true })).toBeVisible();
  const today = page.locator(`section[data-day="${day(0)}"]`);
  await expect(today).toContainText("Hari ini");
  await expect(today).toContainText("Makan siang");
  await expect(today).toContainText("6 porsi");
  await expect(page.getByRole("button", { name: "Tambahkan yang kurang ke Belanja" })).toBeVisible();
  await page.getByRole("button", { name: "Mengerti" }).click();
  await shot(page, "owner-week-id", true);
});

test("an owner plans a dish from a recipe, then edits and removes it", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [chicken], recipes: [soto] });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: /^Add a dish, / }).nth(3).click({ timeout: 20_000 });
  await page.getByRole("tab", { name: "Dinner" }).click();
  await page.getByPlaceholder("Pick a recipe or type a dish").fill("soto");
  await page.getByRole("button", { name: /Chicken soto/ }).click();
  await expect(page.getByText("4 servings")).toBeVisible();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => stub.menu.length).toBe(1);
  expect(stub.menu[0]).toMatchObject({ meal: "dinner", recipe_id: SOTO, title: "Chicken soto", servings: 5 });

  // Just a name: no recipe, no servings.
  await page.getByRole("button", { name: /^Add a dish, / }).nth(4).click();
  await page.getByPlaceholder("Pick a recipe or type a dish").fill("Nasi goreng");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => stub.menu.length).toBe(2);
  expect(stub.menu[1]).toMatchObject({ title: "Nasi goreng", recipe_id: null, servings: null, meal: "lunch" });

  await page.getByRole("button", { name: /Nasi goreng/ }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Remove from the menu" }).click();
  await page.getByRole("button", { name: "Tap again to remove" }).click();
  await expect.poll(() => stub.menu.length).toBe(1);
});

test("Add missing to Shopping: a review first, then To buy and WhatsApp read the shortfall", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [chicken, rice, shallots],
    recipes: [soto],
    menu: [dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 6 })],
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: "Add missing to Shopping" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Ticked items go on the shopping list.", { exact: false })).toBeVisible();
  // From "will be added" to "won't be added".
  await expect(sheet.getByRole("heading", { level: 3 })).toHaveText([
    "To buy",
    "Not in your Ingredients",
    "In your Ingredients",
    "Enough for this week",
  ]);
  // 6 servings of a 4-serving recipe: 1.5 kg chicken against 1 kg.
  await expect(sheet.getByText("Need 1.5 kg · have 1 kg · buy 500 g")).toBeVisible();
  await expect(sheet.getByText("need 750 g · have 4 kg", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Miamus doesn't know if you have these. Untick what's at home.")).toBeVisible();
  await expect(sheet.getByText("Marked as enough. Tick any that are running out.")).toBeVisible();
  // An untracked item under In your Ingredients has no bare "Enough" under it.
  await expect(sheet.getByText("Enough", { exact: true })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Bawang merah" })).toHaveAttribute("aria-pressed", "false");
  // Names Miamus has no item for come ticked, and the button counts them:
  // chicken, lime leaves and salt.
  const lime = sheet.getByRole("button", { name: "Lime leaves" });
  await expect(lime).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Salt" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Add 3 to Shopping" })).toBeVisible();
  // Salt is at home: untick it, and the count drops.
  await sheet.getByRole("button", { name: "Salt" }).click();
  await expect(sheet.getByRole("button", { name: "Salt" })).toHaveAttribute("aria-pressed", "false");
  await expect(sheet.getByRole("button", { name: "Add 2 to Shopping" })).toBeVisible();
  await shot(page, "owner-add-missing-en");
  await sheet.getByRole("button", { name: "Add 2 to Shopping" }).click();
  await expect.poll(() => stub.supplies.find((r) => r.id === chicken.id)?.to_buy_amount).toBe(0.5);
  expect(stub.supplies.find((r) => r.id === chicken.id)).toMatchObject({ stock_status: "low", quantity: 1 });
  expect(stub.supplies.find((r) => r.id === shallots.id)).toMatchObject({ stock_status: "ok" });

  await page.getByRole("tab", { name: "Shopping" }).click();
  await expect(page.getByText(/Buy 500 g · Running low/)).toBeVisible();
  await expect(page.getByText("Lime leaves", { exact: true })).toBeVisible();
  await expect(page.getByText("Salt", { exact: true })).toHaveCount(0);
});

test("Add missing to Shopping in Indonesian: the headings, the grey lines, a tracked item's amount", async ({ context, page }) => {
  // Lime leaves are now in Ingredients, tracked in kg: the recipe's lembar
  // doesn't convert and the free name matches it, so it waits under Ada di
  // Bahan masakan with what's left, never pre-ticked.
  const limeLeaves = item("00000000-0000-4000-8000-000000153004", "Lime leaves", 1.2, "kg", { category: "pantry" });
  await installStub(context, {
    owner: { locale: "id" },
    features: { kitchen: true },
    items: [chicken, rice, shallots, limeLeaves],
    recipes: [soto],
    menu: [dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 6 })],
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: "Tambahkan yang kurang ke Belanja" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Untuk masakan minggu ini yang belum dimasak. Yang dicentang masuk daftar belanja.")).toBeVisible();
  await expect(sheet.getByRole("heading", { level: 3 })).toHaveText([
    "Perlu dibeli",
    "Belum ada di Bahan masakan",
    "Ada di Bahan masakan",
    "Cukup untuk minggu ini",
  ]);
  await expect(sheet.getByText("Perlu 1,5 kg · ada 1 kg · beli 500 g")).toBeVisible();
  await expect(sheet.getByText("perlu 750 g · ada 4 kg", { exact: true })).toBeVisible();
  await expect(sheet.getByText("Tercatat masih ada. Centang yang ternyata hampir habis.")).toBeVisible();
  await expect(sheet.getByText("Sisa 1,2 kg")).toBeVisible();
  await expect(sheet.getByText("Miamus belum tahu apakah ini ada di rumah. Hapus centang yang sudah ada.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Lime leaves" })).toHaveAttribute("aria-pressed", "false");
  await expect(sheet.getByRole("button", { name: "Salt" })).toHaveAttribute("aria-pressed", "true");
  // Chicken and salt; lime leaves wait for a tick.
  await expect(sheet.getByRole("button", { name: "Tambah 2 ke Belanja" })).toBeVisible();
  await shot(page, "owner-add-missing-id");
});

test("Add missing to Shopping with Food at home off names Supplies at home", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "id" },
    features: { kitchen: true, food: false },
    items: [chicken, rice, shallots],
    recipes: [soto],
    menu: [dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 6 })],
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: "Tambahkan yang kurang ke Belanja" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { level: 3 })).toHaveText([
    "Perlu dibeli",
    "Belum ada di Stok di rumah",
    "Ada di Stok di rumah",
    "Cukup untuk minggu ini",
  ]);
  await expect(sheet.getByText("Miamus belum tahu apakah ini ada di rumah. Hapus centang yang sudah ada.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Lime leaves" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Tambah 3 ke Belanja" })).toBeVisible();
});

test("kitchen notes: the first save asks once about health information", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true } });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: /Add a note for whoever cooks/ }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "Kitchen notes" }).fill("No pork. Raka is allergic to peanuts.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Asked in the same sheet, under the note it is about (demo check F-5).
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/may include health information/)).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Kitchen notes" })).toHaveValue("No pork. Raka is allergic to peanuts.");
  await expect(sheet.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Yes, save the note" }).click();
  await expect.poll(() => stub.kitchen.notes).toBe("No pork. Raka is allergic to peanuts.");
  expect(stub.kitchen.confirmedAt).not.toBeNull();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("No pork. Raka is allergic to peanuts.")).toBeVisible();

  // A later edit doesn't ask again.
  await page.getByRole("button", { name: /Kitchen notes/ }).click();
  await page.getByRole("textbox", { name: "Kitchen notes" }).fill("No pork.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => stub.kitchen.notes).toBe("No pork.");
});

test("Copy last week fills the empty days, with Undo", async ({ context, page }) => {
  const monday = -((new Date().getDay() + 6) % 7); // this week's Monday, as a day offset
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    // Last week's Monday and Tuesday. A week is Monday to Sunday, so
    // "7 and 6 days ago" would put the second dish in this week on a Sunday.
    menu: [dish(monday - 7, "lunch", "Soto betawi"), dish(monday - 6, "dinner", "Pecel lele")],
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: "Copy last week" }).click({ timeout: 20_000 });
  await expect.poll(() => stub.menu.length).toBe(4);
  expect(stub.menu.slice(2)).toMatchObject([
    { day: day(monday), title: "Soto betawi", cooked_at: null },
    { day: day(monday + 1), title: "Pecel lele" },
  ]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.menu.length).toBe(2);
});

test("the owner's Today has one quiet menu line", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, recipes: [soto], menu: week() });
  await page.goto("/dashboard");
  await expect(page.getByTestId("menu-today-line")).toHaveText("Menu today: Bubur ayam, Chicken soto, Nasi goreng", { timeout: 20_000 });
});

test("a staff phone cooks from Menu hari ini: the ingredients come off, Undo puts them back", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true, food: true },
    items: [chicken, rice, shallots],
    recipes: [soto],
    menu: week(),
    kitchenNotes: "Tanpa babi. Jangan terlalu pedas untuk anak-anak.",
  });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Catatan dapur: Tanpa babi.");
  await expect(card).toContainText("Siang");
  await expect(card).toContainText("Soto ayam");
  await expect(card).toContainText("6 porsi");
  // Staff screens are Indonesian only.
  await expect(card).not.toContainText("Chicken soto");
  await shot(page, "staff-menu-today");

  await card.getByRole("button", { name: /Soto ayam/ }).click();
  await expect(page.getByRole("heading", { name: "Soto ayam" })).toBeVisible();
  await expect(page.getByText("1,5 kg", { exact: true })).toBeVisible();
  await expect(page.getByText("Rebus ayam 30 menit.")).toBeVisible();
  await shot(page, "staff-dish");
  await page.getByRole("button", { name: "Sudah dimasak" }).click();

  // Bahan yang dipakai: the tracked lines, scaled, in the item's unit.
  await expect(page.getByRole("heading", { name: "Bahan yang dipakai" })).toBeVisible();
  await expect(page.getByText("Tidak dihitung")).toBeVisible();
  await expect(page.getByText(/Daun jeruk/)).toBeVisible();
  await expect(page.getByText("750 g", { exact: true })).toBeVisible(); // 500 g rice × 6/4
  await shot(page, "staff-cook-confirm");
  await page.getByRole("button", { name: "Pakai bahan ini" }).click();

  await expect.poll(() => stub.menu.find((d) => d.recipe_id === SOTO && d.day === day(0))?.cooked_at).not.toBeNull();
  // 1,5 kg asked of 1 kg: the chicken is out; 750 g of rice: 3,25 kg left.
  expect(stub.supplies.find((r) => r.id === chicken.id)).toMatchObject({ quantity: 0, stock_status: "out" });
  expect(stub.supplies.find((r) => r.id === rice.id)).toMatchObject({ quantity: 3.25 });
  await expect(page.getByText("Soto ayam sudah dimasak")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ada sisa?" })).toBeVisible();
  await shot(page, "staff-leftovers");
  await page.getByRole("button", { name: "Tidak ada sisa" }).click();
  await expect(card.getByLabel("Sudah dimasak")).toHaveCount(1);

  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect.poll(() => stub.supplies.find((r) => r.id === chicken.id)?.quantity).toBe(1);
  expect(stub.supplies.find((r) => r.id === rice.id)).toMatchObject({ quantity: 4 });
  expect(stub.menu.find((d) => d.recipe_id === SOTO && d.day === day(0))).toMatchObject({ cooked_at: null, cooked_uses: null });
});

test("a staff phone saves the leftovers to Makanan", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true, food: true },
    menu: [dish(0, "dinner", "Nasi goreng")],
  });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await card.getByRole("button", { name: /Nasi goreng/ }).click({ timeout: 20_000 });
  // No recipe: one tap marks it cooked.
  await page.getByRole("button", { name: "Sudah dimasak" }).click();
  await expect(page.getByText("Nasi goreng sudah dimasak")).toBeVisible();
  await page.getByRole("button", { name: "Simpan ke Makanan" }).click();
  await expect(page.locator("input[value='Nasi goreng']")).toBeVisible();
});

test("a staff phone can't plan: no week, no editing, and Dapur → Menu shows today's menu over the recipes", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    recipes: [soto],
    menu: week(),
  });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();
  await page.getByRole("tab", { name: "Menu" }).click({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Menu hari ini", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Soto ayam/ }).first()).toBeVisible();
  await expect(page.getByText(/Minggu ini|This week|Salin minggu lalu|Tambah masakan/)).toHaveCount(0);
});

test("Kitchen switched off: no menu on staff Today", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: false }, menu: week() });
  await page.goto("/staff");
  await expect(page.getByText("Tugas Hari Ini").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Menu hari ini", exact: true })).toHaveCount(0);
});

test("cooking takes off what the stepper shows, not the dish's servings (Codex, PR #101)", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [chicken, rice, shallots],
    recipes: [soto],
    menu: [dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 2 })],
  });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await card.getByRole("button", { name: /Soto ayam/ }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("2 porsi", { exact: true })).toBeVisible();
  // The cook makes 4 instead of 2: 1 kg chicken and 500 g rice, as shown.
  await page.getByRole("button", { name: "Tambah porsi" }).click();
  await page.getByRole("button", { name: "Tambah porsi" }).click();
  await expect(sheet.getByText("4 porsi", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sudah dimasak" }).click();
  await expect(page.getByRole("heading", { name: "Bahan yang dipakai" })).toBeVisible();
  await expect(page.getByText("500 g", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pakai bahan ini" }).click();
  await expect.poll(() => stub.supplies.find((r) => r.id === rice.id)?.quantity).toBe(3.5);
  expect(stub.supplies.find((r) => r.id === chicken.id)).toMatchObject({ quantity: 0 });
  // said and planned (migrations/156): what the cook confirmed, and the recipe at 4 servings.
  expect(stub.menu[0].cooked_uses).toEqual([
    { item_id: chicken.id, amount: 1, unit: "kg", said: 1, planned: 1 },
    { item_id: rice.id, amount: 0.5, unit: "kg", said: 0.5, planned: 0.5 },
  ]);
});

test("Undo of cooking puts back the date cooking cleared (Phase 177, migrations/156)", async ({ context, page }) => {
  // The last kilo of a dated chicken: cooking empties it, so it loses its
  // date (154); Batalkan brings back the amount and the date.
  const datedChicken = { ...chicken, expires_on: "2026-12-01" };
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [datedChicken, rice, shallots],
    recipes: [soto],
    menu: [dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 4 })],
  });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await card.getByRole("button", { name: /Soto ayam/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Sudah dimasak" }).click();
  await page.getByRole("button", { name: "Pakai bahan ini" }).click();
  await expect.poll(() => stub.supplies.find((r) => r.id === chicken.id)?.quantity).toBe(0);
  expect(stub.supplies.find((r) => r.id === chicken.id)).toMatchObject({ stock_status: "out", expires_on: null });
  expect((stub.menu[0].cooked_uses as Record<string, unknown>[]).find((u) => u.item_id === chicken.id)).toMatchObject({
    amount: 1,
    cleared_date: "2026-12-01",
  });
  await page.getByRole("button", { name: "Tidak ada sisa" }).click();
  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect.poll(() => stub.supplies.find((r) => r.id === chicken.id)?.quantity).toBe(1);
  expect(stub.supplies.find((r) => r.id === chicken.id)).toMatchObject({ stock_status: "ok", expires_on: "2026-12-01" });
});

test("a staff phone's Undo more than 10 minutes after cooking is refused with an Indonesian line (audit D1)", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [chicken, rice, shallots],
    recipes: [soto],
    menu: [dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 4 })],
  });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await card.getByRole("button", { name: /Soto ayam/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Sudah dimasak" }).click();
  await page.getByRole("button", { name: "Pakai bahan ini" }).click();
  await expect.poll(() => stub.supplies.find((r) => r.id === rice.id)?.quantity).toBe(3.5);
  await page.getByRole("button", { name: "Tidak ada sisa" }).click();
  // The server's clock: cooked 11 minutes ago (a very slow signal, or a stale toast).
  stub.menu[0].cooked_at = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect(page.getByText("Sudah terlalu lama untuk dibatalkan. Minta pemilik rumah menandainya belum dimasak.")).toBeVisible();
  expect(stub.supplies.find((r) => r.id === rice.id)).toMatchObject({ quantity: 3.5 });
  expect(stub.menu[0].cooked_at).not.toBeNull();
  // Staff never get Mark not cooked on the dish.
  await card.getByRole("button", { name: /Soto ayam/ }).click();
  await expect(page.getByRole("button", { name: "Tandai belum dimasak" })).toHaveCount(0);
});

test("a dish can't be cooked before its recipe has loaded: Sedang memuat…, then Sudah dimasak (Codex, PR #101)", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [chicken, rice, shallots],
    recipes: [soto],
    menu: [dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 4 })],
    holdRecipes: true,
  });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await card.getByRole("button", { name: /Chicken soto/ }).click({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Sedang memuat…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sudah dimasak" })).toHaveCount(0);
  expect(stub.menu[0].cooked_at).toBeNull();

  stub.releaseRecipes();
  // The recipe arrives: the dish reads as the recipe, and cooking is open.
  await expect(page.getByRole("button", { name: "Sudah dimasak" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Soto ayam" })).toBeVisible();
});

test("Add missing waits for the recipes before it adds up: Loading…, then the review (Codex, PR #101)", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [chicken, rice, shallots],
    recipes: [soto],
    menu: [dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 6 })],
    holdRecipes: true,
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  // Never a review from half the data: the button waits.
  await expect(page.getByRole("button", { name: "Loading…" })).toBeDisabled({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Add missing to Shopping" })).toHaveCount(0);

  stub.releaseRecipes();
  await page.getByRole("button", { name: "Add missing to Shopping" }).click({ timeout: 10_000 });
  await expect(page.getByText("Need 1.5 kg · have 1 kg · buy 500 g")).toBeVisible();
});

test("Undo of a purchase puts the menu's shortfall back on the list (Codex, PR #101)", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [{ ...shallots, stock_status: "low", to_buy_amount: 6 }],
  });
  await page.goto("/dashboard?module=inventory&kitchen=buy");
  await expect(page.getByText(/Buy 6 pcs · Running low/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Bought Bawang merah" }).click();
  await expect.poll(() => stub.supplies[0].to_buy_amount).toBeNull();
  expect(stub.supplies[0].stock_status).toBe("ok");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.supplies[0].to_buy_amount).toBe(6);
  expect(stub.supplies[0].stock_status).toBe("low");
  await expect(page.getByText(/Buy 6 pcs · Running low/)).toBeVisible();
});

test("editing a dish's note while recipes load keeps its recipe and servings (Codex, PR #101)", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [chicken],
    recipes: [soto],
    menu: [dish(0, "lunch", "Chicken soto", { recipe_id: SOTO, servings: 6 })],
    holdRecipes: true,
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: /Chicken soto/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Edit" }).click();
  // Still linked, though the recipe hasn't arrived: the chip, not an empty picker.
  await expect(page.getByRole("button", { name: "Not this recipe" })).toBeVisible();
  await page.getByLabel("Note (optional)").fill("Less salt");
  await page.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => stub.menu[0].notes).toBe("Less salt");
  expect(stub.menu[0]).toMatchObject({ recipe_id: SOTO, servings: 6, title: "Chicken soto" });
  stub.releaseRecipes();
});

test("kitchen notes opened before they load: Loading…, then the note, and Save can't wipe it (Codex, PR #101)", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    kitchenNotes: "No pork.",
    holdKitchenNotes: true,
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await page.getByRole("button", { name: /Kitchen notes/ }).click({ timeout: 20_000 });
  // Not loaded is not empty: no editor, nothing to save.
  await expect(page.getByRole("status").getByText("Loading…")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Kitchen notes" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

  stub.releaseKitchenNotes();
  await expect(page.getByRole("textbox", { name: "Kitchen notes" })).toHaveValue("No pork.", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(stub.kitchen.notes).toBe("No pork.");
});
