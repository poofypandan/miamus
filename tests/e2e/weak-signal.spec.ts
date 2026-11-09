import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Phase 161 (R10): a save that gets no answer on a weak signal — while the
// phone still says it is online — waits on the phone and goes by itself, and
// is saved once even when the first try landed and only its reply was lost.
// Before: "Gagal menyimpan", and the work was gone unless typed in again.

const WAITING_STRIP = /catatan menunggu dikirim/;
const SENT_TOAST = "Catatan yang tertunda sudah terkirim ✅";

async function stillOnline(page: Page) {
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
}

test("food saved on a weak signal waits on the phone, then is sent once", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff?view=stok");
  await expect(page.getByText("Belum ada makanan")).toBeVisible({ timeout: 20_000 });

  // The first try lands but its answer is lost; the next one times out.
  stub.trouble.food_items = { lostReply: 1, drop: 1 };

  await page.getByRole("button", { name: "Tambah makanan" }).click();
  await page.getByLabel(/Makanan apa\?/).fill("Sayur asem");
  await page.getByRole("button", { name: "Dimasak di rumah" }).click();
  await page.getByRole("button", { name: "Besok" }).click();
  await page.getByRole("button", { name: "Simpan" }).click();

  // Kept on the phone and said so, in Indonesian; the row is on the list.
  await expect(page.getByText("Disimpan di HP. Akan dikirim otomatis saat sinyal bagus.")).toBeVisible();
  await expect(page.getByText(WAITING_STRIP)).toBeVisible();
  const row = page.getByRole("button", { name: /Sayur asem/ });
  await expect(row).toContainText("Menunggu dikirim");
  await stillOnline(page);

  // Its detail says it is waiting, and offers nothing that needs the server.
  await row.click();
  await expect(page.getByText(/Tersimpan di HP, menunggu dikirim/)).toBeVisible();
  await expect(page.getByText("Sudah habis?")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Retried by itself — no "online" event ever fires here.
  await expect(page.getByText(SENT_TOAST)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(WAITING_STRIP)).toHaveCount(0);
  await expect(row).not.toContainText("Menunggu dikirim");

  // Three tries reached the server (lost reply, timeout, success) and one row exists.
  expect(stub.writes.filter(([, table]) => table === "food_items")).toHaveLength(3);
  expect(stub.foods).toHaveLength(1);
  expect(stub.foods[0]).toMatchObject({ name: "Sayur asem", added_by: STAFF_ID });
  expect(stub.seen.realBackend).toEqual([]);
});

test("a chore finished on a weak signal shows as done, waits, and completes once", async ({ context, page }) => {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const chore = {
    id: "00000000-0000-4000-8000-000000000061",
    household_id: HOUSEHOLD_ID,
    title: "Sapu teras",
    notes: null,
    category: "cleaning",
    assigned_to: STAFF_ID,
    due_date: today,
    due_time: null,
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
  };
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, chores: [chore] });
  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 90, g: 140, b: 60 } } })
    .jpeg()
    .toBuffer();

  await page.goto("/staff");
  await page.getByText("Sapu teras").first().click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  for (const label of ["Ambil Foto Sebelum", "Ambil Foto Sesudah"]) {
    const chooser = page.waitForEvent("filechooser");
    await sheet.getByRole("button", { name: label }).click();
    await (await chooser).setFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: photo });
  }

  // Two timeouts in a row on the completion.
  stub.trouble.household_tasks = { drop: 2 };
  await sheet.getByRole("button", { name: "Selesaikan" }).click();

  await expect(page.getByText("Tugas selesai, disimpan di HP. Akan dikirim otomatis saat sinyal bagus.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(WAITING_STRIP)).toBeVisible();
  await expect(page.getByText("Menunggu dikirim").first()).toBeVisible();
  await stillOnline(page);

  await expect(page.getByText(SENT_TOAST)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(WAITING_STRIP)).toHaveCount(0);
  expect(chore).toMatchObject({ status: "completed", completed_by: STAFF_ID });
  expect(chore.before_photo_url).toContain(`${HOUSEHOLD_ID}/household/`);
  expect(chore.after_photo_url).toContain(`${HOUSEHOLD_ID}/household/`);
  // Done once: no extra day written, the one chore completed.
  expect(stub.tasks).toHaveLength(0);
  expect(stub.seen.realBackend).toEqual([]);
});

test("a pet routine logged on a weak signal survives a reload and is saved once", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 160, b: 90 } } })
    .jpeg()
    .toBuffer();
  await page.goto("/staff");
  await page.getByRole("button", { name: /Pipis & Pup/ }).first().click({ timeout: 20_000 });

  // The save lands, its answer is lost: the phone cannot tell it apart from
  // a timeout, so it keeps the log and retries with the same row id.
  stub.trouble.task_logs = { lostReply: 1, drop: 1 };
  await page.getByRole("dialog").locator('input[type="file"]').first().setInputFiles({
    name: "foto.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  const pick = page.getByRole("dialog", { name: "Pilih hewan yang ada di foto" });
  await pick.getByText("Mochi").click();
  await pick.getByRole("button", { name: /Simpan \(1\)/ }).click();

  await expect(page.getByText("Disimpan di HP. Akan dikirim otomatis saat sinyal bagus.")).toBeVisible({
    timeout: 30_000,
  });
  await stillOnline(page);

  // Closed and reopened before it could go: still on the phone, still said.
  await page.reload();
  await expect(page.getByText(WAITING_STRIP)).toBeVisible({ timeout: 20_000 });

  await expect(page.getByText(SENT_TOAST)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(WAITING_STRIP)).toHaveCount(0);
  // Several tries, one row: the retry carried the id the lost one had saved.
  expect(stub.writes.filter(([, table]) => table === "task_logs").length).toBeGreaterThanOrEqual(2);
  expect(stub.logs).toHaveLength(1);
  expect(stub.logs[0]).toMatchObject({ staff_id: STAFF_ID, module: "pet" });
  expect(String(stub.logs[0].photo_url)).toContain(`${HOUSEHOLD_ID}/pet/`);
  expect(stub.seen.realBackend).toEqual([]);
});
