import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { freshSession, installStub } from "./stub-backend";

// Phase 176 PR 2 (docs/phase-176-kitchen-places-plan.md, 5a, 5b and 8):
// Food → Ingredients grouped by place with Use soon on top, each item once;
// the ingredient's sheet moves it with a toast and Undo, asks for the new
// date out of the freezer (never filling one in), and sets the date. Staff
// see the same in Indonesian, may move and date, and cannot add.

// The browser runs in Asia/Jakarta (playwright.config.ts), so its calendar
// day is Jakarta's, whatever the runner's own zone.
function jakartaDay(offset = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
}

let next = 0;
const item = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-${String(176_000 + ++next).padStart(12, "0")}`,
  household_id: HOUSEHOLD_ID,
  scope: "home",
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

function kitchen() {
  return [
    item({ name: "Dada Ayam", kept_in: "freezer", track_amount: true, quantity: 6, amount_set_at: new Date().toISOString() }),
    item({ name: "Telur" }),
    item({ name: "Santan", kept_in: "fridge", expires_on: jakartaDay(-2), stock_status: "low" }),
    item({ name: "Daging sapi", kept_in: "freezer", expires_on: jakartaDay(40) }),
    item({ name: "Bawang merah", kept_in: "counter" }),
    item({ name: "Beras", category: "pantry" }),
    // Out, with a date a cached row might still hold: never in Use soon.
    item({ name: "Tomat", kept_in: "fridge", stock_status: "out", expires_on: jakartaDay(1) }),
    item({ name: "Sabun cuci", category: "household_supplies" }),
  ];
}

async function openOwnerFood(page: Page) {
  await page.goto("/dashboard?module=inventory");
  const ingredients = page.getByRole("region", { name: "Ingredients" });
  await expect(ingredients.getByRole("heading", { name: "Ingredients" })).toBeVisible({ timeout: 20_000 });
  return ingredients;
}

test("Ingredients are grouped by place, Use soon on top, each item once", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: kitchen() });
  const ingredients = await openOwnerFood(page);

  await expect(ingredients.locator("h3")).toHaveText(["Use soon", "Fridge", "Freezer", "Counter", "Cupboard"]);
  const soon = ingredients.getByRole("group", { name: "Use soon" });
  await expect(soon.getByRole("button")).toHaveCount(1);
  const santan = soon.getByRole("button", { name: /Santan/ });
  await expect(santan).toContainText("Fridge · 2 days past date — check first");
  await expect(santan.getByText("Fridge · 2 days past date — check first")).toHaveClass(/text-red-700/);

  // Telur has no place stored: its category's default, the Fridge.
  const fridge = ingredients.getByRole("group", { name: "Fridge" });
  await expect(fridge.getByRole("button", { name: /Telur/ })).toBeVisible();
  // Out stays in its place with no date, and is never in Use soon.
  await expect(fridge.getByRole("button", { name: /Tomat/ })).toContainText("Out");
  await expect(fridge.getByRole("button", { name: /Tomat/ })).not.toContainText("Expires");
  await expect(ingredients.getByRole("group", { name: "Freezer" }).getByRole("button", { name: /Daging sapi/ })).toContainText(
    "Expires in 40 days"
  );
  await expect(ingredients.getByRole("group", { name: "Cupboard" }).getByRole("button", { name: /Beras/ })).toBeVisible();

  for (const name of ["Dada Ayam", "Telur", "Santan", "Daging sapi", "Bawang merah", "Beras", "Tomat"]) {
    await expect(ingredients.getByRole("button", { name: new RegExp(name) })).toHaveCount(1);
  }
  await expect(ingredients.getByRole("button", { name: /Sabun cuci/ })).toHaveCount(0);
});

test("Freezer to Fridge: the toast and Undo, then the date question, and Tomorrow moves it up", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: kitchen() });
  const ingredients = await openOwnerFood(page);
  const chicken = () => stub.supplies.find((row) => row.name === "Dada Ayam")!;

  await ingredients.getByRole("button", { name: /Dada Ayam/ }).click();
  const sheet = page.getByRole("dialog", { name: "Dada Ayam" });
  await expect(sheet.getByText("Fresh Food · Freezer")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Freezer" })).toHaveAttribute("aria-pressed", "true");

  await sheet.getByRole("button", { name: "Fridge" }).click();
  await expect(page.getByText("Dada Ayam · moved to Fridge")).toBeVisible();
  await expect.poll(() => chicken().kept_in).toBe("fridge");
  // The sheet stays open, and asks; no date is filled in.
  await expect(sheet.getByText("Out of the freezer. When does it expire now?")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "No date" })).toHaveAttribute("aria-pressed", "true");
  expect(chicken().expires_on).toBeNull();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => chicken().kept_in).toBe("freezer");
  await expect(sheet.getByRole("button", { name: "Freezer" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText("Out of the freezer. When does it expire now?")).toHaveCount(0);

  await sheet.getByRole("button", { name: "Fridge" }).click();
  await expect(sheet.getByText("Out of the freezer. When does it expire now?")).toBeVisible();
  await sheet.getByRole("button", { name: "Tomorrow" }).click();
  await expect.poll(() => chicken().expires_on).toBe(jakartaDay(1));
  await expect(sheet.getByRole("button", { name: "Tomorrow" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByText("Fresh Food · Fridge · Expires tomorrow")).toBeVisible();
  // Only the two columns were written; the amount is untouched.
  expect(chicken()).toMatchObject({ kept_in: "fridge", quantity: 6, track_amount: true });

  await page.keyboard.press("Escape");
  const soon = ingredients.getByRole("group", { name: "Use soon" });
  const row = soon.getByRole("button", { name: /Dada Ayam/ });
  await expect(row).toContainText("Fridge · Expires tomorrow");
  await expect(row.getByText("Fridge · Expires tomorrow")).toHaveClass(/text-amber-700/);
  await expect(ingredients.getByRole("button", { name: /Dada Ayam/ })).toHaveCount(1);
});

test("Undo after a date was set puts back the place and the date", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: kitchen() });
  const ingredients = await openOwnerFood(page);
  const chicken = () => stub.supplies.find((row) => row.name === "Dada Ayam")!;

  await ingredients.getByRole("button", { name: /Dada Ayam/ }).click();
  const sheet = page.getByRole("dialog", { name: "Dada Ayam" });
  await sheet.getByRole("button", { name: "Fridge" }).click();
  await sheet.getByRole("button", { name: "3 days" }).click();
  await expect.poll(() => chicken().expires_on).toBe(jakartaDay(3));
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => chicken().kept_in).toBe("freezer");
  await expect.poll(() => chicken().expires_on).toBeNull();
});

test("Undo after closing and reopening the sheet still puts back the date (Codex, PR #116)", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: kitchen() });
  const ingredients = await openOwnerFood(page);
  const chicken = () => stub.supplies.find((row) => row.name === "Dada Ayam")!;

  await ingredients.getByRole("button", { name: /Dada Ayam/ }).click();
  await page.getByRole("dialog", { name: "Dada Ayam" }).getByRole("button", { name: "Fridge" }).click();
  await expect.poll(() => chicken().kept_in).toBe("fridge");
  await page.keyboard.press("Escape");
  await ingredients.getByRole("button", { name: /Dada Ayam/ }).click();
  await page.getByRole("dialog", { name: "Dada Ayam" }).getByRole("button", { name: "Tomorrow" }).click();
  await expect.poll(() => chicken().expires_on).toBe(jakartaDay(1));
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => chicken().kept_in).toBe("freezer");
  await expect.poll(() => chicken().expires_on).toBeNull();
});

test("a date chosen right after Undo, on a slow signal, is kept (Codex, PR #116)", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: kitchen() });
  const ingredients = await openOwnerFood(page);
  const chicken = () => stub.supplies.find((row) => row.name === "Dada Ayam")!;

  await ingredients.getByRole("button", { name: /Dada Ayam/ }).click();
  const sheet = page.getByRole("dialog", { name: "Dada Ayam" });
  await sheet.getByRole("button", { name: "Fridge" }).click();
  await expect.poll(() => chicken().kept_in).toBe("fridge");

  // Every save is slow from here: Undo's writes are still on their way when
  // the date is chosen.
  await page.route(/\/rest\/v1\/inventory_items/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, 700));
    return route.fallback();
  });
  await page.getByRole("button", { name: "Undo" }).click();
  await sheet.getByRole("button", { name: "1 week" }).click();
  await expect.poll(() => chicken().kept_in, { timeout: 10_000 }).toBe("freezer");
  await expect.poll(() => chicken().expires_on, { timeout: 10_000 }).toBe(jakartaDay(7));
  await page.waitForTimeout(1500);
  expect(chicken().expires_on).toBe(jakartaDay(7));
  await expect(sheet.getByRole("button", { name: "1 week" })).toHaveAttribute("aria-pressed", "true");
});

test("into the freezer keeps the date with a hint; Out hides the date and clears it", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, items: kitchen() });
  const ingredients = await openOwnerFood(page);
  const santan = () => stub.supplies.find((row) => row.name === "Santan")!;

  await ingredients.getByRole("button", { name: /Santan/ }).click();
  const sheet = page.getByRole("dialog", { name: "Santan" });
  await sheet.getByRole("button", { name: "Freezer" }).click();
  await expect.poll(() => santan().kept_in).toBe("freezer");
  await expect(sheet.getByText("In the freezer it keeps longer. Tap No date if the old date no longer applies.")).toBeVisible();
  // Not cleared for her.
  expect(santan().expires_on).toBe(jakartaDay(-2));
  await expect(sheet.getByLabel("Expiry date")).toHaveValue(jakartaDay(-2));

  // Out: the date block goes, and so does the date (migrations/154).
  await sheet.getByRole("button", { name: "Out" }).click();
  await expect.poll(() => santan().stock_status).toBe("out");
  expect(santan().expires_on).toBeNull();
  await ingredients.getByRole("button", { name: /Santan/ }).click();
  await expect(page.getByRole("dialog", { name: "Santan" }).getByText("Expires", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Santan" }).getByRole("button", { name: "Freezer" })).toBeVisible();
});

test("ready-to-eat food moves the same way, and only its place is sent", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: true } });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();

  await page.getByRole("button", { name: "Tambah makanan siap dimakan" }).click({ timeout: 20_000 });
  await page.getByLabel(/Makanan apa\?/).fill("Rendang");
  await page.getByRole("button", { name: "Dimasak di rumah" }).click();
  await page.getByRole("button", { name: "Besok" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(() => stub.foods.length).toBe(1);
  expect(stub.foods[0].kept_in).toBe("fridge");

  await page.getByRole("button", { name: /Rendang/ }).click();
  const sheet = page.getByRole("dialog", { name: "Rendang" });
  // The buttons say where it is; the fact row would say it twice.
  await expect(sheet.getByText("Disimpan di", { exact: true })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Freezer" }).click();
  await expect(page.getByText("Rendang · dipindahkan ke Freezer")).toBeVisible();
  await expect.poll(() => stub.foods[0].kept_in).toBe("freezer");
  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect.poll(() => stub.foods[0].kept_in).toBe("fridge");
});

test("two quick moves on a slow signal land in the order tapped (Codex, PR #116)", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: true } });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();
  await page.getByRole("button", { name: "Tambah makanan siap dimakan" }).click({ timeout: 20_000 });
  await page.getByLabel(/Makanan apa\?/).fill("Rendang");
  await page.getByRole("button", { name: "Dimasak di rumah" }).click();
  await page.getByRole("button", { name: "Besok" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(() => stub.foods.length).toBe(1);

  // The first move's save is slow; the second must still land last.
  const sent: unknown[] = [];
  let first = true;
  await page.route(/\/rest\/v1\/food_items/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    sent.push((route.request().postDataJSON() as { kept_in?: string }).kept_in);
    if (first) {
      first = false;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: /Rendang/ }).click();
  const sheet = page.getByRole("dialog", { name: "Rendang" });
  await sheet.getByRole("button", { name: "Freezer" }).click();
  await sheet.getByRole("button", { name: "Lemari" }).click();
  // The latest tap shows at once.
  await expect(sheet.getByRole("button", { name: "Lemari" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => sent).toEqual(["freezer", "pantry"]);
  await expect.poll(() => stub.foods[0].kept_in).toBe("pantry");
  await expect(sheet.getByRole("button", { name: "Lemari" })).toHaveAttribute("aria-pressed", "true");
});

test("while a move is on its way the other buttons wait; a failed move puts back only the place (Codex, PR #116)", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: true } });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();
  await page.getByRole("button", { name: "Tambah makanan siap dimakan" }).click({ timeout: 20_000 });
  await page.getByLabel(/Makanan apa\?/).fill("Rendang");
  await page.getByRole("button", { name: "Dimasak di rumah" }).click();
  await page.getByRole("button", { name: "Besok" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Tambah 1 porsi" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(() => stub.foods.length).toBe(1);

  // The move's save is slow, then fails.
  await page.route(/\/rest\/v1\/food_items/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return route.fulfill({ status: 500, json: { message: "boom" } });
  });
  await page.getByRole("button", { name: /Rendang/ }).click();
  const sheet = page.getByRole("dialog", { name: "Rendang" });
  await sheet.getByRole("button", { name: "Freezer" }).click();
  await expect(sheet.getByRole("button", { name: "Dimakan 1 porsi" })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "Dimakan", exact: true })).toBeDisabled();

  await expect(page.getByText("Gagal menyimpan. Coba lagi.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Kulkas" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("button", { name: "Dimakan 1 porsi" })).toBeEnabled();
  await expect(sheet.getByText("3 porsi")).toBeVisible();
  expect(stub.foods[0]).toMatchObject({ kept_in: "fridge", portions: 3 });

  // Afterwards a portion goes through, and the place stays.
  await sheet.getByRole("button", { name: "Dimakan 1 porsi" }).click();
  await expect.poll(() => stub.foods[0].portions).toBe(2);
  await expect(sheet.getByRole("button", { name: "Kulkas" })).toHaveAttribute("aria-pressed", "true");
});

test("staff see the same groups in Indonesian, move and date an item, and cannot add", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, features: { kitchen: true }, items: kitchen() });
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Dapur" }).click();

  const bahan = page.getByRole("region", { name: "Bahan masakan" });
  await expect(bahan.locator("h3")).toHaveText(["Segera dipakai", "Kulkas", "Freezer", "Meja", "Lemari"], { timeout: 20_000 });
  await expect(bahan.getByRole("button", { name: /Santan/ })).toContainText("Kulkas · Lewat 2 hari — cek dulu");
  await expect(bahan.getByRole("button", { name: /Daging sapi/ })).toContainText("Kedaluwarsa 40 hari lagi");
  await expect(bahan.getByRole("button", { name: /Tambah/ })).toHaveCount(0);

  await bahan.getByRole("button", { name: /Dada Ayam/ }).click();
  const sheet = page.getByRole("dialog", { name: "Dada Ayam" });
  await expect(sheet.getByText("Makanan Segar · Freezer")).toBeVisible();
  await expect(sheet.getByText("Disimpan di mana?")).toBeVisible();
  await sheet.getByRole("button", { name: "Kulkas" }).click();
  await expect(page.getByText("Dada Ayam · dipindahkan ke Kulkas")).toBeVisible();
  await expect(sheet.getByText("Keluar dari freezer. Sekarang kapan kedaluwarsa?")).toBeVisible();
  await sheet.getByRole("button", { name: "Besok" }).click();
  const chicken = () => stub.supplies.find((row) => row.name === "Dada Ayam")!;
  await expect.poll(() => chicken().expires_on).toBe(jakartaDay(1));
  expect(chicken().kept_in).toBe("fridge");
  // Staff still can't switch tracking or edit the item.
  await expect(sheet.getByRole("button", { name: /Catat jumlah|Ubah barang/ })).toHaveCount(0);
  // No English on the sheet or the list.
  for (const word of ["Fridge", "Expires", "Where is it kept", "moved to", "Use soon", "Undo"]) {
    await expect(page.getByText(word)).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await expect(bahan.getByRole("group", { name: "Segera dipakai" }).getByRole("button", { name: /Dada Ayam/ })).toContainText(
    "Kulkas · Kedaluwarsa besok"
  );
});
