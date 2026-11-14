import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Change what was used (Phase 177 PR 2; docs/phase-177-cooking-corrections-plan.md
// section 3 and 7): on a cooked dish, for the rest of that day, the cook's
// sheet opens again with what was used, and saving applies only the
// difference to what is at home. Owners in their language, staff in Bahasa
// Indonesia. SHOTS_DIR set: the PR's screenshots are saved there too.

function day(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The screen offers the change only on the day of cooked_at, on the phone's
// calendar (Asia/Jakarta here). "An hour ago" is yesterday from 00:00 to
// 01:00 WIB, which is when CI failed: so an hour ago, but never before
// today's midnight.
function earlierToday(): string {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return new Date(Math.max(Date.now() - 60 * 60 * 1000, midnight.getTime())).toISOString();
}

// Yesterday at 23:00: always the day before on the calendar, and always
// within the server's 30 hours, so only the screen's day rule hides it.
function lateYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(23, 0, 0, 0);
  return d.toISOString();
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

// After cooking rendang for 4: 1 kg beef and 400 ml santan came off; the
// cook unticked the shallots.
const beef = item("00000000-0000-4000-8000-000000177001", "Daging sapi", 1.4, "kg");
const santan = item("00000000-0000-4000-8000-000000177002", "Santan", 600, "ml", { category: "pantry" });
const shallots = item("00000000-0000-4000-8000-000000177003", "Bawang merah", 250, "g");
const salt = item("00000000-0000-4000-8000-000000177004", "Garam", 0, "g", { track_amount: false, category: "pantry" });

const RENDANG = "00000000-0000-4000-8000-000000177101";
const SYAM = "00000000-0000-4000-8000-00000000c002";

function line(position: number, fields: Record<string, unknown>) {
  return {
    id: `00000000-0000-4000-8000-00000017720${position}`,
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
  steps: "Brown the beef.\nSimmer in santan for 3 hours.",
  written_in: "id",
  name_id: null,
  steps_id: null,
  created_by: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  ingredients: [
    line(0, { item_id: beef.id, name: "Daging sapi", amount: 1, unit: "kg" }),
    line(1, { item_id: santan.id, name: "Santan", amount: 400, unit: "ml" }),
    line(2, { item_id: shallots.id, name: "Bawang merah", amount: 100, unit: "g" }),
    line(3, { item_id: salt.id, name: "Garam" }),
  ],
};

const COOKED_USES = [
  { item_id: beef.id, amount: 1, unit: "kg", said: 1, planned: 1 },
  { item_id: santan.id, amount: 400, unit: "ml", said: 400, planned: 400 },
];

let seq = 0;
function dish(over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-0000001779${String(seq).padStart(2, "0")}`,
    household_id: HOUSEHOLD_ID,
    day: day(0),
    meal: "dinner",
    recipe_id: RENDANG,
    title: "Rendang",
    servings: 4,
    notes: null,
    position: 0,
    cooked_at: earlierToday(),
    cooked_by: SYAM,
    cooked_uses: COOKED_USES.map((u) => ({ ...u })),
    created_by: null,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    ...over,
  };
}

const STAFF = [
  { id: STAFF_ID, household_id: HOUSEHOLD_ID, name: "Ari", has_pin: true, user_id: null, archived_at: null, created_at: "2026-10-01T00:00:00Z" },
  { id: SYAM, household_id: HOUSEHOLD_ID, name: "Syam", has_pin: true, user_id: null, archived_at: null, created_at: "2026-10-01T00:00:00Z" },
];

async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (!dir) return;
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${dir}/${name}.png` });
}

async function openOwnerDish(page: Page, title = "Rendang") {
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await expect(page.getByRole("heading", { name: /This week|Minggu ini/ })).toBeVisible({ timeout: 20_000 });
  const gotIt = page.getByRole("button", { name: /^(Got it|Mengerti)$/ });
  if (await gotIt.isVisible()) await gotIt.click();
  await page.locator(`section[data-day="${day(0)}"]`).getByRole("button", { name: new RegExp(title) }).first().click();
}

const qty = (stub: { supplies: Record<string, unknown>[] }, id: string) => stub.supplies.find((r) => r.id === id)?.quantity;

test("an owner changes one amount up and one down: only the differences come off or go back; Undo puts it as it was", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [beef, santan, shallots, salt],
    recipes: [rendang],
    staff: STAFF,
    menu: [dish()],
  });
  await openOwnerDish(page);
  const change = page.getByRole("button", { name: "Change what was used" });
  await expect(change).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Syam");
  await shot(page, "owner-en-1-cooked-dish");
  await change.click();

  await expect(page.getByRole("heading", { name: "Change what was used" })).toBeVisible();
  await expect(page.getByText("Rendang. Only the difference is added to or taken off what's at home.")).toBeVisible();
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();
  // Ticked at what was said; the shallots the cook unticked, at the recipe's 100 g.
  await expect(page.getByRole("button", { name: "Don't take off Daging sapi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Take off Bawang merah" })).toBeVisible();
  await expect(page.getByText("1.4 kg left")).toBeVisible();
  await expect(page.getByText("Not counted")).toBeVisible();

  await page.getByRole("button", { name: "More Daging sapi" }).click(); // 1 kg → 1.1 kg
  await page.getByRole("button", { name: "Less Santan" }).click(); // 400 → 350 ml
  await expect(save).toBeEnabled();
  await shot(page, "owner-en-2-change-sheet");
  await save.click();

  await expect(page.getByText("Rendang · ingredients updated")).toBeVisible();
  await expect.poll(() => qty(stub, beef.id)).toBe(1.3);
  expect(qty(stub, santan.id)).toBe(650);
  expect(qty(stub, shallots.id)).toBe(250);
  expect(stub.menu[0]).toMatchObject({ cooked_by: SYAM });
  expect((stub.menu[0].cooked_uses as Record<string, unknown>[]).find((u) => u.item_id === beef.id)).toMatchObject({ amount: 1.1, said: 1.1, planned: 1 });

  // Undo sends the previous amounts back the same way.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => qty(stub, beef.id)).toBe(1.4);
  expect(qty(stub, santan.id)).toBe(600);
  expect(stub.menu[0].cooked_uses).toEqual(COOKED_USES);
});

