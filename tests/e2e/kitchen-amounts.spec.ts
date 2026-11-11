import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Kitchen amounts (Phase 170 PR A, migrations/148): an owner tracks an item
// (the old count only a hint), Bought asks how much and adds it, a staff
// phone moves the amount with minus and plus, and the Features switch off
// hides all of it.

const rice = (over: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000170001",
  household_id: HOUSEHOLD_ID,
  scope: "home",
  name: "Beras",
  category: "pantry",
  quantity: 2,
  unit: "kg",
  min_threshold: 2,
  photo_url: null,
  created_at: "2026-10-01T00:00:00Z",
  variant: null,
  audit_frequency_days: 30,
  last_audited_at: "2026-10-03T03:00:00Z",
  notes: null,
  stock_status: "ok",
  stock_status_at: null,
  stock_status_by: null,
  track_amount: false,
  amount_set_at: null,
  amount_set_by: null,
  last_bought_amount: null,
  ...over,
});

const soap = {
  ...rice(),
  id: "00000000-0000-4000-8000-000000170002",
  name: "Sabun cuci",
  category: "household_supplies",
  quantity: 0,
  last_audited_at: null,
};

test("an owner tracks rice under Food → Ingredients; the old count is only a hint", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: [rice(), soap] });
  await page.goto("/dashboard?module=inventory");

  // D6: rice browses under Food → Ingredients; soap stays under Shopping.
  const ingredients = page.getByRole("region", { name: "Ingredients" });
  await expect(page.getByRole("heading", { name: "Ready to eat" })).toBeVisible({ timeout: 20_000 });
  await expect(ingredients.getByRole("button", { name: /Beras/ })).toBeVisible();
  await expect(ingredients.getByRole("button", { name: /Sabun cuci/ })).toHaveCount(0);

  await ingredients.getByRole("button", { name: /Beras/ }).click();
  await page.getByRole("button", { name: /^Track amount/ }).click();
  await expect(page.getByText("Old count: 2 kg on 3 Oct, not used")).toHaveCount(0);
  await page.getByRole("switch", { name: "Track amount" }).click();
  await expect(page.getByText("Old count: 2 kg on 3 Oct, not used")).toBeVisible();
  // Never pre-filled from the old count (D14).
  await expect(page.getByLabel("How much is there now?")).toHaveValue("");
  await page.getByLabel("How much is there now?").fill("4.5");
  await page.getByLabel(/Running low at/).fill("1");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(ingredients.getByRole("button", { name: /Beras/ })).toContainText("4.5 kg left");
  expect(stub.supplies[0]).toMatchObject({ track_amount: true, quantity: 4.5, min_threshold: 1, unit: "kg", stock_status: "ok" });

  // Shopping keeps the non-food supplies.
  await page.getByRole("tab", { name: "Shopping" }).click();
  await expect(page.getByRole("button", { name: /Sabun cuci/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Beras/ })).toHaveCount(0);
});

test("Bought asks how much, with last time pre-filled, and adds it; Undo puts it back", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [
      rice({
        track_amount: true,
        quantity: 0.5,
        min_threshold: 1,
        stock_status: "low",
        amount_set_at: new Date().toISOString(),
        last_bought_amount: 5,
      }),
    ],
  });
  await page.goto("/dashboard?module=inventory&kitchen=buy");

  await page.getByRole("button", { name: "Bought Beras" }).click({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "How much did you buy?" })).toBeVisible();
  await expect(page.getByText("Beras · usually 5 kg")).toBeVisible();
  await expect(page.getByLabel("Amount bought")).toHaveValue("5");
  await expect(page.getByText("0.5 kg + 5 kg =")).toBeVisible();
  await page.getByRole("button", { name: "Bought", exact: true }).click();

  await expect(page.getByText("Bought · Beras 5.5 kg")).toBeVisible();
  expect(stub.supplies[0]).toMatchObject({ quantity: 5.5, stock_status: "ok", last_bought_amount: 5 });

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.supplies[0].quantity).toBe(0.5);
  expect(stub.supplies[0]).toMatchObject({ stock_status: "low", last_bought_amount: 5 });
});

