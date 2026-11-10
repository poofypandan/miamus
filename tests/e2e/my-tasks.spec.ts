import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER_PROFILE_ID, STAFF_ID, freshSession, installStub } from "./stub-backend";

// "My tasks" on Today (Phase 163): an admin finishes their own chores without
// switching to the staff view, with photos or without (migrations/136), can
// undo, and can't tick off tomorrow's. Staff still need both photos.

function dateIn(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000163${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  notes: null,
  category: "cleaning",
  assigned_to: OWNER_PROFILE_ID,
  due_date: ymd(dateIn(0)),
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
  ...over,
});

const myTasks = (page: Page, name = "My tasks") => page.getByRole("region", { name });

async function photoBuffer() {
  return sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 90, g: 140, b: 60 } } })
    .jpeg()
    .toBuffer();
}

test("an admin ticks off their own chores on Today, with no photos, and undoes one", async ({ context, page }) => {
  const plants = chore({ title: "Water the plants" });
  const bill = chore({ title: "Pay the electricity bill" });
  const mop = chore({ title: "Mop the floor", assigned_to: STAFF_ID });
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [plants, bill, mop] });
  await page.goto("/dashboard");

  // The card, with my two; the staff's chore stays in the day's list, and
  // mine aren't repeated there.
  const card = myTasks(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("0 of 2 done");
  await expect(card).not.toContainText("Mop the floor");
  await expect(page.getByText("Mop the floor")).toBeVisible();
  await expect(page.getByText("Water the plants")).toHaveCount(1);
  // Its tutorial, since this admin has chores of their own.
  await expect(page.getByText("New: finish your own chores on Today")).toBeVisible();

  // One tap on the circle: done, no photos, under my name.
  await card.getByRole("button", { name: "Mark done: Water the plants" }).click();
  await expect(page.getByText("Done: Water the plants")).toBeVisible();
  await expect(card).toContainText("1 of 2 done");
  expect(plants).toMatchObject({ status: "completed", completed_by: OWNER_PROFILE_ID, before_photo_url: null, after_photo_url: null });

  // Undo puts it back.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card).toContainText("0 of 2 done");
  expect(plants).toMatchObject({ status: "pending", completed_by: null, completed_at: null });

  // Both done: the card folds to one green line, which opens again.
  await card.getByRole("button", { name: "Mark done: Water the plants" }).click();
  await expect(card).toContainText("1 of 2 done");
  await card.getByRole("button", { name: "Mark done: Pay the electricity bill" }).click();
  const allDone = page.getByRole("button", { name: "Your 2 tasks are done" });
  await expect(allDone).toBeVisible();
  await allDone.click();
  await expect(card).toContainText("Pay the electricity bill");

  // The staff's chore was never touched.
  expect(mop).toMatchObject({ status: "pending" });
  expect(stub.seen.realBackend).toEqual([]);
});

