import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// The shared photo field (FoodPhotoField) kept only a File, and compressPhoto
// handed it the compression library's Blob, so every photo picked through it
// vanished and the form saved without it: food (owners and staff), repair
// reports, repair notes and repair receipts. Each one here attaches a photo
// and checks that it is shown, uploaded and saved on the row.

async function photo() {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 120, g: 160, b: 90 } } })
    .jpeg()
    .toBuffer();
}

/**
 * The compressor first tries a worker it loads from a CDN; refused here, it
 * compresses on the page. Both hand back the same Blob, so either shows the
 * bug.
 */
async function noCdn(context: BrowserContext) {
  await context.route(/cdn\.jsdelivr\.net/, (route) => route.abort("blockedbyclient"));
}

async function attach(page: Page, scope: Locator, removeLabel: string) {
  await scope.locator('input[type="file"]').setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: await photo() });
  // The field shows it, with a way to take it off: it was kept.
  await expect(scope.getByRole("button", { name: removeLabel })).toBeVisible({ timeout: 15_000 });
}

const id = (n: number) => `00000000-0000-4000-8000-0000000009${String(n).padStart(2, "0")}`;
const room = {
  id: id(2),
  household_id: HOUSEHOLD_ID,
  name: "Music Room",
  created_at: "2026-10-01T00:00:00Z",
  kind: "room",
  parent_id: null,
  sort_order: 0,
};
const repair = {
  id: id(50),
  household_id: HOUSEHOLD_ID,
  location_id: room.id,
  spot: null,
  title: "Dinding retak",
  details: null,
  photo_url: null,
  urgent: false,
  status: "open",
  reported_by_staff: null,
  created_by: null,
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  updated_at: new Date().toISOString(),
  decided_by: null,
  decided_at: null,
  dismiss_reason: null,
  fixed_by_name: null,
  closed_at: null,
};
const seenCards = async (context: BrowserContext) =>
  context.addInitScript(() => {
    for (const card of ["rooms-2026-11", "floors-2026-11", "room-picker-2026-11", "repairs-2026-11", "repair-costs-2026-11"]) {
      localStorage.setItem(`miamus.whats-new.${card}`, "seen");
    }
  });

test("food: a photo-only food from a staff phone keeps its photo", async ({ context, page }) => {
  await noCdn(context);
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");
  await page.getByRole("button", { name: "Lapor" }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /Makanan masuk/ }).click();
  const form = page.getByRole("dialog");
  await attach(page, form, "Hapus foto");
  await form.getByRole("button", { name: "Kulkas" }).click();
  await form.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(() => stub.foods.length).toBe(1);
  await expect.poll(() => stub.foods[0].photo_url ?? null, { timeout: 20_000 }).not.toBeNull();
  expect(stub.uploads.some((u) => u.startsWith("household-logs/"))).toBe(true);
});

test("repairs: a report's photo, a note's photo and the receipt are all kept", async ({ context, page }) => {
  await noCdn(context);
  await seenCards(context);
  const repairs: Record<string, unknown>[] = [repair];
  const stub = await installStub(context, { owner: { locale: "en" }, rooms: [room], chores: [], repairs });
  await page.goto("/dashboard?module=chores&chores=repairs");

  // Report a problem, with a photo.
  await page.getByRole("button", { name: "Report a problem" }).click({ timeout: 20_000 });
  const report = page.getByRole("dialog");
  await report.getByLabel("Room").selectOption({ label: "Music Room" });
  await report.getByLabel("What's wrong?").fill("Lampu berkedip");
  await attach(page, report, "Remove photo");
  await report.getByRole("button", { name: "Report", exact: true }).click();
  await expect.poll(() => repairs.length).toBe(2);
  expect(String(repairs[1].photo_url ?? "")).toContain("/household-logs/");

  // A note with a photo, and the receipt, on the first repair.
  await page.getByRole("region", { name: "Open" }).getByText("Dinding retak").click();
  const sheet = page.getByRole("dialog");
  const notes = sheet.getByRole("region", { name: "Notes" });
  await notes.getByLabel("Add a note").fill("Retaknya makin panjang");
  await attach(page, notes, "Remove photo");
  await notes.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => stub.repairNotes.length).toBe(1);
  expect(String(stub.repairNotes[0].photo_url ?? "")).toContain("/household-logs/");

  const cost = sheet.getByRole("region", { name: "Cost and receipt" });
  await cost.getByRole("button", { name: "Add cost or receipt" }).click();
  await attach(page, cost, "Remove photo");
  await cost.getByRole("button", { name: "Save" }).click();
  await expect.poll(() => stub.repairCosts.length).toBe(1);
  expect(String(stub.repairCosts[0].receipt_url ?? "")).toContain(`/owner-receipts/${HOUSEHOLD_ID}/`);
  expect(stub.uploads.filter((u) => u.startsWith("owner-receipts/"))).toHaveLength(1);
});

// Staff report a problem through the same field (Lapor → Lapor kerusakan).
test("repairs: a staff phone's report keeps its photo", async ({ context, page }) => {
  await noCdn(context);
  const repairs: Record<string, unknown>[] = [];
  await installStub(context, { stored: freshSession(), staffPhone: true, rooms: [room], chores: [], repairs });
  await page.goto("/staff");
  await page.getByRole("button", { name: /^Lapor/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /Lapor kerusakan/ }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Ruangan").selectOption({ label: "Music Room" });
  await form.getByLabel("Apa yang rusak?").fill("Keran bocor");
  await attach(page, form, "Hapus foto");
  await form.getByRole("button", { name: "Kirim" }).click();
  await expect.poll(() => repairs.length).toBe(1);
  expect(repairs[0]).toMatchObject({ reported_by_staff: STAFF_ID });
  expect(String(repairs[0].photo_url ?? "")).toContain("/household-logs/");
});
