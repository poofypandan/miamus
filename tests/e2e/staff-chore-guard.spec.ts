import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Staff chore saves refused on 12-13 Nov 2026 (production): Ari's phone
// offered "Ganti handuk" on a Friday with nothing owed, every Selesaikan was
// refused (household_tasks 403, chore_owner_only) and so was "Tidak bisa
// dikerjakan" (task_exceptions 403, task_exception_task), each time with
// "Gagal ...". The stub's household_tasks and task_exceptions inserts follow
// the two database guards here (stub-backend.ts: staffDayRowRefusal and
// answerExceptions).

// Today in Jakarta, the browser's zone (playwright.config.ts).
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const shift = (day: string, days: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000001770${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  title: "Ganti handuk",
  notes: null,
  category: "cleaning",
  assigned_to: STAFF_ID,
  due_date: today(),
  due_time: null,
  status: "pending",
  completed_by: null,
  completed_at: null,
  photo_url: null,
  created_at: "2026-10-11T00:00:00Z",
  recurrence: "none",
  recurrence_until: null,
  recurrence_interval: 1,
  remind_days_before: null,
  parent_task_id: null,
  requires_supervision: false,
  before_photo_url: null,
  after_photo_url: null,
  location_id: null,
  spot: null,
  ...over,
});

const done = (day: string) => ({
  status: "completed",
  completed_by: STAFF_ID,
  completed_at: `${day}T07:34:00Z`,
  before_photo_url: `https://stub.test/${HOUSEHOLD_ID}/household/b.jpg`,
  after_photo_url: `https://stub.test/${HOUSEHOLD_ID}/household/a.jpg`,
});

async function takeBothPhotos(page: Page) {
  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 60, g: 120, b: 160 } } })
    .jpeg()
    .toBuffer();
  const sheet = page.getByRole("dialog");
  for (const label of ["Ambil Foto Sebelum", "Ambil Foto Sesudah"]) {
    const chooser = page.waitForEvent("filechooser");
    await sheet.getByRole("button", { name: label }).click();
    await (await chooser).setFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: photo });
  }
  await expect(sheet.getByRole("button", { name: "Selesaikan" })).toBeEnabled({ timeout: 20_000 });
}

const choreInserts = (writes: [string, string][]) =>
  writes.filter(([method, table]) => method === "POST" && table === "household_tasks").length;

test("a written day with a cadence of its own is not offered as a second repeat", async ({ context, page }) => {
  // The repeat falls two days ago and every week before; both its last two
  // days are written and done. The older one was given a cadence of its own
  // (as an owner could, picking "Weekly" on one day's row).
  const last = shift(today(), -2);
  const repeat = chore({ due_date: shift(last, -28), recurrence: "weekly", ...done(shift(last, -28)) });
  const older = chore({ due_date: shift(last, -7), parent_task_id: repeat.id, recurrence: "weekly", ...done(last) });
  const latest = chore({ due_date: last, parent_task_id: repeat.id, ...done(last) });
  const other = chore({ title: "Sapu teras" });
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    chores: [repeat, older, latest, other],
  });

  await page.goto("/staff");
  await expect(page.getByText("Sapu teras").first()).toBeVisible({ timeout: 20_000 });
  // Nothing is owed: before, "Ganti handuk" was offered as missed, under the
  // older day's row, and could never be finished or explained.
  await expect(page.getByText("Ganti handuk")).toHaveCount(0);
  expect(choreInserts(stub.writes)).toBe(0);
  expect(stub.seen.realBackend).toEqual([]);
});

test("a finish the server refuses says why, reloads the list, and keeps the photos", async ({ context, page }) => {
  // A weekly repeat that falls today: nothing written yet.
  const repeat = chore({ due_date: shift(today(), -14), recurrence: "weekly", status: "completed" });
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, chores: [repeat] });
  // The guard refuses this phone's day row however it is sent (as it did on
  // Ari's phone): the server's answer, not the stub's rule, is under test.
  let refused = 0;
  await page.route(/\/rest\/v1\/household_tasks/, (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    refused++;
    return route.fulfill({ status: 403, json: { code: "42501", message: "chore_owner_only", details: null, hint: null } });
  });

  await page.goto("/staff");
  await page.getByText("Ganti handuk").first().click({ timeout: 20_000 });
  await takeBothPhotos(page);
  await page.getByRole("dialog").getByRole("button", { name: "Selesaikan" }).click();

  // Said plainly, in Indonesian: not sent, why, the list reloaded, photos kept.
  await expect(page.getByText(/"Ganti handuk" tidak terkirim karena tugasnya sudah diubah atau sudah selesai/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/Foto tetap tersimpan di HP/)).toBeVisible();
  await expect(page.getByText(/Gagal/)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Nothing left waiting to be resent: one try, one refusal.
  await expect(page.getByText(/catatan menunggu dikirim/)).toHaveCount(0);
  await page.waitForTimeout(6_000);
  expect(refused).toBe(1);

  // The chore is still on the list, so reopening finds both photos in place.
  await page.getByText("Ganti handuk").first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(/Diambil \d{2}\.\d{2}/)).toHaveCount(2);
  await expect(sheet.getByRole("button", { name: "Selesaikan" })).toBeEnabled();
  expect(stub.seen.realBackend).toEqual([]);
});

test("a repeat changed before the finish is caught on the phone, without sending the day", async ({ context, page }) => {
  const repeat = chore({ due_date: shift(today(), -14), recurrence: "weekly", status: "completed" });
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, chores: [repeat] });
  await page.goto("/staff");
  await page.getByText("Ganti handuk").first().click({ timeout: 20_000 });
  await takeBothPhotos(page);

  // Meanwhile an owner turns the repeat off: today is no longer its day.
  Object.assign(repeat, { recurrence: "none" });
  await page.getByRole("dialog").getByRole("button", { name: "Selesaikan" }).click();

  await expect(page.getByText(/"Ganti handuk" tidak terkirim karena tugasnya sudah diubah atau sudah selesai/)).toBeVisible({
    timeout: 20_000,
  });
  // The list is reloaded, and the chore is gone from it.
  await expect(page.getByText("Ganti handuk", { exact: true })).toHaveCount(0, { timeout: 20_000 });
  expect(choreInserts(stub.writes)).toBe(0);
  expect(stub.tasks).toHaveLength(0);
});

test("a couldn't-do the server refuses says why and reloads the list", async ({ context, page }) => {
  const laundry = chore({ title: "Cuci baju" });
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, chores: [laundry] });
  await page.goto("/staff");
  await page.getByText("Cuci baju").first().click({ timeout: 20_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Tidak bisa dikerjakan" }).click();
  await page.getByRole("dialog", { name: "Kenapa tidak bisa?" }).getByRole("button", { name: /Sudah dikerjakan orang lain/ }).click();

  // Meanwhile an owner calls the chore off: task_exceptions_guard refuses it.
  laundry.status = "cancelled";
  await page.getByRole("dialog", { name: "Sudah dikerjakan orang lain" }).getByRole("button", { name: "Kirim" }).click();

  await expect(page.getByText("Tidak terkirim karena tugasnya sudah diubah atau sudah selesai. Daftar tugas sudah diperbarui.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Gagal mengirim. Coba lagi.")).toHaveCount(0);
  await expect(page.getByText("Cuci baju")).toHaveCount(0, { timeout: 20_000 });
  expect(stub.exceptions).toHaveLength(0);
});