test("a staff phone moves the amount with minus and plus, and can't switch tracking", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [rice({ track_amount: true, quantity: 2, min_threshold: 1, amount_set_at: new Date().toISOString() })],
  });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();

  const bahan = page.getByRole("region", { name: "Bahan masakan" });
  await expect(bahan.getByRole("button", { name: /Beras/ })).toContainText("Sisa 2 kg", { timeout: 20_000 });
  await bahan.getByRole("button", { name: /Beras/ }).click();
  await page.getByRole("button", { name: "Tambah 0,5 kg" }).click();
  await expect(page.getByText("Sisa 2,5 kg").first()).toBeVisible();
  await expect.poll(() => stub.supplies[0].quantity).toBe(2.5);
  expect(stub.supplies[0].amount_set_by).toBe(STAFF_ID);

  // Down to the low level: running low, by the server's rule.
  await page.getByRole("button", { name: "Kurangi 0,5 kg" }).click();
  await page.getByRole("button", { name: "Kurangi 0,5 kg" }).click();
  await page.getByRole("button", { name: "Kurangi 0,5 kg" }).click();
  await expect.poll(() => stub.supplies[0].quantity).toBe(1);
  expect(stub.supplies[0].stock_status).toBe("low");

  // Staff never see Track amount (D3), and nothing on the sheet is English.
  await expect(page.getByRole("button", { name: /Catat jumlah|Track amount/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ubah jumlah" })).toBeVisible();
});

test("Kitchen amounts off hides the amounts, Track amount and Ingredients", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: false },
    items: [rice({ track_amount: true, quantity: 4.5, min_threshold: 1, amount_set_at: new Date().toISOString() }), soap],
  });
  await page.goto("/dashboard?module=inventory");
  await expect(page.getByRole("button", { name: "Add food" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Ingredients" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Ready to eat" })).toHaveCount(0);

  await page.getByRole("tab", { name: "Shopping" }).click();
  const row = page.getByRole("button", { name: /Beras/ });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("left");
  await row.click();
  await expect(page.getByRole("button", { name: "Edit item" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Track amount/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Set amount" })).toHaveCount(0);
});

test("portions on food: set in the form, Ate 1 portion counts down (D7)", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff?view=stok");
  await expect(page.getByText("Belum ada makanan")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Tambah makanan" }).click();
  await page.getByLabel(/Makanan apa\?/).fill("Rendang");
  await page.getByRole("button", { name: "Dimasak di rumah" }).click();
  await page.getByRole("button", { name: "Besok" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Tambah 1 porsi" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();

  const row = page.getByRole("button", { name: /Rendang/ });
  await expect(row).toContainText("3 porsi");
  expect(stub.foods[0]).toMatchObject({ portions: 3 });

  await row.click();
  // Another phone ate one meanwhile; this phone still shows 3.
  stub.foods[0].portions = 2;
  await page.getByRole("button", { name: "Dimakan 1 porsi" }).click();
  // The toast says what the server counted, with the other phone's portion.
  await expect(page.getByText("Rendang · sisa 1 porsi")).toBeVisible();
  // A change made on the server (Codex, PR #93): 2 → 1, not an absolute 2.
  await expect.poll(() => stub.foods[0].portions).toBe(1);
  expect(stub.seen.portionCalls).toHaveLength(1);
  // The screen takes the server's answer, with the other phone's portion.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Rendang/ })).toContainText("1 porsi");
});

test("Ate 1 portion on a weak signal: kept on the phone, and the resend counts once (Codex, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff?view=stok");
  await expect(page.getByText("Belum ada makanan")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Tambah makanan" }).click();
  await page.getByLabel(/Makanan apa\?/).fill("Opor");
  await page.getByRole("button", { name: "Dimasak di rumah" }).click();
  await page.getByRole("button", { name: "Besok" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Tambah 1 porsi" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("button", { name: /Opor/ })).toContainText("3 porsi");

  // The first try lands, but its answer is lost on the way back.
  stub.portionTrouble.lostReplies = 1;

  await page.getByRole("button", { name: /Opor/ }).click();
  await page.getByRole("button", { name: "Dimakan 1 porsi" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Opor/ })).toContainText("2 porsi");

  // The phone resends the same tap; the server counts it once.
  await expect.poll(() => stub.seen.portionCalls.length, { timeout: 30_000 }).toBeGreaterThan(1);
  expect(new Set(stub.seen.portionCalls).size).toBe(1);
  expect(stub.foods[0].portions).toBe(2);
});

test("changing kg to g converts the amount and the Bought pre-fill (Codex, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [rice({ track_amount: true, quantity: 1.5, min_threshold: 0, amount_set_at: new Date().toISOString(), last_bought_amount: 5 })],
  });
  await page.goto("/dashboard?module=inventory");
  const ingredients = page.getByRole("region", { name: "Ingredients" });
  await ingredients.getByRole("button", { name: /Beras/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Track amount/ }).click();
  await page.getByRole("button", { name: "g", exact: true }).click();
  await expect(page.getByLabel("How much is there now?")).toHaveValue("1500");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(ingredients.getByRole("button", { name: /Beras/ })).toContainText("1,500 g left");
  expect(stub.supplies[0]).toMatchObject({ unit: "g", quantity: 1500, last_bought_amount: 5000 });
});