test("unticking everything puts it all back and the dish stays cooked; ticking an unticked line takes it off", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [beef, santan, shallots, salt],
    recipes: [rendang],
    staff: STAFF,
    menu: [dish()],
  });
  await openOwnerDish(page);
  await page.getByRole("button", { name: "Change what was used" }).click();
  await page.getByRole("button", { name: "Don't take off Daging sapi" }).click();
  await page.getByRole("button", { name: "Don't take off Santan" }).click();
  await page.getByRole("button", { name: "Take off Bawang merah" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => qty(stub, beef.id)).toBe(2.4);
  expect(qty(stub, santan.id)).toBe(1000);
  expect(qty(stub, shallots.id)).toBe(150);
  expect(stub.menu[0].cooked_at).not.toBeNull();

  await expect(page.getByText("Rendang · ingredients updated")).toBeVisible();
  await openOwnerDish(page);
  await page.getByRole("button", { name: "Change what was used" }).click();
  // Unticked now; the shallots ticked at 100 g.
  await expect(page.getByRole("button", { name: "Take off Daging sapi" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Don't take off Bawang merah" })).toBeVisible();
});

test("the button is gone on a dish cooked yesterday, on a dish with no recipe, and on one with nothing that can come off", async ({ context, page }) => {
  const plain = { ...rendang, id: "00000000-0000-4000-8000-000000177102", name: "Sambal", ingredients: [line(9, { recipe_id: "x", item_id: salt.id, name: "Garam" })] };
  await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [beef, santan, shallots, salt],
    recipes: [rendang, plain],
    staff: STAFF,
    menu: [
      // Planned for today but marked cooked yesterday (the rule is the day of cooked_at):
      // a dish on yesterday's date would fall outside the week on a Monday.
      dish({ cooked_at: lateYesterday() }),
      dish({ recipe_id: null, title: "Nasi goreng", servings: null, cooked_uses: [], meal: "lunch" }),
      dish({ recipe_id: plain.id, title: "Sambal", cooked_uses: [], meal: "breakfast" }),
    ],
  });
  await page.goto("/dashboard?module=inventory&kitchen=menu");
  await expect(page.getByRole("heading", { name: "This week" })).toBeVisible({ timeout: 20_000 });
  const gotIt = page.getByRole("button", { name: "Got it" });
  if (await gotIt.isVisible()) await gotIt.click();
  await page.locator(`section[data-day="${day(0)}"]`).getByRole("button", { name: /Rendang/ }).click();
  await expect(page.getByRole("button", { name: "Mark not cooked" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change what was used" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  for (const title of ["Nasi goreng", "Sambal"]) {
    await page.locator(`section[data-day="${day(0)}"]`).getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.getByRole("button", { name: "Mark not cooked" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Change what was used" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
});

test("another phone's change while the sheet is open is refused with its message, and nothing moves", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [beef, santan, shallots, salt],
    recipes: [rendang],
    staff: STAFF,
    menu: [dish()],
  });
  await openOwnerDish(page);
  await page.getByRole("button", { name: "Change what was used" }).click();
  await page.getByRole("button", { name: "More Daging sapi" }).click();
  // Another phone saved 450 ml of santan meanwhile.
  stub.menu[0].cooked_uses = [COOKED_USES[0], { ...COOKED_USES[1], amount: 450, said: 450 }];
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changed on another phone. Open it again.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change what was used" })).toHaveCount(0);
  expect(qty(stub, beef.id)).toBe(1.4);
});

test("the owner's change sheet in Bahasa Indonesia", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "id" },
    features: { kitchen: true },
    items: [beef, santan, shallots, salt],
    recipes: [rendang],
    staff: STAFF,
    menu: [dish()],
  });
  await openOwnerDish(page);
  await expect(page.getByRole("button", { name: "Ubah bahan yang dipakai" })).toBeVisible();
  await shot(page, "owner-id-1-cooked-dish");
  await page.getByRole("button", { name: "Ubah bahan yang dipakai" }).click();
  await expect(page.getByRole("heading", { name: "Ubah bahan yang dipakai" })).toBeVisible();
  await expect(page.getByText("Rendang. Hanya selisihnya yang ditambah atau dikurangi dari stok di rumah.")).toBeVisible();
  await page.getByRole("button", { name: "Tambah jumlah Daging sapi" }).click();
  await shot(page, "owner-id-2-change-sheet");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Rendang · bahan diperbarui")).toBeVisible();
});

