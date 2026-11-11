import { test } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "../e2e/stub-backend";
import { captions } from "./captions";

// One test per tip (src/lib/video-tips.ts). The test's title is the file
// name finish-tips.ts gives the recording: "<id>.<lang>". Tips recorded from
// the phone's own menus (Add to Home Screen) can't be scripted here and are
// screen-recorded on a real phone; the house-code tip comes with PR A2's
// claim screen.

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("staff-first-chore.id", async ({ context, page }) => {
  const chore = {
    id: "00000000-0000-4000-8000-0000000000a1",
    household_id: HOUSEHOLD_ID,
    title: "Sapu teras",
    notes: null,
    category: "cleaning",
    assigned_to: STAFF_ID,
    due_date: today(),
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
  await installStub(context, { stored: freshSession(), staffPhone: true, chores: [chore] });
  const photo = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 120, g: 150, b: 110 } } })
    .jpeg()
    .toBuffer();
  const say = await captions(page, "staff-first-chore", "id");

  await page.goto("/staff");
  await page.getByText("Sapu teras").first().waitFor({ timeout: 20_000 });
  await say.show();
  await page.getByText("Sapu teras").first().click();
  const sheet = page.getByRole("dialog");
  await say.show(1500);
  for (const label of ["Ambil Foto Sebelum", "Ambil Foto Sesudah"]) {
    await say.show(1200);
    const chooser = page.waitForEvent("filechooser");
    await sheet.getByRole("button", { name: label }).first().click();
    await (await chooser).setFiles({ name: "foto.jpg", mimeType: "image/jpeg", buffer: photo });
    await page.waitForTimeout(800);
  }
  await say.show(1200);
  await sheet.getByRole("button", { name: "Selesaikan" }).click();
  await page.waitForTimeout(2500);
});

for (const locale of ["en", "id"] as const) {
  test(`owner-staff-phones.${locale}`, async ({ context, page }) => {
    await installStub(context, { owner: { locale }, household: { hasPets: false, pets: false }, staff: [], linkedPhones: [] });
    const say = await captions(page, "owner-staff-phones", locale);

    await page.goto("/dashboard?module=access&page=staff");
    const add = page.getByRole("button", { name: locale === "id" ? "Tambah Orang" : "Add Person" });
    await add.waitFor({ timeout: 20_000 });
    await say.show();
    await add.click();
    await page.waitForTimeout(1500);
    await page.keyboard.type("Sari", { delay: 120 });
    await page.keyboard.press("Escape");
    await page.goto("/dashboard?module=access&page=invite");
    await say.show();
    await say.show();
    await say.show();
  });
}
