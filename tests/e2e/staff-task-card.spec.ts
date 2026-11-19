import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// The staff task card (19 Nov, product change #2): the task's name, its time,
// and two photo places, Sebelum and Sesudah, that are the buttons. The
// Sesudah photo finishes it; "Tidak bisa dikerjakan" is in the card's menu.

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000001919${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  notes: null,
  category: "cleaning",
  assigned_to: STAFF_ID,
  due_date: today(),
  due_time: "09:00",
  status: "pending",
  completed_by: null,
  completed_at: null,
  photo_url: null,
  created_at: "2026-11-01T00:00:00Z",
  recurrence: "none",
  recurrence_until: null,
  parent_task_id: null,
  requires_supervision: false,
  before_photo_url: null,
  after_photo_url: null,
  location_id: null,
  spot: null,
  ...over,
});

const TERAS = "00000000-0000-4000-8000-000000191901";
const DAPUR = "00000000-0000-4000-8000-000000191902";
const rooms = [
  { id: TERAS, household_id: HOUSEHOLD_ID, name: "Teras", kind: "room", parent_id: null, sort_order: 0, created_at: "2026-10-01T00:00:00Z" },
  { id: DAPUR, household_id: HOUSEHOLD_ID, name: "Dapur", kind: "room", parent_id: null, sort_order: 1, created_at: "2026-10-01T00:00:00Z" },
];

async function photo(page: Page, card: ReturnType<Page["locator"]>, place: "Sebelum" | "Sesudah") {
  const buffer = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 60, g: 120, b: 160 } } })
    .jpeg()
    .toBuffer();
  const chooser = page.waitForEvent("filechooser");
  await card.getByRole("button", { name: new RegExp(`^${place}`) }).click();
  await (await chooser).setFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer });
}

test("staff finish a chore on its card: Sebelum, then Sesudah, and it shows Selesai", async ({ context, page }) => {
  const mop = chore({ title: "Pel teras", location_id: TERAS });
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, chores: [mop], rooms });
  await page.goto("/staff");

  const card = page.locator("div.rounded-xl", { has: page.getByText("Pel teras", { exact: true }) }).last();
  await expect(card).toBeVisible({ timeout: 20_000 });
  // The name says Teras: no room line. No "Untuk Anda" on a person's own list, no category.
  await expect(card.getByText("Teras", { exact: true })).toHaveCount(0);
  await expect(card.getByText("Untuk Anda")).toHaveCount(0);
  await expect(card.getByText("Bersih-bersih")).toHaveCount(0);
  await expect(card.getByText("09.00")).toBeVisible();

  // Sesudah waits for Sebelum.
  await expect(card.getByRole("button", { name: /^Sesudah/ })).toBeDisabled();
  await photo(page, card, "Sebelum");
  await expect(card.getByRole("img", { name: "Foto Sebelum" })).toBeVisible();
  expect(mop.status).toBe("pending");
  await photo(page, card, "Sesudah");

  await expect(page.getByText('"Pel teras" selesai')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => mop.status).toBe("completed");
  expect(mop).toMatchObject({ completed_by: STAFF_ID });
  expect(mop.before_photo_url).toContain(`${HOUSEHOLD_ID}/household/`);
  expect(mop.after_photo_url).toContain(`${HOUSEHOLD_ID}/household/`);
  expect(stub.seen.realBackend).toEqual([]);
});

test("a photo taken on the card is in the chore's sheet, and the other way round", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, chores: [chore({ title: "Lap meja", location_id: DAPUR })], rooms });
  await page.goto("/staff");
  const card = page.locator("div.rounded-xl", { has: page.getByText("Lap meja", { exact: true }) }).last();
  // "Lap meja" doesn't say Dapur: the room shows.
  await expect(card.getByText("Dapur")).toBeVisible({ timeout: 20_000 });
  await photo(page, card, "Sebelum");
  await expect(card.getByRole("img", { name: "Foto Sebelum" })).toBeVisible();

  await card.getByText("Lap meja", { exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: "Hapus foto" }).first()).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Ambil foto sesudah dulu" })).toBeDisabled();
});

test("the tip says where the photos are now, once", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, taskCardTip: true, chores: [chore({ title: "Cuci mobil" })] });
  await page.goto("/staff");
  await expect(page.getByRole("region", { name: "Baru: foto langsung di kartu tugas" })).toBeVisible({ timeout: 20_000 });
});

test("the card's menu keeps Tidak bisa dikerjakan one tap away", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, chores: [chore({ title: "Cuci mobil" })] });
  await page.goto("/staff");
  const card = page.locator("div.rounded-xl", { has: page.getByText("Cuci mobil", { exact: true }) }).last();
  await card.getByRole("button", { name: "Pilihan lain" }).click({ timeout: 20_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Tidak bisa dikerjakan" }).click();
  await expect(page.getByRole("dialog", { name: "Kenapa tidak bisa?" })).toBeVisible();
});

test("a chore for Anyone is taken first: no photo places until it is someone's", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, chores: [chore({ title: "Buang sampah", assigned_to: null })] });
  await page.goto("/staff");
  const card = page.locator("div.rounded-xl", { has: page.getByText("Buang sampah", { exact: true }) }).last();
  await expect(card.getByText("Saya kerjakan")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole("button", { name: /^Sebelum/ })).toHaveCount(0);
});