test("a staff phone changes a dish another staff member cooked, all in Bahasa Indonesia", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [beef, santan, shallots, salt],
    recipes: [rendang],
    staff: STAFF,
    menu: [dish()],
  });
  await page.goto("/staff");
  const card = page.getByRole("region", { name: "Menu hari ini", exact: true });
  await card.getByRole("button", { name: /Rendang/ }).click({ timeout: 20_000 });
  const change = page.getByRole("button", { name: "Ubah bahan yang dipakai" });
  await expect(change).toBeVisible();
  // Staff still can't mark a dish not cooked or edit it.
  await expect(page.getByRole("button", { name: "Tandai belum dimasak" })).toHaveCount(0);
  await shot(page, "staff-id-1-cooked-dish");
  await change.click();
  await expect(page.getByRole("heading", { name: "Ubah bahan yang dipakai" })).toBeVisible();
  await expect(page.getByText("Sisa 1,4 kg")).toBeVisible();
  await page.getByRole("button", { name: "Kurangi jumlah Daging sapi" }).click(); // 1 kg → 900 g
  await shot(page, "staff-id-2-change-sheet");
  const dialog = page.getByRole("dialog");
  for (const word of ["Change", "Save", "used", "left", "Not counted"]) await expect(dialog).not.toContainText(word);
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Rendang · bahan diperbarui")).toBeVisible();
  await expect.poll(() => qty(stub, beef.id)).toBe(1.5);
  expect(stub.supplies.find((r) => r.id === beef.id)).toMatchObject({ amount_set_by: STAFF_ID });
  expect(stub.menu[0]).toMatchObject({ cooked_by: SYAM });
  await shot(page, "staff-id-3-saved");
});

test("a day has passed while the sheet was open: the staff phone is told to change the ingredient itself", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [beef, santan, shallots, salt],
    recipes: [rendang],
    staff: STAFF,
    menu: [dish()],
  });
  await page.goto("/staff");
  await page.getByRole("region", { name: "Menu hari ini", exact: true }).getByRole("button", { name: /Rendang/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Ubah bahan yang dipakai" }).click();
  await page.getByRole("button", { name: "Tambah jumlah Santan" }).click();
  // The server's clock says cooking was 31 hours ago.
  stub.menu[0].cooked_at = new Date(Date.now() - 31 * 60 * 60 * 1000).toISOString();
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Sudah lewat sehari. Ubah jumlahnya langsung di bahannya.")).toBeVisible();
  expect(qty(stub, santan.id)).toBe(600);
});
