import { expect, test, type BrowserContext } from "@playwright/test";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Notifications on staff phones (Phase 166). Staff Today asks once, in the
// one tip slot; the Lapor sheet keeps the switch; a notification meant for
// someone else on a shared phone says whose it is.

const PUSH_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const BUDI = "00000000-0000-4000-8000-00000000c002";
const ROSTER = [
  { id: STAFF_ID, household_id: "x", name: "Ari", has_pin: true, user_id: null, archived_at: null, created_at: "2026-10-01T00:00:00Z" },
  { id: BUDI, household_id: "x", name: "Budi", has_pin: true, user_id: null, archived_at: null, created_at: "2026-10-01T00:00:00Z" },
];

async function permission(context: BrowserContext, value: NotificationPermission) {
  await context.addInitScript((answer) => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => answer });
  }, value);
}

test("staff Today asks to turn notifications on, and 'Nanti saja' puts it off on this phone", async ({ context, page }) => {
  await permission(context, "default");
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    pushKey: PUSH_KEY,
    staffPush: { people: [{ staff_id: BUDI, name: "Budi" }], shared: true, household_on: true },
  });
  await page.goto("/staff");

  const card = page.getByRole("region", { name: "Aktifkan notifikasi" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Tidak ada notifikasi pukul 22.00–06.00.");
  await expect(card).toContainText("HP ini dipakai bersama. Notifikasi hanya menyebut nama Anda.");
  await expect(card.getByRole("button", { name: "Aktifkan" })).toBeEnabled();

  await card.getByRole("button", { name: "Nanti saja" }).last().click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Tugas Hari Ini")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Aktifkan notifikasi" })).toHaveCount(0);
});

test("the owner switched staff notifications off: no card", async ({ context, page }) => {
  await permission(context, "default");
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    pushKey: PUSH_KEY,
    staffPush: { people: [], shared: false, household_on: false },
  });
  await page.goto("/staff");
  await expect(page.getByText("Tugas Hari Ini")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await expect(page.getByRole("region", { name: "Aktifkan notifikasi" })).toHaveCount(0);
});

test("Lapor ends with 'Notifikasi di HP ini', which opens the settings", async ({ context, page }) => {
  await permission(context, "default");
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    pushKey: PUSH_KEY,
    staffPush: { people: [], shared: false, household_on: true },
  });
  await page.goto("/staff");
  await page.getByRole("button", { name: /^Lapor/ }).click();
  const row = page.getByRole("button", { name: /Notifikasi di HP ini/ });
  await expect(row).toContainText("Mati", { timeout: 20_000 });
  await row.click();

  const sheet = page.getByRole("dialog", { name: "Notifikasi di HP ini" });
  await expect(sheet.getByRole("switch", { name: "Untuk saya (Ari)" })).toHaveAttribute("aria-checked", "false");
  await expect(sheet).toContainText("Tugas baru untuk Anda hari ini");
  await expect(sheet).toContainText("Jam tenang");
  await expect(sheet).toContainText("Tidak ada notifikasi pukul 22.00–06.00.");
});

test("a notification for Budi, opened on Ari's turn: says whose, and offers the switch", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, staff: ROSTER });
  await page.goto(`/staff?untuk=${BUDI}`);

  const strip = page.getByRole("region", { name: "Notifikasi ini untuk Budi" });
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await strip.getByRole("button", { name: "Ganti ke Budi" }).click();
  // The usual PIN screen, for Budi; nothing in his name before that.
  await expect(page.getByText("Masukkan PIN")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Budi" })).toBeVisible();
  await page.getByRole("button", { name: "Kembali" }).click();
  await expect(page.getByText("Masukkan PIN")).toHaveCount(0);
  await expect(strip).toBeVisible();
});

test("the phone's Back closes the PIN screen and stays on Today (review fix)", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, staff: ROSTER });
  await page.goto(`/staff?untuk=${BUDI}`);
  const strip = page.getByRole("region", { name: "Notifikasi ini untuk Budi" });
  await expect(strip).toBeVisible({ timeout: 20_000 });
  await strip.getByRole("button", { name: "Ganti ke Budi" }).click();
  await expect(page.getByText("Masukkan PIN")).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Masukkan PIN")).toHaveCount(0);
  await expect(page).toHaveURL(/\/staff\?untuk=/);
  await expect(strip).toBeVisible();
  // And it opens again, so the waiting caller was released.
  await strip.getByRole("button", { name: "Ganti ke Budi" }).click();
  await expect(page.getByText("Masukkan PIN")).toBeVisible();
});

test("a notification for the person on duty: no strip", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, staff: ROSTER });
  await page.goto(`/staff?untuk=${STAFF_ID}`);
  await expect(page.getByText("Tugas Hari Ini")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: /Notifikasi ini untuk/ })).toHaveCount(0);
});