test("Undo keeps another phone's purchase made in the meantime (Codex, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "en" },
    features: { kitchen: true },
    items: [rice({ track_amount: true, quantity: 0, min_threshold: 0, stock_status: "out", amount_set_at: new Date().toISOString(), last_bought_amount: 2 })],
  });
  await page.goto("/dashboard?module=inventory&kitchen=buy");
  await page.getByRole("button", { name: "Bought Beras" }).click({ timeout: 20_000 });
  await page.getByLabel("Amount bought").fill("5");
  await page.getByRole("button", { name: "Bought", exact: true }).click();
  await expect(page.getByText("Bought · Beras 5 kg")).toBeVisible();

  // Another phone buys 3 kg before the Undo.
  Object.assign(stub.supplies[0], { quantity: 8, last_bought_amount: 3 });
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => stub.supplies[0].quantity).toBe(3);
  // Not emptied by writing Out back, and the other purchase's pre-fill stays.
  await page.waitForTimeout(500);
  expect(stub.supplies[0]).toMatchObject({ quantity: 3, stock_status: "ok", last_bought_amount: 3 });
});

test("plus then Habis within the moment the taps wait: the item stays empty (Codex, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [rice({ track_amount: true, quantity: 2, min_threshold: 0, amount_set_at: new Date().toISOString() })],
  });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();
  await page.getByRole("region", { name: "Bahan masakan" }).getByRole("button", { name: /Beras/ }).click({ timeout: 20_000 });

  // Plus, then Habis straight away, before the tap is sent.
  await page.getByRole("button", { name: "Tambah 0,5 kg" }).click();
  await page.getByRole("button", { name: "Habis", exact: true }).click();
  await expect.poll(() => stub.supplies[0].stock_status).toBe("out");
  // Long after the taps' wait (600 ms): nothing was added back.
  await page.waitForTimeout(1500);
  expect(stub.supplies[0]).toMatchObject({ quantity: 0, stock_status: "out" });
  expect(stub.writes.filter(([, table]) => table === "rpc/adjust_inventory_quantity")).toHaveLength(0);
});

// A slow signal for the stepper's batches: the first takes 2 s, later ones
// 0.3 s, so without ordering a later batch would overtake the first.
async function slowBatches(context: import("@playwright/test").BrowserContext) {
  let n = 0;
  await context.route("http://supabase.test/rest/v1/rpc/adjust_inventory_quantity*", async (route) => {
    n += 1;
    await new Promise((resolve) => setTimeout(resolve, n === 1 ? 2000 : 300));
    await route.fallback();
  });
}

async function openRiceAsStaff(page: import("@playwright/test").Page) {
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();
  await page.getByRole("region", { name: "Bahan masakan" }).getByRole("button", { name: /Beras/ }).click({ timeout: 20_000 });
}

const stockOrder = (writes: [string, string][]) =>
  writes.map(([, table]) => table).filter((t) => t === "rpc/adjust_inventory_quantity" || t === "inventory_items");

test("two plus batches on their way, then Habis: Out still wins (Codex, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [rice({ track_amount: true, quantity: 2, min_threshold: 0, amount_set_at: new Date().toISOString() })],
  });
  await slowBatches(context);
  await openRiceAsStaff(page);

  // Plus, past the 600 ms wait (sent); plus again, sent too; then Habis.
  await page.getByRole("button", { name: "Tambah 0,5 kg" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Tambah 0,5 kg" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Habis", exact: true }).click();

  await expect.poll(() => stockOrder(stub.writes), { timeout: 8_000 }).toEqual([
    "rpc/adjust_inventory_quantity",
    "rpc/adjust_inventory_quantity",
    "inventory_items",
  ]);
  await page.waitForTimeout(300);
  expect(stub.supplies[0]).toMatchObject({ quantity: 0, stock_status: "out" });
  // The screen agrees: no batch's late answer over Out.
  await page.getByRole("tab", { name: "Dapur" }).click();
  await expect(page.getByRole("region", { name: "Bahan masakan" }).getByRole("button", { name: /Beras/ })).toContainText("Sisa 0 kg");
});