test("Bahasa Indonesia: finishing with both photos, then marking it not done", async ({ context, page }) => {
  const plants = chore({ title: "Siram tanaman" });
  const stub = await installStub(context, { owner: { locale: "id" }, chores: [plants] });
  const photo = await photoBuffer();
  await page.goto("/dashboard");

  const card = myTasks(page, "Tugas saya");
  await expect(card).toContainText("0 dari 1 selesai", { timeout: 20_000 });
  await card.getByRole("button", { name: /^Kapan saja Siram tanaman/ }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Siram tanaman" })).toBeVisible();
  await expect(sheet.getByText("Tambah foto (opsional)")).toBeVisible();
  await expect(sheet.getByText("Dua foto, atau tidak sama sekali.")).toBeVisible();

  // One photo alone holds Mark done back: both, or none.
  const take = sheet.getByRole("button", { name: "Ambil foto" });
  let chooser = page.waitForEvent("filechooser");
  await take.first().click();
  await (await chooser).setFiles({ name: "sebelum.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(sheet.getByText("Tambahkan foto sesudah, atau hapus foto ini.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Tandai selesai" })).toBeDisabled();

  chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "Ambil foto" }).click();
  await (await chooser).setFiles({ name: "sesudah.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(sheet.getByRole("button", { name: "Tandai selesai" })).toBeEnabled({ timeout: 20_000 });
  await sheet.getByRole("button", { name: "Tandai selesai" }).click();

  await expect(page.getByText("Selesai: Siram tanaman")).toBeVisible({ timeout: 20_000 });
  expect(plants).toMatchObject({ status: "completed", completed_by: OWNER_PROFILE_ID });
  expect(plants.before_photo_url).toContain(`${HOUSEHOLD_ID}/household/`);
  expect(plants.after_photo_url).toContain(`${HOUSEHOLD_ID}/household/`);

  // Afterwards, from the sheet: Tandai belum selesai.
  await page.getByRole("button", { name: "Tugas Anda sudah selesai" }).click();
  await card.getByRole("button", { name: /^Kapan saja Siram tanaman/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Tandai belum selesai" }).click();
  await expect(card).toContainText("0 dari 1 selesai");
  expect(plants).toMatchObject({ status: "pending", completed_by: null, before_photo_url: null, after_photo_url: null });
  expect(stub.seen.realBackend).toEqual([]);
});

test("tomorrow's own chores show read-only; an admin with none sees no card", async ({ context, page }) => {
  const tomorrow = dateIn(1);
  const laundry = chore({ title: "Pick up the laundry", due_date: ymd(tomorrow) });
  const mop = chore({ title: "Mop the floor", assigned_to: STAFF_ID });
  await installStub(context, { owner: { locale: "en" }, chores: [laundry, mop] });
  await page.goto("/dashboard");

  // Nothing of mine today: Today as before.
  await expect(page.getByText("Mop the floor")).toBeVisible({ timeout: 20_000 });
  await expect(myTasks(page)).toHaveCount(0);

  // Tomorrow: the card, without circles.
  await page
    .getByRole("button")
    .filter({ hasText: new RegExp(`^\\D*${tomorrow.getDate()}$`) })
    .first()
    .click();
  const card = page.getByRole("region", { name: "My tasks" });
  await expect(card).toContainText("Tomorrow, 1 task");
  await expect(card).toContainText("Pick up the laundry");
  await expect(card.getByRole("button", { name: /Mark done/ })).toHaveCount(0);

  // Its sheet offers Edit, not Mark done.
  await card.getByRole("button", { name: /Pick up the laundry/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("You can mark it done on the day.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Mark done" })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: "Edit chore" })).toBeVisible();
  expect(laundry).toMatchObject({ status: "pending" });
});

test("staff phones still need both photos", async ({ context, page }) => {
  const sweep = chore({ title: "Sapu teras", assigned_to: STAFF_ID });
  await installStub(context, { stored: freshSession(), staffPhone: true, chores: [sweep] });
  await page.goto("/staff");

  await page.getByText("Sapu teras").first().click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  const finish = sheet.getByRole("button", { name: "Ambil 2 foto dulu" });
  await expect(finish).toBeVisible();
  await expect(finish).toBeDisabled();

  // And the stub refuses a photo-free completion from a staff phone, as
  // migrations/104 and 136 do.
  const cookie = (await context.cookies()).find((c) => c.name.startsWith("sb-supabase-auth-token"));
  const token = JSON.parse(Buffer.from(cookie!.value.replace(/^base64-/, ""), "base64url").toString()).access_token;
  const status = await page.evaluate(
    async ({ id, token }) => {
      const response = await fetch(`http://supabase.test/rest/v1/household_tasks?id=eq.${id}`, {
        method: "PATCH",
        headers: { apikey: "anon-test-key", authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "completed", completed_by: "x" }),
      });
      return response.status;
    },
    { id: sweep.id, token }
  );
  expect(status).toBe(400);
  expect(sweep).toMatchObject({ status: "pending" });
});
