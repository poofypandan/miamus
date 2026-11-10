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

test("a chore covered for someone on leave is taken over, then finished without photos", async ({ context, page }) => {
  const today = ymd(dateIn(0));
  // Ari's one-off, stored as Ari's; Ari is on approved leave and the admin covers.
  const sweep = chore({ title: "Sweep the terrace", assigned_to: STAFF_ID });
  const leave = {
    id: "00000000-0000-4000-8000-000000016380",
    household_id: HOUSEHOLD_ID,
    staff_id: STAFF_ID,
    start_date: today,
    end_date: today,
    status: "approved",
    fallback_action: "reassign",
    fallback_assignee_id: OWNER_PROFILE_ID,
    ended_on: null,
    created_at: "2026-11-01T00:00:00Z",
  };
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [sweep], leaves: [leave] });
  await page.goto("/dashboard");

  const card = myTasks(page);
  await expect(card).toContainText("Sweep the terrace", { timeout: 20_000 });
  // A weak signal on the first try: the takeover times out, and both it and
  // the completion wait on the phone together (Codex, PR #58).
  stub.trouble.household_tasks = { drop: 1 };
  await card.getByRole("button", { name: "Mark done: Sweep the terrace" }).click();
  await expect(page.getByText("Done, saved on this phone. It will be sent when the signal is back.")).toBeVisible({
    timeout: 30_000,
  });
  // Sent by itself: taken over first (its own edit), then completed
  // photo-free. The stub applies migrations/136's rule and would refuse it
  // the other way round.
  await expect.poll(() => sweep.status, { timeout: 45_000 }).toBe("completed");
  expect(sweep).toMatchObject({ assigned_to: OWNER_PROFILE_ID, completed_by: OWNER_PROFILE_ID, before_photo_url: null });
});

test("covering the first day of a repeat for someone on leave needs photos, and never reassigns the repeat", async ({
  context,
  page,
}) => {
  const today = ymd(dateIn(0));
  // A weekly chore whose first day is today: that day lives on the repeat itself.
  const water = chore({ title: "Water the garden", assigned_to: STAFF_ID, recurrence: "weekly" });
  const leave = {
    id: "00000000-0000-4000-8000-000000016381",
    household_id: HOUSEHOLD_ID,
    staff_id: STAFF_ID,
    start_date: today,
    end_date: today,
    status: "approved",
    fallback_action: "reassign",
    fallback_assignee_id: OWNER_PROFILE_ID,
    ended_on: null,
    created_at: "2026-11-01T00:00:00Z",
  };
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [water], leaves: [leave] });
  await page.goto("/dashboard");

  const card = myTasks(page);
  await expect(card).toContainText("Water the garden", { timeout: 20_000 });
  // The circle opens the sheet instead, which asks for both photos.
  await card.getByRole("button", { name: "Mark done: Water the garden" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("You're covering this for someone on leave, so it needs both photos.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Mark done" })).toBeDisabled();
  // Nothing was written: the repeat is still Ari's, and still open.
  expect(water).toMatchObject({ assigned_to: STAFF_ID, status: "pending" });
  expect(stub.writes.filter(([, table]) => table === "household_tasks")).toEqual([]);

  // With both photos it finishes, still stored as Ari's, and stays in My
  // tasks so it can be opened again (Codex, PR #58).
  const photo = await photoBuffer();
  for (let i = 0; i < 2; i++) {
    const chooser = page.waitForEvent("filechooser");
    await sheet.getByRole("button", { name: "Take photo" }).first().click();
    await (await chooser).setFiles({ name: `p${i}.jpg`, mimeType: "image/jpeg", buffer: photo });
    await expect(sheet.getByRole("button", { name: "Take photo" })).toHaveCount(1 - i, { timeout: 20_000 });
  }
  await sheet.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("Done: Water the garden")).toBeVisible({ timeout: 20_000 });
  expect(water).toMatchObject({ assigned_to: STAFF_ID, status: "completed", completed_by: OWNER_PROFILE_ID });
  await page.getByRole("button", { name: "Your task is done" }).click();
  await card.getByRole("button", { name: /^Anytime Water the garden/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Mark not done" })).toBeVisible();
});

test("a carried-over chore finished today can be marked not done from its own day", async ({ context, page }) => {
  const yesterday = dateIn(-1);
  const bill = chore({ title: "Pay the electricity bill", due_date: ymd(yesterday) });
  await installStub(context, { owner: { locale: "en" }, chores: [bill] });
  await page.goto("/dashboard");

  const card = myTasks(page);
  await expect(card).toContainText("carried over", { timeout: 20_000 });
  await card.getByRole("button", { name: "Mark done: Pay the electricity bill" }).click();
  await expect(page.getByText("Done: Pay the electricity bill")).toBeVisible();
  expect(bill).toMatchObject({ status: "completed", completed_by: OWNER_PROFILE_ID });

  // Its own day: no circles, but the sheet can still reopen it.
  await page
    .getByRole("button")
    .filter({ hasText: new RegExp(`^\\D*${yesterday.getDate()}$`) })
    .first()
    .click();
  await page.getByRole("button", { name: "Your task is done" }).click();
  await expect(card.getByRole("button", { name: /Mark done/ })).toHaveCount(0);
  await card.getByRole("button", { name: /^Anytime Pay the electricity bill/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark not done" }).click();
  await expect.poll(() => bill.status).toBe("pending");
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