test("two plus batches on their way, then Set amount: the typed amount wins, on the server and the screen (Codex, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [rice({ track_amount: true, quantity: 2, min_threshold: 0, amount_set_at: new Date().toISOString() })],
  });
  await slowBatches(context);
  await openRiceAsStaff(page);

  await page.getByRole("button", { name: "Tambah 0,5 kg" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Tambah 0,5 kg" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Ubah jumlah" }).click();
  await page.getByLabel("Jumlah sekarang").fill("3");
  await page.getByRole("button", { name: "Simpan" }).click();

  await expect.poll(() => stockOrder(stub.writes), { timeout: 8_000 }).toEqual([
    "rpc/adjust_inventory_quantity",
    "rpc/adjust_inventory_quantity",
    "inventory_items",
  ]);
  await page.waitForTimeout(300);
  expect(stub.supplies[0].quantity).toBe(3);
  await expect(page.getByText("Sisa 3 kg").first()).toBeVisible();
  await expect(page.getByText("Sisa 3,5 kg")).toHaveCount(0);
});

test("a plus batch stuck on a dead signal holds Habis back at most 20 s, then Habis goes (code review, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    features: { kitchen: true },
    items: [rice({ track_amount: true, quantity: 2, min_threshold: 0, amount_set_at: new Date().toISOString() })],
  });
  // The batch never gets an answer.
  await context.route("http://supabase.test/rest/v1/rpc/adjust_inventory_quantity*", () => new Promise<void>(() => undefined));
  await openRiceAsStaff(page);

  await page.getByRole("button", { name: "Tambah 0,5 kg" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Habis", exact: true }).click();

  await expect.poll(() => stub.supplies[0].stock_status, { timeout: 30_000 }).toBe("out");
  expect(stub.supplies[0].quantity).toBe(0);
});

async function foodWithPortions(page: import("@playwright/test").Page, name: string, portions: number) {
  await page.goto("/staff?view=stok");
  await expect(page.getByText("Belum ada makanan")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Tambah makanan" }).click();
  await page.getByLabel(/Makanan apa\?/).fill(name);
  await page.getByRole("button", { name: "Dimasak di rumah" }).click();
  await page.getByRole("button", { name: "Besok" }).click();
  for (let i = 0; i < portions; i++) await page.getByRole("button", { name: "Tambah 1 porsi" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("button", { name: new RegExp(name) })).toContainText(`${portions} porsi`);
}

test("the last portion on screen goes to the server too: another phone's Undo is kept (Codex, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await foodWithPortions(page, "Sate", 1);

  // Another phone undid a portion meanwhile: the server has 2, this phone shows 1.
  stub.foods[0].portions = 2;
  await page.getByRole("button", { name: /Sate/ }).click();
  await page.getByRole("button", { name: "Dimakan 1 porsi" }).click();

  // Not finished: the server took one of two.
  await expect(page.getByText("Sate · sisa 1 porsi")).toBeVisible();
  await expect.poll(() => stub.foods[0].portions).toBe(1);
  expect(stub.foods[0].outcome ?? null).toBeNull();
});

test("Undo puts back only what the tap took: nothing, when another phone had finished it (Codex, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await foodWithPortions(page, "Gulai", 2);

  // Another phone finished it meanwhile.
  Object.assign(stub.foods[0], { portions: 0, outcome: "eaten", finished_at: new Date().toISOString() });
  await page.getByRole("button", { name: /Gulai/ }).click();
  await page.getByRole("button", { name: "Dimakan 1 porsi" }).click();

  await expect(page.getByText("Gulai sudah habis")).toBeVisible();
  // No Undo is offered for a tap that took nothing, and nothing was put back.
  await expect(page.getByRole("button", { name: "Batalkan" })).toHaveCount(0);
  expect(stub.seen.portionUndos).toHaveLength(0);
  expect(stub.foods[0]).toMatchObject({ portions: 0, outcome: "eaten" });
});

test("the tap that takes the last portion finishes the food, and its Undo brings it back (Codex, PR #93)", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await foodWithPortions(page, "Pepes", 1);

  await page.getByRole("button", { name: /Pepes/ }).click();
  await page.getByRole("button", { name: "Dimakan 1 porsi" }).click();
  await expect(page.getByText("Dimakan — Pepes")).toBeVisible();
  await expect.poll(() => stub.foods[0].outcome).toBe("eaten");
  await expect(page.getByRole("button", { name: /Pepes/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect.poll(() => stub.foods[0].outcome ?? null).toBeNull();
  expect(stub.foods[0].portions).toBe(1);
  await expect(page.getByRole("button", { name: /Pepes/ })).toContainText("1 porsi");
});
